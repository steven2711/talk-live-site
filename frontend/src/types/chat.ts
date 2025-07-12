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
  IN_VOICE_ROOM = 'in_voice_room',
  WAITING_IN_QUEUE = 'waiting_in_queue',
}

// WebRTC-specific types
export enum VoiceCallStatus {
  IDLE = 'idle',
  INITIATING = 'initiating',
  RINGING = 'ringing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ENDED = 'ended',
  FAILED = 'failed'
}

// Global Voice Room Types
export enum VoiceRoomRole {
  LISTENER = 'listener',
  SPEAKER = 'speaker',
  QUEUE = 'queue'
}

// Alias for consistency with socket events
export type UserRole = VoiceRoomRole;

export interface VoiceRoomUser {
  user: User
  role: VoiceRoomRole
  queuePosition?: number // Only for QUEUE role
  joinedAt: Date
  isMuted: boolean
  audioLevel: number // 0-100 for visualization
  volume: number // 0-1 for volume control
}

export interface GlobalVoiceRoom {
  id: string
  name: string
  isActive: boolean
  speakers: VoiceRoomUser[] // Max 2 speakers
  listeners: VoiceRoomUser[]
  queue: VoiceRoomUser[] // Ordered queue for speaker positions
  createdAt: Date
  lastActivity: Date
  maxSpeakers: number // Currently 2
}

export interface WebRTCSignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate'
  data: RTCSessionDescriptionInit | RTCIceCandidate
  callId: string
}

// Voice Room Broadcasting Types
export interface VoiceRoomBroadcastMessage {
  type: 'broadcast-offer' | 'broadcast-answer' | 'broadcast-ice-candidate' | 'speaker-offer' | 'speaker-answer' | 'speaker-ice-candidate'
  data: RTCSessionDescriptionInit | RTCIceCandidate
  roomId: string
  fromUserId: string
  toUserId?: string // For targeted messages
}

export interface AudioMixingConfig {
  masterVolume: number
  speakerVolumes: Record<string, number> // userId -> volume
  enableEcho: boolean
  enableNoiseSuppression: boolean
}

export interface VoiceCallState {
  status: VoiceCallStatus
  callId: string | null
  isInitiator: boolean
  startTime: Date | null
  endTime: Date | null
  error: string | null
}

export interface AudioState {
  isMuted: boolean
  isSpeakerOn: boolean
  volume: number
  hasPermission: boolean
  isRecording: boolean
}

// Consolidated VoiceCallState interface
export interface VoiceCallState {
  status: VoiceCallStatus
  callId: string | null
  isInitiator: boolean
  startTime: Date | null  
  endTime: Date | null
  error: string | null
}

export interface QueueUser {
  user: User
  queuePosition: number
  waitingSince: Date
}

// Voice Room State
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
  you_left_voice_room: (data: { userId: string; timestamp: number; reason: string }) => void
  speaker_changed: (newSpeakers: VoiceRoomUser[]) => void
  audio_level_update: (update: AudioLevelUpdate) => void
  user_role_changed: (userId: string, newRole: UserRole) => void
  queue_updated: (listeners: VoiceRoomUser[]) => void
  speaker_volume_changed: (userId: string, volume: number) => void
  
  // Voice call events
  voice_call_offer: (offer: RTCSessionDescriptionInit) => void
  voice_call_answer: (answer: RTCSessionDescriptionInit) => void
  voice_call_ice_candidate: (candidate: RTCIceCandidateInit) => void
  voice_call_request: (from: string) => void
  voice_call_accepted: () => void
  voice_call_rejected: () => void
  voice_call_ended: () => void
  
  // Broadcasting events
  broadcast_offer: (data: { offer: RTCSessionDescriptionInit, speakerId: string, speakerUsername: string }) => void
  broadcast_answer: (data: { answer: RTCSessionDescriptionInit, listenerId: string }) => void
  broadcast_ice_candidate: (data: { candidate: RTCIceCandidateInit, peerId: string }) => void
  speaker_promoted: (data: { newSpeakerId: string, listenerIds: string[] }) => void
  speaker_demoted: (data: { demotedSpeakerId: string }) => void
  room_state_updated: (data: { speakers: string[], listeners: string[], queue: string[] }) => void
  peer_disconnected: (peerId: string) => void
  
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
  
  // Voice room events
  join_voice_room: (username: string) => void
  leave_voice_room: () => void
  request_speaker_role: () => void
  set_speaker_volume: (volume: number) => void
  mute_speaker: (muted: boolean) => void
  send_audio_level: (level: number) => void
  
  // Voice call events
  voice_call_request: () => void
  voice_call_accept: () => void
  voice_call_reject: () => void
  voice_call_end: () => void
  voice_call_offer: (offer: RTCSessionDescriptionInit) => void
  voice_call_answer: (answer: RTCSessionDescriptionInit) => void
  voice_call_ice_candidate: (candidate: RTCIceCandidateInit) => void
  
  // Broadcasting events
  broadcast_offer: (data: { offer: RTCSessionDescriptionInit, listenerId: string, speakerId: string }) => void
  broadcast_answer: (data: { answer: RTCSessionDescriptionInit, speakerId: string, listenerId: string }) => void
  broadcast_ice_candidate: (data: { candidate: RTCIceCandidateInit, peerId: string }) => void
  start_broadcasting: (listenerIds: string[]) => void
  stop_broadcasting: () => void
  ready_to_listen: (data: { speakerIds: string[] }) => void
  stop_listening: () => void
  
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

export interface TypingIndicator {
  userId: string
  username: string
  isTyping: boolean
}