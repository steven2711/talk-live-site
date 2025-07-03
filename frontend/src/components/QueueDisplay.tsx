import React from 'react';
import { FiClock, FiUser, FiUsers } from 'react-icons/fi';
import { VoiceRoomUser } from '../types';
import { cn } from '../utils';

interface QueueDisplayProps {
  listeners: VoiceRoomUser[];
  currentUserId: string;
}

const QueueDisplay: React.FC<QueueDisplayProps> = ({
  listeners,
  currentUserId
}) => {
  // Sort listeners by queue position
  const sortedListeners = [...listeners].sort((a, b) => {
    const posA = a.queuePosition || Infinity;
    const posB = b.queuePosition || Infinity;
    return posA - posB;
  });

  // Show empty state if no listeners
  if (sortedListeners.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-200 rounded-full mb-3">
          <FiUsers className="w-6 h-6 text-blue-600" />
        </div>
        <p className="text-gray-500">No one in the listening queue</p>
        <p className="text-sm text-gray-400 mt-1">Others can join to listen and queue for speaking</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Queue header with stats */}
      <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
        <span>{sortedListeners.length} listeners in room</span>
        <span>Average wait time: ~3 minutes</span>
      </div>

      {/* Queue list */}
      <div className="space-y-2">
        {sortedListeners.map((listener) => {
          const isCurrentUser = listener.user.id === currentUserId;
          const queuePosition = listener.queuePosition || 0;
          const isUpNext = queuePosition === 1;
          
          return (
            <div
              key={listener.user.id}
              className={cn(
                'flex items-center space-x-3 p-3 rounded-lg transition-all duration-200',
                isCurrentUser 
                  ? 'bg-blue-100 border border-blue-200' 
                  : 'bg-white border border-gray-200 hover:border-gray-300',
                isUpNext && 'ring-2 ring-green-200 bg-green-50 border-green-200'
              )}
            >
              {/* Queue position */}
              <div className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold',
                isUpNext 
                  ? 'bg-green-500 text-white' 
                  : isCurrentUser 
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-600'
              )}>
                {queuePosition || '?'}
              </div>
              
              {/* User avatar */}
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-white font-medium',
                isCurrentUser ? 'bg-blue-500' : 'bg-gray-500'
              )}>
                {listener.user.username.charAt(0).toUpperCase()}
              </div>
              
              {/* User info */}
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="font-medium text-gray-800">
                    {listener.user.username}
                    {isCurrentUser && <span className="text-blue-600 ml-1">(You)</span>}
                  </h4>
                  
                  {isUpNext && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                      Up Next!
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-500">
                  {isUpNext 
                    ? "You're next in line to speak" 
                    : queuePosition 
                      ? `Position ${queuePosition} in queue`
                      : 'Listening'
                  }
                </p>
              </div>
              
              {/* Wait time indicator */}
              <div className="flex items-center space-x-1 text-gray-400">
                <FiClock className="w-4 h-4" />
                <span className="text-xs">
                  {queuePosition 
                    ? `~${queuePosition * 3}m` 
                    : 'Listening'
                  }
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Queue info */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start space-x-2 text-sm">
          <FiUser className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-blue-700">
            <p className="font-medium mb-1">How the queue works:</p>
            <ul className="space-y-1 text-blue-600">
              <li>• Listeners are automatically queued when speakers are full</li>
              <li>• Queue position is based on join time</li>
              <li>• You'll be notified when it's your turn to speak</li>
              <li>• Speaking slots rotate to give everyone a chance</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueueDisplay;