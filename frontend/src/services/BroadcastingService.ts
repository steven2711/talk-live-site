import { VoiceBroadcastManager } from './VoiceBroadcastManager';
import { AudioStreamManager } from './AudioStreamManager';
import { VoiceTransitionManager, TransitionEvents } from './VoiceTransitionManager';
import { Socket } from 'socket.io-client';

export interface BroadcastingConfig {
  maxSpeakers: number;
  audioConfig: {
    sampleRate: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  transitionConfig: {
    fadeOutDuration: number;
    fadeInDuration: number;
    crossfadeDuration: number;
    bufferTime: number;
  };
  mixerConfig: {
    speakerGain: number;
    masterVolume: number;
    enableCompression: boolean;
    enableEqualizer: boolean;
  };
}

export interface RoomState {
  speakers: Array<{ id: string; username: string; audioLevel: number }>;
  listeners: Array<{ id: string; username: string }>;
  queue: Array<{ id: string; username: string; position: number }>;
  currentUserId: string;
  currentUserRole: 'speaker' | 'listener' | 'queue';
}

export enum BroadcastingEvents {
  ROLE_CHANGED = 'role_changed',
  SPEAKER_ADDED = 'speaker_added',
  SPEAKER_REMOVED = 'speaker_removed',
  LISTENER_JOINED = 'listener_joined',
  LISTENER_LEFT = 'listener_left',
  AUDIO_LEVEL_UPDATE = 'audio_level_update',
  CONNECTION_STATE_CHANGED = 'connection_state_changed',
  ERROR = 'error'
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  BROADCASTING = 'broadcasting',
  LISTENING = 'listening',
  ERROR = 'error'
}

export class BroadcastingService {
  private socket: Socket;
  private broadcastManager!: VoiceBroadcastManager;
  private audioManager!: AudioStreamManager;
  private transitionManager!: VoiceTransitionManager;
  private config: BroadcastingConfig;
  private roomState: RoomState;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private eventListeners: Map<string, Function[]> = new Map();
  private audioLevelInterval: NodeJS.Timeout | null = null;

