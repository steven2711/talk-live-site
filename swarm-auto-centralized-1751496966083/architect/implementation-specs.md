# Implementation Specifications

## Backend Implementation Details

### GlobalVoiceRoomManager Class

```typescript
// /backend/src/services/globalVoiceRoomManager.ts
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'

export interface GlobalVoiceRoom {
  id: 'global-room'
  speakers: [User | null, User | null]
  listenerQueue: User[]
  allUsers: Map<string, User>
  createdAt: Date
  lastActivity: Date
  totalUsersEver: number
  stats: VoiceRoomStats
}

export interface User {
  id: string
  username: string
  socketId: string
  role: 'speaker' | 'listener'
  joinTime: Date
  lastActivity: Date
  queuePosition?: number
  speakerSlotIndex?: 0 | 1
  speakingStartTime?: Date
  totalSpeakingTime: number
}

export interface VoiceRoomStats {
  currentSpeakers: number
  totalListeners: number
  queueLength: number
  averageWaitTime: number
  totalUsers: number
  activeUsers: number
}

export class GlobalVoiceRoomManager {
  private globalRoom: GlobalVoiceRoom
  private readonly MAX_SPEAKING_TIME = 10 * 60 * 1000 // 10 minutes
  private readonly MAX_QUEUE_SIZE = 50
  
  constructor() {
    this.globalRoom = {
      id: 'global-room',
      speakers: [null, null],
      listenerQueue: [],
      allUsers: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
      totalUsersEver: 0,
      stats: this.calculateStats()
    }
  }

  // Core room management
  addUserToRoom(user: User): VoiceRoomJoinResult {
    if (this.globalRoom.allUsers.has(user.id)) {
      throw new Error('User already in room')
    }

    // Add to global room as listener initially
    user.role = 'listener'
    user.joinTime = new Date()
    user.totalSpeakingTime = 0
    
    this.globalRoom.allUsers.set(user.id, user)
    this.globalRoom.totalUsersEver++
    this.globalRoom.lastActivity = new Date()
    
    // Try to promote to speaker if slots available
    const availableSlot = this.getAvailableSpeakerSlot()
    if (availableSlot !== null) {
      this.promotToSpeaker(user, availableSlot)
    }
    
    this.updateStats()
    
    logger.info(`User ${user.username} joined global room as ${user.role}`)
    
    return {
      success: true,
      userRole: user.role,
      speakerSlotIndex: user.speakerSlotIndex,
      queuePosition: user.queuePosition,
      roomState: this.getRoomState()
    }
  }

  removeUserFromRoom(userId: string): void {
    const user = this.globalRoom.allUsers.get(userId)
    if (!user) return

    // If user was a speaker, free up the slot
    if (user.role === 'speaker' && user.speakerSlotIndex !== undefined) {
      this.globalRoom.speakers[user.speakerSlotIndex] = null
      
      // Auto-promote next user from queue
      this.autoPromoteFromQueue()
    }

    // Remove from queue if present
    this.removeFromSpeakerQueue(userId)
    
    // Remove from room
    this.globalRoom.allUsers.delete(userId)
    this.globalRoom.lastActivity = new Date()
    this.updateStats()
    
    logger.info(`User ${user.username} left global room`)
  }

  // Speaker slot management
  requestSpeakerSlot(userId: string): SpeakerRequestResult {
    const user = this.globalRoom.allUsers.get(userId)
    if (!user) {
      return { success: false, error: 'User not in room' }
    }

    if (user.role === 'speaker') {
      return { success: false, error: 'User is already a speaker' }
    }

    // Check if speaker slot available
    const availableSlot = this.getAvailableSpeakerSlot()
    if (availableSlot !== null) {
      this.promotToSpeaker(user, availableSlot)
      return { 
        success: true, 
        speakerSlotIndex: availableSlot,
        message: 'Promoted to speaker immediately' 
      }
    }

    // Add to queue
    if (this.globalRoom.listenerQueue.length >= this.MAX_QUEUE_SIZE) {
      return { success: false, error: 'Speaker queue is full' }
    }

    if (!this.globalRoom.listenerQueue.some(u => u.id === userId)) {
      this.globalRoom.listenerQueue.push(user)
      this.updateQueuePositions()
    }

    return {
      success: true,
      queuePosition: user.queuePosition,
      estimatedWaitTime: this.calculateEstimatedWaitTime(),
      message: 'Added to speaker queue'
    }
  }

  voluntaryLeaveSpeaker(userId: string): void {
    const user = this.globalRoom.allUsers.get(userId)
    if (!user || user.role !== 'speaker' || user.speakerSlotIndex === undefined) {
      return
    }

    // Record speaking time
    if (user.speakingStartTime) {
      user.totalSpeakingTime += Date.now() - user.speakingStartTime.getTime()
    }

    // Free up speaker slot
    this.globalRoom.speakers[user.speakerSlotIndex] = null
    user.role = 'listener'
    delete user.speakerSlotIndex
    delete user.speakingStartTime

    // Auto-promote from queue
    this.autoPromoteFromQueue()
    
    this.updateStats()
    logger.info(`User ${user.username} voluntarily left speaker slot`)
  }

  private promotToSpeaker(user: User, slotIndex: 0 | 1): void {
    user.role = 'speaker'
    user.speakerSlotIndex = slotIndex
    user.speakingStartTime = new Date()
    delete user.queuePosition
    
    this.globalRoom.speakers[slotIndex] = user
    
    // Remove from queue if present
    this.removeFromSpeakerQueue(user.id)
    
    logger.info(`User ${user.username} promoted to speaker slot ${slotIndex}`)
  }

  private autoPromoteFromQueue(): void {
    const availableSlot = this.getAvailableSpeakerSlot()
    if (availableSlot !== null && this.globalRoom.listenerQueue.length > 0) {
      const nextSpeaker = this.globalRoom.listenerQueue.shift()!
      this.promotToSpeaker(nextSpeaker, availableSlot)
      this.updateQueuePositions()
      
      logger.info(`Auto-promoted ${nextSpeaker.username} from queue to slot ${availableSlot}`)
    }
  }

  private getAvailableSpeakerSlot(): 0 | 1 | null {
    if (this.globalRoom.speakers[0] === null) return 0
    if (this.globalRoom.speakers[1] === null) return 1
    return null
  }

  private removeFromSpeakerQueue(userId: string): void {
    const queueIndex = this.globalRoom.listenerQueue.findIndex(u => u.id === userId)
    if (queueIndex !== -1) {
      this.globalRoom.listenerQueue.splice(queueIndex, 1)
      this.updateQueuePositions()
    }
  }

  private updateQueuePositions(): void {
    this.globalRoom.listenerQueue.forEach((user, index) => {
      user.queuePosition = index + 1
    })
  }

  private calculateStats(): VoiceRoomStats {
    const speakerCount = this.globalRoom.speakers.filter(s => s !== null).length
    const listenerCount = this.globalRoom.allUsers.size - speakerCount
    
    // Calculate average wait time
    const now = new Date()
    const averageWaitTime = this.globalRoom.listenerQueue.length > 0
      ? this.globalRoom.listenerQueue.reduce((sum, user) => 
          sum + (now.getTime() - user.joinTime.getTime()), 0) / this.globalRoom.listenerQueue.length / 1000
      : 0

    return {
      currentSpeakers: speakerCount,
      totalListeners: listenerCount,
      queueLength: this.globalRoom.listenerQueue.length,
      averageWaitTime: Math.round(averageWaitTime),
      totalUsers: this.globalRoom.allUsers.size,
      activeUsers: this.globalRoom.allUsers.size
    }
  }

  private updateStats(): void {
    this.globalRoom.stats = this.calculateStats()
  }

  private calculateEstimatedWaitTime(): number {
    // Simple estimation: assume 5 minutes average speaking time
    const AVERAGE_SPEAKING_TIME = 5 * 60 * 1000 // 5 minutes
    const queuePosition = this.globalRoom.listenerQueue.length
    return Math.round((queuePosition * AVERAGE_SPEAKING_TIME) / 2 / 1000) // Divide by 2 for 2 speaker slots
  }

  // Public getters
  getRoomState(): GlobalVoiceRoomState {
    return {
      speakers: [...this.globalRoom.speakers],
      queueLength: this.globalRoom.listenerQueue.length,
      totalUsers: this.globalRoom.allUsers.size,
      stats: this.globalRoom.stats,
      lastActivity: this.globalRoom.lastActivity
    }
  }

  getStats(): VoiceRoomStats {
    return { ...this.globalRoom.stats }
  }

  getUser(userId: string): User | null {
    return this.globalRoom.allUsers.get(userId) || null
  }

  getAllUsers(): User[] {
    return Array.from(this.globalRoom.allUsers.values())
  }

  getSpeakers(): [User | null, User | null] {
    return [...this.globalRoom.speakers]
  }

  getListenerQueue(): User[] {
    return [...this.globalRoom.listenerQueue]
  }
}

// Result interfaces
export interface VoiceRoomJoinResult {
  success: boolean
  userRole: 'speaker' | 'listener'
  speakerSlotIndex?: 0 | 1
  queuePosition?: number
  roomState: GlobalVoiceRoomState
  error?: string
}

export interface SpeakerRequestResult {
  success: boolean
  speakerSlotIndex?: 0 | 1
  queuePosition?: number
  estimatedWaitTime?: number
  message?: string
  error?: string
}

export interface GlobalVoiceRoomState {
  speakers: [User | null, User | null]
  queueLength: number
  totalUsers: number
  stats: VoiceRoomStats
  lastActivity: Date
}
```

