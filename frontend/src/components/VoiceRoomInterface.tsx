import React, { useState, useEffect, useRef } from 'react';
import { FiMic, FiUsers, FiX, FiVolume2 } from 'react-icons/fi';
import { useChatStore } from '../store/chatStore';
import { ConnectionStatus, VoiceRoomRole, VoiceRoomState } from '../types';
import SpeakerSection from './SpeakerSection';
import QueueDisplay from './QueueDisplay';
import AudioControls from './AudioControls';
import JoinedUserCount from './JoinedUserCount';
import { gracefulDisconnectManager, emergencyDisconnect } from '../utils/gracefulDisconnect';

const VoiceRoomInterface: React.FC = () => {
  const {
    currentUser,
    voiceRoomState,
    connectionStatus,
    disconnect,
    requestSpeakerRole,
    setSpeakerVolume,
    muteSpeaker,
    voiceRoomManager,
    socket
  } = useChatStore();
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [autoAudioAttempted, setAutoAudioAttempted] = useState(false);
  const interactionHandledRef = useRef(false);

  // For demo purposes, create mock voice room state if backend isn't available
  const [mockVoiceRoomState] = useState<VoiceRoomState>(() => ({
    roomId: 'demo-room-1',
    speakers: [
      {
        user: {
          id: 'speaker-1',
          username: 'Alex',
          socketId: 'socket-1',
          connectedAt: new Date(),
          lastActivity: new Date()
        },
        role: VoiceRoomRole.SPEAKER,
        joinedAt: new Date(),
        audioLevel: 45,
        isMuted: false,
        volume: 0.8
      },
      {
        user: {
          id: currentUser?.id || 'current-user',
          username: currentUser?.username || 'You',
          socketId: 'socket-current',
          connectedAt: new Date(),
          lastActivity: new Date()
        },
        role: VoiceRoomRole.SPEAKER,
        joinedAt: new Date(),
        audioLevel: 0,
        isMuted: false,
        volume: 0.8
      }
    ],
    listeners: [
      {
        user: {
          id: 'listener-1',
          username: 'Jordan',
          socketId: 'socket-3',
          connectedAt: new Date(),
          lastActivity: new Date()
        },
        role: VoiceRoomRole.LISTENER,
        joinedAt: new Date(),
        audioLevel: 0,
        isMuted: true,
        volume: 1.0,
        queuePosition: 1
      },
      {
        user: {
          id: 'listener-2',
          username: 'Casey',
          socketId: 'socket-4',
          connectedAt: new Date(),
          lastActivity: new Date()
        },
        role: VoiceRoomRole.LISTENER,
        joinedAt: new Date(),
        audioLevel: 0,
        isMuted: true,
        volume: 1.0,
        queuePosition: 2
      },
      {
        user: {
          id: 'listener-3',
          username: 'Morgan',
          socketId: 'socket-5',
          connectedAt: new Date(),
          lastActivity: new Date()
        },
        role: VoiceRoomRole.LISTENER,
        joinedAt: new Date(),
        audioLevel: 0,
        isMuted: true,
        volume: 1.0,
        queuePosition: 3
      }
    ],
    totalUsers: 5,
    maxSpeakers: 2,
    isRecording: false,
    roomStartTime: new Date(Date.now() - 300000) // 5 minutes ago
  }));

  // Use the actual voice room state if available, otherwise use mock data
  const effectiveVoiceRoomState = voiceRoomState || mockVoiceRoomState;

  // Automatic audio activation effect
  useEffect(() => {
    const attemptAutoAudio = async () => {
      if (autoAudioAttempted || !voiceRoomManager) return;
      
      try {
        setAutoAudioAttempted(true);
        console.log('Attempting automatic audio activation');
        
        // Try to enable audio automatically
        if (typeof voiceRoomManager.resumeAudioPlayback === 'function') {
          await voiceRoomManager.resumeAudioPlayback();
          setAudioEnabled(true);
          console.log('Audio enabled automatically');
        }
      } catch (error) {
        console.log('Automatic audio activation failed (expected in some browsers):', error);
        // This is expected in many browsers due to autoplay policies
        // We'll handle this with user interaction
      }
    };

    attemptAutoAudio();
  }, [voiceRoomManager, autoAudioAttempted]);

  // Handle user interaction for audio activation
  useEffect(() => {
    const handleUserInteraction = async () => {
      if (interactionHandledRef.current || audioEnabled) return;
      
      try {
        interactionHandledRef.current = true;
        console.log('User interaction detected, enabling audio');
        
        if (voiceRoomManager && typeof voiceRoomManager.resumeAudioPlayback === 'function') {
          await voiceRoomManager.resumeAudioPlayback();
          setAudioEnabled(true);
          console.log('Audio enabled via user interaction');
        }
      } catch (error) {
        console.error('Failed to enable audio on user interaction:', error);
      }
    };

    // Add event listeners for user interaction
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [voiceRoomManager, audioEnabled]);

  // Handle page unload and disconnect events
  useEffect(() => {
    const handleGracefulDisconnect = async () => {
      console.log('Graceful disconnect initiated');
      try {
        // Use graceful disconnect utility for better reliability
        if (socket && currentUser) {
          await gracefulDisconnectManager.disconnect(socket, {
            userId: currentUser.id,
            reason: 'user_leaving'
          });
        }
        
        // Standard disconnect
        disconnect();
        
        // If we have a voice room manager, clean it up
        if (voiceRoomManager && typeof voiceRoomManager.cleanup === 'function') {
          await voiceRoomManager.cleanup();
        }
      } catch (error) {
        console.error('Error during graceful disconnect:', error);
      }
    };

    // Handle page unload (user closing tab/browser)
    const handleBeforeUnload = () => {
      // Use emergency disconnect for immediate, reliable signaling
      if (currentUser) {
        emergencyDisconnect(currentUser.id);
      }
      
      // Also attempt standard disconnect
      try {
        disconnect();
      } catch (error) {
        console.error('Error during beforeunload disconnect:', error);
      }
    };

    // Handle page hide (mobile browsers, tab switching)
    const handlePageHide = () => {
      console.log('Page hidden, attempting disconnect');
      handleGracefulDisconnect();
    };

    // Handle visibility change (tab becomes hidden)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page became hidden, starting disconnect timer');
        // Give the user 30 seconds before disconnecting in case they're just switching tabs
        setTimeout(() => {
          if (document.hidden) {
            console.log('Page still hidden after 30 seconds, disconnecting');
            handleGracefulDisconnect();
          }
        }, 30000);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [disconnect, voiceRoomManager, currentUser, socket]);

  // Use mock data for demo (remove when backend is connected)

  // Handle disconnect
  const handleLeaveRoom = () => {
    if (window.confirm('Are you sure you want to leave the voice room?')) {
      disconnect();
    }
  };

  // Handle request to speak
  const handleRequestToSpeak = () => {
    requestSpeakerRole();
  };

  // Check if current user is a speaker
  const isCurrentUserSpeaker = () => {
    if (!currentUser || !effectiveVoiceRoomState) return false;
    return effectiveVoiceRoomState.speakers.some(speaker => speaker.user.id === currentUser.id);
  };

  // Get current user's queue position
  const getCurrentUserQueuePosition = () => {
    if (!currentUser || !effectiveVoiceRoomState) return null;
    const listener = effectiveVoiceRoomState.listeners.find(listener => listener.user.id === currentUser.id);
    return listener?.queuePosition || null;
  };

  // Show loading state if not connected to voice room (for demo, we'll bypass this)
  if (connectionStatus !== ConnectionStatus.IN_VOICE_ROOM && !effectiveVoiceRoomState) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <FiUsers className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Connecting to voice room...
            </h2>
            <p className="text-gray-600 mb-6">
              Please wait while we set up your voice room experience.
            </p>
            <button
              onClick={handleLeaveRoom}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentUserRole = isCurrentUserSpeaker() ? VoiceRoomRole.SPEAKER : VoiceRoomRole.LISTENER;
  const queuePosition = getCurrentUserQueuePosition();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Voice Room Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <FiMic className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Voice Room</h1>
                <p className="text-purple-100">
                  {currentUserRole === VoiceRoomRole.SPEAKER ? 'You are speaking' : 'You are listening'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <JoinedUserCount 
                totalUsers={effectiveVoiceRoomState.totalUsers}
              />
              <button
                onClick={handleLeaveRoom}
                className="p-2 text-white hover:text-red-300 hover:bg-white hover:bg-opacity-10 rounded-lg transition-colors duration-200"
                title="Leave voice room"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 space-y-6">
          {/* Speakers Section */}
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Current Speakers ({effectiveVoiceRoomState.speakers.length}/{effectiveVoiceRoomState.maxSpeakers})
              </h2>
              {currentUserRole === VoiceRoomRole.LISTENER && queuePosition && (
                <div className="text-sm text-gray-600">
                  {queuePosition === 1 ? "You're up next!" : `Position #${queuePosition} in queue`}
                </div>
              )}
            </div>
            
            <SpeakerSection 
              speakers={effectiveVoiceRoomState.speakers}
              currentUserId={currentUser?.id || ''}
              isCurrentUserSpeaker={currentUserRole === VoiceRoomRole.SPEAKER}
            />
            
            {/* Audio Controls for Speakers */}
            {currentUserRole === VoiceRoomRole.SPEAKER && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <AudioControls 
                  currentUser={currentUser}
                  onVolumeChange={setSpeakerVolume}
                  onMuteToggle={muteSpeaker}
                />
              </div>
            )}
          </div>

          {/* Queue Section */}
          <div className="bg-blue-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Listener Queue ({effectiveVoiceRoomState.listeners.length} waiting)
              </h2>
              {currentUserRole === VoiceRoomRole.LISTENER && (
                <button
                  onClick={handleRequestToSpeak}
                  className="btn-primary text-sm px-4 py-2"
                  disabled={effectiveVoiceRoomState.speakers.length >= effectiveVoiceRoomState.maxSpeakers}
                >
                  Request to Speak
                </button>
              )}
            </div>
            
            <QueueDisplay 
              listeners={effectiveVoiceRoomState.listeners}
              currentUserId={currentUser?.id || ''}
            />
          </div>

          {/* Audio Enable Button - Only show if auto-activation failed */}
          {!audioEnabled && autoAudioAttempted && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <FiVolume2 className="w-5 h-5 text-blue-600" />
                <span className="text-blue-800 font-medium">Audio Not Active</span>
              </div>
              <p className="text-sm text-blue-700 mb-3">
                Click anywhere to enable audio and hear other participants
              </p>
              <div className="text-xs text-blue-600">
                Audio will enable automatically on your next interaction
              </div>
            </div>
          )}
          
          {/* Room Info */}
          <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <span>Live audio room</span>
            </div>
            {effectiveVoiceRoomState.roomStartTime && (
              <div>
                Room started {new Date(effectiveVoiceRoomState.roomStartTime).toLocaleTimeString()}
              </div>
            )}
            <div>
              Max {effectiveVoiceRoomState.maxSpeakers} speakers at a time
            </div>
            {audioEnabled && (
              <div className="flex items-center space-x-2">
                <FiVolume2 className="w-3 h-3 text-green-500" />
                <span className="text-green-600">Audio enabled</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceRoomInterface;