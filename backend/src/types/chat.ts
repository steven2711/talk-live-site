// Shared type definitions for the anonymous P2P chat application
// These types should be synchronized with frontend types

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

// Global Voice Room Types
export enum VoiceRoomRole {
  LISTENER = 'listener',
  SPEAKER = 'speaker',
  QUEUE = 'queue'
}

export type UserRole = VoiceRoomRole;

export interface VoiceRoomUser {
  user: User
  role: VoiceRoomRole
  queuePosition?: number
  joinedAt: Date
  isMuted: boolean
  audioLevel: number
  volume: number
}

export interface GlobalVoiceRoom {
  id: string
  name: string
  isActive: boolean
  speakers: VoiceRoomUser[]
  listeners: VoiceRoomUser[]
  queue: VoiceRoomUser[]
  createdAt: Date
  lastActivity: Date
  maxSpeakers: number
}

export interface VoiceRoomState {
  roomId: string | null
  speakers: VoiceRoomUser[]
  listeners: VoiceRoomUser[]
  totalUsers: number
  maxSpeakers: number
  isRecording: boolean
  roomStartTime: Date | null
}

export interface AudioLevelUpdate {
  userId: string
  audioLevel: number
  timestamp: Date
}

export interface VoiceRoomBroadcastMessage {
  type: string
  data: any
  roomId: string
  fromUserId: string
  toUserId?: string
}

// WebRTC Types (for Node.js backend compatibility)
export interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback'
  sdp?: string
}

export interface RTCIceCandidateInit {
  candidate?: string
  sdpMLineIndex?: number | null
  sdpMid?: string | null
  usernameFragment?: string | null
}

export interface WebRTCOfferData {
  offer: RTCSessionDescriptionInit
  listenerId: string
  speakerId: string
}

export interface WebRTCAnswerData {
  answer: RTCSessionDescriptionInit
  speakerId: string
  listenerId: string
}

export interface WebRTCIceCandidateData {
  candidate: RTCIceCandidateInit
  peerId: string
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
  
  // Voice room events
  voice_room_joined: (roomState: VoiceRoomState) => void
  voice_room_updated: (roomState: VoiceRoomState) => void
  speaker_changed: (newSpeakers: VoiceRoomUser[]) => void
  audio_level_update: (update: AudioLevelUpdate) => void
  user_role_changed: (userId: string, newRole: UserRole) => void
  queue_updated: (listeners: VoiceRoomUser[]) => void
  speaker_volume_changed: (userId: string, volume: number) => void
  voice_room_broadcast_signal: (message: VoiceRoomBroadcastMessage) => void
  
  // WebRTC signaling events
  broadcast_offer: (data: { offer: RTCSessionDescriptionInit; speakerId: string; speakerUsername: string }) => void
  broadcast_answer: (data: { answer: RTCSessionDescriptionInit; listenerId: string }) => void
  broadcast_ice_candidate: (data: { candidate: RTCIceCandidateInit; peerId: string }) => void
  listener_ready: (data: { listenerId: string; listenerUsername: string }) => void
  speaker_joined: (data: { speakerId: string; speakerUsername: string }) => void
  speaker_promoted: (data: { newSpeakerId: string; listenerIds: string[]; speakerIds?: string[] }) => void
  peer_disconnected: (peerId: string) => void
  
  // System events
  error: (error: string) => void
  chat_ended: () => void
  heartbeat_ack: (data: { timestamp: number }) => void
}

export interface ClientToServerEvents {
  // Connection events
  join_queue: (username: string) => void
  leave_chat: () => void
  
  // Message events
  send_message: (content: string) => void
  typing_start: () => void
  typing_stop: () => void
  
  // Voice room events
  join_voice_room: (username: string) => void
  leave_voice_room: () => void
  request_speaker_role: () => void
  set_speaker_volume: (volume: number) => void
  mute_speaker: (muted: boolean) => void
  send_audio_level: (level: number) => void
  voice_room_broadcast_signal: (message: VoiceRoomBroadcastMessage) => void
  
  // WebRTC signaling events
  broadcast_offer: (data: WebRTCOfferData) => void
  broadcast_answer: (data: WebRTCAnswerData) => void
  broadcast_ice_candidate: (data: WebRTCIceCandidateData) => void
  ready_to_listen: (data: { speakerIds: string[] }) => void
  
  // Heartbeat
  ping: () => void
  heartbeat: (data: { userId: string; timestamp: number; roomId: string }) => void
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

// Configuration types
export interface ChatConfig {
  maxUsernameLength: number
  maxMessageLength: number
  maxWaitTime: number
  heartbeatInterval: number
  typingTimeout: number
}

// Statistics types (for monitoring)
export interface ChatStats {
  activeUsers: number
  activeRooms: number
  queueLength: number
  totalMessagesExchanged: number
  averageWaitTime: number
}

// Note: Interfaces cannot be used in runtime default exports
// Use named exports instead for TypeScript interfaces and types