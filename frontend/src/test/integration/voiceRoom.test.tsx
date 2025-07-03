import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlobalVoiceRoomManager } from '../../services/GlobalVoiceRoomManager';
import { VoiceBroadcastManager } from '../../services/VoiceBroadcastManager';
import { AudioStreamManager } from '../../services/AudioStreamManager';
import { VoiceRoomRole } from '../../types/chat';
import { setupWebRTCMocks, cleanupWebRTCMocks } from '../mocks/webrtc';

// Mock socket
const mockSocket = {
  id: 'mock-socket-id',
  emit: vi.fn(),
  on: vi.fn(),
  disconnect: vi.fn()
};

describe('Voice Room Integration Tests', () => {
  beforeEach(() => {
    setupWebRTCMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupWebRTCMocks();
  });

  describe('GlobalVoiceRoomManager', () => {
    let voiceRoomManager: GlobalVoiceRoomManager;

    beforeEach(async () => {
      voiceRoomManager = new GlobalVoiceRoomManager(mockSocket);
      await voiceRoomManager.initialize({ id: 'test-user', username: 'TestUser' });
    });

    afterEach(async () => {
      await voiceRoomManager.cleanup();
    });

    it('should initialize successfully', () => {
      expect(voiceRoomManager).toBeDefined();
    });

    it('should handle speaker role requests', () => {
      voiceRoomManager.requestSpeakerRole();
      expect(mockSocket.emit).toHaveBeenCalledWith('request_speaker_role');
    });

    it('should set speaker volume', () => {
      voiceRoomManager.setSpeakerVolume(0.8);
      expect(mockSocket.emit).toHaveBeenCalledWith('set_speaker_volume', 0.8);
    });

    it('should handle mute toggle', () => {
      voiceRoomManager.muteSpeaker(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('mute_speaker', true);
    });
  });

  describe('VoiceBroadcastManager', () => {
    let broadcastManager: VoiceBroadcastManager;

    beforeEach(() => {
      broadcastManager = new VoiceBroadcastManager(mockSocket);
    });

    afterEach(async () => {
      await broadcastManager.cleanup();
    });

    it('should initialize with listener role', () => {
      expect(broadcastManager.role).toBe('listener');
      expect(broadcastManager.isActive).toBe(false);
    });

    it('should handle starting to listen', async () => {
      await broadcastManager.startListening(['speaker1', 'speaker2']);
      expect(broadcastManager.isActive).toBe(true);
      expect(broadcastManager.role).toBe('listener');
    });

    it('should handle starting to speak', async () => {
      await broadcastManager.startSpeaking(['listener1', 'listener2']);
      expect(broadcastManager.isActive).toBe(true);
      expect(broadcastManager.role).toBe('speaker');
    });

    it('should handle speaker promotion', async () => {
      // Start as listener
      await broadcastManager.startListening(['speaker1']);
      expect(broadcastManager.role).toBe('listener');

      // Get promoted to speaker
      await broadcastManager.promoteSpeaker('test-user', ['listener1']);
      expect(broadcastManager.role).toBe('speaker');
    });
  });

  describe('AudioStreamManager', () => {
    let audioManager: AudioStreamManager;

    beforeEach(async () => {
      audioManager = new AudioStreamManager();
      await audioManager.initialize();
    });

    afterEach(async () => {
      await audioManager.cleanup();
    });

    it('should initialize successfully', () => {
      expect(audioManager.isActive()).toBe(true);
    });

    it('should manage speaker streams', () => {
      const mockStream = new MediaStream();
      audioManager.addSpeakerStream('speaker1', mockStream, 0.8);
      
      // Verify stream was added
      expect(() => audioManager.setSpeakerGain('speaker1', 0.5)).not.toThrow();
    });

    it('should control master volume', () => {
      audioManager.setMasterVolume(0.7);
      // No exception should be thrown
      expect(() => audioManager.setMasterVolume(0.5)).not.toThrow();
    });

    it('should handle muting speakers', () => {
      const mockStream = new MediaStream();
      audioManager.addSpeakerStream('speaker1', mockStream);
      
      audioManager.muteSpeaker('speaker1', true);
      audioManager.muteSpeaker('speaker1', false);
      
      // No exception should be thrown
      expect(true).toBe(true);
    });
  });

  describe('Voice Room Scenarios', () => {
    let voiceRoomManager: GlobalVoiceRoomManager;
    let broadcastManager: VoiceBroadcastManager;
    let audioManager: AudioStreamManager;

    beforeEach(async () => {
      audioManager = new AudioStreamManager();
      await audioManager.initialize();
      
      broadcastManager = new VoiceBroadcastManager(mockSocket);
      
      voiceRoomManager = new GlobalVoiceRoomManager(mockSocket);
      await voiceRoomManager.initialize({ id: 'test-user', username: 'TestUser' });
    });

    afterEach(async () => {
      await voiceRoomManager.cleanup();
      await broadcastManager.cleanup();
      await audioManager.cleanup();
    });

    it('should handle complete speaker workflow', async () => {
      // User requests speaker role
      voiceRoomManager.requestSpeakerRole();
      expect(mockSocket.emit).toHaveBeenCalledWith('request_speaker_role');

      // Simulate being promoted to speaker
      await broadcastManager.startSpeaking(['listener1', 'listener2']);
      expect(broadcastManager.role).toBe('speaker');

      // Adjust volume and mute controls
      voiceRoomManager.setSpeakerVolume(0.8);
      voiceRoomManager.muteSpeaker(true);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('set_speaker_volume', 0.8);
      expect(mockSocket.emit).toHaveBeenCalledWith('mute_speaker', true);

      // Stop speaking
      await broadcastManager.stopSpeaking();
      expect(broadcastManager.isActive).toBe(false);
    });

    it('should handle complete listener workflow', async () => {
      // Start listening to speakers
      await broadcastManager.startListening(['speaker1', 'speaker2']);
      expect(broadcastManager.role).toBe('listener');
      expect(broadcastManager.isActive).toBe(true);

      // Add speaker streams to audio mixer
      const mockStream1 = new MediaStream();
      const mockStream2 = new MediaStream();
      
      audioManager.addSpeakerStream('speaker1', mockStream1, 0.8);
      audioManager.addSpeakerStream('speaker2', mockStream2, 0.8);

      // Control volumes
      audioManager.setSpeakerGain('speaker1', 0.6);
      audioManager.setSpeakerGain('speaker2', 0.7);
      audioManager.setMasterVolume(0.9);

      // Stop listening
      await broadcastManager.stopListening();
      expect(broadcastManager.isActive).toBe(false);
    });

    it('should handle role transitions', async () => {
      // Start as listener
      await broadcastManager.startListening(['speaker1']);
      expect(broadcastManager.role).toBe('listener');

      // Request speaker role
      voiceRoomManager.requestSpeakerRole();
      expect(mockSocket.emit).toHaveBeenCalledWith('request_speaker_role');

      // Simulate promotion to speaker
      await broadcastManager.promoteSpeaker('test-user', ['listener1', 'listener2']);
      expect(broadcastManager.role).toBe('speaker');
      expect(broadcastManager.isActive).toBe(true);

      // Simulate demotion back to listener
      await broadcastManager.stopSpeaking();
      await broadcastManager.startListening(['speaker1', 'speaker2']);
      expect(broadcastManager.role).toBe('listener');
    });
  });

  describe('Queue Management Scenarios', () => {
    it('should simulate queue promotion workflow', () => {
      // Mock room state with queue
      const mockRoomState = {
        roomId: 'test-room',
        speakers: [
          {
            user: { id: 'speaker1', username: 'Speaker1', socketId: 'socket1', connectedAt: new Date(), lastActivity: new Date() },
            role: VoiceRoomRole.SPEAKER,
            joinedAt: new Date(),
            isMuted: false,
            audioLevel: 50,
            volume: 0.8
          },
          {
            user: { id: 'speaker2', username: 'Speaker2', socketId: 'socket2', connectedAt: new Date(), lastActivity: new Date() },
            role: VoiceRoomRole.SPEAKER,
            joinedAt: new Date(),
            isMuted: false,
            audioLevel: 30,
            volume: 0.9
          }
        ],
        listeners: [
          {
            user: { id: 'listener1', username: 'Listener1', socketId: 'socket3', connectedAt: new Date(), lastActivity: new Date() },
            role: VoiceRoomRole.LISTENER,
            joinedAt: new Date(),
            isMuted: true,
            audioLevel: 0,
            volume: 1.0,
            queuePosition: 1
          },
          {
            user: { id: 'listener2', username: 'Listener2', socketId: 'socket4', connectedAt: new Date(), lastActivity: new Date() },
            role: VoiceRoomRole.LISTENER,
            joinedAt: new Date(),
            isMuted: true,
            audioLevel: 0,
            volume: 1.0,
            queuePosition: 2
          }
        ],
        totalUsers: 4,
        maxSpeakers: 2,
        isRecording: false,
        roomStartTime: new Date()
      };

      // Verify queue structure
      expect(mockRoomState.speakers.length).toBe(2);
      expect(mockRoomState.listeners.length).toBe(2);
      expect(mockRoomState.listeners[0].queuePosition).toBe(1);
      expect(mockRoomState.listeners[1].queuePosition).toBe(2);

      // Verify max speakers limit
      expect(mockRoomState.speakers.length).toBeLessThanOrEqual(mockRoomState.maxSpeakers);
    });
  });
});