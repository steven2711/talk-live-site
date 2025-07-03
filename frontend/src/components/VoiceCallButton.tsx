import React from 'react';
import { FiPhone, FiPhoneCall } from 'react-icons/fi';
import { VoiceCallStatus } from '../types/chat';
import { cn } from '../utils';

interface VoiceCallButtonProps {
  callStatus: VoiceCallStatus;
  onCallRequest: () => void;
  disabled?: boolean;
  className?: string;
}

const VoiceCallButton: React.FC<VoiceCallButtonProps> = ({
  callStatus,
  onCallRequest,
  disabled = false,
  className = ''
}) => {
  const isCallActive = callStatus === VoiceCallStatus.CONNECTED || 
                       callStatus === VoiceCallStatus.CONNECTING ||
                       callStatus === VoiceCallStatus.RINGING;

  const isCallInitiating = callStatus === VoiceCallStatus.INITIATING;

  const getButtonContent = () => {
    switch (callStatus) {
      case VoiceCallStatus.INITIATING:
        return {
          icon: FiPhoneCall,
          text: 'Calling...',
          className: 'bg-yellow-500 hover:bg-yellow-600 animate-pulse'
        };
      case VoiceCallStatus.RINGING:
        return {
          icon: FiPhoneCall,
          text: 'Ringing...',
          className: 'bg-yellow-500 hover:bg-yellow-600 animate-bounce'
        };
      case VoiceCallStatus.CONNECTING:
        return {
          icon: FiPhoneCall,
          text: 'Connecting...',
          className: 'bg-blue-500 hover:bg-blue-600 animate-pulse'
        };
      case VoiceCallStatus.CONNECTED:
        return {
          icon: FiPhoneCall,
          text: 'In Call',
          className: 'bg-green-500 hover:bg-green-600'
        };
      default:
        return {
          icon: FiPhone,
          text: 'Voice Call',
          className: 'bg-primary-600 hover:bg-primary-700'
        };
    }
  };

  const buttonConfig = getButtonContent();
  const Icon = buttonConfig.icon;

  return (
    <button
      onClick={onCallRequest}
      disabled={disabled || isCallActive || isCallInitiating}
      className={cn(
        'inline-flex items-center px-4 py-3 rounded-lg text-white font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 min-w-[140px] justify-center',
        buttonConfig.className,
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      title={disabled ? 'Voice calls not available' : buttonConfig.text}
    >
      <Icon className="w-5 h-5 mr-2" />
      <span>{buttonConfig.text}</span>
    </button>
  );
};

export default VoiceCallButton;