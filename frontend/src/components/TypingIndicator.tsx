import React from 'react';
import { TypingIndicator as TypingIndicatorType } from '../types';

interface TypingIndicatorProps {
  indicators: TypingIndicatorType[];
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ indicators }) => {
  if (indicators.length === 0) {
    return null;
  }

  const typingUsers = indicators.filter(indicator => indicator.isTyping);
  
  if (typingUsers.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div className="mr-12 max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl">
        {/* Sender name */}
        <div className="text-xs text-gray-500 mb-1 px-1">
          {typingUsers[0].username}
        </div>
        
        {/* Typing bubble */}
        <div className="bg-gray-100 text-gray-800 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm animate-fade-in">
          <div className="flex items-center space-x-1">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;