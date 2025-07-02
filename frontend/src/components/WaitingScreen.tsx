import React from 'react';
import { FiUsers, FiClock, FiX } from 'react-icons/fi';
import { useChatStore } from '../store/chatStore';
import { cn } from '../utils';

const WaitingScreen: React.FC = () => {
  const { 
    connectionStatus, 
    queuePosition, 
    currentUser,
    disconnect 
  } = useChatStore();

  const handleCancel = () => {
    disconnect();
  };

  const getStatusText = () => {
    if (connectionStatus === 'connecting') {
      return 'Connecting to server...';
    }
    
    if (connectionStatus === 'waiting') {
      if (queuePosition !== null && queuePosition > 0) {
        return `Waiting for a chat partner... Position ${queuePosition} in queue`;
      }
      return 'Looking for someone to chat with...';
    }
    
    return 'Preparing your chat...';
  };

  const getStatusIcon = () => {
    if (connectionStatus === 'connecting') {
      return (
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      );
    }
    
    return (
      <div className="relative">
        <FiUsers className="w-8 h-8 text-primary-600" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* Status Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-50 rounded-full mb-6">
          {getStatusIcon()}
        </div>

        {/* User Info */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Hi, {currentUser?.username}!
          </h2>
          <p className="text-gray-600">
            {getStatusText()}
          </p>
        </div>

        {/* Status Details */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <FiClock className="w-4 h-4" />
            <span>Average wait time: 30 seconds</span>
          </div>
          
          {queuePosition !== null && queuePosition > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-center space-x-2 text-blue-700">
                <FiUsers className="w-5 h-5" />
                <span className="font-medium">
                  {queuePosition === 1 
                    ? "You're next in line!" 
                    : `${queuePosition - 1} ${queuePosition === 2 ? 'person' : 'people'} ahead of you`
                  }
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Loading Animation */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-2">
            <div className="w-3 h-3 bg-primary-400 rounded-full animate-bounce"></div>
            <div className="w-3 h-3 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-3 h-3 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>

        {/* Cancel Button */}
        <button
          onClick={handleCancel}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
        >
          <FiX className="w-4 h-4 mr-2" />
          Cancel
        </button>

        {/* Tips */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-left space-y-2 text-sm text-gray-600">
            <h3 className="font-medium text-gray-800 text-center mb-3">
              While you wait...
            </h3>
            <ul className="space-y-1">
              <li className="flex items-start space-x-2">
                <span className="text-primary-600 mt-1">•</span>
                <span>Keep your browser tab active for the fastest connection</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-primary-600 mt-1">•</span>
                <span>You'll be paired with the next available person</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-primary-600 mt-1">•</span>
                <span>Remember to be respectful and kind in your conversation</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitingScreen;