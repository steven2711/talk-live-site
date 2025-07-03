import { VoiceBroadcastManager } from './VoiceBroadcastManager';
import { AudioStreamManager } from './AudioStreamManager';

export interface TransitionConfig {
  fadeOutDuration: number; // ms
  fadeInDuration: number; // ms
  crossfadeDuration: number; // ms
  bufferTime: number; // ms for connection establishment
}

export interface TransitionState {
  isTransitioning: boolean;
  currentSpeakers: string[];
  pendingSpeakers: string[];
  transitionStartTime: number;
  transitionType: 'promotion' | 'demotion' | 'replacement' | 'initial';
}

export enum TransitionEvents {
  TRANSITION_START = 'transition_start',
  TRANSITION_PROGRESS = 'transition_progress',
  TRANSITION_COMPLETE = 'transition_complete',
  TRANSITION_ERROR = 'transition_error'
}

export class VoiceTransitionManager {
  private audioManager: AudioStreamManager;
  private config: TransitionConfig;
  private state: TransitionState;
  private transitionTimer: NodeJS.Timeout | null = null;
  private fadeInterval: NodeJS.Timeout | null = null;
  private eventListeners: Map<TransitionEvents, Function[]> = new Map();

  constructor(
    _broadcastManager: VoiceBroadcastManager,
    audioManager: AudioStreamManager,
    config: Partial<TransitionConfig> = {}
  ) {
    this.audioManager = audioManager;
    
    this.config = {
      fadeOutDuration: 1000,
      fadeInDuration: 1000,
      crossfadeDuration: 2000,
      bufferTime: 500,
      ...config
    };

    this.state = {
      isTransitioning: false,
      currentSpeakers: [],
      pendingSpeakers: [],
      transitionStartTime: 0,
      transitionType: 'initial'
    };

    // Initialize event listener maps
    Object.values(TransitionEvents).forEach(event => {
      this.eventListeners.set(event, []);
    });
  }

  /**
   * Handle smooth speaker promotion from queue
   */
  async handleSpeakerPromotion(
    newSpeakerId: string, 
    listenerIds: string[],
    replacedSpeakerId?: string
  ): Promise<void> {
    try {
      if (this.state.isTransitioning) {
        throw new Error('Another transition is already in progress');
      }

      this.startTransition('promotion', [newSpeakerId], replacedSpeakerId ? [replacedSpeakerId] : []);
      
      // If replacing an existing speaker, handle crossfade
      if (replacedSpeakerId) {
        await this.handleSpeakerReplacement(newSpeakerId, replacedSpeakerId, listenerIds);
      } else {
        // Simple promotion - just add the new speaker
        await this.handleSimplePromotion(newSpeakerId, listenerIds);
      }

      this.completeTransition();
      console.log(`Speaker promotion completed: ${newSpeakerId}`);
    } catch (error) {
      this.handleTransitionError(error as Error);
      throw error;
    }
  }

  /**
   * Handle speaker demotion with smooth audio handoff
   */
  async handleSpeakerDemotion(
    demotedSpeakerId: string,
    promotedSpeakerId?: string,
    listenerIds: string[] = []
  ): Promise<void> {
    try {
      if (this.state.isTransitioning) {
        throw new Error('Another transition is already in progress');
      }

      this.startTransition('demotion', promotedSpeakerId ? [promotedSpeakerId] : [], [demotedSpeakerId]);

      if (promotedSpeakerId) {
        // Simultaneous demotion and promotion
        await this.handleSpeakerReplacement(promotedSpeakerId, demotedSpeakerId, listenerIds);
      } else {
        // Simple demotion
        await this.handleSimpleDemotion(demotedSpeakerId);
      }

      this.completeTransition();
      console.log(`Speaker demotion completed: ${demotedSpeakerId}`);
    } catch (error) {
      this.handleTransitionError(error as Error);
      throw error;
    }
  }

