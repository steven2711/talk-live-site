import { vi } from 'vitest';

// Mock MediaStream
export class MockMediaStream implements MediaStream {
  id: string = 'mock-stream-id';
  active: boolean = true;
  onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null = null;
  onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null = null;

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }

  tracks: MediaStreamTrack[] = [];

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  clone(): MediaStream {
    return new MockMediaStream([...this.tracks]);
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'audio');
  }

  getTrackById(trackId: string): MediaStreamTrack | null {
    return this.tracks.find(track => track.id === trackId) || null;
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'video');
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index > -1) {
      this.tracks.splice(index, 1);
    }
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
}

// Mock MediaStreamTrack
export class MockMediaStreamTrack implements MediaStreamTrack {
  contentHint: string = '';
  enabled: boolean = true;
  id: string = 'mock-track-id';
  isolated: boolean = false;
  kind: string = 'audio';
  label: string = 'Mock Audio Track';
  muted: boolean = false;
  readonly: boolean = false;
  readyState: MediaStreamTrackState = 'live';
  onended: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onmute: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onunmute: ((this: MediaStreamTrack, ev: Event) => any) | null = null;

  applyConstraints(constraints?: MediaTrackConstraints): Promise<void> {
    return Promise.resolve();
  }

  clone(): MediaStreamTrack {
    return new MockMediaStreamTrack();
  }

  getCapabilities(): MediaTrackCapabilities {
    return {};
  }

  getConstraints(): MediaTrackConstraints {
    return {};
  }

  getSettings(): MediaTrackSettings {
    return {
      deviceId: 'mock-device-id',
      groupId: 'mock-group-id'
    };
  }

  stop(): void {
    this.readyState = 'ended';
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
}

// Mock RTCPeerConnection
export class MockRTCPeerConnection implements RTCPeerConnection {
  canTrickleIceCandidates: boolean | null = true;
  connectionState: RTCPeerConnectionState = 'new';
  currentLocalDescription: RTCSessionDescription | null = null;
  currentRemoteDescription: RTCSessionDescription | null = null;
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  localDescription: RTCSessionDescription | null = null;
  onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null = null;
  ondatachannel: ((this: RTCPeerConnection, ev: RTCDataChannelEvent) => any) | null = null;
  onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => any) | null = null;
  oniceconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null = null;
  onicegatheringstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null = null;
  onnegotiationneeded: ((this: RTCPeerConnection, ev: Event) => any) | null = null;
  onsignalingstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null = null;
  ontrack: ((this: RTCPeerConnection, ev: RTCTrackEvent) => any) | null = null;
  pendingLocalDescription: RTCSessionDescription | null = null;
  pendingRemoteDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  signalingState: RTCSignalingState = 'stable';
  sctp: RTCSctpTransport | null = null;

  constructor(config?: RTCConfiguration) {}

  addIceCandidate(candidate?: RTCIceCandidateInit): Promise<void> {
    return Promise.resolve();
  }

  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
    return {} as RTCRtpSender;
  }

  addTransceiver(trackOrKind: MediaStreamTrack | string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    return {} as RTCRtpTransceiver;
  }

  close(): void {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.signalingState = 'closed';
  }

  createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({
      type: 'answer',
      sdp: 'mock-sdp-answer'
    });
  }

  createDataChannel(label: string, dataChannelDict?: RTCDataChannelInit): RTCDataChannel {
    return {} as RTCDataChannel;
  }

  createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({
      type: 'offer',
      sdp: 'mock-sdp-offer'
    });
  }

  getConfiguration(): RTCConfiguration {
    return {};
  }

  getReceivers(): RTCRtpReceiver[] {
    return [];
  }

  getSenders(): RTCRtpSender[] {
    return [];
  }

  getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
    return Promise.resolve(new Map() as RTCStatsReport);
  }

  getTransceivers(): RTCRtpTransceiver[] {
    return [];
  }

  removeTrack(sender: RTCRtpSender): void {}

  restartIce(): void {}

  setConfiguration(configuration?: RTCConfiguration): void {}

  setLocalDescription(description?: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
    return Promise.resolve();
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
}

