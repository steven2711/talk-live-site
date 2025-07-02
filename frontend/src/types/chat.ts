// Shared type definitions for the anonymous P2P chat application
// These types should be synchronized with backend types

export interface User {
  id: string
  username: string
  socketId: string
  connectedAt: Date
  lastActivity: Date
}

export interface Message {
  id: string
  content: string
  senderId: string
  senderUsername: string
  timestamp: Date
  type: MessageType
}

export enum MessageType {
  TEXT = 'text',
  SYSTEM = 'system',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',
}

export interface ChatRoom {
  id: string
  users: User[]
  messages: Message[]
  createdAt: Date
  isActive: boolean
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  WAITING_FOR_PARTNER = 'waiting_for_partner',
  IN_CHAT = 'in_chat',
  PARTNER_DISCONNECTED = 'partner_disconnected',
}

export interface QueueUser {
  user: User
  queuePosition: number
  waitingSince: Date
}

// Socket.io Event Types
export interface ServerToClientEvents {
  // Connection events
  connection_status: (status: ConnectionStatus) => void
  queue_position: (position: number) => void
  partner_found: (partner: Omit<User, 'socketId'>) => void
  partner_left: () => void
  
  // Message events
  message_received: (message: Message) => void
  typing_indicator: (isTyping: boolean, username: string) => void
  
  // System events
  error: (error: string) => void
  chat_ended: () => void
}

export interface ClientToServerEvents {
  // Connection events
  join_queue: (username: string) => void
  leave_chat: () => void
  
  // Message events
  send_message: (content: string) => void
  typing_start: () => void
  typing_stop: () => void
  
  // Heartbeat
  ping: () => void
}

export interface InterServerEvents {
  // For future horizontal scaling
}

export interface SocketData {
  user?: User
  roomId?: string
}

// Error types
export interface ChatError {
  code: string
  message: string
  timestamp: Date
}

export enum ErrorCodes {
  INVALID_USERNAME = 'INVALID_USERNAME',
  USER_ALREADY_IN_QUEUE = 'USER_ALREADY_IN_QUEUE',
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
}

// Utility types
export type UserWithoutSocket = Omit<User, 'socketId'>
export type MessageWithoutId = Omit<Message, 'id'>
export type NewMessage = Pick<Message, 'content' | 'senderId' | 'senderUsername' | 'type'>

// Frontend-specific types
export interface ChatState {
  currentUser: User | null
  partner: UserWithoutSocket | null
  messages: Message[]
  connectionStatus: ConnectionStatus
  queuePosition: number
  isTyping: boolean
  partnerIsTyping: boolean
  error: string | null
}

// UI State types
export interface UIState {
  showEmojiPicker: boolean
  isMobile: boolean
  sidebarOpen: boolean
  theme: 'light' | 'dark'
}

// Form types
export interface UsernameFormData {
  username: string
}

export interface MessageFormData {
  message: string
}

// Configuration types
export interface ChatConfig {
  maxUsernameLength: number
  maxMessageLength: number
  maxWaitTime: number
  heartbeatInterval: number
  typingTimeout: number
  apiUrl: string
  wsUrl: string
}

// Component props types
export interface ChatMessageProps {
  message: Message
  isOwn: boolean
  showTimestamp?: boolean
}

export interface ConnectionStatusProps {
  status: ConnectionStatus
  queuePosition?: number
}

export interface TypingIndicatorProps {
  isVisible: boolean
  username: string
}

export default {
  User,
  Message,
  MessageType,
  ChatRoom,
  ConnectionStatus,
  QueueUser,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  ChatError,
  ErrorCodes,
  ChatState,
  UIState,
  UsernameFormData,
  MessageFormData,
  ChatConfig,
  ChatMessageProps,
  ConnectionStatusProps,
  TypingIndicatorProps,
}