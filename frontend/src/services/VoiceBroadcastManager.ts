
export interface BroadcastPeer {
  id: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  role: 'speaker' | 'listener';
  username: string;
  stuckSince?: number; // Timestamp for stuck connection detection
}

export interface BroadcastState {
  role: 'speaker' | 'listener';
  isActive: boolean;
  localStream?: MediaStream;
  remotePeers: Map<string, BroadcastPeer>;
  audioContext?: AudioContext;
  mixedAudioDestination?: MediaStreamAudioDestinationNode;
  speakerStreams: Map<string, MediaStream>;
  audioElement?: HTMLAudioElement;
  gainNodes: Map<string, GainNode>;
}

export class VoiceBroadcastManager {
  private state: BroadcastState;
  private socket: any;
  private userInteractionHandler?: (event: Event) => void;
  private iceServers: RTCIceServer[] = [
    // Multiple STUN servers for better reliability
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // Multiple TURN servers for NAT traversal
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject', 
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject', 
      credential: 'openrelayproject'
    },
    
    // Additional reliable TURN servers
    { 
      urls: 'turn:relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  constructor(socket: any) {
    this.socket = socket;
    this.state = {
      role: 'listener',
      isActive: false,
      remotePeers: new Map(),
      speakerStreams: new Map(),
      gainNodes: new Map()
    };

    this.setupSocketHandlers();
    this.startConnectionHealthMonitoring();
  }

  private setupSocketHandlers(): void {
    // Handle incoming broadcast offers
    this.socket.on('broadcast_offer', async (data: { 
      offer: RTCSessionDescriptionInit, 
      speakerId: string, 
      speakerUsername: string 
    }) => {
      await this.handleBroadcastOffer(data.offer, data.speakerId, data.speakerUsername);
    });

    // Handle broadcast answers
    this.socket.on('broadcast_answer', async (data: { 
      answer: RTCSessionDescriptionInit, 
      listenerId: string 
    }) => {
      await this.handleBroadcastAnswer(data.answer, data.listenerId);
    });

    // Handle ICE candidates
    this.socket.on('broadcast_ice_candidate', async (data: { 
      candidate: RTCIceCandidateInit, 
      peerId: string 
    }) => {
      await this.handleIceCandidate(data.candidate, data.peerId);
    });

    // Handle speaker promotion
    this.socket.on('speaker_promoted', async (data: { 
      newSpeakerId: string, 
      listenerIds: string[] 
    }) => {
      if (data.newSpeakerId === this.socket.id) {
        await this.promoteSpeaker(data.newSpeakerId, data.listenerIds);
      }
    });

    // Handle speaker demotion
    this.socket.on('speaker_demoted', async (data: { 
      demotedSpeakerId: string 
    }) => {
      if (data.demotedSpeakerId === this.socket.id) {
        await this.demoteToListener();
      } else {
        this.removePeer(data.demotedSpeakerId);
      }
    });

    // Handle peer disconnection
    this.socket.on('peer_disconnected', (peerId: string) => {
      this.removePeer(peerId);
    });
  }

  /**
   * For speakers: Start broadcasting to all listeners
   */
  async startSpeaking(listenerIds: string[]): Promise<void> {
    try {
      console.log('🎤 [WEBRTC] Starting to speak...');
      console.log(`🎤 [WEBRTC] Target peer IDs:`, listenerIds);
      
      if (this.state.isActive) {
        throw new Error('Already broadcasting');
      }

      // Get user media
      console.log('🎤 [WEBRTC] Requesting microphone access...');
      this.state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });
      console.log('🎤 [WEBRTC] Microphone access granted, stream:', this.state.localStream);

      this.state.role = 'speaker';
      this.state.isActive = true;

      // Setup audio mixing for speakers too (to hear other speakers)
      console.log('🎤 [WEBRTC] Setting up audio mixing...');
      await this.setupAudioMixing();

      // Create connections to all listeners
      console.log(`🎤 [WEBRTC] Creating WebRTC connections to ${listenerIds.length} peers...`);
      for (const listenerId of listenerIds) {
        console.log(`🎤 [WEBRTC] Creating connection to peer: ${listenerId}`);
        await this.createSpeakerConnection(listenerId);
      }

