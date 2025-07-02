import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiUser, FiX, FiWifi, FiWifiOff } from 'react-icons/fi';
import { useChatStore } from '../store/chatStore';
import { cn, debounce } from '../utils';
import MessageList from './MessageList';
import TypingIndicator from './TypingIndicator';
import ConnectionStatus from './ConnectionStatus';

const ChatInterface: React.FC = () => {
  const {
    currentUser,
    partner,
    connectionStatus,
    messages,
    typingIndicators,
    sendMessage,
    setTyping,
    disconnect
  } = useChatStore();

  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Debounced typing indicator
  const debouncedStopTyping = debounce(() => {
    if (isTyping) {
      setTyping(false);
      setIsTyping(false);
    }
  }, 1000);

  // Handle typing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }

    // Handle typing indicators
    if (value.trim() && !isTyping) {
      setTyping(true);
      setIsTyping(true);
    } else if (!value.trim() && isTyping) {
      setTyping(false);
      setIsTyping(false);
    }

    // Reset typing after pause
    if (value.trim()) {
      debouncedStopTyping();
    }
  };

  // Send message
  const handleSendMessage = () => {
    const trimmed = messageInput.trim();
    if (!trimmed || !partner) return;

    sendMessage(trimmed);
    setMessageInput('');
    
    // Stop typing indicator
    if (isTyping) {
      setTyping(false);
      setIsTyping(false);
    }

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Handle enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    if (window.confirm('Are you sure you want to leave this chat?')) {
      disconnect();
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingIndicators]);

  // Show waiting message if connected but no partner
  if (connectionStatus === 'connected' && !partner) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <FiUser className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Looking for a chat partner...
            </h2>
            <p className="text-gray-600 mb-6">
              We're finding someone for you to chat with. This usually takes just a few seconds.
            </p>
            <button
              onClick={handleDisconnect}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!partner) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[600px]">
        {/* Chat Header */}
        <div className="bg-gray-50 border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <FiUser className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">
                  {partner.username}
                </h2>
                <div className="flex items-center space-x-2">
                  <ConnectionStatus status={connectionStatus} />
                  {typingIndicators.length > 0 && (
                    <span className="text-xs text-gray-500">
                      typing...
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <button
              onClick={handleDisconnect}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors duration-200"
              title="Leave chat"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
          <MessageList 
            messages={messages} 
            currentUserId={currentUser?.id || ''}
          />
          
          {typingIndicators.length > 0 && (
            <TypingIndicator indicators={typingIndicators} />
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none min-h-[48px] max-h-32"
                rows={1}
                disabled={connectionStatus !== 'paired'}
              />
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || connectionStatus !== 'paired'}
              className={cn(
                'p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                messageInput.trim() && connectionStatus === 'paired'
                  ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              )}
              title="Send message (Enter)"
            >
              <FiSend className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mt-2 text-xs text-gray-500 text-center">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;