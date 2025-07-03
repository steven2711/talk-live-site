import React from 'react';
import { FiWifi, FiWifiOff, FiClock, FiUsers, FiCheck } from 'react-icons/fi';
import { ConnectionStatus as ConnectionStatusType } from '../types';
import { cn } from '../utils';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  className?: string;
  showText?: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  status, 
  className = '',
  showText = true 
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case ConnectionStatusType.CONNECTED:
        return {
          icon: FiWifi,
          text: 'Connected',
          className: 'status-connected',
          iconColor: 'text-green-600'
        };
      case ConnectionStatusType.IN_CHAT:
        return {
          icon: FiCheck,
          text: 'Paired',
          className: 'status-connected',
          iconColor: 'text-green-600'
        };
      case ConnectionStatusType.CONNECTING:
        return {
          icon: FiClock,
          text: 'Connecting',
          className: 'status-connecting',
          iconColor: 'text-yellow-600'
        };
      case ConnectionStatusType.WAITING_FOR_PARTNER:
        return {
          icon: FiUsers,
          text: 'Waiting',
          className: 'status-waiting',
          iconColor: 'text-blue-600'
        };
      case ConnectionStatusType.DISCONNECTED:
      default:
        return {
          icon: FiWifiOff,
          text: 'Disconnected',
          className: 'status-disconnected',
          iconColor: 'text-red-600'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={cn('status-indicator', config.className, className)}>
      <Icon className={cn('w-3 h-3', config.iconColor)} />
      {showText && (
        <span className="ml-1 text-xs font-medium">
          {config.text}
        </span>
      )}
    </div>
  );
};

export default ConnectionStatus;