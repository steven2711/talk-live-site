
export interface BroadcastPeer {
  id: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  role: 'speaker' | 'listener';
  username: string;
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
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
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
      if (this.state.isActive) {
        throw new Error('Already broadcasting');
      }

      // Get user media
      this.state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      this.state.role = 'speaker';
      this.state.isActive = true;

      // Setup audio mixing for speakers too (to hear other speakers)
      await this.setupAudioMixing();

      // Create connections to all listeners
      for (const listenerId of listenerIds) {
        await this.createSpeakerConnection(listenerId);
      }

      console.log(`Started broadcasting to ${listenerIds.length} listeners`);
    } catch (error) {
      console.error('Failed to start speaking:', error);
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
      if (this.state.isActive) {
        throw new Error('Already listening');
      }

      this.state.role = 'listener';
      this.state.isActive = true;

      // Setup audio mixing
      await this.setupAudioMixing();

      // Notify server that we're ready to receive
      this.socket.emit('ready_to_listen', { speakerIds });

      console.log(`Started listening to ${speakerIds.length} speakers`);
    } catch (error) {
      console.error('Failed to start listening:', error);
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
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    
    // Add local stream to connection
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(track => {
        connection.addTrack(track, this.state.localStream!);
      });
    }

    // Handle ICE candidates
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('broadcast_ice_candidate', {
          candidate: event.candidate,
          peerId: listenerId
        });
      }
    };

    // Handle connection state changes with retry logic
    connection.onconnectionstatechange = () => {
      console.log(`Connection to ${listenerId}: ${connection.connectionState}`);
      if (connection.connectionState === 'failed') {
        console.log(`Connection to ${listenerId} failed, attempting recovery`);
        this.attemptConnectionRecovery(listenerId);
      } else if (connection.connectionState === 'disconnected') {
        console.log(`Connection to ${listenerId} disconnected`);
        this.removePeer(listenerId);
      } else if (connection.connectionState === 'connected') {
        console.log(`Connection to ${listenerId} established successfully`);
      }
    };

    // Store peer connection
    this.state.remotePeers.set(listenerId, {
      id: listenerId,
      connection,
      role: 'listener',
      username: '' // Will be updated from server
    });

    // Create and send offer
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    
    this.socket.emit('broadcast_offer', {
      offer,
      listenerId,
      speakerId: this.socket.id
    });
  }

  private async handleBroadcastOffer(
    offer: RTCSessionDescriptionInit, 
    speakerId: string, 
    speakerUsername: string
  ): Promise<void> {
    try {
      const connection = new RTCPeerConnection({ iceServers: this.iceServers });

      // Handle incoming stream
      connection.ontrack = async (event) => {
        console.log(`Received track from speaker ${speakerId}:`, event.track);
        const [stream] = event.streams;
        if (stream) {
          console.log(`Received stream from speaker ${speakerId}`, stream);
          await this.addSpeakerStream(speakerId, stream);
        } else {
          console.warn(`No stream received from speaker ${speakerId}`);
        }
      };

      // Handle ICE candidates
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('broadcast_ice_candidate', {
            candidate: event.candidate,
            peerId: speakerId
          });
        }
      };

          // Handle connection state changes with retry logic
      connection.onconnectionstatechange = () => {
        console.log(`Connection to speaker ${speakerId}: ${connection.connectionState}`);
        if (connection.connectionState === 'failed') {
          console.log(`Connection to speaker ${speakerId} failed, attempting recovery`);
          this.attemptConnectionRecovery(speakerId);
        } else if (connection.connectionState === 'disconnected') {
          console.log(`Connection to speaker ${speakerId} disconnected`);
          this.removePeer(speakerId);
        } else if (connection.connectionState === 'connected') {
          console.log(`Connection to speaker ${speakerId} established successfully`);
        }
      };

      // Store peer connection
      this.state.remotePeers.set(speakerId, {
        id: speakerId,
        connection,
        role: 'speaker',
        username: speakerUsername
      });

      // Set remote description and create answer
      await connection.setRemoteDescription(offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      // Send answer
      this.socket.emit('broadcast_answer', {
        answer,
        speakerId,
        listenerId: this.socket.id
      });

    } catch (error) {
      console.error('Error handling broadcast offer:', error);
      throw error;
    }
  }

  private async handleBroadcastAnswer(
    answer: RTCSessionDescriptionInit, 
    listenerId: string
  ): Promise<void> {
    try {
      const peer = this.state.remotePeers.get(listenerId);
      if (!peer) {
        console.warn(`No peer connection found for listener ${listenerId}`);
        return;
      }

      await peer.connection.setRemoteDescription(answer);
      console.log(`Set remote description for listener ${listenerId}`);
    } catch (error) {
      console.error('Error handling broadcast answer:', error);
      throw error;
    }
  }

  private async handleIceCandidate(
    candidate: RTCIceCandidateInit, 
    peerId: string
  ): Promise<void> {
    try {
      const peer = this.state.remotePeers.get(peerId);
      if (!peer) {
        console.warn(`No peer connection found for ${peerId}`);
        return;
      }

      await peer.connection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  private async setupAudioMixing(): Promise<void> {
    try {
      console.log('Setting up audio mixing for listener');
      
      // Create audio context with error handling
      if (!this.state.audioContext || this.state.audioContext.state === 'closed') {
        this.state.audioContext = new AudioContext();
        
        // Set up error handling for audio context
        this.state.audioContext.addEventListener('statechange', () => {
          console.log(`Audio context state changed to: ${this.state.audioContext?.state}`);
        });
      }
      
      // Ensure audio context is running
      await this.ensureAudioContextRunning();
      
      this.state.mixedAudioDestination = this.state.audioContext.createMediaStreamDestination();
      
      // Create audio element for playback with enhanced error handling
      if (this.state.audioElement) {
        // Clean up existing audio element
        try {
          this.state.audioElement.pause();
          this.state.audioElement.srcObject = null;
          document.body.removeChild(this.state.audioElement);
        } catch (cleanupError) {
          console.warn('Error cleaning up previous audio element:', cleanupError);
        }
      }
      
      this.state.audioElement = document.createElement('audio');
      this.state.audioElement.autoplay = false;
      this.state.audioElement.controls = false;
      this.state.audioElement.style.display = 'none';
      this.state.audioElement.volume = 1.0;
      this.state.audioElement.muted = false;
      
      // Set attributes for better compatibility
      this.state.audioElement.setAttribute('playsinline', 'true');
      this.state.audioElement.setAttribute('webkit-playsinline', 'true');
      
      // Add comprehensive error handling
      this.state.audioElement.addEventListener('error', async (error) => {
        console.error('Audio element error:', error);
        await this.handleAudioContextError(error);
      });
      
      this.state.audioElement.addEventListener('abort', () => {
        console.warn('Audio playback aborted');
      });
      
      this.state.audioElement.addEventListener('stalled', () => {
        console.warn('Audio playback stalled');
      });
      
      document.body.appendChild(this.state.audioElement);
      
      console.log('Audio mixing setup complete');
    } catch (error) {
      console.error('Failed to setup audio mixing:', error);
      await this.handleAudioContextError(error);
      throw error;
    }
  }

  private async addSpeakerStream(speakerId: string, stream: MediaStream): Promise<void> {
    try {
      console.log(`Adding speaker ${speakerId} stream to broadcast manager`);
      console.log('Stream tracks:', stream.getTracks().map(t => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      })));
      
      this.state.speakerStreams.set(speakerId, stream);

      // Always skip our own stream to prevent self-hearing
      if (speakerId === this.socket.id) {
        console.log(`Skipping own stream ${speakerId} to prevent self-hearing`);
        this.emitStateChange();
        return;
      }

      // Add to audio mixing for both listeners and speakers (but not our own stream)
      if (this.state.audioContext && this.state.mixedAudioDestination) {
        
        // Ensure audio context is running
        await this.ensureAudioContextRunning();
        
        const source = this.state.audioContext.createMediaStreamSource(stream);
        const gainNode = this.state.audioContext.createGain();
        
        // Set equal volume for both speakers
        gainNode.gain.value = 0.5;
        
        // Store gain node for later reference
        this.state.gainNodes.set(speakerId, gainNode);
        
        source.connect(gainNode);
        gainNode.connect(this.state.mixedAudioDestination);
        
        console.log(`Added speaker ${speakerId} to audio mix`);
        
        // Start playing the mixed audio
        await this.startMixedAudioPlayback();
      }

      // Emit event for UI updates
      this.emitStateChange();
    } catch (error) {
      console.error('Error adding speaker stream:', error);
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
      console.warn('Audio element or mixed audio destination not available');
      return;
    }

    try {
      // Don't restart if already playing
      if (this.state.audioElement.srcObject === this.state.mixedAudioDestination.stream) {
        if (!this.state.audioElement.paused) {
          console.log('Mixed audio already playing');
          return;
        }
      }

      console.log('Starting mixed audio playback');
      
      // Ensure audio context is running before attempting playback
      await this.ensureAudioContextRunning();
      
      // Set up the audio element
      this.state.audioElement.srcObject = this.state.mixedAudioDestination.stream;
      
      // Monitor playback
      this.setupAudioPlaybackMonitoring();
      
      // Try to play with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      let lastError: any = null;
      
      while (retryCount < maxRetries) {
        try {
          await this.state.audioElement.play();
          console.log('Mixed audio playback started successfully');
          return;
        } catch (playError) {
          lastError = playError;
          retryCount++;
          console.warn(`Audio playback attempt ${retryCount} failed:`, playError);
          
          if (retryCount < maxRetries) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to resume audio context again
            await this.ensureAudioContextRunning();
          }
        }
      }
      
      // If all retries failed, throw the last error
      throw lastError;
      
    } catch (error) {
      console.error('Failed to start mixed audio playback:', error);
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
   * Force start audio playback (for user interaction)
   */
  async forceStartAudioPlayback(): Promise<void> {
    try {
      console.log('Force starting audio playback');
      await this.ensureAudioContextRunning();
      
      // Only start mixed audio playback if we're a listener
      if (this.state.role === 'listener') {
        await this.startMixedAudioPlayback();
      }
      
      console.log('Audio playback force started successfully');
    } catch (error) {
      console.error('Failed to force start audio playback:', error);
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
    // Check connection health every 30 seconds
    setInterval(() => {
      this.checkConnectionHealth();
    }, 30000);
  }

  /**
   * Check the health of all connections
   */
  private checkConnectionHealth(): void {
    this.state.remotePeers.forEach((peer, peerId) => {
      const connectionState = peer.connection.connectionState;
      console.log(`Connection health check for ${peerId}: ${connectionState}`);
      
      if (connectionState === 'failed' || connectionState === 'disconnected') {
        console.log(`Unhealthy connection detected for ${peerId}, attempting recovery`);
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
    if (this.state.role === 'speaker') {
      await this.stopSpeaking();
    } else {
      await this.stopListening();
    }
  }
}