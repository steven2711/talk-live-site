import React from 'react';
import { Message } from '../types';
import { formatTime, cn } from '../utils';
import { FiInfo } from 'react-icons/fi';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

const MessageList: React.FC<MessageListProps> = ({ messages, currentUserId }) => {
  if (messages.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
          <FiInfo className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-500">
          No messages yet. Start the conversation!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const isCurrentUser = message.sender !== 'system' && message.id.startsWith(currentUserId);
        const isSystem = message.type === 'system';

        if (isSystem) {
          return (
            <div key={message.id} className="flex justify-center">
              <div className="bg-gray-100 text-gray-600 text-sm px-4 py-2 rounded-full max-w-xs text-center">
                {message.content}
              </div>
            </div>
          );
        }

        return (
          <div 
            key={message.id} 
            className={cn(
              'flex',
              isCurrentUser ? 'justify-end' : 'justify-start'
            )}
          >
            <div className={cn(
              'max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl group',
              isCurrentUser ? 'ml-12' : 'mr-12'
            )}>
              {/* Sender name (only for other users) */}
              {!isCurrentUser && (
                <div className="text-xs text-gray-500 mb-1 px-1">
                  {message.sender}
                </div>
              )}
              
              {/* Message bubble */}
              <div className={cn(
                'relative px-4 py-3 rounded-2xl shadow-sm break-words animate-slide-up',
                isCurrentUser 
                  ? 'bg-primary-600 text-white rounded-br-md' 
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              )}>
                <div className="whitespace-pre-wrap">
                  {message.content}
                </div>
                
                {/* Timestamp */}
                <div className={cn(
                  'text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
                  isCurrentUser ? 'text-primary-200' : 'text-gray-500'
                )}>
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MessageList;