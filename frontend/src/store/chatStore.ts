import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Message, ConnectionStatus, TypingIndicator, ClientToServerEvents, ServerToClientEvents, MessageType, VoiceRoomState, VoiceRoomUser, UserRole, AudioLevelUpdate } from '../types';
import { GlobalVoiceRoomManager } from '../services/GlobalVoiceRoomManager';

const SOCKET_URL = (import.meta.env?.VITE_PROD || import.meta.env?.PROD) 
  ? window.location.origin 
  : import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Utility function to check server connectivity
const checkServerConnectivity = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(`${url}/health-check`, { 
      method: 'GET',
      timeout: 5000 as any // Type assertion for fetch timeout
    });
    return response.ok;
  } catch (error) {
    console.warn('Server connectivity check failed:', error);
    return false;
  }
};

interface ChatStoreState {
  connectionStatus: ConnectionStatus;
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  currentUser: { id: string; username: string } | null;
  partner: { id: string; username: string } | null;
  messages: Message[];
  typingIndicators: TypingIndicator[];
  queuePosition: number | null;
  
  // Voice Room State
  voiceRoomState: VoiceRoomState | null;
  voiceRoomManager: GlobalVoiceRoomManager | null;
  
  // Actions
  connect: (username: string) => void;
  connectToVoiceRoom: (username: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (content: string) => void;
  setTyping: (isTyping: boolean) => void;
  
  // Voice Room Actions
  requestSpeakerRole: () => void;
  setSpeakerVolume: (volume: number) => void;
  muteSpeaker: (muted: boolean) => void;
  sendAudioLevel: (level: number) => void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  // Initial state
  connectionStatus: ConnectionStatus.DISCONNECTED,
  socket: null,
  currentUser: null,
  partner: null,
  messages: [],
  typingIndicators: [],
  queuePosition: null,
  voiceRoomState: null,
  voiceRoomManager: null,

  // Actions
  connectToVoiceRoom: async (username: string) => {
    const maxRetries = 3;
    const baseDelay = 1000;
    let retryCount = 0;
    
    const attemptConnection = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const socket = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          autoConnect: false, // Manual connection control
        });

        // Set initial state
        set({ 
          connectionStatus: ConnectionStatus.CONNECTING,
          messages: [],
          partner: null,
          queuePosition: null,
          voiceRoomState: null,
          voiceRoomManager: null,
        });

        // Connection success handler
        socket.on('connect', async () => {
          try {
            console.log('Socket connected successfully');
            
            // Now we have a valid socket.id
            const currentUser = { id: socket.id, username };
            
            // Initialize GlobalVoiceRoomManager
            const voiceRoomManager = new GlobalVoiceRoomManager(socket);
            
            // Initialize with error handling
            await voiceRoomManager.initialize(currentUser);
            
            set({ 
              socket, 
              connectionStatus: ConnectionStatus.CONNECTED,
              currentUser,
              voiceRoomManager,
            });

            // Setup voice room manager event listeners
            voiceRoomManager.on('roomJoined', (roomState) => {
              set({ 
                connectionStatus: ConnectionStatus.IN_VOICE_ROOM,
                voiceRoomState: roomState 
              });
            });

            voiceRoomManager.on('roomUpdated', (roomState) => {
              set({ voiceRoomState: roomState });
            });

            voiceRoomManager.on('error', (error) => {
              console.error('Voice room manager error:', error);
              // Attempt to recover or degrade gracefully
              handleVoiceRoomError(error);
            });

            // Setup additional socket event handlers
            socket.on('voice_room_joined', (roomState: VoiceRoomState) => {
              console.log('Joined voice room:', roomState);
              set({ 
                connectionStatus: ConnectionStatus.IN_VOICE_ROOM,
                voiceRoomState: roomState,
                queuePosition: null
              });
            });

            socket.on('voice_room_updated', (roomState: VoiceRoomState) => {
              console.log('Voice room updated:', roomState);
              set({ voiceRoomState: roomState });
            });

            socket.on('speaker_changed', (newSpeakers: VoiceRoomUser[]) => {
              console.log('Speakers changed:', newSpeakers);
              set(state => ({
                voiceRoomState: state.voiceRoomState ? {
                  ...state.voiceRoomState,
                  speakers: newSpeakers
                } : null
              }));
            });

            socket.on('audio_level_update', (update: AudioLevelUpdate) => {
              set(state => {
                if (!state.voiceRoomState) return state;

                const updatedSpeakers = state.voiceRoomState.speakers.map(speaker =>
                  speaker.user.id === update.userId
                    ? { ...speaker, audioLevel: update.audioLevel }
                    : speaker
                );

                return {
                  voiceRoomState: {
                    ...state.voiceRoomState,
                    speakers: updatedSpeakers
                  }
                };
              });
            });

            socket.on('user_role_changed', (userId: string, newRole: UserRole) => {
              console.log('User role changed:', userId, newRole);
              set(state => {
                if (!state.voiceRoomState) return state;
                // Handle role changes - could implement user movement between arrays
                return state;
              });
            });

            socket.on('queue_updated', (listeners: VoiceRoomUser[]) => {
              console.log('Queue updated:', listeners);
              set(state => ({
                voiceRoomState: state.voiceRoomState ? {
                  ...state.voiceRoomState,
                  listeners: listeners
                } : null
              }));
            });

            socket.on('speaker_volume_changed', (userId: string, volume: number) => {
              set(state => {
                if (!state.voiceRoomState) return state;

                const updatedSpeakers = state.voiceRoomState.speakers.map(speaker =>
                  speaker.user.id === userId
                    ? { ...speaker, volume: volume }
                    : speaker
                );

                return {
                  voiceRoomState: {
                    ...state.voiceRoomState,
                    speakers: updatedSpeakers
                  }
                };
              });
            });

            socket.on('error', (message) => {
              console.error('Voice room socket error:', message);
              handleVoiceRoomError(message);
            });

            // Join the voice room
            try {
              await voiceRoomManager.joinRoom();
              resolve();
            } catch (joinError) {
              console.error('Failed to join voice room:', joinError);
              set({ connectionStatus: ConnectionStatus.DISCONNECTED });
              reject(joinError);
            }
          } catch (initError) {
            console.error('Failed to initialize voice room manager:', initError);
            set({ connectionStatus: ConnectionStatus.DISCONNECTED });
            reject(initError);
          }
        });

