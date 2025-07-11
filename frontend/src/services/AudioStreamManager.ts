export interface AudioStreamConfig {
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  sampleRate: number
  channelCount: number
}

export interface MixerConfig {
  speakerGain: number
  masterVolume: number
  enableCompression: boolean
  enableEqualizer: boolean
}

export class AudioStreamManager {
  private audioContext: AudioContext | null = null
  private localStream: MediaStream | null = null
  private mixerDestination: MediaStreamAudioDestinationNode | null = null
  private speakerSources: Map<string, MediaStreamAudioSourceNode> = new Map()
  private gainNodes: Map<string, GainNode> = new Map()
  private compressor: DynamicsCompressorNode | null = null
  private masterGain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private audioElement: HTMLAudioElement | null = null
  
  // Separate monitoring for microphone audio levels
  private microphoneAnalyser: AnalyserNode | null = null
  private microphoneSource: MediaStreamAudioSourceNode | null = null

  constructor(
    private config: MixerConfig = {
      speakerGain: 0.5,
      masterVolume: 1.0,
      enableCompression: true,
      enableEqualizer: false,
    }
  ) {}

  /**
   * Initialize audio context and setup audio processing chain
   */
  async initialize(): Promise<void> {
    try {
      this.audioContext = new AudioContext()

      // Create master gain node
      this.masterGain = this.audioContext.createGain()
      this.masterGain.gain.value = this.config.masterVolume

      // Create compressor for audio dynamics
      if (this.config.enableCompression) {
        this.compressor = this.audioContext.createDynamicsCompressor()
        this.compressor.threshold.value = -24
        this.compressor.knee.value = 30
        this.compressor.ratio.value = 12
        this.compressor.attack.value = 0.003
        this.compressor.release.value = 0.25
      }

      // Create analyser for audio visualization
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8

      // Create destination for mixed audio
      this.mixerDestination = this.audioContext.createMediaStreamDestination()

      // Create audio element for playback with production-friendly settings
      this.audioElement = document.createElement('audio')
      this.audioElement.autoplay = false // Don't use autoplay for production compatibility
      this.audioElement.controls = false
      this.audioElement.style.display = 'none'
      this.audioElement.volume = 1.0
      this.audioElement.muted = false
      
      // Set additional attributes for better compatibility
      this.audioElement.setAttribute('playsinline', 'true')
      this.audioElement.setAttribute('webkit-playsinline', 'true')
      
      document.body.appendChild(this.audioElement)
      
      console.log('🔊 Audio element created with production-friendly settings')

      // Connect the audio processing chain
      this.setupAudioChain()

      // Start audio context monitoring
      this.startAudioContextMonitoring()

      console.log('AudioStreamManager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize AudioStreamManager:', error)
      throw error
    }
  }

