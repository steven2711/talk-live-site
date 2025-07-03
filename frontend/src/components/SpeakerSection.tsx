import React from 'react';
import { FiMic, FiMicOff, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { VoiceRoomUser } from '../types';
import { cn } from '../utils';

interface SpeakerSectionProps {
  speakers: VoiceRoomUser[];
  currentUserId: string;
  isCurrentUserSpeaker: boolean;
}

const SpeakerSection: React.FC<SpeakerSectionProps> = ({
  speakers,
  currentUserId
}) => {
  // Generate audio level bars based on audio level (0-100)
  const generateAudioBars = (audioLevel: number, isActive: boolean) => {
    const bars = [];
    const barCount = 5;
    const threshold = 100 / barCount;
    
    for (let i = 0; i < barCount; i++) {
      const isBarActive = isActive && audioLevel > (i * threshold);
      bars.push(
        <div
          key={i}
          className={cn(
            'w-1 rounded-full transition-all duration-150',
            isBarActive 
              ? 'bg-green-400 shadow-sm' 
              : 'bg-gray-300',
            // Vary heights for visual effect
            i === 0 || i === 4 ? 'h-2' : i === 1 || i === 3 ? 'h-3' : 'h-4'
          )}
        />
      );
    }
    
    return bars;
  };

  // Show empty state if no speakers
  if (speakers.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-200 rounded-full mb-4">
          <FiMicOff className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-500">No one is speaking right now</p>
        <p className="text-sm text-gray-400 mt-1">Be the first to join the conversation!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {speakers.map((speaker) => {
        const isCurrentUser = speaker.user.id === currentUserId;
        const isAudioActive = speaker.audioLevel > 10; // Threshold for showing audio activity
        
        return (
          <div
            key={speaker.user.id}
            className={cn(
              'relative bg-white rounded-xl p-4 border-2 transition-all duration-300',
              isAudioActive 
                ? 'border-green-400 shadow-lg ring-2 ring-green-100' 
                : 'border-gray-200 hover:border-gray-300',
              isCurrentUser && 'bg-blue-50 border-blue-200'
            )}
          >
            {/* Speaker Info */}
            <div className="flex items-center space-x-3 mb-3">
              <div className={cn(
                'relative w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold',
                isCurrentUser 
                  ? 'bg-blue-500' 
                  : 'bg-purple-500'
              )}>
                {speaker.user.username.charAt(0).toUpperCase()}
                
                {/* Live indicator */}
                {isAudioActive && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-gray-800">
                    {speaker.user.username}
                    {isCurrentUser && <span className="text-blue-600 ml-1">(You)</span>}
                  </h3>
                  
                  {/* Mute indicator */}
                  {speaker.isMuted ? (
                    <FiMicOff className="w-4 h-4 text-red-500" title="Muted" />
                  ) : (
                    <FiMic className="w-4 h-4 text-green-500" title="Unmuted" />
                  )}
                </div>
                
                <p className="text-sm text-gray-500">
                  {isAudioActive ? 'Speaking...' : 'Ready to speak'}
                </p>
              </div>
              
              {/* Volume indicator for listeners */}
              {!isCurrentUser && (
                <div className="flex items-center space-x-1 text-gray-400">
                  {speaker.volume > 0 ? (
                    <FiVolume2 className="w-4 h-4" />
                  ) : (
                    <FiVolumeX className="w-4 h-4" />
                  )}
                  <span className="text-xs">{Math.round(speaker.volume * 100)}%</span>
                </div>
              )}
            </div>
            
            {/* Audio Level Visualization */}
            <div className="flex items-center space-x-1 mb-2">
              <span className="text-xs text-gray-500 mr-2">Audio:</span>
              <div className="flex items-end space-x-1">
                {generateAudioBars(speaker.audioLevel, isAudioActive)}
              </div>
              <span className="text-xs text-gray-400 ml-2">
                {Math.round(speaker.audioLevel)}%
              </span>
            </div>
            
            {/* Connection quality indicator */}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Connected</span>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Empty speaker slots */}
      {Array.from({ length: 2 - speakers.length }).map((_, index) => (
        <div
          key={`empty-${index}`}
          className="bg-gray-50 rounded-xl p-4 border-2 border-dashed border-gray-300 flex items-center justify-center"
        >
          <div className="text-center text-gray-400">
            <FiMic className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">Speaker slot available</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SpeakerSection;