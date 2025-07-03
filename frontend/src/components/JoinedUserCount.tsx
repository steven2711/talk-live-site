import React from 'react';
import { FiUsers } from 'react-icons/fi';
import { cn } from '../utils';

interface JoinedUserCountProps {
  totalUsers: number;
  maxUsers?: number;
  className?: string;
}

const JoinedUserCount: React.FC<JoinedUserCountProps> = ({
  totalUsers,
  maxUsers = 50, // Default max room capacity
  className = ''
}) => {
  const isNearCapacity = totalUsers >= maxUsers * 0.8;
  const isFull = totalUsers >= maxUsers;

  return (
    <div className={cn(
      'flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200',
      isFull 
        ? 'bg-red-100 text-red-700 border border-red-200' 
        : isNearCapacity 
          ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
          : 'bg-green-100 text-green-700 border border-green-200',
      className
    )}>
      <FiUsers className="w-4 h-4" />
      <span>
        {totalUsers}
        {maxUsers && (
          <span className="text-gray-500">
            /{maxUsers}
          </span>
        )}
      </span>
      <span className="hidden sm:inline">
        {totalUsers === 1 ? 'user' : 'users'}
      </span>

      {/* Status indicator */}
      <div className={cn(
        'w-2 h-2 rounded-full',
        isFull 
          ? 'bg-red-400' 
          : isNearCapacity 
            ? 'bg-yellow-400'
            : 'bg-green-400'
      )} />
    </div>
  );
};

export default JoinedUserCount;