## Socket Service Implementation

```typescript
// /backend/src/services/globalSocketService.ts
import { Server, Socket } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import { validateUsername } from '../utils/validation'
import { GlobalVoiceRoomManager } from './globalVoiceRoomManager'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData,
  User
} from '../types'

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

export function setupGlobalRoomHandlers(io: TypedServer, roomManager: GlobalVoiceRoomManager): void {
  logger.info('Setting up Global Voice Room Socket.IO handlers')

  io.on('connection', (socket: TypedSocket) => {
    logger.info(`New socket connection: ${socket.id}`)

    // Handle joining global room
    socket.on('join_global_room', (username: string) => {
      try {
        logger.info(`User ${username} attempting to join global room from socket ${socket.id}`)

        // Validate username
        const validationResult = validateUsername(username)
        if (!validationResult.isValid) {
          socket.emit('error', validationResult.error || 'Invalid username')
          return
        }

        // Create user object
        const user: User = {
          id: uuidv4(),
          username: username.trim(),
          socketId: socket.id,
          role: 'listener', // Will be set by room manager
          joinTime: new Date(),
          lastActivity: new Date(),
          totalSpeakingTime: 0
        }

        // Store user data in socket
        socket.data.user = user

        // Add user to global room
        const joinResult = roomManager.addUserToRoom(user)
        
        if (!joinResult.success) {
          socket.emit('error', joinResult.error || 'Failed to join room')
          return
        }

        // Join socket room
        socket.join('global-room')

        // Send room state to new user
        socket.emit('room_joined', joinResult.roomState)

        // Notify user of their role and position
        if (joinResult.userRole === 'speaker') {
          socket.emit('promoted_to_speaker', joinResult.speakerSlotIndex!)
        } else if (joinResult.queuePosition) {
          socket.emit('queue_position_updated', joinResult.queuePosition, joinResult.roomState.queueLength)
        }

        // Broadcast room update to all users
        io.to('global-room').emit('room_updated', roomManager.getRoomState())

        logger.info(`User ${username} (${user.id}) joined global room as ${joinResult.userRole}`)

      } catch (error) {
        logger.error(`Error joining global room: ${error}`)
        socket.emit('error', error instanceof Error ? error.message : 'Failed to join room')
      }
    })

    // Handle speaker slot requests
    socket.on('request_speaker_slot', () => {
      try {
        const user = socket.data.user
        if (!user) {
          socket.emit('error', 'User not authenticated')
          return
        }

        const result = roomManager.requestSpeakerSlot(user.id)
        
        if (!result.success) {
          socket.emit('error', result.error || 'Failed to request speaker slot')
          return
        }

        // If immediately promoted
        if (result.speakerSlotIndex !== undefined) {
          socket.emit('promoted_to_speaker', result.speakerSlotIndex)
          io.to('global-room').emit('speaker_joined', user, result.speakerSlotIndex)
        } else {
          // Added to queue
          socket.emit('queue_joined', result.queuePosition!)
          socket.emit('queue_position_updated', result.queuePosition!, roomManager.getStats().queueLength)
        }

        // Broadcast room update
        io.to('global-room').emit('room_updated', roomManager.getRoomState())

        logger.info(`User ${user.username} requested speaker slot: ${result.message}`)

      } catch (error) {
        logger.error(`Error requesting speaker slot: ${error}`)
        socket.emit('error', 'Failed to request speaker slot')
      }
    })

    // Handle voluntary speaker leaving
    socket.on('voluntary_speaker_leave', () => {
      try {
        const user = socket.data.user
        if (!user) return

        const wasSpeaker = user.role === 'speaker'
        const slotIndex = user.speakerSlotIndex

        roomManager.voluntaryLeaveSpeaker(user.id)

        if (wasSpeaker && slotIndex !== undefined) {
          socket.emit('demoted_to_listener')
          io.to('global-room').emit('speaker_left', slotIndex)
          
          // Check if someone was auto-promoted
          const newSpeaker = roomManager.getSpeakers()[slotIndex]
          if (newSpeaker) {
            const newSpeakerSocket = io.sockets.sockets.get(newSpeaker.socketId)
            if (newSpeakerSocket) {
              newSpeakerSocket.emit('promoted_to_speaker', slotIndex)
              io.to('global-room').emit('speaker_joined', newSpeaker, slotIndex)
            }
          }
        }

        // Update all queue positions
        const queue = roomManager.getListenerQueue()
        queue.forEach((queueUser, index) => {
          const queueSocket = io.sockets.sockets.get(queueUser.socketId)
          if (queueSocket) {
            queueSocket.emit('queue_position_updated', index + 1, queue.length)
          }
        })

        // Broadcast room update
        io.to('global-room').emit('room_updated', roomManager.getRoomState())

        logger.info(`User ${user.username} voluntarily left speaker slot`)

      } catch (error) {
        logger.error(`Error handling voluntary speaker leave: ${error}`)
      }
    })

    // Handle leaving global room
    socket.on('leave_global_room', () => {
      try {
        const user = socket.data.user
        if (!user) return

        handleUserLeaving(socket, user, roomManager, io)
        logger.info(`User ${user.username} (${user.id}) left global room voluntarily`)

      } catch (error) {
        logger.error(`Error handling leave global room: ${error}`)
      }
    })

    // Handle ping for heartbeat
    socket.on('ping', () => {
      try {
        const user = socket.data.user
        if (user) {
          user.lastActivity = new Date()
        }
      } catch (error) {
        logger.error(`Error handling ping: ${error}`)
      }
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      try {
        const user = socket.data.user
        if (user) {
          handleUserLeaving(socket, user, roomManager, io)
          logger.info(`User ${user.username} (${user.id}) disconnected: ${reason}`)
        } else {
          logger.info(`Anonymous socket ${socket.id} disconnected: ${reason}`)
        }
      } catch (error) {
        logger.error(`Error handling disconnect: ${error}`)
      }
    })
  })

  // Periodic room stats broadcast
  setInterval(() => {
    const stats = roomManager.getStats()
    io.to('global-room').emit('room_stats', stats)
  }, 30000) // Every 30 seconds

  logger.info('Global Voice Room Socket.IO handlers setup complete')
}

function handleUserLeaving(
  socket: TypedSocket, 
  user: User, 
  roomManager: GlobalVoiceRoomManager, 
  io: TypedServer
): void {
  try {
    const wasSpeak = user.role === 'speaker'
    const slotIndex = user.speakerSlotIndex

    // Remove user from room
    roomManager.removeUserFromRoom(user.id)

    // Leave socket room
    socket.leave('global-room')

    // If user was a speaker, handle slot management
    if (wasSpeak && slotIndex !== undefined) {
      io.to('global-room').emit('speaker_left', slotIndex)
      
      // Check if someone was auto-promoted
      const newSpeaker = roomManager.getSpeakers()[slotIndex]
      if (newSpeaker) {
        const newSpeakerSocket = io.sockets.sockets.get(newSpeaker.socketId)
        if (newSpeakerSocket) {
          newSpeakerSocket.emit('promoted_to_speaker', slotIndex)
          io.to('global-room').emit('speaker_joined', newSpeaker, slotIndex)
        }
      }
    }

    // Update all queue positions
    const queue = roomManager.getListenerQueue()
    queue.forEach((queueUser, index) => {
      const queueSocket = io.sockets.sockets.get(queueUser.socketId)
      if (queueSocket) {
        queueSocket.emit('queue_position_updated', index + 1, queue.length)
      }
    })

    // Broadcast room update
    io.to('global-room').emit('room_updated', roomManager.getRoomState())

    // Clear socket data
    socket.data.user = undefined
    
  } catch (error) {
    logger.error(`Error handling user leaving: ${error}`)
  }
}
```

