import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { ChatState, Message, User, ConnectionStatus, TypingIndicator } from '../types';

const SOCKET_URL = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  socket: null,
  currentUser: null,
  partner: null,
  messages: [],
  typingIndicators: [],
  queuePosition: null,

  // Actions
  connect: (username: string) => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    set({ 
      socket, 
      connectionStatus: 'connecting',
      currentUser: { id: socket.id || '', username },
      messages: [],
      partner: null,
      queuePosition: null,
    });

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to server');
      set({ connectionStatus: 'connected' });
      
      // Join the queue
      socket.emit('join-queue', { username });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      set({ connectionStatus: 'disconnected' });
    });

    socket.on('queue-position', ({ position }) => {
      console.log('Queue position:', position);
      set({ 
        connectionStatus: 'waiting',
        queuePosition: position 
      });
    });

    socket.on('chat-paired', ({ partner, roomId }) => {
      console.log('Paired with:', partner);
      set({ 
        connectionStatus: 'paired',
        partner,
        queuePosition: null,
        messages: [{
          id: `system-${Date.now()}`,
          content: `You are now connected with ${partner.username}`,
          sender: 'system',
          timestamp: Date.now(),
          type: 'system'
        }]
      });
    });

    socket.on('message-received', (message: Message) => {
      console.log('Message received:', message);
      set(state => ({
        messages: [...state.messages, message]
      }));
    });

    socket.on('partner-typing', ({ isTyping }) => {
      const { partner } = get();
      if (!partner) return;

      set(state => {
        const existingIndex = state.typingIndicators.findIndex(
          indicator => indicator.userId === partner.id
        );

        let newTypingIndicators;
        if (isTyping) {
          const typingIndicator: TypingIndicator = {
            userId: partner.id,
            username: partner.username,
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

    socket.on('partner-disconnected', () => {
      console.log('Partner disconnected');
      set(state => ({
        messages: [...state.messages, {
          id: `system-${Date.now()}`,
          content: 'Your chat partner has disconnected',
          sender: 'system',
          timestamp: Date.now(),
          type: 'system'
        }],
        partner: null,
        connectionStatus: 'connected',
        typingIndicators: []
      }));
    });

    socket.on('chat-ended', () => {
      console.log('Chat ended');
      set({
        messages: [],
        partner: null,
        connectionStatus: 'connected',
        typingIndicators: [],
        queuePosition: null
      });
    });

    socket.on('error', ({ message }) => {
      console.error('Socket error:', message);
      // Handle error - could show a toast notification
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      set({ connectionStatus: 'disconnected' });
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('leave-chat');
      socket.disconnect();
    }
    
    set({
      socket: null,
      connectionStatus: 'disconnected',
      currentUser: null,
      partner: null,
      messages: [],
      typingIndicators: [],
      queuePosition: null
    });
  },

  sendMessage: (content: string) => {
    const { socket, currentUser, partner } = get();
    if (!socket || !currentUser || !partner) return;

    const message: Message = {
      id: `${currentUser.id}-${Date.now()}`,
      content: content.trim(),
      sender: currentUser.username,
      timestamp: Date.now(),
      type: 'text'
    };

    // Add message to local state immediately
    set(state => ({
      messages: [...state.messages, message]
    }));

    // Send to server
    socket.emit('send-message', { content: content.trim() });
  },

  setTyping: (isTyping: boolean) => {
    const { socket } = get();
    if (!socket) return;

    if (isTyping) {
      socket.emit('typing-start');
    } else {
      socket.emit('typing-stop');
    }
  },
}));