  /**
   * Handle graceful speaker disconnection
   */
  async handleSpeakerDisconnection(
    disconnectedSpeakerId: string,
    replacementSpeakerId?: string,
    listenerIds: string[] = []
  ): Promise<void> {
    try {
      if (this.state.isTransitioning) {
        // If already transitioning, queue this disconnect
        await this.queueDisconnectionHandling(disconnectedSpeakerId, replacementSpeakerId, listenerIds);
        return;
      }

      this.startTransition('replacement', replacementSpeakerId ? [replacementSpeakerId] : [], [disconnectedSpeakerId]);

      // Immediate removal of disconnected speaker
      this.audioManager.removeSpeakerStream(disconnectedSpeakerId);
      
      if (replacementSpeakerId) {
        // Promote replacement speaker with faster fade-in
        await this.handleEmergencyPromotion(replacementSpeakerId, listenerIds);
      }

      this.completeTransition();
      console.log(`Speaker disconnection handled: ${disconnectedSpeakerId}`);
    } catch (error) {
      this.handleTransitionError(error as Error);
      throw error;
    }
  }

  /**
   * Handle initial room setup with multiple speakers
   */
  async handleInitialSetup(speakerIds: string[], listenerIds: string[]): Promise<void> {
    try {
      if (this.state.isTransitioning) {
        throw new Error('Cannot setup during transition');
      }

      this.startTransition('initial', speakerIds, []);

      // Setup all speakers simultaneously
      await Promise.all(speakerIds.map(speakerId => 
        this.setupSpeakerConnection(speakerId, listenerIds)
      ));

      this.completeTransition();
      console.log(`Initial setup completed with ${speakerIds.length} speakers`);
    } catch (error) {
      this.handleTransitionError(error as Error);
      throw error;
    }
  }

  private async handleSpeakerReplacement(
    newSpeakerId: string,
    oldSpeakerId: string,
    listenerIds: string[]
  ): Promise<void> {
    // Phase 1: Fade out old speaker
    await this.fadeOutSpeaker(oldSpeakerId);
    
    // Phase 2: Setup new speaker connection (parallel to fade out)
    const setupPromise = this.setupSpeakerConnection(newSpeakerId, listenerIds);
    
    // Phase 3: Wait for new connection and fade in
    await setupPromise;
    await this.fadeInSpeaker(newSpeakerId);
    
    // Phase 4: Remove old speaker
    this.audioManager.removeSpeakerStream(oldSpeakerId);
  }

  private async handleSimplePromotion(newSpeakerId: string, listenerIds: string[]): Promise<void> {
    // Setup connection and fade in
    await this.setupSpeakerConnection(newSpeakerId, listenerIds);
    await this.fadeInSpeaker(newSpeakerId);
  }

  private async handleSimpleDemotion(demotedSpeakerId: string): Promise<void> {
    // Fade out and remove
    await this.fadeOutSpeaker(demotedSpeakerId);
    this.audioManager.removeSpeakerStream(demotedSpeakerId);
  }

  private async handleEmergencyPromotion(newSpeakerId: string, listenerIds: string[]): Promise<void> {
    // Faster setup for emergency replacement
    const emergencyConfig = {
      ...this.config,
      fadeInDuration: Math.min(500, this.config.fadeInDuration),
      bufferTime: Math.min(250, this.config.bufferTime)
    };

    await this.setupSpeakerConnection(newSpeakerId, listenerIds);
    await this.fadeInSpeaker(newSpeakerId, emergencyConfig.fadeInDuration);
  }

  private async setupSpeakerConnection(speakerId: string, _listenerIds: string[]): Promise<void> {
    // This would typically involve WebRTC connection setup
    // For now, we'll simulate the connection establishment
    await new Promise(resolve => setTimeout(resolve, this.config.bufferTime));
    
    // Update current speakers list
    if (!this.state.currentSpeakers.includes(speakerId)) {
      this.state.currentSpeakers.push(speakerId);
    }
  }

