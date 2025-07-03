import React, { useState } from 'react';
import { FiMic, FiMicOff, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { cn } from '../utils';

interface AudioControlsProps {
  currentUser: { id: string; username: string } | null;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: (muted: boolean) => void;
  isMuted?: boolean;
  volume?: number;
}

const AudioControls: React.FC<AudioControlsProps> = ({
  currentUser,
  onVolumeChange,
  onMuteToggle,
  isMuted = false,
  volume = 1.0
}) => {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [localVolume, setLocalVolume] = useState(volume);

  const handleVolumeChange = (newVolume: number) => {
    setLocalVolume(newVolume);
    onVolumeChange(newVolume);
  };

  const handleMuteToggle = () => {
    onMuteToggle(!isMuted);
  };

  if (!currentUser) return null;

  return (
    <div className="flex items-center space-x-4 p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700">Audio Controls:</span>
      </div>

      {/* Mute Button */}
      <button
        onClick={handleMuteToggle}
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-opacity-50 shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95',
          isMuted 
            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-300 text-white' 
            : 'bg-green-500 hover:bg-green-600 focus:ring-green-300 text-white'
        )}
        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? (
          <FiMicOff className="w-5 h-5" />
        ) : (
          <FiMic className="w-5 h-5" />
        )}
      </button>

      {/* Volume Control */}
      <div className="relative flex items-center space-x-2">
        <button
          onClick={() => setShowVolumeSlider(!showVolumeSlider)}
          className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-gray-300 focus:ring-opacity-50 shadow-sm hover:shadow-md"
          title="Adjust volume"
        >
          {localVolume === 0 ? (
            <FiVolumeX className="w-5 h-5 text-gray-600" />
          ) : (
            <FiVolume2 className="w-5 h-5 text-gray-600" />
          )}
        </button>

        {/* Volume Slider */}
        {showVolumeSlider && (
          <div className="absolute left-0 top-full mt-2 bg-white rounded-lg p-3 shadow-xl border border-gray-200 z-10">
            <div className="flex items-center space-x-3">
              <FiVolumeX className="w-4 h-4 text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={localVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <FiVolume2 className="w-4 h-4 text-gray-600" />
            </div>
            <div className="text-center mt-2">
              <span className="text-xs text-gray-500">
                {Math.round(localVolume * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Current volume display */}
        <span className="text-sm text-gray-500 min-w-[3rem]">
          {Math.round(localVolume * 100)}%
        </span>
      </div>

      {/* Microphone Status */}
      <div className="flex items-center space-x-2 text-sm">
        <div className={cn(
          'w-2 h-2 rounded-full',
          isMuted ? 'bg-red-400' : 'bg-green-400'
        )} />
        <span className="text-gray-600">
          {isMuted ? 'Muted' : 'Live'}
        </span>
      </div>

      {/* Audio Level Indicator */}
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-500">Level:</span>
        <div className="flex items-end space-x-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-1 rounded-sm transition-colors duration-150',
                !isMuted && Math.random() > 0.5 // Simulate audio levels
                  ? 'bg-green-400' 
                  : 'bg-gray-300',
                i === 0 || i === 4 ? 'h-2' : i === 1 || i === 3 ? 'h-3' : 'h-4'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AudioControls;