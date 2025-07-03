import React, { useEffect, useState } from 'react';
import { FiPhone, FiPhoneOff, FiUser } from 'react-icons/fi';
import { cn } from '../utils';

interface IncomingCallModalProps {
  isVisible: boolean;
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  isVisible,
  callerName,
  onAccept,
  onReject
}) => {
  const [ringCount, setRingCount] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setRingCount(0);
      return;
    }

    const interval = setInterval(() => {
      setRingCount(prev => prev + 1);
    }, 1000);

    // Auto-reject after 30 seconds
    const timeout = setTimeout(() => {
      onReject();
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isVisible, onReject]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-scale-in">
        {/* Caller Avatar */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full mb-4 animate-pulse-ring">
            <FiUser className="w-12 h-12 text-white" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            Incoming Call
          </h2>
          <p className="text-gray-600 text-lg">
            {callerName}
          </p>
        </div>

        {/* Call Status */}
        <div className="text-center mb-8">
          <div className="flex justify-center items-center space-x-1 mb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 bg-primary-400 rounded-full animate-bounce',
                )}
                style={{ 
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500">
            Ringing... ({Math.max(30 - ringCount, 0)}s)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center space-x-4">
          {/* Reject Button */}
          <button
            onClick={onReject}
            className="flex items-center justify-center w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full text-white transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-red-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            title="Decline call"
          >
            <FiPhoneOff className="w-7 h-7" />
          </button>

          {/* Accept Button */}
          <button
            onClick={onAccept}
            className="flex items-center justify-center w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full text-white transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-green-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 animate-pulse-green"
            title="Accept call"
          >
            <FiPhone className="w-7 h-7" />
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">Enter</kbd> to accept or <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">Esc</kbd> to decline</p>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;