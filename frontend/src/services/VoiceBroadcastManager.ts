import { VoiceCallStatus, WebRTCSignalingMessage } from '../types/chat';

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
      speakerStreams: new Map()
    };

    this.setupSocketHandlers();
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
  async promoteSpeaker(newSpeakerId: string, listenerIds: string[]): Promise<void> {
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

    // Handle connection state changes
    connection.onconnectionstatechange = () => {
      console.log(`Connection to ${listenerId}: ${connection.connectionState}`);
      if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
        this.removePeer(listenerId);
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
      connection.ontrack = (event) => {
        const [stream] = event.streams;
        this.addSpeakerStream(speakerId, stream);
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

      // Handle connection state changes
      connection.onconnectionstatechange = () => {
        console.log(`Connection to speaker ${speakerId}: ${connection.connectionState}`);
        if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
          this.removePeer(speakerId);
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
      this.state.audioContext = new AudioContext();
      this.state.mixedAudioDestination = this.state.audioContext.createMediaStreamDestination();
      
      console.log('Audio mixing setup complete');
    } catch (error) {
      console.error('Failed to setup audio mixing:', error);
      throw error;
    }
  }

  private addSpeakerStream(speakerId: string, stream: MediaStream): void {
    try {
      this.state.speakerStreams.set(speakerId, stream);

      // Add to audio mixing if we're a listener
      if (this.state.role === 'listener' && this.state.audioContext && this.state.mixedAudioDestination) {
        const source = this.state.audioContext.createMediaStreamSource(stream);
        const gainNode = this.state.audioContext.createGain();
        
        // Set equal volume for both speakers
        gainNode.gain.value = 0.5;
        
        source.connect(gainNode);
        gainNode.connect(this.state.mixedAudioDestination);
        
        console.log(`Added speaker ${speakerId} to audio mix`);
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

  // Cleanup method
  async cleanup(): Promise<void> {
    if (this.state.role === 'speaker') {
      await this.stopSpeaking();
    } else {
      await this.stopListening();
    }
  }
}