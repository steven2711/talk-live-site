import { VoiceBroadcastManager } from './VoiceBroadcastManager'
import { AudioStreamManager } from './AudioStreamManager'
import {
  VoiceRoomState,
  VoiceRoomUser,
  VoiceRoomRole,
  VoiceRoomBroadcastMessage,
} from '../types/chat'

export interface VoiceRoomManagerEvents {
  roomJoined: (roomState: VoiceRoomState) => void
  roomUpdated: (roomState: VoiceRoomState) => void
  roleChanged: (newRole: VoiceRoomRole, queuePosition?: number) => void
  speakerPromoted: (userId: string) => void
  speakerDemoted: (userId: string) => void
  audioLevelUpdate: (userId: string, level: number) => void
  connectionStateChange: (connected: boolean) => void
  error: (error: string) => void
}

export class GlobalVoiceRoomManager {
  private socket: any
  private voiceBroadcastManager: VoiceBroadcastManager
  private audioStreamManager: AudioStreamManager
  private currentUser: { id: string; username: string } | null = null
  private roomState: VoiceRoomState | null = null
  private eventListeners: Partial<VoiceRoomManagerEvents> = {}
  private audioLevelInterval: number | null = null
  private isInitialized = false

  constructor(socket: any) {
    this.socket = socket
    this.voiceBroadcastManager = new VoiceBroadcastManager(socket)
    this.audioStreamManager = new AudioStreamManager()

    this.setupSocketHandlers()
    this.setupBroadcastEventHandlers()
  }

  /**
   * Initialize the voice room manager
   */
  async initialize(user: { id: string; username: string }): Promise<void> {
    try {
      if (this.isInitialized) {
        throw new Error('Already initialized')
      }

      this.currentUser = user

      // Check audio capabilities before initialization
      const hasAudioSupport = await this.checkAudioCapabilities()

      if (hasAudioSupport) {
        // Initialize audio stream manager with error handling
        try {
          await this.audioStreamManager.initialize()
          console.log('Audio stream manager initialized successfully')
        } catch (audioError) {
          console.warn(
            'Audio stream manager initialization failed, continuing with limited functionality:',
            audioError
          )
          // Continue without audio features
        }
      } else {
        console.warn(
          'Audio capabilities not available, voice room will have limited functionality'
        )
      }

      this.isInitialized = true
      console.log('GlobalVoiceRoomManager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize GlobalVoiceRoomManager:', error)
      throw error
    }
  }

  /**
   * Check if audio capabilities are available
   */
  private async checkAudioCapabilities(): Promise<boolean> {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported')
        return false
      }

      // Check WebRTC support
      if (!window.RTCPeerConnection) {
        console.warn('WebRTC not supported')
        return false
      }

      // Check microphone permission
      const hasPermission = await AudioStreamManager.checkMicrophonePermission()
      if (!hasPermission) {
        console.warn('Microphone permission denied or unavailable')
        return false
      }

