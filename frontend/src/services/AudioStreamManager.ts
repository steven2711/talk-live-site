export interface AudioStreamConfig {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
}

export interface MixerConfig {
  speakerGain: number;
  masterVolume: number;
  enableCompression: boolean;
  enableEqualizer: boolean;
}

export class AudioStreamManager {
  private audioContext: AudioContext | null = null;
  private localStream: MediaStream | null = null;
  private mixerDestination: MediaStreamAudioDestinationNode | null = null;
  private speakerSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  constructor(private config: MixerConfig = {
    speakerGain: 0.5,
    masterVolume: 1.0,
    enableCompression: true,
    enableEqualizer: false
  }) {}

  /**
   * Initialize audio context and setup audio processing chain
   */
  async initialize(): Promise<void> {
    try {
      this.audioContext = new AudioContext();
      
      // Create master gain node
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.config.masterVolume;

      // Create compressor for audio dynamics
      if (this.config.enableCompression) {
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
      }

      // Create analyser for audio visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Create destination for mixed audio
      this.mixerDestination = this.audioContext.createMediaStreamDestination();

      // Connect the audio processing chain
      this.setupAudioChain();

      console.log('AudioStreamManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AudioStreamManager:', error);
      throw error;
    }
  }

  /**
   * Get microphone stream for speaking
   */
  async getMicrophoneStream(config: Partial<AudioStreamConfig> = {}): Promise<MediaStream> {
    try {
      const streamConfig: AudioStreamConfig = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
        ...config
      };

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: streamConfig.echoCancellation,
          noiseSuppression: streamConfig.noiseSuppression,
          autoGainControl: streamConfig.autoGainControl,
          sampleRate: streamConfig.sampleRate,
          channelCount: streamConfig.channelCount
        }
      });

      console.log('Microphone stream acquired successfully');
      return this.localStream;
    } catch (error) {
      console.error('Failed to get microphone stream:', error);
      throw error;
    }
  }

  /**
   * Add a speaker's audio stream to the mixer
   */
  addSpeakerStream(speakerId: string, stream: MediaStream, gain: number = this.config.speakerGain): void {
    if (!this.audioContext || !this.mixerDestination) {
      throw new Error('AudioStreamManager not initialized');
    }

    try {
      // Create audio source from stream
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // Create gain node for this speaker
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = gain;

      // Store references
      this.speakerSources.set(speakerId, source);
      this.gainNodes.set(speakerId, gainNode);

      // Connect to audio chain
      source.connect(gainNode);
      gainNode.connect(this.getAudioChainInput());

      console.log(`Added speaker ${speakerId} to audio mixer with gain ${gain}`);
    } catch (error) {
      console.error(`Failed to add speaker ${speakerId} to mixer:`, error);
      throw error;
    }
  }

  /**
   * Remove a speaker's audio stream from the mixer
   */
  removeSpeakerStream(speakerId: string): void {
    try {
      const source = this.speakerSources.get(speakerId);
      const gainNode = this.gainNodes.get(speakerId);

      if (source) {
        source.disconnect();
        this.speakerSources.delete(speakerId);
      }

      if (gainNode) {
        gainNode.disconnect();
        this.gainNodes.delete(speakerId);
      }

      console.log(`Removed speaker ${speakerId} from audio mixer`);
    } catch (error) {
      console.error(`Failed to remove speaker ${speakerId} from mixer:`, error);
    }
  }

  /**
   * Adjust gain for a specific speaker
   */
  setSpeakerGain(speakerId: string, gain: number): void {
    const gainNode = this.gainNodes.get(speakerId);
    if (gainNode) {
      gainNode.gain.value = Math.max(0, Math.min(1, gain));
      console.log(`Set gain for speaker ${speakerId} to ${gain}`);
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
      this.config.masterVolume = volume;
      console.log(`Set master volume to ${volume}`);
    }
  }

  /**
   * Get the mixed audio stream for playback
   */
  getMixedAudioStream(): MediaStream | null {
    return this.mixerDestination?.stream || null;
  }

  /**
   * Get audio level data for visualization
   */
  getAudioLevels(): Uint8Array | null {
    if (!this.analyser) return null;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Get current audio volume level (0-1)
   */
  getCurrentVolume(): number {
    if (!this.analyser) return 0;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = (dataArray[i] - 128) / 128;
      sum += value * value;
    }
    
    return Math.sqrt(sum / dataArray.length);
  }

  /**
   * Mute/unmute a specific speaker
   */
  muteSpeaker(speakerId: string, muted: boolean): void {
    const gainNode = this.gainNodes.get(speakerId);
    if (gainNode) {
      gainNode.gain.value = muted ? 0 : this.config.speakerGain;
      console.log(`${muted ? 'Muted' : 'Unmuted'} speaker ${speakerId}`);
    }
  }

  /**
   * Check if audio context is running
   */
  isActive(): boolean {
    return this.audioContext?.state === 'running';
  }

  /**
   * Resume audio context if suspended
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
      console.log('Audio context resumed');
    }
  }

  /**
   * Stop local microphone stream
   */
  stopMicrophone(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      console.log('Microphone stream stopped');
    }
  }

  /**
   * Cleanup all audio resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop local stream
      this.stopMicrophone();

      // Disconnect all sources and gain nodes
      this.speakerSources.forEach(source => source.disconnect());
      this.gainNodes.forEach(gainNode => gainNode.disconnect());

      // Clear maps
      this.speakerSources.clear();
      this.gainNodes.clear();

      // Close audio context
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Clear references
      this.mixerDestination = null;
      this.compressor = null;
      this.masterGain = null;
      this.analyser = null;

      console.log('AudioStreamManager cleaned up successfully');
    } catch (error) {
      console.error('Error during AudioStreamManager cleanup:', error);
    }
  }

  private setupAudioChain(): void {
    if (!this.audioContext || !this.mixerDestination || !this.masterGain) {
      throw new Error('Audio context not properly initialized');
    }

    let currentNode: AudioNode = this.masterGain;

    // Add compressor if enabled
    if (this.compressor) {
      this.masterGain.connect(this.compressor);
      currentNode = this.compressor;
    }

    // Add analyser for monitoring
    if (this.analyser) {
      currentNode.connect(this.analyser);
      this.analyser.connect(this.mixerDestination);
    } else {
      currentNode.connect(this.mixerDestination);
    }
  }

  private getAudioChainInput(): AudioNode {
    return this.masterGain || this.mixerDestination!;
  }

  // Static utility methods
  static async checkMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.warn('Microphone permission denied:', error);
      return false;
    }
  }

  static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Failed to get audio devices:', error);
      return [];
    }
  }

  static async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audiooutput');
    } catch (error) {
      console.error('Failed to get audio output devices:', error);
      return [];
    }
  }
}