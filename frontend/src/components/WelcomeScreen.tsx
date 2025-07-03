import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiMic, FiShield, FiZap, FiHeadphones } from 'react-icons/fi';
import { useChatStore } from '../store/chatStore';
import { validateUsername } from '../utils';
import { cn } from '../utils';

interface FormData {
  username: string;
}

const WelcomeScreen: React.FC = () => {
  const { connectToVoiceRoom } = useChatStore();
  const [isConnecting, setIsConnecting] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    const validation = validateUsername(data.username);
    
    if (!validation.isValid) {
      setError('username', {
        type: 'manual',
        message: validation.error
      });
      return;
    }

    setIsConnecting(true);
    try {
      connectToVoiceRoom(data.username.trim());
    } catch (error) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setError('username', {
        type: 'manual',
        message: 'Failed to connect. Please try again.'
      });
    }
  };

  const features = [
    {
      icon: FiZap,
      title: 'Instant Voice Rooms',
      description: 'Join live voice conversations in seconds'
    },
    {
      icon: FiShield,
      title: 'Completely Anonymous',
      description: 'No registration, no tracking, no data stored'
    },
    {
      icon: FiMic,
      title: '2 Speakers at a Time',
      description: 'Take turns speaking with volume controls'
    },
    {
      icon: FiHeadphones,
      title: 'Unlimited Listeners',
      description: 'Listen and queue up to speak next'
    }
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Main welcome card */}
      <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <FiMic className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Join Voice Room
          </h2>
          <p className="text-gray-600">
            Enter a username to join live voice conversations
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label 
              htmlFor="username" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Choose a username
            </label>
            <input
              {...register('username', {
                required: 'Username is required',
                minLength: {
                  value: 2,
                  message: 'Username must be at least 2 characters'
                },
                maxLength: {
                  value: 20,
                  message: 'Username must be less than 20 characters'
                }
              })}
              type="text"
              id="username"
              placeholder="Enter your username..."
              className={cn(
                'w-full px-4 py-3 border rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors',
                errors.username 
                  ? 'border-red-300 bg-red-50' 
                  : 'border-gray-300 bg-white'
              )}
              disabled={isConnecting}
              autoFocus
            />
            {errors.username && (
              <p className="mt-2 text-sm text-red-600">
                {errors.username.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isConnecting}
            className={cn(
              'w-full py-3 px-6 rounded-lg font-medium text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              isConnecting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1'
            )}
          >
            {isConnecting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Connecting...
              </div>
            ) : (
              'Join Voice Room'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            By continuing, you agree to keep voice conversations respectful and appropriate.
          </p>
        </div>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <div 
              key={index}
              className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-200"
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WelcomeScreen;