        // Connection error handler with retry logic
        socket.on('connect_error', (error) => {
          console.error('Voice room connection error:', error);
          
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
            
            console.log(`Retrying connection (${retryCount}/${maxRetries}) in ${delay}ms...`);
            
            set({ 
              connectionStatus: ConnectionStatus.CONNECTING,
            });
            
            setTimeout(() => {
              socket.connect();
            }, delay);
          } else {
            console.error('Max connection retries reached');
            set({ connectionStatus: ConnectionStatus.DISCONNECTED });
            reject(new Error(`Connection failed after ${maxRetries} attempts: ${error.message}`));
          }
        });

        // Disconnect handler
        socket.on('disconnect', (reason) => {
          console.log('Disconnected from voice room server:', reason);
          set({ 
            connectionStatus: ConnectionStatus.DISCONNECTED,
            voiceRoomState: null
          });
          
          // Auto-reconnect for unexpected disconnections
          if (reason === 'io server disconnect' || reason === 'transport close') {
            console.log('Attempting to reconnect...');
            setTimeout(() => {
              if (socket.disconnected) {
                socket.connect();
              }
            }, 5000);
          }
        });

        // Start connection attempt
        socket.connect();
      });
    };

    const handleVoiceRoomError = (error: string) => {
      // Implement graceful degradation
      console.warn('Voice room error, attempting graceful degradation:', error);
      
      // Could fall back to text-only mode or retry specific operations
      set(state => ({
        ...state,
        // Keep connection but disable voice features
      }));
    };

    // Check server connectivity before attempting connection
    console.log('Checking server connectivity...');
    const isServerAvailable = await checkServerConnectivity(SOCKET_URL);
    
    if (!isServerAvailable) {
      console.warn('Server appears to be unavailable, but attempting connection anyway...');
      // Continue anyway as server might not have health check endpoint
    }

    try {
      await attemptConnection();
    } catch (error) {
      console.error('Failed to connect to voice room:', error);
      set({ connectionStatus: ConnectionStatus.DISCONNECTED });
      throw error;
    }
  },

  connect: (username: string) => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    set({ 
      socket, 
      connectionStatus: ConnectionStatus.CONNECTING,
      currentUser: { id: socket.id || '', username },
      messages: [],
      partner: null,
      queuePosition: null,
    });

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to server');
      set({ connectionStatus: ConnectionStatus.CONNECTED });
      
      // Join the queue
      socket.emit('join_queue', username);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      set({ connectionStatus: ConnectionStatus.DISCONNECTED });
    });

    socket.on('queue_position', (position) => {
      console.log('Queue position:', position);
      set({ 
        connectionStatus: ConnectionStatus.WAITING_FOR_PARTNER,
        queuePosition: position 
      });
    });

    socket.on('partner_found', (partner) => {
      console.log('Paired with:', partner);
      set({ 
        connectionStatus: ConnectionStatus.IN_CHAT,
        partner,
        queuePosition: null,
        messages: [{
          id: `system-${Date.now()}`,
          content: `You are now connected with ${partner.username}`,
          senderId: 'system',
          senderUsername: 'System',
          timestamp: new Date(),
          type: MessageType.SYSTEM
        }]
      });
    });

    socket.on('message_received', (message: Message) => {
      console.log('Message received:', message);
      set(state => ({
        messages: [...state.messages, message]
      }));
    });

    socket.on('typing_indicator', (isTyping, typingUsername) => {
      const { partner } = get();
      if (!partner || partner.username !== typingUsername) return;

      set(state => {
        const existingIndex = state.typingIndicators.findIndex(
          indicator => indicator.userId === partner.id
        );

        let newTypingIndicators;
        if (isTyping) {
          const typingIndicator: TypingIndicator = {
            userId: partner.id,
            username: typingUsername,
            isTyping: true
          };

          if (existingIndex >= 0) {
            newTypingIndicators = [...state.typingIndicators];
            newTypingIndicators[existingIndex] = typingIndicator;
          } else {
            newTypingIndicators = [...state.typingIndicators, typingIndicator];
          }
        } else {
          newTypingIndicators = state.typingIndicators.filter(
            indicator => indicator.userId !== partner.id
          );
        }

        return { typingIndicators: newTypingIndicators };
      });
    });

    socket.on('partner_left', () => {
      console.log('Partner disconnected');
      set(state => ({
        messages: [...state.messages, {
          id: `system-${Date.now()}`,
          content: 'Your chat partner has disconnected',
          senderId: 'system',
          senderUsername: 'System',
          timestamp: new Date(),
          type: MessageType.SYSTEM
        }],
        partner: null,
        connectionStatus: ConnectionStatus.CONNECTED,
        typingIndicators: []
      }));
    });

    socket.on('chat_ended', () => {
      console.log('Chat ended');
      set({
        messages: [],
        partner: null,
        connectionStatus: ConnectionStatus.CONNECTED,
        typingIndicators: [],
        queuePosition: null
      });
    });

    socket.on('error', (message) => {
      console.error('Socket error:', message);
      // Handle error - could show a toast notification
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      set({ connectionStatus: ConnectionStatus.DISCONNECTED });
    });
  },

  disconnect: async () => {
    const { socket, connectionStatus, voiceRoomManager } = get();
    
    // Cleanup voice room manager first
    if (voiceRoomManager) {
      try {
        await voiceRoomManager.cleanup();
      } catch (error) {
        console.error('Error cleaning up voice room manager:', error);
      }
    }
    
    if (socket) {
      // Emit the appropriate leave event based on current connection type
      if (connectionStatus === ConnectionStatus.IN_VOICE_ROOM) {
        socket.emit('leave_voice_room');
      } else {
        socket.emit('leave_chat');
      }
      socket.disconnect();
    }
    
    set({
      socket: null,
      connectionStatus: ConnectionStatus.DISCONNECTED,
      currentUser: null,
      partner: null,
      messages: [],
      typingIndicators: [],
      queuePosition: null,
      voiceRoomState: null,
      voiceRoomManager: null
    });
  },

  sendMessage: (content: string) => {
    const { socket, currentUser, partner } = get();
    if (!socket || !currentUser || !partner) return;

    const message: Message = {
      id: `${currentUser.id}-${Date.now()}`,
      content: content.trim(),
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      timestamp: new Date(),
      type: MessageType.TEXT
    };

    // Add message to local state immediately
    set(state => ({
      messages: [...state.messages, message]
    }));

    // Send to server
    socket.emit('send_message', content.trim());
  },

  setTyping: (isTyping: boolean) => {
    const { socket } = get();
    if (!socket) return;

    if (isTyping) {
      socket.emit('typing_start');
    } else {
      socket.emit('typing_stop');
    }
  },

  // Voice Room Actions
  requestSpeakerRole: () => {
    const { voiceRoomManager } = get();
    if (!voiceRoomManager) return;

    voiceRoomManager.requestSpeakerRole();
  },

  setSpeakerVolume: (volume: number) => {
    const { voiceRoomManager } = get();
    if (!voiceRoomManager) return;

    voiceRoomManager.setSpeakerVolume(volume);
  },

  muteSpeaker: (muted: boolean) => {
    const { voiceRoomManager } = get();
    if (!voiceRoomManager) return;

    voiceRoomManager.muteSpeaker(muted);
  },

  sendAudioLevel: (level: number) => {
    const { socket } = get();
    if (!socket) return;

    socket.emit('send_audio_level', level);
  },
}));