      console.log(`✅ [WEBRTC] Started broadcasting to ${listenerIds.length} peers`);
    } catch (error) {
      console.error('❌ [WEBRTC] Failed to start speaking:', error);
      await this.stopSpeaking();
      throw error;
    }
  }

  /**
   * For speakers: Stop broadcasting
   */
  async stopSpeaking(): Promise<void> {
    try {
      // Stop local stream
      if (this.state.localStream) {
        this.state.localStream.getTracks().forEach(track => track.stop());
        this.state.localStream = undefined;
      }

      // Close all peer connections
      this.state.remotePeers.forEach(peer => {
        peer.connection.close();
      });
      this.state.remotePeers.clear();

      this.state.isActive = false;
      this.state.role = 'listener';

      // Notify server
      this.socket.emit('stop_broadcasting');

      console.log('Stopped broadcasting');
    } catch (error) {
      console.error('Error stopping broadcast:', error);
      throw error;
    }
  }

  /**
   * For listeners: Start receiving from both speakers
   */
  async startListening(speakerIds: string[]): Promise<void> {
    try {
      console.log('🎧 [WEBRTC] startListening() called with speaker IDs:', speakerIds);
      
      // Allow speakers to listen to other speakers without throwing error
      if (this.state.isActive && this.state.role === 'listener') {
        console.log('🎧 [WEBRTC] Already listening as listener, current state:', this.state);
        throw new Error('Already listening');
      }
      
      const isSpeakerWantingToListen = this.state.isActive && this.state.role === 'speaker';
      
      if (isSpeakerWantingToListen) {
        console.log('🎧 [WEBRTC] Speaker wanting to listen to other speakers - this is allowed');
        // Don't change role or isActive state for speakers
      } else {
        // Only set role/active for pure listeners
        this.state.role = 'listener';
        this.state.isActive = true;
      }

      // Setup audio mixing
      console.log('🎧 [WEBRTC] Setting up audio mixing for listening...');
      await this.setupAudioMixing();

      // Notify server that we're ready to receive
      console.log('🎧 [WEBRTC] Emitting ready_to_listen to server...');
      this.socket.emit('ready_to_listen', { speakerIds });

      console.log(`✅ [WEBRTC] Started listening to ${speakerIds.length} speakers`);
    } catch (error) {
      console.error('❌ [WEBRTC] Failed to start listening:', error);
      await this.stopListening();
      throw error;
    }
  }

  /**
   * For listeners: Stop receiving
   */
  async stopListening(): Promise<void> {
    try {
      // Close all peer connections
      this.state.remotePeers.forEach(peer => {
        peer.connection.close();
      });
      this.state.remotePeers.clear();

      // Stop and cleanup audio element
      if (this.state.audioElement) {
        this.state.audioElement.pause();
        this.state.audioElement.srcObject = null;
        document.body.removeChild(this.state.audioElement);
        this.state.audioElement = undefined;
      }
      
      // Disconnect all gain nodes
      this.state.gainNodes.forEach(gainNode => {
        gainNode.disconnect();
      });
      this.state.gainNodes.clear();

      // Cleanup audio context
      if (this.state.audioContext) {
        await this.state.audioContext.close();
        this.state.audioContext = undefined;
        this.state.mixedAudioDestination = undefined;
      }

      this.state.speakerStreams.clear();
      this.state.isActive = false;

      // Notify server
      this.socket.emit('stop_listening');

      console.log('Stopped listening');
    } catch (error) {
      console.error('Error stopping listening:', error);
      throw error;
    }
  }

  /**
   * Handle speaker promotion - transition from listener to speaker
   */
  async promoteSpeaker(_newSpeakerId: string, listenerIds: string[]): Promise<void> {
    try {
      console.log('Being promoted to speaker');
      
      // Stop current listening state
      if (this.state.isActive && this.state.role === 'listener') {
        await this.stopListening();
      }

      // Start speaking
      await this.startSpeaking(listenerIds);

      console.log('Successfully promoted to speaker');
    } catch (error) {
      console.error('Failed to promote to speaker:', error);
      throw error;
    }
  }

  /**
   * Handle demotion from speaker to listener
   */
  private async demoteToListener(): Promise<void> {
    try {
      console.log('Being demoted to listener');
      
      // Stop speaking
      if (this.state.isActive && this.state.role === 'speaker') {
        await this.stopSpeaking();
      }

      // The server will handle reassigning us as a listener
      console.log('Successfully demoted to listener');
    } catch (error) {
      console.error('Failed to demote to listener:', error);
      throw error;
    }
  }

  private async createSpeakerConnection(listenerId: string): Promise<void> {
    console.log(`🔗 [WEBRTC] Creating peer connection to ${listenerId}`);
    
    const connection = new RTCPeerConnection({ 
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all' // Use both STUN and TURN
    });
    console.log(`🔗 [WEBRTC] RTCPeerConnection created for ${listenerId} with ${this.iceServers.length} ICE servers`);
    
    // Add local stream to connection
    if (this.state.localStream) {
      console.log(`🔗 [WEBRTC] Adding local stream tracks to connection for ${listenerId}`);
      this.state.localStream.getTracks().forEach(track => {
        console.log(`🔗 [WEBRTC] Adding track ${track.kind} to ${listenerId}:`, {
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted
        });
        connection.addTrack(track, this.state.localStream!);
      });
      console.log(`✅ [WEBRTC] Added ${this.state.localStream.getTracks().length} tracks to connection for ${listenerId}`);
    } else {
      console.warn(`⚠️ [WEBRTC] No local stream available to add to connection for ${listenerId}`);
    }

    // Handle ICE candidates with detailed logging
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 [WEBRTC] Sending ICE candidate to ${listenerId}:`, {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid
        });
        this.socket.emit('broadcast_ice_candidate', {
          candidate: event.candidate,
          peerId: listenerId
        });
      } else {
        console.log(`🧊 [WEBRTC] ICE candidate gathering complete for ${listenerId}`);
      }
    };

    // Handle ICE gathering state changes
    connection.onicegatheringstatechange = () => {
      console.log(`🧊 [WEBRTC] ICE gathering state for ${listenerId}: ${connection.iceGatheringState}`);
    };

    // Handle ICE connection state changes
    connection.oniceconnectionstatechange = () => {
      console.log(`🧊 [WEBRTC] ICE connection state for ${listenerId}: ${connection.iceConnectionState}`);
      
      if (connection.iceConnectionState === 'failed') {
        console.error(`❌ [WEBRTC] ICE connection failed for ${listenerId}, attempting recovery`);
        this.attemptConnectionRecovery(listenerId);
      } else if (connection.iceConnectionState === 'disconnected') {
        console.warn(`⚠️ [WEBRTC] ICE connection disconnected for ${listenerId}`);
        // Don't immediately remove, might reconnect
      } else if (connection.iceConnectionState === 'connected') {
        console.log(`✅ [WEBRTC] ICE connection established for ${listenerId}`);
      } else if (connection.iceConnectionState === 'checking') {
        console.log(`🔍 [WEBRTC] ICE connection checking for ${listenerId}`);
      } else if (connection.iceConnectionState === 'completed') {
        console.log(`🎯 [WEBRTC] ICE connection completed for ${listenerId}`);
      }
    };

    // Handle track events (CRITICAL: This was missing for speakers!)
    connection.ontrack = (event) => {
      console.log(`🎵 [WEBRTC] Track received from speaker ${listenerId}:`, event.track);
      const [stream] = event.streams;
      if (stream) {
        console.log(`🎵 [WEBRTC] Audio stream received from speaker ${listenerId}:`, stream);
        console.log(`🎵 [WEBRTC] Stream tracks:`, stream.getTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState
        })));
        this.addSpeakerStream(listenerId, stream);
      } else {
        console.warn(`⚠️ [WEBRTC] No stream received with track from speaker ${listenerId}`);
      }
    };

    // Handle connection state changes with retry logic
    connection.onconnectionstatechange = () => {
      console.log(`📡 [WEBRTC] Connection to ${listenerId}: ${connection.connectionState}`);
      if (connection.connectionState === 'failed') {
        console.error(`❌ [WEBRTC] Connection to ${listenerId} failed, attempting recovery`);
        this.attemptConnectionRecovery(listenerId);
      } else if (connection.connectionState === 'disconnected') {
        console.warn(`⚠️ [WEBRTC] Connection to ${listenerId} disconnected`);
        // Wait a moment before removing to allow for reconnection
        setTimeout(() => {
          if (connection.connectionState === 'disconnected') {
            this.removePeer(listenerId);
          }
        }, 5000);
      } else if (connection.connectionState === 'connected') {
        console.log(`✅ [WEBRTC] Connection to ${listenerId} established successfully`);
      } else if (connection.connectionState === 'connecting') {
        console.log(`⏳ [WEBRTC] Connecting to ${listenerId}...`);
      }
    };

    // Store peer connection
    this.state.remotePeers.set(listenerId, {
      id: listenerId,
      connection,
      role: 'listener',
      username: '' // Will be updated from server
    });

    // Create and send offer with better error handling
    try {
      console.log(`📤 [WEBRTC] Creating offer for ${listenerId}`);
      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await connection.setLocalDescription(offer);
      console.log(`📤 [WEBRTC] Sending offer to ${listenerId}:`, offer);
      
      this.socket.emit('broadcast_offer', {
        offer,
        listenerId,
        speakerId: this.socket.id
      });
      console.log(`📤 [WEBRTC] Offer sent to ${listenerId} via socket`);
    } catch (error) {
      console.error(`❌ [WEBRTC] Failed to create/send offer to ${listenerId}:`, error);
      this.removePeer(listenerId);
      throw error;
    }
  }

  private async handleBroadcastOffer(
    offer: RTCSessionDescriptionInit, 
    speakerId: string, 
    speakerUsername: string
  ): Promise<void> {
    try {
      console.log(`📥 [WEBRTC] Received offer from speaker ${speakerUsername} (${speakerId}):`, offer);
      
      const connection = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all' // Use both STUN and TURN
      });
      console.log(`🔗 [WEBRTC] Created peer connection for incoming offer from ${speakerId} with ${this.iceServers.length} ICE servers`);

      // Handle incoming stream
      connection.ontrack = async (event) => {
        console.log(`🎵 [WEBRTC] Received track from speaker ${speakerId} (${speakerUsername}):`, event.track);
        const [stream] = event.streams;
        if (stream) {
          console.log(`🎵 [WEBRTC] Received audio stream from speaker ${speakerId}:`, stream);
          console.log(`🎵 [WEBRTC] Stream tracks:`, stream.getTracks().map(t => ({
            id: t.id,
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState
          })));
          await this.addSpeakerStream(speakerId, stream);
        } else {
          console.warn(`⚠️ [WEBRTC] No stream received from speaker ${speakerId}`);
        }
      };

      // Handle ICE candidates with detailed logging
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`🧊 [WEBRTC] Sending ICE candidate to speaker ${speakerId}:`, {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid
          });
          this.socket.emit('broadcast_ice_candidate', {
            candidate: event.candidate,
            peerId: speakerId
          });
        } else {
          console.log(`🧊 [WEBRTC] ICE candidate gathering complete for speaker ${speakerId}`);
        }
      };

      // Handle ICE gathering state changes
      connection.onicegatheringstatechange = () => {
        console.log(`🧊 [WEBRTC] ICE gathering state for speaker ${speakerId}: ${connection.iceGatheringState}`);
      };

      // Handle ICE connection state changes
      connection.oniceconnectionstatechange = () => {
        console.log(`🧊 [WEBRTC] ICE connection state for speaker ${speakerId}: ${connection.iceConnectionState}`);
        
        if (connection.iceConnectionState === 'failed') {
          console.error(`❌ [WEBRTC] ICE connection failed for speaker ${speakerId}, attempting recovery`);
          this.attemptConnectionRecovery(speakerId);
        } else if (connection.iceConnectionState === 'disconnected') {
          console.warn(`⚠️ [WEBRTC] ICE connection disconnected for speaker ${speakerId}`);
          // Don't immediately remove, might reconnect
        } else if (connection.iceConnectionState === 'connected') {
          console.log(`✅ [WEBRTC] ICE connection established for speaker ${speakerId}`);
        } else if (connection.iceConnectionState === 'checking') {
          console.log(`🔍 [WEBRTC] ICE connection checking for speaker ${speakerId}`);
        } else if (connection.iceConnectionState === 'completed') {
          console.log(`🎯 [WEBRTC] ICE connection completed for speaker ${speakerId}`);
        }
      };

      // Handle connection state changes with retry logic
      connection.onconnectionstatechange = () => {
        console.log(`📡 [WEBRTC] Connection to speaker ${speakerId} (${speakerUsername}): ${connection.connectionState}`);
        if (connection.connectionState === 'failed') {
          console.error(`❌ [WEBRTC] Connection to speaker ${speakerId} failed, attempting recovery`);
          this.attemptConnectionRecovery(speakerId);
        } else if (connection.connectionState === 'disconnected') {
          console.warn(`⚠️ [WEBRTC] Connection to speaker ${speakerId} disconnected`);
          // Wait a moment before removing to allow for reconnection
          setTimeout(() => {
            if (connection.connectionState === 'disconnected') {
              this.removePeer(speakerId);
            }
          }, 5000);
        } else if (connection.connectionState === 'connected') {
          console.log(`✅ [WEBRTC] Connection to speaker ${speakerId} established successfully`);
        } else if (connection.connectionState === 'connecting') {
          console.log(`⏳ [WEBRTC] Connecting to speaker ${speakerId}...`);
        }
      };

      // Store peer connection
      this.state.remotePeers.set(speakerId, {
        id: speakerId,
        connection,
        role: 'speaker',
        username: speakerUsername
      });

      // Set remote description and create answer with better error handling
      try {
        console.log(`📥 [WEBRTC] Setting remote description for ${speakerId}`);
        await connection.setRemoteDescription(offer);
        console.log(`📤 [WEBRTC] Creating answer for ${speakerId}`);
        const answer = await connection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        await connection.setLocalDescription(answer);
        console.log(`📤 [WEBRTC] Sending answer to ${speakerId}:`, answer);

        // Send answer
        this.socket.emit('broadcast_answer', {
          answer,
          speakerId,
          listenerId: this.socket.id
        });
        console.log(`📤 [WEBRTC] Answer sent to ${speakerId} via socket`);
      } catch (error) {
        console.error(`❌ [WEBRTC] Failed to create/send answer to ${speakerId}:`, error);
        this.removePeer(speakerId);
        throw error;
      }

    } catch (error) {
      console.error(`❌ [WEBRTC] Error handling broadcast offer from ${speakerId}:`, error);
      throw error;
    }
  }

  private async handleBroadcastAnswer(
    answer: RTCSessionDescriptionInit, 
    listenerId: string
  ): Promise<void> {
    try {
      console.log(`📥 [WEBRTC] Received answer from peer ${listenerId}:`, answer);
      
      const peer = this.state.remotePeers.get(listenerId);
      if (!peer) {
        console.warn(`⚠️ [WEBRTC] No peer connection found for peer ${listenerId} when handling answer`);
        return;
      }

      console.log(`📥 [WEBRTC] Setting remote description for peer ${listenerId}`);
      await peer.connection.setRemoteDescription(answer);
      console.log(`✅ [WEBRTC] Remote description set for peer ${listenerId}`);
    } catch (error) {
      console.error(`❌ [WEBRTC] Error handling broadcast answer from ${listenerId}:`, error);
      throw error;
    }
  }

  private async handleIceCandidate(
    candidate: RTCIceCandidateInit, 
    peerId: string
  ): Promise<void> {
    try {
      console.log(`🧊 [WEBRTC] Received ICE candidate from peer ${peerId}:`, candidate);
      
      const peer = this.state.remotePeers.get(peerId);
      if (!peer) {
        console.warn(`⚠️ [WEBRTC] No peer connection found for peer ${peerId} when handling ICE candidate`);
        return;
      }

      console.log(`🧊 [WEBRTC] Adding ICE candidate for peer ${peerId}`);
      await peer.connection.addIceCandidate(candidate);
      console.log(`✅ [WEBRTC] ICE candidate added for peer ${peerId}`);
    } catch (error) {
      console.error(`❌ [WEBRTC] Error handling ICE candidate from ${peerId}:`, error);
    }
  }

  private async setupAudioMixing(): Promise<void> {
    try {
      console.log('🔊 [AUDIO-SETUP] Setting up audio mixing for listener');
      
      // Create audio context with error handling
      if (!this.state.audioContext || this.state.audioContext.state === 'closed') {
        console.log('🔊 [AUDIO-SETUP] Creating new AudioContext');
        this.state.audioContext = new AudioContext();
        
        // Set up error handling for audio context
        this.state.audioContext.addEventListener('statechange', () => {
          console.log(`🔊 [AUDIO-SETUP] Audio context state changed to: ${this.state.audioContext?.state}`);
        });
      }
      
      // Ensure audio context is running
      await this.ensureAudioContextRunning();
      
      console.log('🔊 [AUDIO-SETUP] Creating MediaStreamDestination');
      this.state.mixedAudioDestination = this.state.audioContext.createMediaStreamDestination();
      
      // Create audio element for playback with enhanced error handling
      if (this.state.audioElement) {
        // Clean up existing audio element
        try {
          this.state.audioElement.pause();
          this.state.audioElement.srcObject = null;
          if (this.state.audioElement.parentNode) {
            document.body.removeChild(this.state.audioElement);
          }
        } catch (cleanupError) {
          console.warn('🔊 [AUDIO-SETUP] Error cleaning up previous audio element:', cleanupError);
        }
      }
      
      console.log('🔊 [AUDIO-SETUP] Creating audio element');
      this.state.audioElement = document.createElement('audio');
      this.state.audioElement.autoplay = false; // Will be manually controlled
      this.state.audioElement.controls = false;
      this.state.audioElement.style.display = 'none';
      this.state.audioElement.volume = 1.0;
      this.state.audioElement.muted = false;
      this.state.audioElement.preload = 'auto';
      
      // Set attributes for better compatibility
      this.state.audioElement.setAttribute('playsinline', 'true');
      this.state.audioElement.setAttribute('webkit-playsinline', 'true');
      
      // Add comprehensive event handling
      this.state.audioElement.addEventListener('loadstart', () => {
        console.log('🔊 [AUDIO-SETUP] Audio element started loading');
      });
      
      this.state.audioElement.addEventListener('loadedmetadata', () => {
        console.log('🔊 [AUDIO-SETUP] Audio element metadata loaded');
      });
      
      this.state.audioElement.addEventListener('canplay', () => {
        console.log('🔊 [AUDIO-SETUP] Audio element can play');
      });
      
      this.state.audioElement.addEventListener('playing', () => {
        console.log('✅ [AUDIO-SETUP] Audio element is playing');
      });
      
      this.state.audioElement.addEventListener('error', async (error) => {
        console.error('❌ [AUDIO-SETUP] Audio element error:', error);
        await this.handleAudioContextError(error);
      });
      
      this.state.audioElement.addEventListener('abort', () => {
        console.warn('⚠️ [AUDIO-SETUP] Audio playback aborted');
      });
      
      this.state.audioElement.addEventListener('stalled', () => {
        console.warn('⚠️ [AUDIO-SETUP] Audio playback stalled');
      });
      
      this.state.audioElement.addEventListener('pause', () => {
        console.log('⏸️ [AUDIO-SETUP] Audio playback paused');
      });
      
      this.state.audioElement.addEventListener('ended', () => {
        console.log('🔚 [AUDIO-SETUP] Audio playback ended');
      });
      
      document.body.appendChild(this.state.audioElement);
      console.log('✅ [AUDIO-SETUP] Audio mixing setup complete');
    } catch (error) {
      console.error('❌ [AUDIO-SETUP] Failed to setup audio mixing:', error);
      await this.handleAudioContextError(error);
      throw error;
    }
  }

  private async addSpeakerStream(speakerId: string, stream: MediaStream): Promise<void> {
    try {
      console.log(`🎵 [AUDIO] Adding speaker ${speakerId} stream to broadcast manager`);
      console.log(`🎵 [AUDIO] Stream tracks:`, stream.getTracks().map(t => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      })));
      
      this.state.speakerStreams.set(speakerId, stream);

      // Always skip our own stream to prevent self-hearing
      if (speakerId === this.socket.id) {
        console.log(`🔇 [AUDIO] Skipping own stream ${speakerId} to prevent self-hearing`);
        this.emitStateChange();
        return;
      }

      // Add to audio mixing for both listeners and speakers (but not our own stream)
      if (this.state.audioContext && this.state.mixedAudioDestination) {
        console.log(`🎵 [AUDIO] Adding remote speaker ${speakerId} to audio mixer`);
        
        // Ensure audio context is running
        await this.ensureAudioContextRunning();
        
        const source = this.state.audioContext.createMediaStreamSource(stream);
        const gainNode = this.state.audioContext.createGain();
        
        // Set equal volume for both speakers
        gainNode.gain.value = 0.5;
        console.log(`🎵 [AUDIO] Created audio nodes for speaker ${speakerId}, gain: ${gainNode.gain.value}`);
        
        // Store gain node for later reference
        this.state.gainNodes.set(speakerId, gainNode);
        
        source.connect(gainNode);
        gainNode.connect(this.state.mixedAudioDestination);
        console.log(`🎵 [AUDIO] Connected speaker ${speakerId} to audio mixer destination`);
        
        console.log(`✅ [AUDIO] Added speaker ${speakerId} to audio mix`);
        
        // Start playing the mixed audio
        console.log(`🔊 [AUDIO] Starting mixed audio playback for speaker ${speakerId}`);
        await this.startMixedAudioPlayback();
      } else {
        console.warn(`⚠️ [AUDIO] Cannot add speaker ${speakerId} to mixer - audio context or destination missing`);
        console.warn(`⚠️ [AUDIO] Audio context: ${!!this.state.audioContext}, Destination: ${!!this.state.mixedAudioDestination}`);
      }

      // Emit event for UI updates
      this.emitStateChange();
    } catch (error) {
      console.error(`❌ [AUDIO] Error adding speaker ${speakerId} stream:`, error);
    }
  }

  private removePeer(peerId: string): void {
    const peer = this.state.remotePeers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.state.remotePeers.delete(peerId);
      this.state.speakerStreams.delete(peerId);
      
      // Disconnect and remove gain node
      const gainNode = this.state.gainNodes.get(peerId);
      if (gainNode) {
        gainNode.disconnect();
        this.state.gainNodes.delete(peerId);
      }
      
      console.log(`Removed peer ${peerId}`);
      this.emitStateChange();
    }
  }

  private emitStateChange(): void {
    // Emit custom event for UI to listen to
    const event = new CustomEvent('voiceBroadcastStateChange', {
      detail: {
        role: this.state.role,
        isActive: this.state.isActive,
        peerCount: this.state.remotePeers.size,
        speakerCount: this.state.speakerStreams.size
      }
    });
    window.dispatchEvent(event);
  }

  /**
   * Initialize audio context if not already initialized
   */
  private async initializeAudioContext(): Promise<void> {
    if (!this.state.audioContext) {
      try {
        console.log('Initializing audio context');
        this.state.audioContext = new AudioContext();
        console.log('Audio context initialized successfully');
      } catch (error) {
        console.error('Failed to initialize audio context:', error);
        throw error;
      }
    }
  }

  /**
   * Ensure audio context is running
   */
  private async ensureAudioContextRunning(): Promise<void> {
    // Initialize if not already initialized
    if (!this.state.audioContext) {
      await this.initializeAudioContext();
    }

    if (!this.state.audioContext) {
      throw new Error('Audio context could not be initialized');
    }

    console.log(`Audio context state: ${this.state.audioContext.state}`);

    if (this.state.audioContext.state === 'suspended') {
      try {
        console.log('Resuming suspended audio context');
        await this.state.audioContext.resume();
        console.log('Audio context resumed successfully');
      } catch (error) {
        console.error('Failed to resume audio context:', error);
        throw error;
      }
    } else if (this.state.audioContext.state === 'closed') {
      console.error('Audio context is closed, creating new one');
      // Create a new audio context if the old one is closed
      await this.initializeAudioContext();
    }
  }

  /**
   * Start playing the mixed audio stream with enhanced error handling
   */
  private async startMixedAudioPlayback(): Promise<void> {
    if (!this.state.audioElement || !this.state.mixedAudioDestination) {
      console.warn('🔊 [AUDIO-PLAYBACK] Audio element or mixed audio destination not available');
      return;
    }

    try {
      // Don't restart if already playing the same stream
      if (this.state.audioElement.srcObject === this.state.mixedAudioDestination.stream) {
        if (!this.state.audioElement.paused) {
          console.log('🔊 [AUDIO-PLAYBACK] Mixed audio already playing');
          return;
        }
      }

      console.log('🔊 [AUDIO-PLAYBACK] Starting mixed audio playback');
      
      // Ensure audio context is running before attempting playback
      await this.ensureAudioContextRunning();
      
      // Set up the audio element
      this.state.audioElement.srcObject = this.state.mixedAudioDestination.stream;
      console.log('🔊 [AUDIO-PLAYBACK] Set audio element srcObject to mixed stream');
      
      // Monitor playback
      this.setupAudioPlaybackMonitoring();
      
      // Try to play with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`🔊 [AUDIO-PLAYBACK] Attempting to play audio (attempt ${retryCount + 1}/${maxRetries})`);
          await this.state.audioElement.play();
          console.log('✅ [AUDIO-PLAYBACK] Mixed audio playback started successfully');
          return;
        } catch (playError: any) {
          retryCount++;
          console.warn(`⚠️ [AUDIO-PLAYBACK] Audio playback attempt ${retryCount} failed:`, playError);
          
          // Check if this is a user interaction required error
          if (playError?.name === 'NotAllowedError' || playError?.message?.includes('user interaction')) {
            console.log('🔊 [AUDIO-PLAYBACK] User interaction required for audio playback');
            // Set up user interaction handler
            this.setupUserInteractionHandler();
            return; // Don't retry, wait for user interaction
          }
          
          if (retryCount < maxRetries) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to resume audio context again
            await this.ensureAudioContextRunning();
          }
        }
      }
      
      // If all retries failed, set up user interaction handler
      console.warn('🔊 [AUDIO-PLAYBACK] All retry attempts failed, setting up user interaction handler');
      this.setupUserInteractionHandler();
      
    } catch (error) {
      console.error('❌ [AUDIO-PLAYBACK] Failed to start mixed audio playback:', error);
      await this.handleAudioContextError(error);
      
      // Try fallback approach
      await this.fallbackAudioPlayback();
    }
  }

  /**
   * Setup audio playback monitoring
   */
  private setupAudioPlaybackMonitoring(): void {
    if (!this.state.audioElement) return;

    const audioElement = this.state.audioElement;
    
    audioElement.onplaying = () => {
      console.log('Mixed audio is playing');
    };
    
    audioElement.onpause = () => {
      console.log('Mixed audio paused');
    };
    
    audioElement.onerror = (error) => {
      console.error('Audio playback error:', error);
      this.restartAudioPlayback();
    };
    
    audioElement.onended = () => {
      console.log('Mixed audio ended');
    };
  }

  /**
   * Restart audio playback when issues occur
   */
  private async restartAudioPlayback(): Promise<void> {
    try {
      console.log('Restarting audio playback');
      await this.startMixedAudioPlayback();
    } catch (error) {
      console.error('Failed to restart audio playback:', error);
    }
  }

  /**
   * Fallback audio playback for production environments
   */
  private async fallbackAudioPlayback(): Promise<void> {
    console.log('Attempting fallback audio playback');
    
    // Wait for user interaction
    const waitForUserInteraction = () => {
      const startPlayback = async () => {
        try {
          await this.ensureAudioContextRunning();
          if (this.state.audioElement) {
            await this.state.audioElement.play();
            console.log('Fallback audio playback started');
          }
        } catch (error) {
          console.error('Fallback playback failed:', error);
        }
        
        // Remove event listeners
        document.removeEventListener('click', startPlayback);
        document.removeEventListener('touchstart', startPlayback);
      };
      
      // Add event listeners for user interaction
      document.addEventListener('click', startPlayback, { once: true });
      document.addEventListener('touchstart', startPlayback, { once: true });
      
      console.log('Waiting for user interaction to start audio playback');
    };
    
    waitForUserInteraction();
  }

  /**
   * Setup user interaction handler for audio playback
   */
  private setupUserInteractionHandler(): void {
    console.log('🔊 [USER-INTERACTION] Setting up user interaction handler for audio playback');
    
    // Create a one-time event handler for user interaction
    const handleUserInteraction = async (event: Event) => {
      console.log('🔊 [USER-INTERACTION] User interaction detected:', event.type);
      
      try {
        // Resume audio context and start playback
        await this.ensureAudioContextRunning();
        
        if (this.state.audioElement && this.state.mixedAudioDestination) {
          console.log('🔊 [USER-INTERACTION] Attempting to start audio playback after user interaction');
          await this.state.audioElement.play();
          console.log('✅ [USER-INTERACTION] Audio playback started successfully after user interaction');
        }
        
        // Remove event listeners after successful playback
        this.removeUserInteractionListeners();
        
      } catch (error) {
        console.error('❌ [USER-INTERACTION] Failed to start audio playback after user interaction:', error);
      }
    };
    
    // Store the handler reference for cleanup
    this.userInteractionHandler = handleUserInteraction;
    
    // Add event listeners for various user interaction types
    const events = ['click', 'touchstart', 'touchend', 'keydown', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, capture: true });
    });
    
    // Show a visual indicator that user interaction is needed
    this.showUserInteractionPrompt();
  }

  /**
   * Remove user interaction listeners
   */
  private removeUserInteractionListeners(): void {
    if (this.userInteractionHandler) {
      const handler = this.userInteractionHandler;
      const events = ['click', 'touchstart', 'touchend', 'keydown', 'mousedown'];
      events.forEach(event => {
        document.removeEventListener(event, handler, { capture: true });
      });
      this.userInteractionHandler = undefined;
    }
    
    // Hide the user interaction prompt
    this.hideUserInteractionPrompt();
  }

  /**
   * Show user interaction prompt
   */
  private showUserInteractionPrompt(): void {
    console.log('🔊 [USER-INTERACTION] Showing user interaction prompt');
    
    // Create a visual prompt for user interaction
    const existingPrompt = document.getElementById('audio-interaction-prompt');
    if (existingPrompt) {
      existingPrompt.remove();
    }
    
    const prompt = document.createElement('div');
    prompt.id = 'audio-interaction-prompt';
    prompt.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10000;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    `;
    
    prompt.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>🔊</span>
        <span>Click to enable audio</span>
      </div>
    `;
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(prompt);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      this.hideUserInteractionPrompt();
    }, 10000);
  }

  /**
   * Hide user interaction prompt
   */
  private hideUserInteractionPrompt(): void {
    const prompt = document.getElementById('audio-interaction-prompt');
    if (prompt) {
      prompt.remove();
    }
  }

  /**
   * Force start audio playback (for user interaction)
   */
  async forceStartAudioPlayback(): Promise<void> {
    try {
      console.log('🔊 [FORCE-START] Force starting audio playback');
      await this.ensureAudioContextRunning();
      
      // Start mixed audio playback for both listeners and speakers
      if (this.state.audioElement && this.state.mixedAudioDestination) {
        console.log('🔊 [FORCE-START] Attempting to start mixed audio playback');
        await this.startMixedAudioPlayback();
      }
      
      console.log('✅ [FORCE-START] Audio playback force started successfully');
    } catch (error) {
      console.error('❌ [FORCE-START] Failed to force start audio playback:', error);
    }
  }

  // Getters for state inspection
  get isActive(): boolean {
    return this.state.isActive;
  }

  get role(): 'speaker' | 'listener' {
    return this.state.role;
  }

  get peerCount(): number {
    return this.state.remotePeers.size;
  }

  get speakerCount(): number {
    return this.state.speakerStreams.size;
  }

  get mixedAudioStream(): MediaStream | undefined {
    return this.state.mixedAudioDestination?.stream;
  }

  /**
   * Attempt to recover a failed connection
   */
  private async attemptConnectionRecovery(peerId: string): Promise<void> {
    try {
      console.log(`Attempting to recover connection to ${peerId}`);
      
      const peer = this.state.remotePeers.get(peerId);
      if (!peer) {
        console.log(`No peer found for ${peerId}, cannot recover`);
        return;
      }

      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if the connection is still failed
      if (peer.connection.connectionState === 'failed') {
        console.log(`Recreating connection to ${peerId}`);
        
        // Remove the failed peer
        this.removePeer(peerId);
        
        // If we're a speaker, try to recreate the connection
        if (this.state.role === 'speaker') {
          await this.createSpeakerConnection(peerId);
        }
      }
    } catch (error) {
      console.error(`Failed to recover connection to ${peerId}:`, error);
      // If recovery fails, remove the peer
      this.removePeer(peerId);
    }
  }

  /**
   * Monitor connection health and prevent users from dropping
   */
  private startConnectionHealthMonitoring(): void {
    // Check connection health every 15 seconds for faster detection
    setInterval(() => {
      this.checkConnectionHealth();
    }, 15000);
    
    // Check for stuck connections more aggressively
    setInterval(() => {
      this.checkStuckConnections();
    }, 10000);
  }

  /**
   * Check for connections stuck in "connecting" state
   */
  private checkStuckConnections(): void {
    this.state.remotePeers.forEach((peer, peerId) => {
      const connectionState = peer.connection.connectionState;
      const iceConnectionState = peer.connection.iceConnectionState;
      
      // If connection has been "connecting" for too long, restart it
      if (connectionState === 'connecting' || iceConnectionState === 'checking') {
        // Add a timestamp to track how long it's been stuck
        if (!peer.stuckSince) {
          peer.stuckSince = Date.now();
        } else if (Date.now() - peer.stuckSince > 20000) { // 20 seconds
          console.warn(`🔄 [WEBRTC] Connection to ${peerId} stuck in ${connectionState}/${iceConnectionState} for 20s, restarting`);
          this.attemptConnectionRecovery(peerId);
        }
      } else {
        // Clear stuck timestamp if connection progressed
        delete peer.stuckSince;
      }
    });
  }

  /**
   * Check the health of all connections
   */
  private checkConnectionHealth(): void {
    this.state.remotePeers.forEach((peer, peerId) => {
      const connectionState = peer.connection.connectionState;
      const iceConnectionState = peer.connection.iceConnectionState;
      console.log(`🔍 [HEALTH] Connection health check for ${peerId}: ${connectionState}/${iceConnectionState}`);
      
      if (connectionState === 'failed' || connectionState === 'disconnected' || iceConnectionState === 'failed') {
        console.log(`🚨 [HEALTH] Unhealthy connection detected for ${peerId}, attempting recovery`);
        this.attemptConnectionRecovery(peerId);
      }
    });
  }

  /**
   * Enhanced error handling for audio context issues
   */
  private async handleAudioContextError(error: any): Promise<void> {
    console.error('Audio context error detected:', error);
    
    try {
      // Try to resume audio context if suspended
      if (this.state.audioContext && this.state.audioContext.state === 'suspended') {
        console.log('Attempting to resume suspended audio context');
        await this.state.audioContext.resume();
        console.log('Audio context resumed successfully');
      }
    } catch (resumeError) {
      console.error('Failed to resume audio context:', resumeError);
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    console.log('🔊 [CLEANUP] Cleaning up VoiceBroadcastManager');
    
    // Remove user interaction handlers
    this.removeUserInteractionListeners();
    
    if (this.state.role === 'speaker') {
      await this.stopSpeaking();
    } else {
      await this.stopListening();
    }
    
    console.log('✅ [CLEANUP] VoiceBroadcastManager cleanup complete');
  }
}