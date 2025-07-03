import React, { useState, useEffect } from 'react';
import { FiMic, FiMicOff, FiPhoneOff, FiVolume2, FiVolumeX, FiUser } from 'react-icons/fi';
import { cn } from '../utils';

interface ActiveCallInterfaceProps {
  isVisible: boolean;
  partnerName: string;
  duration: number;
  isMuted: boolean;
  volume: number;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onEndCall: () => void;
  className?: string;
}

const ActiveCallInterface: React.FC<ActiveCallInterfaceProps> = ({
  isVisible,
  partnerName,
  duration,
  isMuted,
  volume,
  onMuteToggle,
  onVolumeChange,
  onEndCall,
  className = ''
}) => {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'm':
        case 'M':
          event.preventDefault();
          onMuteToggle();
          break;
        case 'Escape':
          event.preventDefault();
          onEndCall();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onMuteToggle, onEndCall]);

  if (!isVisible) return null;

  return (
    <div className={cn(
      'bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 text-white shadow-2xl',
      className
    )}>
      {/* Call Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full mb-3">
          <FiUser className="w-8 h-8 text-white" />
        </div>
        
        <h3 className="text-lg font-semibold mb-1">
          {partnerName}
        </h3>
        
        <div className="flex items-center justify-center space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <p className="text-sm text-gray-300">
            {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Audio Visualization (placeholder) */}
      <div className="flex justify-center mb-6">
        <div className="flex items-end space-x-1 h-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'bg-primary-400 rounded-sm animate-pulse',
                'w-1'
              )}
              style={{
                height: `${Math.random() * 100 + 20}%`,
                animationDelay: `${i * 0.1}s`,
                animationDuration: `${0.5 + Math.random() * 0.5}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Call Controls */}
      <div className="flex items-center justify-center space-x-4">
        {/* Mute Button */}
        <button
          onClick={onMuteToggle}
          className={cn(
            'flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-opacity-50 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95',
            isMuted 
              ? 'bg-red-500 hover:bg-red-600 focus:ring-red-300' 
              : 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-300'
          )}
          title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
        >
          {isMuted ? (
            <FiMicOff className="w-5 h-5" />
          ) : (
            <FiMic className="w-5 h-5" />
          )}
        </button>

        {/* Volume Control */}
        <div className="relative">
          <button
            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
            className="flex items-center justify-center w-12 h-12 bg-gray-600 hover:bg-gray-700 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300 focus:ring-opacity-50 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            title="Volume"
          >
            {volume === 0 ? (
              <FiVolumeX className="w-5 h-5" />
            ) : (
              <FiVolume2 className="w-5 h-5" />
            )}
          </button>

          {/* Volume Slider */}
          {showVolumeSlider && (
            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-700 rounded-lg p-3 shadow-xl">
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => onVolumeChange(parseInt(e.target.value))}
                className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="text-xs text-center mt-1 text-gray-300">
                {volume}%
              </div>
            </div>
          )}
        </div>

        {/* End Call Button */}
        <button
          onClick={onEndCall}
          className="flex items-center justify-center w-12 h-12 bg-red-500 hover:bg-red-600 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-red-300 focus:ring-opacity-50 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          title="End call (Esc)"
        >
          <FiPhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-4 text-center text-xs text-gray-400">
        <p>
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">M</kbd> to mute • 
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded ml-1">Esc</kbd> to end call
        </p>
      </div>
    </div>
  );
};

export default ActiveCallInterface;