// Mock getUserMedia
export const mockGetUserMedia = vi.fn().mockImplementation((constraints: MediaStreamConstraints) => {
  const tracks: MediaStreamTrack[] = [];
  
  if (constraints.audio) {
    const audioTrack = new MockMediaStreamTrack();
    audioTrack.kind = 'audio';
    audioTrack.label = 'Mock Microphone';
    tracks.push(audioTrack);
  }
  
  if (constraints.video) {
    const videoTrack = new MockMediaStreamTrack();
    videoTrack.kind = 'video';
    videoTrack.label = 'Mock Camera';
    tracks.push(videoTrack);
  }
  
  return Promise.resolve(new MockMediaStream(tracks));
});

// Mock AudioContext
export class MockAudioContext implements AudioContext {
  audioWorklet: AudioWorklet = {} as AudioWorklet;
  baseLatency: number = 0;
  currentTime: number = 0;
  destination: AudioDestinationNode = {} as AudioDestinationNode;
  listener: AudioListener = {} as AudioListener;
  outputLatency: number = 0;
  sampleRate: number = 44100;
  state: AudioContextState = 'suspended';
  onstatechange: ((this: BaseAudioContext, ev: Event) => any) | null = null;

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createMediaStreamSource(mediaStream: MediaStream): MediaStreamAudioSourceNode {
    return {} as MediaStreamAudioSourceNode;
  }

  createAnalyser(): AnalyserNode {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteFrequencyData: vi.fn(),
      getFloatFrequencyData: vi.fn()
    } as any;
  }

  createGain(): GainNode {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn()
    } as any;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return {
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 12 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
      connect: vi.fn(),
      disconnect: vi.fn()
    } as any;
  }

  createMediaStreamDestination(): MediaStreamAudioDestinationNode {
    return {
      stream: new MockMediaStream(),
      connect: vi.fn(),
      disconnect: vi.fn()
    } as any;
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }

  createBuffer(): AudioBuffer { return {} as AudioBuffer; }
  createBufferSource(): AudioBufferSourceNode { return {} as AudioBufferSourceNode; }
  createChannelMerger(): ChannelMergerNode { return {} as ChannelMergerNode; }
  createChannelSplitter(): ChannelSplitterNode { return {} as ChannelSplitterNode; }
  createConstantSource(): ConstantSourceNode { return {} as ConstantSourceNode; }
  createConvolver(): ConvolverNode { return {} as ConvolverNode; }
  createDelay(): DelayNode { return {} as DelayNode; }
  createDynamicsCompressor(): DynamicsCompressorNode { return {} as DynamicsCompressorNode; }
  createIIRFilter(): IIRFilterNode { return {} as IIRFilterNode; }
  createOscillator(): OscillatorNode { return {} as OscillatorNode; }
  createPanner(): PannerNode { return {} as PannerNode; }
  createPeriodicWave(): PeriodicWave { return {} as PeriodicWave; }
  createScriptProcessor(): ScriptProcessorNode { return {} as ScriptProcessorNode; }
  createStereoPanner(): StereoPannerNode { return {} as StereoPannerNode; }
  createWaveShaper(): WaveShaperNode { return {} as WaveShaperNode; }
  createBiquadFilter(): BiquadFilterNode { return {} as BiquadFilterNode; }
  decodeAudioData(): Promise<AudioBuffer> { return Promise.resolve({} as AudioBuffer); }
  createMediaElementSource(): MediaElementAudioSourceNode { return {} as MediaElementAudioSourceNode; }
  createMediaStreamDestination(): MediaStreamAudioDestinationNode { return {} as MediaStreamAudioDestinationNode; }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
}

// Setup WebRTC mocks
export const setupWebRTCMocks = () => {
  // Mock navigator.mediaDevices
  Object.defineProperty(global.navigator, 'mediaDevices', {
    writable: true,
    value: {
      getUserMedia: mockGetUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'mock-audio-input', kind: 'audioinput', label: 'Mock Microphone' },
        { deviceId: 'mock-audio-output', kind: 'audiooutput', label: 'Mock Speaker' }
      ]),
      getSupportedConstraints: vi.fn().mockReturnValue({
        audio: true,
        video: true
      })
    }
  });

  // Mock RTCPeerConnection
  global.RTCPeerConnection = MockRTCPeerConnection as any;

  // Mock AudioContext
  global.AudioContext = MockAudioContext as any;
  (global as any).webkitAudioContext = MockAudioContext;
};

// Cleanup WebRTC mocks
export const cleanupWebRTCMocks = () => {
  vi.clearAllMocks();
};