      return true
    } catch (error) {
      console.warn('Error checking audio capabilities:', error)
      return false
    }
  }

  /**
   * Join the global voice room
   */
  async joinRoom(): Promise<void> {
    try {
      if (!this.isInitialized || !this.currentUser) {
        throw new Error('Manager not initialized')
      }

      console.log('Joining voice room...')
      this.socket.emit('join_voice_room', this.currentUser.username)
    } catch (error) {
      console.error('Failed to join voice room:', error)
      this.emit('error', `Failed to join voice room: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * Leave the voice room
   */
  async leaveRoom(): Promise<void> {
    try {
      console.log('Leaving voice room...')

      // Stop all audio activities
      await this.stopSpeaking()
      await this.stopListening()

      // Stop audio level monitoring
      if (this.audioLevelInterval) {
        clearInterval(this.audioLevelInterval)
        this.audioLevelInterval = null
      }

      // Notify server
      this.socket.emit('leave_voice_room')

      // Reset state
      this.roomState = null

      console.log('Left voice room successfully')
    } catch (error) {
      console.error('Error leaving voice room:', error)
      throw error
    }
  }

  /**
   * Request to become a speaker
   */
  requestSpeakerRole(): void {
    if (!this.isInitialized) {
      throw new Error('Manager not initialized')
    }

    console.log('Requesting speaker role...')
    this.socket.emit('request_speaker_role')
  }

  /**
   * Start speaking (when promoted to speaker)
   */
  async startSpeaking(): Promise<void> {
    try {
      console.log('🎤 startSpeaking() called')

      if (!this.roomState) {
        throw new Error('Not in a voice room')
      }

      console.log('🎤 Starting to speak...')

      // Resume audio context first
      console.log('🔊 Resuming audio context...')
      await this.audioStreamManager.resume()

      // Get microphone stream
      console.log('🔊 Getting microphone stream...')
      const micStream = await this.audioStreamManager.getMicrophoneStream()

      // Connect microphone to analyzer for audio level monitoring
      console.log('🔊 Connecting microphone to analyzer...')
      this.audioStreamManager.addSpeakerStream('local', micStream, 1.0)

      // 🔥 ADD THIS: Start audio playback
      this.audioStreamManager.startAudioPlayback()

      // Get list of listener IDs
      const listenerIds = this.roomState.listeners.map(
        listener => listener.user.id
      )

      // Start broadcasting to listeners
      await this.voiceBroadcastManager.startSpeaking(listenerIds)

      // Start audio level monitoring
      console.log('🔊 Starting audio level monitoring...')
      this.startAudioLevelMonitoring()

      console.log('✅ Started speaking successfully')
    } catch (error) {
      console.error('❌ Failed to start speaking:', error)
      this.emit('error', `Failed to start speaking: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * Stop speaking (when demoted from speaker)
   */
  async stopSpeaking(): Promise<void> {
    try {
      if (
        this.voiceBroadcastManager.isActive &&
        this.voiceBroadcastManager.role === 'speaker'
      ) {
        await this.voiceBroadcastManager.stopSpeaking()
      }

      // 🔥 ADD THIS: Stop audio playback
      this.audioStreamManager.stopAudioPlayback()

      this.audioStreamManager.removeSpeakerStream('local')
      this.audioStreamManager.stopMicrophone()

      // Stop audio level monitoring
      if (this.audioLevelInterval) {
        clearInterval(this.audioLevelInterval)
        this.audioLevelInterval = null
      }

      console.log('Stopped speaking')
    } catch (error) {
      console.error('Error stopping speaking:', error)
    }
  }

  /**
   * Start listening to speakers
   */
  async startListening(): Promise<void> {
    try {
      if (!this.roomState) {
        throw new Error('Not in a voice room')
      }

      console.log('Starting to listen...')

      // Get list of speaker IDs
      const speakerIds = this.roomState.speakers.map(speaker => speaker.user.id)

      if (speakerIds.length > 0) {
        await this.voiceBroadcastManager.startListening(speakerIds)
        console.log('Started listening to speakers')
      } else {
        console.log('No speakers to listen to')
      }
    } catch (error) {
      console.error('Failed to start listening:', error)
      this.emit('error', `Failed to start listening: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    try {
      if (
        this.voiceBroadcastManager.isActive &&
        this.voiceBroadcastManager.role === 'listener'
      ) {
        await this.voiceBroadcastManager.stopListening()
      }
      console.log('Stopped listening')
    } catch (error) {
      console.error('Error stopping listening:', error)
    }
  }

  /**
   * Set speaker volume
   */
  setSpeakerVolume(volume: number): void {
    this.audioStreamManager.setMasterVolume(volume)
    this.socket.emit('set_speaker_volume', volume)
  }

  /**
   * Mute/unmute microphone
   */
  muteSpeaker(muted: boolean): void {
    // The audio stream manager doesn't directly support muting,
    // so we'll control this at the track level
    this.socket.emit('mute_speaker', muted)
  }

  /**
   * Get current room state
   */
  getRoomState(): VoiceRoomState | null {
    return this.roomState
  }

  /**
   * Get current user role
   */
  getCurrentUserRole(): VoiceRoomRole | null {
    if (!this.roomState || !this.currentUser) return null

    // Check if user is a speaker
    const isSpeaker = this.roomState.speakers.some(
      speaker => speaker.user.id === this.currentUser!.id
    )
    if (isSpeaker) return VoiceRoomRole.SPEAKER

    // Check if user is a listener
    const isListener = this.roomState.listeners.some(
      listener => listener.user.id === this.currentUser!.id
    )
    if (isListener) return VoiceRoomRole.LISTENER

    return null
  }

  /**
   * Add event listener
   */
  on<K extends keyof VoiceRoomManagerEvents>(
    event: K,
    listener: VoiceRoomManagerEvents[K]
  ): void {
    this.eventListeners[event] = listener
  }

  /**
   * Remove event listener
   */
  off<K extends keyof VoiceRoomManagerEvents>(event: K): void {
    delete this.eventListeners[event]
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    try {
      console.log('Cleaning up GlobalVoiceRoomManager...')

      // Leave room if currently in one
      if (this.roomState) {
        await this.leaveRoom()
      }

      // Cleanup managers
      await this.voiceBroadcastManager.cleanup()
      await this.audioStreamManager.cleanup()

      // Clear state
      this.currentUser = null
      this.roomState = null
      this.eventListeners = {}
      this.isInitialized = false

      console.log('GlobalVoiceRoomManager cleaned up successfully')
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  }

  private setupSocketHandlers(): void {
    // Voice room events
    this.socket.on('voice_room_joined', (roomState: VoiceRoomState) => {
      console.log('Joined voice room:', roomState)
      this.roomState = roomState
      this.emit('roomJoined', roomState)

      // Start listening if we're a listener
      if (this.getCurrentUserRole() === VoiceRoomRole.LISTENER) {
        this.startListening().catch(console.error)
      }
    })

    this.socket.on('voice_room_updated', (roomState: VoiceRoomState) => {
      console.log('Voice room updated:', roomState)
      this.roomState = roomState
      this.emit('roomUpdated', roomState)
    })

    this.socket.on(
      'user_role_changed',
      (userId: string, newRole: VoiceRoomRole) => {
        console.log(
          `🎭 Socket received: User ${userId} role changed to ${newRole}`
        )
        console.log(`🎭 Current user ID: ${this.currentUser?.id}`)
        console.log(
          `🎭 Is this the current user? ${this.currentUser && userId === this.currentUser.id}`
        )

        if (this.currentUser && userId === this.currentUser.id) {
          console.log(
            '🎭 Emitting roleChanged event and calling handleRoleChange'
          )
          this.emit('roleChanged', newRole)
          this.handleRoleChange(newRole)
        } else {
          console.log('🎭 Not the current user, ignoring role change')
        }
      }
    )

    this.socket.on('speaker_changed', (newSpeakers: VoiceRoomUser[]) => {
      console.log('Speakers changed:', newSpeakers)
      if (this.roomState) {
        this.roomState.speakers = newSpeakers
        this.emit('roomUpdated', this.roomState)
      }
    })

    this.socket.on('queue_updated', (listeners: VoiceRoomUser[]) => {
      console.log('Queue updated:', listeners)
      if (this.roomState) {
        this.roomState.listeners = listeners
        this.emit('roomUpdated', this.roomState)
      }
    })

    this.socket.on(
      'audio_level_update',
      (update: { userId: string; audioLevel: number }) => {
        this.emit('audioLevelUpdate', update.userId, update.audioLevel)
      }
    )

    this.socket.on(
      'voice_room_broadcast_signal',
      (message: VoiceRoomBroadcastMessage) => {
        // Forward to broadcast manager
        this.handleBroadcastSignal(message)
      }
    )
  }

  private setupBroadcastEventHandlers(): void {
    // Listen to broadcast manager state changes
    window.addEventListener('voiceBroadcastStateChange', (event: any) => {
      const { role, isActive, peerCount, speakerCount } = event.detail
      console.log('Broadcast state change:', {
        role,
        isActive,
        peerCount,
        speakerCount,
      })
    })
  }

  private async handleRoleChange(newRole: VoiceRoomRole): Promise<void> {
    try {
      console.log(`🎭 Handling role change to: ${newRole}`)
      console.log(`🎭 VoiceRoomRole.SPEAKER: ${VoiceRoomRole.SPEAKER}`)
      console.log(`🎭 VoiceRoomRole.LISTENER: ${VoiceRoomRole.LISTENER}`)
      console.log(`🎭 Comparison result: ${newRole === VoiceRoomRole.SPEAKER}`)

      if (newRole === VoiceRoomRole.SPEAKER) {
        console.log(
          '🎤 Role changed to SPEAKER, stopping listening and starting speaking...'
        )
        await this.stopListening()
        console.log('🎤 Starting to speak...')
        await this.startSpeaking()
        this.emit('speakerPromoted', this.currentUser!.id)
      } else if (newRole === VoiceRoomRole.LISTENER) {
        console.log(
          '👂 Role changed to LISTENER, stopping speaking and starting listening...'
        )
        await this.stopSpeaking()
        await this.startListening()
        this.emit('speakerDemoted', this.currentUser!.id)
      } else {
        console.log(`🎭 Unknown role: ${newRole}`)
      }
    } catch (error) {
      console.error('❌ Error handling role change:', error)
      this.emit('error', `Failed to handle role change: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private handleBroadcastSignal(message: VoiceRoomBroadcastMessage): void {
    // This would forward WebRTC signaling messages to the broadcast manager
    // For now, we'll log them
    console.log('Received broadcast signal:', message)
  }

  private startAudioLevelMonitoring(): void {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval)
    }

    console.log('🔊 Setting up audio level monitoring interval...')

    this.audioLevelInterval = window.setInterval(() => {
      const isActive = this.audioStreamManager.isActive()

      if (isActive) {
        const level = this.audioStreamManager.getCurrentVolume()
        const normalizedLevel = Math.round(level * 100)

        console.log(
          `🔊 Audio level: ${level.toFixed(4)}, Normalized: ${normalizedLevel}%`
        )

        // Send to server
        this.socket.emit('send_audio_level', normalizedLevel)

        // Emit locally
        if (this.currentUser) {
          this.emit('audioLevelUpdate', this.currentUser.id, normalizedLevel)
        }
      } else {
        console.log('⚠️ Audio context not active, attempting to resume...')
        this.audioStreamManager.resume().catch(console.error)
      }
    }, 100) // Update every 100ms
  }

  private emit<K extends keyof VoiceRoomManagerEvents>(
    event: K,
    ...args: Parameters<VoiceRoomManagerEvents[K]>
  ): void {
    console.log(`🎭 Emitting event: ${event}`, args)
    const listener = this.eventListeners[event]
    console.log(`🎭 Event listener exists: ${!!listener}`)
    if (listener) {
      console.log(`🎭 Calling event listener for: ${event}`)
      ;(listener as any)(...args)
    } else {
      console.log(`🎭 No event listener found for: ${event}`)
    }
  }

  updateCurrentUser(user: { id: string; username: string }): void {
    console.log('🔄 Updating current user:', user)
    this.currentUser = user
  }
}