  private async fadeOutSpeaker(speakerId: string, duration?: number): Promise<void> {
    const fadeTime = duration || this.config.fadeOutDuration;
    const steps = 20;
    const stepDuration = fadeTime / steps;
    
    return new Promise((resolve) => {
      let step = 0;
      this.fadeInterval = setInterval(() => {
        const volume = 1 - (step / steps);
        this.audioManager.setSpeakerGain(speakerId, volume);
        
        step++;
        if (step >= steps) {
          if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
          }
          resolve();
        }
      }, stepDuration);
    });
  }

  private async fadeInSpeaker(speakerId: string, duration?: number): Promise<void> {
    const fadeTime = duration || this.config.fadeInDuration;
    const steps = 20;
    const stepDuration = fadeTime / steps;
    
    return new Promise((resolve) => {
      let step = 0;
      this.fadeInterval = setInterval(() => {
        const volume = step / steps;
        this.audioManager.setSpeakerGain(speakerId, volume);
        
        step++;
        if (step >= steps) {
          if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
          }
          resolve();
        }
      }, stepDuration);
    });
  }

  private startTransition(
    type: TransitionState['transitionType'],
    pendingSpeakers: string[],
    removingSpeakers: string[]
  ): void {
    this.state = {
      isTransitioning: true,
      currentSpeakers: [...this.state.currentSpeakers],
      pendingSpeakers,
      transitionStartTime: Date.now(),
      transitionType: type
    };

    // Remove speakers that are being replaced
    removingSpeakers.forEach(speakerId => {
      const index = this.state.currentSpeakers.indexOf(speakerId);
      if (index > -1) {
        this.state.currentSpeakers.splice(index, 1);
      }
    });

    this.emit(TransitionEvents.TRANSITION_START, {
      type,
      pendingSpeakers,
      removingSpeakers,
      timestamp: this.state.transitionStartTime
    });
  }

  private completeTransition(): void {
    // Move pending speakers to current
    this.state.pendingSpeakers.forEach(speakerId => {
      if (!this.state.currentSpeakers.includes(speakerId)) {
        this.state.currentSpeakers.push(speakerId);
      }
    });

    const transitionDuration = Date.now() - this.state.transitionStartTime;
    
    this.emit(TransitionEvents.TRANSITION_COMPLETE, {
      type: this.state.transitionType,
      duration: transitionDuration,
      finalSpeakers: [...this.state.currentSpeakers]
    });

    this.state = {
      isTransitioning: false,
      currentSpeakers: [...this.state.currentSpeakers],
      pendingSpeakers: [],
      transitionStartTime: 0,
      transitionType: 'initial'
    };
  }

  private handleTransitionError(error: Error): void {
    console.error('Transition error:', error);
    
    this.emit(TransitionEvents.TRANSITION_ERROR, {
      error: error.message,
      type: this.state.transitionType,
      timestamp: Date.now()
    });

    // Reset transition state
    this.state.isTransitioning = false;
    this.state.pendingSpeakers = [];
    
    // Clear any active intervals
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
  }

  private async queueDisconnectionHandling(
    disconnectedSpeakerId: string,
    replacementSpeakerId?: string,
    listenerIds: string[] = []
  ): Promise<void> {
    // Wait for current transition to complete
    await new Promise<void>((resolve) => {
      const checkTransition = () => {
        if (!this.state.isTransitioning) {
          resolve();
        } else {
          setTimeout(checkTransition, 100);
        }
      };
      checkTransition();
    });

    // Now handle the disconnection
    await this.handleSpeakerDisconnection(disconnectedSpeakerId, replacementSpeakerId, listenerIds);
  }

  // Event system
  on(event: TransitionEvents, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  off(event: TransitionEvents, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(event, listeners);
    }
  }

  private emit(event: TransitionEvents, data: any): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in transition event listener for ${event}:`, error);
      }
    });
  }

  // Public getters
  get isTransitioning(): boolean {
    return this.state.isTransitioning;
  }

  get currentSpeakers(): string[] {
    return [...this.state.currentSpeakers];
  }

  get transitionType(): TransitionState['transitionType'] {
    return this.state.transitionType;
  }

  // Cleanup
  cleanup(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    this.eventListeners.clear();
    
    this.state = {
      isTransitioning: false,
      currentSpeakers: [],
      pendingSpeakers: [],
      transitionStartTime: 0,
      transitionType: 'initial'
    };
  }
}