  constructor(socket: Socket, config: Partial<BroadcastingConfig> = {}) {
    this.socket = socket;
    
    this.config = {
      maxSpeakers: 2,
      audioConfig: {
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      transitionConfig: {
        fadeOutDuration: 1000,
        fadeInDuration: 1000,
        crossfadeDuration: 2000,
        bufferTime: 500
      },
      mixerConfig: {
        speakerGain: 0.5,
        masterVolume: 1.0,
        enableCompression: true,
        enableEqualizer: false
      },
      ...config
    };

    this.roomState = {
      speakers: [],
      listeners: [],
      queue: [],
      currentUserId: socket.id || '',
      currentUserRole: 'listener'
    };

    this.initializeServices();
    this.setupSocketHandlers();
    this.setupTransitionHandlers();
  }

  private initializeServices(): void {
    // Initialize audio manager
    this.audioManager = new AudioStreamManager(this.config.mixerConfig);
    
    // Initialize broadcast manager
    this.broadcastManager = new VoiceBroadcastManager(this.socket);
    
    // Initialize transition manager
    this.transitionManager = new VoiceTransitionManager(
      this.broadcastManager,
      this.audioManager,
      this.config.transitionConfig
    );
  }

  private setupSocketHandlers(): void {
    // Room state updates
    this.socket.on('room_state_updated', (data: { speakers: string[], listeners: string[], queue: string[] }) => {
      this.updateRoomState(data);
    });

    // Speaker promotion/demotion
    this.socket.on('speaker_promoted', async (data: { newSpeakerId: string, listenerIds: string[] }) => {
      if (data.newSpeakerId === this.socket.id) {
        await this.handlePromotion(data.listenerIds);
      } else {
        this.handlePeerPromotion(data.newSpeakerId);
      }
    });

    this.socket.on('speaker_demoted', async (data: { demotedSpeakerId: string }) => {
      if (data.demotedSpeakerId === this.socket.id) {
        await this.handleDemotion();
      } else {
        this.handlePeerDemotion(data.demotedSpeakerId);
      }
    });

    // Peer disconnections
    this.socket.on('peer_disconnected', async (peerId: string) => {
      await this.handlePeerDisconnection(peerId);
    });

    // Connection status
    this.socket.on('connect', () => {
      this.setConnectionState(ConnectionState.CONNECTED);
    });

    this.socket.on('disconnect', () => {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.cleanup();
    });

    // Error handling
    this.socket.on('error', (error: string) => {
      this.handleError(new Error(error));
    });
  }

  private setupTransitionHandlers(): void {
    this.transitionManager.on(TransitionEvents.TRANSITION_START, (data: any) => {
      console.log('Transition started:', data);
    });

    this.transitionManager.on(TransitionEvents.TRANSITION_COMPLETE, (data: any) => {
      console.log('Transition completed:', data);
      this.emit(BroadcastingEvents.ROLE_CHANGED, {
        newRole: this.roomState.currentUserRole,
        speakers: data.finalSpeakers
      });
    });

    this.transitionManager.on(TransitionEvents.TRANSITION_ERROR, (data: any) => {
      console.error('Transition error:', data);
      this.handleError(new Error(data.error));
    });
  }

  /**
   * Join the voice room
   */
  async joinRoom(username: string): Promise<void> {
    try {
      this.setConnectionState(ConnectionState.CONNECTING);
      
      // Initialize audio manager
      await this.audioManager.initialize();
      
      // Setup user interaction handler for audio
      this.setupUserInteractionHandler();
      
      // Join the voice room
      this.socket.emit('join_voice_room', username);
      
      this.roomState.currentUserId = this.socket.id || '';
      console.log('Joined voice room successfully');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Leave the voice room
   */
  async leaveRoom(): Promise<void> {
    try {
      // Stop current activity
      if (this.roomState.currentUserRole === 'speaker') {
        await this.stopSpeaking();
      } else if (this.roomState.currentUserRole === 'listener') {
        await this.stopListening();
      }

      // Leave the room
      this.socket.emit('leave_voice_room');
      
      // Cleanup
      await this.cleanup();
      
      this.setConnectionState(ConnectionState.DISCONNECTED);
      console.log('Left voice room successfully');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Request to become a speaker
   */
  async requestSpeakerRole(): Promise<void> {
    try {
      if (this.roomState.currentUserRole === 'speaker') {
        throw new Error('Already a speaker');
      }

      this.socket.emit('request_speaker_role');
      console.log('Requested speaker role');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Stop speaking and return to listener role
   */
  async stopSpeaking(): Promise<void> {
    try {
      if (this.roomState.currentUserRole !== 'speaker') {
        return;
      }

      await this.broadcastManager.stopSpeaking();
      this.stopAudioLevelMonitoring();
      
      this.roomState.currentUserRole = 'listener';
      this.setConnectionState(ConnectionState.LISTENING);
      
      console.log('Stopped speaking');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Start listening to speakers
   */
  async startListening(): Promise<void> {
    try {
      if (this.roomState.currentUserRole === 'speaker') {
        return;
      }

      const speakerIds = this.roomState.speakers.map(s => s.id);
      await this.broadcastManager.startListening(speakerIds);
      
      this.roomState.currentUserRole = 'listener';
      this.setConnectionState(ConnectionState.LISTENING);
      
      console.log('Started listening');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Resume audio contexts and start playback (for user interaction)
   */
  async resumeAudioPlayback(): Promise<void> {
    try {
      console.log('Resuming audio playback after user interaction');
      
      // Resume audio manager
      await this.audioManager.resume();
      
      // Force start audio playback
      await this.audioManager.forceStartAudioPlayback();
      
      // Force start broadcast manager audio playback
      if (this.broadcastManager && typeof this.broadcastManager.forceStartAudioPlayback === 'function') {
        await this.broadcastManager.forceStartAudioPlayback();
      }
      
      console.log('Audio playback resumed successfully');
    } catch (error) {
      console.error('Failed to resume audio playback:', error);
      this.handleError(error as Error);
    }
  }

  /**
   * Setup user interaction handler for audio context resume
   */
  private setupUserInteractionHandler(): void {
    let interactionHandled = false;
    
    const handleUserInteraction = async () => {
      if (interactionHandled) return;
      interactionHandled = true;
      
      try {
        console.log('User interaction detected, resuming audio');
        await this.resumeAudioPlayback();
      } catch (error) {
        console.error('Failed to handle user interaction:', error);
      }
      
      // Remove event listeners
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
    
    // Add event listeners for user interaction
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    
    console.log('User interaction handler setup complete');
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    try {
      if (this.roomState.currentUserRole !== 'listener') {
        return;
      }

      await this.broadcastManager.stopListening();
      console.log('Stopped listening');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async handlePromotion(listenerIds: string[]): Promise<void> {
    try {
      await this.transitionManager.handleSpeakerPromotion(this.socket.id!, listenerIds);
      await this.broadcastManager.startSpeaking(listenerIds);
      
      this.roomState.currentUserRole = 'speaker';
      this.setConnectionState(ConnectionState.BROADCASTING);
      this.startAudioLevelMonitoring();
      
      this.emit(BroadcastingEvents.ROLE_CHANGED, {
        newRole: 'speaker',
        listenerIds
      });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async handleDemotion(): Promise<void> {
    try {
      await this.transitionManager.handleSpeakerDemotion(this.socket.id!);
      await this.stopSpeaking();
      await this.startListening();
      
      this.emit(BroadcastingEvents.ROLE_CHANGED, {
        newRole: 'listener'
      });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private handlePeerPromotion(speakerId: string): void {
    const speaker = this.roomState.speakers.find(s => s.id === speakerId);
    if (!speaker) {
      this.roomState.speakers.push({
        id: speakerId,
        username: 'Unknown',
        audioLevel: 0
      });
    }
    
    this.emit(BroadcastingEvents.SPEAKER_ADDED, { speakerId });
  }

  private handlePeerDemotion(speakerId: string): void {
    this.roomState.speakers = this.roomState.speakers.filter(s => s.id !== speakerId);
    this.audioManager.removeSpeakerStream(speakerId);
    
    this.emit(BroadcastingEvents.SPEAKER_REMOVED, { speakerId });
  }

  private async handlePeerDisconnection(peerId: string): Promise<void> {
    try {
      // Find replacement if this was a speaker
      const wasSpeaker = this.roomState.speakers.some(s => s.id === peerId);
      if (wasSpeaker) {
        const replacement = this.roomState.queue[0];
        if (replacement) {
          await this.transitionManager.handleSpeakerDisconnection(
            peerId,
            replacement.id,
            this.roomState.listeners.map(l => l.id)
          );
        } else {
          await this.transitionManager.handleSpeakerDisconnection(peerId);
        }
      }

      // Remove from all lists
      this.roomState.speakers = this.roomState.speakers.filter(s => s.id !== peerId);
      this.roomState.listeners = this.roomState.listeners.filter(l => l.id !== peerId);
      this.roomState.queue = this.roomState.queue.filter(q => q.id !== peerId);
      
      this.audioManager.removeSpeakerStream(peerId);
      
      this.emit(BroadcastingEvents.SPEAKER_REMOVED, { speakerId: peerId });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private updateRoomState(data: { speakers: string[], listeners: string[], queue: string[] }): void {
    // Update room state structure
    this.roomState.speakers = data.speakers.map(id => ({
      id,
      username: 'Unknown', // Will be updated with actual usernames
      audioLevel: 0
    }));
    
    this.roomState.listeners = data.listeners.map(id => ({
      id,
      username: 'Unknown'
    }));
    
    this.roomState.queue = data.queue.map((id, index) => ({
      id,
      username: 'Unknown',
      position: index + 1
    }));

    // Update current user role
    if (data.speakers.includes(this.roomState.currentUserId)) {
      this.roomState.currentUserRole = 'speaker';
    } else if (data.listeners.includes(this.roomState.currentUserId)) {
      this.roomState.currentUserRole = 'listener';
    } else if (data.queue.includes(this.roomState.currentUserId)) {
      this.roomState.currentUserRole = 'queue';
    }
  }

  private startAudioLevelMonitoring(): void {
    if (this.audioLevelInterval) return;

    this.audioLevelInterval = setInterval(() => {
      const volume = this.audioManager.getCurrentVolume();
      this.socket.emit('send_audio_level', volume);
      
      this.emit(BroadcastingEvents.AUDIO_LEVEL_UPDATE, {
        userId: this.roomState.currentUserId,
        level: volume
      });
    }, 100); // Update every 100ms
  }

  private stopAudioLevelMonitoring(): void {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.emit(BroadcastingEvents.CONNECTION_STATE_CHANGED, { state });
    }
  }

  private handleError(error: Error): void {
    console.error('Broadcasting service error:', error);
    this.setConnectionState(ConnectionState.ERROR);
    this.emit(BroadcastingEvents.ERROR, { error: error.message });
  }

  // Event system
  on(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(event, listeners);
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in broadcasting event listener for ${event}:`, error);
      }
    });
  }

  // Public getters
  get currentRole(): 'speaker' | 'listener' | 'queue' {
    return this.roomState.currentUserRole;
  }

  get speakers(): Array<{ id: string; username: string; audioLevel: number }> {
    return [...this.roomState.speakers];
  }

  get listeners(): Array<{ id: string; username: string }> {
    return [...this.roomState.listeners];
  }

  get queue(): Array<{ id: string; username: string; position: number }> {
    return [...this.roomState.queue];
  }

  get isConnected(): boolean {
    return this.connectionState !== ConnectionState.DISCONNECTED && 
           this.connectionState !== ConnectionState.ERROR;
  }

  get isSpeaking(): boolean {
    return this.connectionState === ConnectionState.BROADCASTING;
  }

  get isListening(): boolean {
    return this.connectionState === ConnectionState.LISTENING;
  }

  get connectionStatus(): ConnectionState {
    return this.connectionState;
  }

  // Audio controls
  setSpeakerVolume(speakerId: string, volume: number): void {
    this.audioManager.setSpeakerGain(speakerId, volume);
    this.socket.emit('set_speaker_volume', volume);
  }

  setMasterVolume(volume: number): void {
    this.audioManager.setMasterVolume(volume);
  }

  muteSpeaker(speakerId: string, muted: boolean): void {
    this.audioManager.muteSpeaker(speakerId, muted);
    if (speakerId === this.roomState.currentUserId) {
      this.socket.emit('mute_speaker', muted);
    }
  }

  // Cleanup
  private async cleanup(): Promise<void> {
    try {
      this.stopAudioLevelMonitoring();
      
      if (this.transitionManager) {
        this.transitionManager.cleanup();
      }
      
      if (this.broadcastManager) {
        await this.broadcastManager.cleanup();
      }
      
      if (this.audioManager) {
        await this.audioManager.cleanup();
      }
      
      this.eventListeners.clear();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}