## Frontend Store Implementation

```typescript
// /frontend/src/store/globalRoomStore.ts
import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import { 
  User, 
  GlobalVoiceRoomState, 
  VoiceRoomStats,
  ClientToServerEvents, 
  ServerToClientEvents 
} from '../types'

const SOCKET_URL = (import.meta.env?.VITE_PROD || import.meta.env?.PROD) 
  ? window.location.origin 
  : 'http://localhost:3002'

interface GlobalRoomState {
  // Connection state
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null
  isConnected: boolean
  isConnecting: boolean
  
  // User state
  currentUser: User | null
  userRole: 'speaker' | 'listener' | null
  speakerSlotIndex: 0 | 1 | null
  queuePosition: number | null
  
  // Room state
  roomState: GlobalVoiceRoomState | null
  speakers: [User | null, User | null]
  queueLength: number
  totalUsers: number
  roomStats: VoiceRoomStats | null
  
  // Audio state
  isRequestingSpeaker: boolean
  isMuted: boolean
  speakerVolumes: [number, number]
  
  // Actions
  joinGlobalRoom: (username: string) => void
  leaveGlobalRoom: () => void
  requestSpeakerSlot: () => void
  leaveSpeakerQueue: () => void
  voluntaryLeaveSpeaker: () => void
  toggleMute: () => void
  setSpeakerVolume: (slotIndex: 0 | 1, volume: number) => void
}

export const useGlobalRoomStore = create<GlobalRoomState>((set, get) => ({
  // Initial state
  socket: null,
  isConnected: false,
  isConnecting: false,
  currentUser: null,
  userRole: null,
  speakerSlotIndex: null,
  queuePosition: null,
  roomState: null,
  speakers: [null, null],
  queueLength: 0,
  totalUsers: 0,
  roomStats: null,
  isRequestingSpeaker: false,
  isMuted: false,
  speakerVolumes: [1.0, 1.0],

  // Actions
  joinGlobalRoom: (username: string) => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    })

    set({ 
      socket, 
      isConnecting: true,
      currentUser: { 
        id: '', // Will be set by server
        username,
        socketId: socket.id || '',
        role: 'listener',
        joinTime: new Date(),
        lastActivity: new Date(),
        totalSpeakingTime: 0
      }
    })

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to global room server')
      set({ isConnected: true, isConnecting: false })
      socket.emit('join_global_room', username)
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from global room server')
      set({ isConnected: false })
    })

    socket.on('room_joined', (roomState: GlobalVoiceRoomState) => {
      console.log('Joined global room:', roomState)
      set({ 
        roomState,
        speakers: roomState.speakers,
        queueLength: roomState.queueLength,
        totalUsers: roomState.totalUsers,
        roomStats: roomState.stats
      })
    })

    socket.on('room_updated', (roomState: GlobalVoiceRoomState) => {
      console.log('Room state updated:', roomState)
      set({ 
        roomState,
        speakers: roomState.speakers,
        queueLength: roomState.queueLength,
        totalUsers: roomState.totalUsers,
        roomStats: roomState.stats
      })
    })

    socket.on('promoted_to_speaker', (slotIndex: 0 | 1) => {
      console.log(`Promoted to speaker slot ${slotIndex}`)
      set(state => ({
        userRole: 'speaker',
        speakerSlotIndex: slotIndex,
        queuePosition: null,
        isRequestingSpeaker: false,
        currentUser: state.currentUser ? {
          ...state.currentUser,
          role: 'speaker',
          speakerSlotIndex: slotIndex,
          speakingStartTime: new Date()
        } : null
      }))
    })

    socket.on('demoted_to_listener', () => {
      console.log('Demoted to listener')
      set(state => ({
        userRole: 'listener',
        speakerSlotIndex: null,
        currentUser: state.currentUser ? {
          ...state.currentUser,
          role: 'listener'
        } : null
      }))
    })

    socket.on('queue_joined', (position: number) => {
      console.log(`Joined speaker queue at position ${position}`)
      set({ queuePosition: position, isRequestingSpeaker: false })
    })

    socket.on('queue_position_updated', (position: number, totalQueue: number) => {
      console.log(`Queue position updated: ${position}/${totalQueue}`)
      set({ queuePosition: position, queueLength: totalQueue })
    })

    socket.on('speaker_joined', (user: User, slotIndex: 0 | 1) => {
      console.log(`Speaker joined slot ${slotIndex}:`, user)
      set(state => {
        const newSpeakers: [User | null, User | null] = [...state.speakers]
        newSpeakers[slotIndex] = user
        return { speakers: newSpeakers }
      })
    })

    socket.on('speaker_left', (slotIndex: 0 | 1) => {
      console.log(`Speaker left slot ${slotIndex}`)
      set(state => {
        const newSpeakers: [User | null, User | null] = [...state.speakers]
        newSpeakers[slotIndex] = null
        return { speakers: newSpeakers }
      })
    })

    socket.on('room_stats', (stats: VoiceRoomStats) => {
      set({ roomStats: stats })
    })

    socket.on('error', (message: string) => {
      console.error('Global room error:', message)
      set({ isRequestingSpeaker: false })
      // Could show toast notification here
    })
  },

  leaveGlobalRoom: () => {
    const { socket } = get()
    if (!socket) return

    socket.emit('leave_global_room')
    socket.disconnect()
    
    set({
      socket: null,
      isConnected: false,
      isConnecting: false,
      currentUser: null,
      userRole: null,
      speakerSlotIndex: null,
      queuePosition: null,
      roomState: null,
      speakers: [null, null],
      queueLength: 0,
      totalUsers: 0,
      roomStats: null,
      isRequestingSpeaker: false
    })
  },

  requestSpeakerSlot: () => {
    const { socket, isRequestingSpeaker } = get()
    if (!socket || isRequestingSpeaker) return

    set({ isRequestingSpeaker: true })
    socket.emit('request_speaker_slot')
  },

  leaveSpeakerQueue: () => {
    const { socket } = get()
    if (!socket) return

    socket.emit('leave_speaker_queue')
    set({ queuePosition: null })
  },

  voluntaryLeaveSpeaker: () => {
    const { socket } = get()
    if (!socket) return

    socket.emit('voluntary_speaker_leave')
  },

  toggleMute: () => {
    const { socket, isMuted } = get()
    if (!socket) return

    const newMutedState = !isMuted
    socket.emit('mute_speaker', newMutedState)
    set({ isMuted: newMutedState })
  },

  setSpeakerVolume: (slotIndex: 0 | 1, volume: number) => {
    set(state => {
      const newVolumes: [number, number] = [...state.speakerVolumes]
      newVolumes[slotIndex] = volume
      return { speakerVolumes: newVolumes }
    })
  }
}))
```

This implementation provides the core backend and frontend infrastructure for the global voice room system with proper speaker slot management, queue handling, and real-time state synchronization.