  /**
   * Get microphone stream for speaking
   */
  async getMicrophoneStream(
    config: Partial<AudioStreamConfig> = {}
  ): Promise<MediaStream> {
    try {
      const streamConfig: AudioStreamConfig = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
        ...config,
      }

      console.log('🔊 Requesting microphone access with config:', streamConfig)

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: streamConfig.echoCancellation,
          noiseSuppression: streamConfig.noiseSuppression,
          autoGainControl: streamConfig.autoGainControl,
          sampleRate: streamConfig.sampleRate,
          channelCount: streamConfig.channelCount,
        },
      })

      console.log('✅ Microphone stream acquired successfully')
      console.log(
        '🔊 Stream tracks:',
        this.localStream.getTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        }))
      )

      return this.localStream
    } catch (error) {
      console.error('❌ Failed to get microphone stream:', error)
      throw error
    }
  }

  /**
   * Connect microphone to analyzer for audio level monitoring (without playback)
   */
  async connectMicrophoneToAnalyzer(stream: MediaStream): Promise<void> {
    try {
      if (!this.audioContext) {
        throw new Error('Audio context not initialized')
      }

      await this.ensureAudioContextRunning()

      console.log('🔊 Connecting microphone to separate analyzer for level monitoring')

      // Create separate analyzer for microphone monitoring
      this.microphoneAnalyser = this.audioContext.createAnalyser()
      this.microphoneAnalyser.fftSize = 256
      this.microphoneAnalyser.smoothingTimeConstant = 0.8

      // Create source from microphone stream
      this.microphoneSource = this.audioContext.createMediaStreamSource(stream)

      // Connect microphone directly to its own analyzer (NOT to playback chain)
      this.microphoneSource.connect(this.microphoneAnalyser)

      console.log('✅ Microphone connected to analyzer for level monitoring')
    } catch (error) {
      console.error('❌ Failed to connect microphone to analyzer:', error)
      throw error
    }
  }

  /**
   * Disconnect microphone from analyzer
   */
  disconnectMicrophoneAnalyzer(): void {
    try {
      if (this.microphoneSource) {
        this.microphoneSource.disconnect()
        this.microphoneSource = null
      }
      this.microphoneAnalyser = null
      console.log('🔊 Microphone analyzer disconnected')
    } catch (error) {
      console.error('❌ Failed to disconnect microphone analyzer:', error)
    }
  }

  /**
   * Add a speaker's audio stream to the mixer
   */
  async addSpeakerStream(
    speakerId: string,
    stream: MediaStream,
    gain: number = this.config.speakerGain
  ): Promise<void> {
    if (!this.audioContext || !this.mixerDestination) {
      throw new Error('AudioStreamManager not initialized')
    }

    try {
      console.log(`🔊 Adding speaker ${speakerId} to audio mixer`)
      console.log(`🔊 Audio context state: ${this.audioContext.state}`)
      console.log(
        `🔊 Stream tracks:`,
        stream.getTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        }))
      )

      // Ensure audio context is running
      await this.ensureAudioContextRunning()

      // Create audio source from stream
      const source = this.audioContext.createMediaStreamSource(stream)
      console.log(`🔊 Created MediaStreamSource for ${speakerId}`)

      // Create gain node for this speaker
      const gainNode = this.audioContext.createGain()
      gainNode.gain.value = gain
      console.log(`🔊 Created GainNode for ${speakerId} with gain ${gain}`)

      // Store references
      this.speakerSources.set(speakerId, source)
      this.gainNodes.set(speakerId, gainNode)

      // Connect to audio chain
      source.connect(gainNode)
      gainNode.connect(this.getAudioChainInput())
      console.log(`🔊 Connected ${speakerId} to audio chain`)

      // Start audio playback if not already playing
      if (!this.isAudioPlaying()) {
        console.log('🔊 Starting audio playback for new speaker')
        await this.startAudioPlayback()
      }

      console.log(
        `✅ Added speaker ${speakerId} to audio mixer with gain ${gain}`
      )
    } catch (error) {
      console.error(`❌ Failed to add speaker ${speakerId} to mixer:`, error)
      throw error
    }
  }

  /**
   * Remove a speaker's audio stream from the mixer
   */
  removeSpeakerStream(speakerId: string): void {
    try {
      const source = this.speakerSources.get(speakerId)
      const gainNode = this.gainNodes.get(speakerId)

      if (source) {
        source.disconnect()
        this.speakerSources.delete(speakerId)
      }

      if (gainNode) {
        gainNode.disconnect()
        this.gainNodes.delete(speakerId)
      }

      console.log(`Removed speaker ${speakerId} from audio mixer`)
    } catch (error) {
      console.error(`Failed to remove speaker ${speakerId} from mixer:`, error)
    }
  }

  /**
   * Adjust gain for a specific speaker
   */
  setSpeakerGain(speakerId: string, gain: number): void {
    const gainNode = this.gainNodes.get(speakerId)
    if (gainNode) {
      gainNode.gain.value = Math.max(0, Math.min(1, gain))
      console.log(`Set gain for speaker ${speakerId} to ${gain}`)
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume))
      this.config.masterVolume = volume
      console.log(`Set master volume to ${volume}`)
    }
  }

  /**
   * Get the mixed audio stream for playback
   */
  getMixedAudioStream(): MediaStream | null {
    const stream = this.mixerDestination?.stream || null
    if (stream) {
      console.log('🔊 Mixed audio stream available:', {
        id: stream.id,
        tracks: stream.getTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState
        }))
      })
    }
    return stream
  }

  /**
   * Check if audio is currently playing
   */
  private isAudioPlaying(): boolean {
    if (!this.audioElement) return false
    return !this.audioElement.paused && !this.audioElement.ended && this.audioElement.readyState > 2
  }

  /**
   * Force audio playback to start (for user interaction)
   */
  async forceStartAudioPlayback(): Promise<void> {
    console.log('🔊 Force starting audio playback (user interaction)')
    
    try {
      // Ensure audio context is running
      await this.ensureAudioContextRunning()
      
      // Start audio playback
      await this.startAudioPlayback()
      
    } catch (error) {
      console.error('❌ Failed to force start audio playback:', error)
      throw error
    }
  }

  /**
   * Get audio level data for visualization
   */
  getAudioLevels(): Uint8Array | null {
    if (!this.analyser) return null

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(dataArray)
    return dataArray
  }

  /**
   * Get current audio volume level (0-1)
   */
  getCurrentVolume(): number {
    // Use microphone analyzer for local audio level monitoring
    const analyzer = this.microphoneAnalyser || this.analyser
    
    if (!analyzer) {
      console.log('🔊 No analyser available for volume measurement')
      return 0
    }

    const dataArray = new Uint8Array(analyzer.frequencyBinCount)
    analyzer.getByteTimeDomainData(dataArray)

    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const value = (dataArray[i] - 128) / 128
      sum += value * value
    }

    const volume = Math.sqrt(sum / dataArray.length)
    const analyzerType = this.microphoneAnalyser ? 'microphone' : 'main'
    console.log(
      `🔊 Raw volume: ${volume} (${analyzerType} analyzer), FFT size: ${analyzer.fftSize}, Frequency bins: ${analyzer.frequencyBinCount}`
    )

    return volume
  }

  /**
   * Mute/unmute a specific speaker
   */
  muteSpeaker(speakerId: string, muted: boolean): void {
    const gainNode = this.gainNodes.get(speakerId)
    if (gainNode) {
      gainNode.gain.value = muted ? 0 : this.config.speakerGain
      console.log(`${muted ? 'Muted' : 'Unmuted'} speaker ${speakerId}`)
    }
  }

  /**
   * Check if audio context is running
   */
  isActive(): boolean {
    const isActive = this.audioContext?.state === 'running'
    console.log(
      `🔊 Audio context state: ${this.audioContext?.state}, isActive: ${isActive}`
    )
    return isActive
  }

  /**
   * Monitor audio playback state and handle issues
   */
  private monitorAudioPlayback(): void {
    if (!this.audioElement) return

    const handlePlaybackIssue = (event: Event) => {
      console.warn('⚠️  Audio playback issue detected:', event.type)
      
      // Try to restart playback
      this.restartAudioPlayback()
    }

    // Monitor for playback issues
    this.audioElement.addEventListener('error', handlePlaybackIssue)
    this.audioElement.addEventListener('abort', handlePlaybackIssue)
    this.audioElement.addEventListener('stalled', handlePlaybackIssue)
    
    // Monitor for successful playback
    this.audioElement.addEventListener('playing', () => {
      console.log('✅ Audio element is playing')
    })
    
    this.audioElement.addEventListener('pause', () => {
      console.log('⏸️  Audio element paused')
    })
  }

  /**
   * Restart audio playback when issues are detected
   */
  private async restartAudioPlayback(): Promise<void> {
    try {
      console.log('🔄 Restarting audio playback')
      await this.stopAudioPlayback()
      await this.startAudioPlayback()
    } catch (error) {
      console.error('❌ Failed to restart audio playback:', error)
    }
  }

  /**
   * Fallback audio playback method for production environments
   */
  private async fallbackAudioPlayback(): Promise<void> {
    try {
      console.log('🔄 Attempting fallback audio playback')
      
      if (!this.mixerDestination) {
        throw new Error('No mixer destination available')
      }
      
      // Create a new audio element with different settings
      const fallbackAudio = document.createElement('audio')
      fallbackAudio.autoplay = false // Don't use autoplay for fallback
      fallbackAudio.controls = false
      fallbackAudio.style.display = 'none'
      fallbackAudio.volume = 1.0
      fallbackAudio.muted = false
      
      // Set up the stream
      fallbackAudio.srcObject = this.mixerDestination.stream
      
      // Replace the existing audio element
      if (this.audioElement) {
        document.body.removeChild(this.audioElement)
      }
      
      this.audioElement = fallbackAudio
      document.body.appendChild(this.audioElement)
      
      // Wait for user interaction to start playback
      console.log('🔊 Fallback audio element created, waiting for user interaction')
      
      // Add click handler to resume playback
      const resumePlayback = async () => {
        try {
          await this.ensureAudioContextRunning()
          await this.audioElement!.play()
          console.log('✅ Fallback audio playback started')
          document.removeEventListener('click', resumePlayback)
        } catch (error) {
          console.error('❌ Fallback playback failed:', error)
        }
      }
      
      document.addEventListener('click', resumePlayback, { once: true })
      
    } catch (error) {
      console.error('❌ Fallback audio playback failed:', error)
    }
  }

  /**
   * Resume audio context if suspended
   */
  async resume(): Promise<void> {
    await this.ensureAudioContextRunning()
  }

  /**
   * Resume audio playback for user interaction
   */
  async resumeAudioPlayback(): Promise<void> {
    console.log('🔊 Resuming audio playback (user interaction)')
    
    try {
      // Ensure audio context is running
      await this.ensureAudioContextRunning()
      
      // Start audio playback if we have streams
      if (this.speakerSources.size > 0) {
        await this.startAudioPlayback()
      }
      
    } catch (error) {
      console.error('❌ Failed to resume audio playback:', error)
      throw error
    }
  }

  /**
   * Ensure audio context is running with proper error handling
   */
  private async ensureAudioContextRunning(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized')
    }

    console.log(
      `🔊 Checking audio context state: ${this.audioContext.state}`
    )

    if (this.audioContext.state === 'suspended') {
      try {
        console.log('🔊 Resuming suspended audio context')
        await this.audioContext.resume()
        console.log('✅ Audio context resumed successfully')
        
        // Restart audio monitoring after resume
        this.startAudioContextMonitoring()
      } catch (error) {
        console.error('❌ Failed to resume audio context:', error)
        throw error
      }
    } else if (this.audioContext.state === 'closed') {
      console.error('❌ Audio context is closed, reinitializing')
      // Try to reinitialize the audio context
      await this.reinitializeAudioContext()
    } else {
      console.log('✅ Audio context is already running')
    }
  }

  /**
   * Reinitialize audio context when it's closed
   */
  private async reinitializeAudioContext(): Promise<void> {
    try {
      console.log('🔄 Reinitializing audio context')
      
      // Create new audio context
      this.audioContext = new AudioContext()
      
      // Recreate master gain node
      this.masterGain = this.audioContext.createGain()
      this.masterGain.gain.value = this.config.masterVolume

      // Recreate compressor if enabled
      if (this.config.enableCompression) {
        this.compressor = this.audioContext.createDynamicsCompressor()
        this.compressor.threshold.value = -24
        this.compressor.knee.value = 30
        this.compressor.ratio.value = 12
        this.compressor.attack.value = 0.003
        this.compressor.release.value = 0.25
      }

      // Recreate analyser
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8

      // Recreate mixer destination
      this.mixerDestination = this.audioContext.createMediaStreamDestination()

      // Reconnect audio chain
      this.setupAudioChain()

      // Reconnect all existing sources
      await this.reconnectAudioSources()

      console.log('✅ Audio context reinitialized successfully')
    } catch (error) {
      console.error('❌ Failed to reinitialize audio context:', error)
      throw error
    }
  }

  /**
   * Reconnect all audio sources after reinitialization
   */
  private async reconnectAudioSources(): Promise<void> {
    const sourcesToReconnect = Array.from(this.speakerSources.entries())
    
    // Clear existing sources
    this.speakerSources.clear()
    this.gainNodes.clear()
    
    // Reconnect each source
    for (const [speakerId, _source] of sourcesToReconnect) {
      try {
        // We need to recreate the source from the original stream
        // For now, log that we need to handle this case
        console.log(`⚠️  Need to reconnect speaker ${speakerId} - requires stream reference`)
      } catch (error) {
        console.error(`❌ Failed to reconnect speaker ${speakerId}:`, error)
      }
    }
  }

  /**
   * Start monitoring audio context state
   */
  private startAudioContextMonitoring(): void {
    if (!this.audioContext) return

    // Monitor state changes
    this.audioContext.addEventListener('statechange', () => {
      console.log(`🔊 Audio context state changed to: ${this.audioContext?.state}`)
      
      if (this.audioContext?.state === 'suspended') {
        console.log('⚠️  Audio context suspended, attempting to resume')
        this.ensureAudioContextRunning().catch(error => {
          console.error('❌ Failed to resume audio context automatically:', error)
        })
      }
    })

    // Periodic health check
    setInterval(() => {
      if (this.audioContext && this.audioContext.state !== 'running') {
        console.log(`⚠️  Audio context health check failed: ${this.audioContext.state}`)
        this.ensureAudioContextRunning().catch(error => {
          console.error('❌ Failed audio context health check:', error)
        })
      }
    }, 30000) // Check every 30 seconds
  }

  /**
   * Stop local microphone stream
   */
  stopMicrophone(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
      console.log('Microphone stream stopped')
    }
    
    // Also disconnect the microphone analyzer
    this.disconnectMicrophoneAnalyzer()
  }

  /**
   * Start audio playback with proper error handling and fallback
   */
  async startAudioPlayback(): Promise<void> {
    if (!this.audioElement || !this.mixerDestination) {
      console.error('❌ Audio element or mixer destination not available')
      return
    }

    try {
      // Ensure audio context is running
      await this.ensureAudioContextRunning()
      
      console.log('🔊 Starting audio playback')
      console.log('🔊 Mixed stream tracks:', this.mixerDestination.stream.getTracks().map(t => ({ 
        id: t.id, 
        kind: t.kind, 
        enabled: t.enabled, 
        readyState: t.readyState 
      })))
      
      // Set up audio element for playback
      this.audioElement.srcObject = this.mixerDestination.stream
      this.audioElement.volume = 1.0
      this.audioElement.muted = false
      
      // Handle playback with retry logic
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries) {
        try {
          await this.audioElement.play()
          console.log('✅ Audio playback started successfully')
          
          // Monitor playback state
          this.monitorAudioPlayback()
          return
        } catch (playError) {
          retryCount++
          console.warn(`⚠️  Audio playback attempt ${retryCount} failed:`, playError)
          
          if (retryCount < maxRetries) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Try to resume audio context again
            await this.ensureAudioContextRunning()
          } else {
            throw playError
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to start audio playback:', error)
      
      // Try fallback playback method
      await this.fallbackAudioPlayback()
    }
  }

  /**
   * Stop audio playback
   */
  async stopAudioPlayback(): Promise<void> {
    if (this.audioElement) {
      console.log('🔊 Stopping audio playback')
      
      try {
        this.audioElement.pause()
        this.audioElement.srcObject = null
        
        // Remove event listeners
        this.audioElement.removeEventListener('error', () => {})
        this.audioElement.removeEventListener('abort', () => {})
        this.audioElement.removeEventListener('stalled', () => {})
        this.audioElement.removeEventListener('playing', () => {})
        this.audioElement.removeEventListener('pause', () => {})
        
        console.log('✅ Audio playback stopped')
      } catch (error) {
        console.error('❌ Error stopping audio playback:', error)
      }
    }
  }

  /**
   * Cleanup all audio resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop local stream
      this.stopMicrophone()

      // Stop audio playback
      this.stopAudioPlayback()

      // Remove audio element from DOM
      if (this.audioElement) {
        document.body.removeChild(this.audioElement)
        this.audioElement = null
      }

      // Disconnect all sources and gain nodes
      this.speakerSources.forEach(source => source.disconnect())
      this.gainNodes.forEach(gainNode => gainNode.disconnect())

      // Clear maps
      this.speakerSources.clear()
      this.gainNodes.clear()

      // Disconnect microphone analyzer
      this.disconnectMicrophoneAnalyzer()

      // Close audio context
      if (this.audioContext) {
        await this.audioContext.close()
        this.audioContext = null
      }

      // Clear references
      this.mixerDestination = null
      this.compressor = null
      this.masterGain = null
      this.analyser = null

      console.log('AudioStreamManager cleaned up successfully')
    } catch (error) {
      console.error('Error during AudioStreamManager cleanup:', error)
    }
  }

  private setupAudioChain(): void {
    if (!this.audioContext || !this.mixerDestination || !this.masterGain) {
      throw new Error('Audio context not properly initialized')
    }

    let currentNode: AudioNode = this.masterGain

    // Add compressor if enabled
    if (this.compressor) {
      this.masterGain.connect(this.compressor)
      currentNode = this.compressor
    }

    // Add analyser for monitoring
    if (this.analyser) {
      currentNode.connect(this.analyser)
      this.analyser.connect(this.mixerDestination)
    } else {
      currentNode.connect(this.mixerDestination)
    }
  }

  private getAudioChainInput(): AudioNode {
    return this.masterGain || this.mixerDestination!
  }

  // Static utility methods
  static async checkMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (error) {
      console.warn('Microphone permission denied:', error)
      return false
    }
  }

  static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(device => device.kind === 'audioinput')
    } catch (error) {
      console.error('Failed to get audio devices:', error)
      return []
    }
  }

  static async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(device => device.kind === 'audiooutput')
    } catch (error) {
      console.error('Failed to get audio output devices:', error)
      return []
    }
  }
}
