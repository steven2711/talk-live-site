import { Server, Socket } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import { validateUsername } from '../utils/validation.js'
import { GlobalVoiceRoomManager } from './globalVoiceRoomManager.js'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData,
  User,
  VoiceRoomState
} from '../types/index.js'
import { VoiceRoomRole, MessageType } from '../types/index.js'
import { ConnectionStatus } from '../types/index.js'

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

export function setupVoiceRoomSocketHandlers(io: TypedServer, voiceRoomManager: GlobalVoiceRoomManager): void {
  logger.info('Setting up Voice Room Socket.IO event handlers')

  io.on('connection', (socket: TypedSocket) => {
    logger.info(`New voice room socket connection: ${socket.id}`)
    
    // Initialize connection status
    socket.emit('connection_status', ConnectionStatus.CONNECTED)

    // Handle user joining the voice room
    socket.on('join_voice_room', (username: string) => {
      try {
        logger.info(`User ${username} attempting to join voice room from socket ${socket.id}`)

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
          connectedAt: new Date(),
          lastActivity: new Date()
        }

        // Store user data in socket
        socket.data.user = user

        // Add user to voice room
        const result = voiceRoomManager.addUser(user)
        
        // Join the voice room socket room for broadcasting
        socket.join('voice_room')
        
        // Create and emit room state
        const roomState = createVoiceRoomState(voiceRoomManager)
        socket.emit('voice_room_joined', roomState)
        socket.emit('connection_status', ConnectionStatus.IN_CHAT)

        // Broadcast room state update to all users
        broadcastRoomState(io, voiceRoomManager)

        // Notify of role change if user became a speaker
        if (result.role === VoiceRoomRole.SPEAKER) {
          socket.emit('user_role_changed', user.id, result.role)
        }

        logger.info(`User ${username} (${user.id}) joined voice room as ${result.role}${result.queuePosition ? ` at queue position ${result.queuePosition}` : ''}`)

      } catch (error) {
        logger.error(`Error joining voice room: ${error}`)
        socket.emit('error', error instanceof Error ? error.message : 'Failed to join voice room')
      }
    })

    // Handle user requesting speaker role (if they're a listener)
    socket.on('request_speaker_role', () => {
      try {
        const user = socket.data.user
        if (!user) {
          socket.emit('error', 'User not authenticated')
          return
        }

        const userStatus = voiceRoomManager.getUserVoiceStatus(user.id)
        if (!userStatus) {
          socket.emit('error', 'User not in voice room')
          return
        }

        if (userStatus.role === 'speaker') {
          socket.emit('error', 'You are already a speaker')
          return
        }

        // For now, just notify the user of their current queue position
        // In a real implementation, this might move them up in the queue or handle priority requests
        socket.emit('queue_position', userStatus.queuePosition || 0)
        
        logger.info(`User ${user.username} requested speaker role (currently at position ${userStatus.queuePosition})`)

      } catch (error) {
        logger.error(`Error handling speaker role request: ${error}`)
        socket.emit('error', 'Failed to process speaker role request')
      }
    })

    // Handle user leaving voice room
    socket.on('leave_voice_room', () => {
      try {
        const user = socket.data.user
        if (!user) return

        handleUserLeavingVoiceRoom(socket, user, voiceRoomManager, io)
        logger.info(`User ${user.username} (${user.id}) left voice room voluntarily`)

      } catch (error) {
        logger.error(`Error handling leave voice room: ${error}`)
      }
    })

    // Handle sending messages (voice room chat)
    socket.on('send_message', (content: string) => {
      try {
        const user = socket.data.user
        if (!user) {
          socket.emit('error', 'User not authenticated')
          return
        }

        // Validate message content
        if (!content || content.trim().length === 0) {
          socket.emit('error', 'Message cannot be empty')
          return
        }

        if (content.length > 500) {
          socket.emit('error', 'Message too long (max 500 characters)')
          return
        }

        const userStatus = voiceRoomManager.getUserVoiceStatus(user.id)
        if (!userStatus) {
          socket.emit('error', 'You are not in the voice room')
          return
        }

        // Create message object
        const message = {
          id: uuidv4(),
          content: content.trim(),
          senderId: user.id,
          senderUsername: user.username,
          timestamp: new Date(),
          type: MessageType.TEXT,
          senderRole: userStatus.role // Include sender's role for UI styling
        }

        // Broadcast message to all users in the voice room
        io.to('voice_room').emit('message_received', message)

        // Update user activity
        voiceRoomManager.getUserVoiceStatus(user.id) // This will update internal tracking

        logger.debug(`Message sent by ${user.username} (${userStatus.role}) in voice room`)

      } catch (error) {
        logger.error(`Error sending voice room message: ${error}`)
        socket.emit('error', 'Failed to send message')
      }
    })

    // Handle typing indicators
    socket.on('typing_start', () => {
      try {
        const user = socket.data.user
        if (!user) return

        const userStatus = voiceRoomManager.getUserVoiceStatus(user.id)
        if (!userStatus) return

        // Broadcast typing indicator to all other users in the voice room
        socket.to('voice_room').emit('typing_indicator', true, user.username)

      } catch (error) {
        logger.error(`Error handling typing start: ${error}`)
      }
    })

    socket.on('typing_stop', () => {
      try {
        const user = socket.data.user
        if (!user) return

        const userStatus = voiceRoomManager.getUserVoiceStatus(user.id)
        if (!userStatus) return

        // Broadcast typing stop to all other users in the voice room
        socket.to('voice_room').emit('typing_indicator', false, user.username)

      } catch (error) {
        logger.error(`Error handling typing stop: ${error}`)
      }
    })

    // Handle ping for heartbeat
    socket.on('ping', () => {
      try {
        const user = socket.data.user
        if (user) {
          // Update user activity
          user.lastActivity = new Date()
        }
        socket.emit('connection_status', ConnectionStatus.CONNECTED)
      } catch (error) {
        logger.error(`Error handling ping: ${error}`)
      }
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      try {
        const user = socket.data.user
        if (user) {
          handleUserLeavingVoiceRoom(socket, user, voiceRoomManager, io)
          logger.info(`User ${user.username} (${user.id}) disconnected from voice room: ${reason}`)
        } else {
          logger.info(`Anonymous socket ${socket.id} disconnected from voice room: ${reason}`)
        }
      } catch (error) {
        logger.error(`Error handling voice room disconnect: ${error}`)
      }
    })
  })

  // Periodic cleanup and room state updates
  setInterval(() => {
    try {
      const removedUsers = voiceRoomManager.cleanupInactiveUsers()
      if (removedUsers.length > 0) {
        logger.info(`Cleaned up ${removedUsers.length} inactive users from voice room`)
        broadcastRoomState(io, voiceRoomManager)
      }
    } catch (error) {
      logger.error(`Error during voice room cleanup: ${error}`)
    }
  }, 60 * 1000) // Run every minute

  logger.info('Voice Room Socket.IO event handlers setup complete')
}

function handleUserLeavingVoiceRoom(
  socket: TypedSocket, 
  user: User, 
  voiceRoomManager: GlobalVoiceRoomManager, 
  io: TypedServer
): void {
  try {
    // Remove user from voice room
    const result = voiceRoomManager.removeUser(user.id)
    
    // Leave the voice room socket room
    socket.leave('voice_room')
    
    // Broadcast room state update to all remaining users
    broadcastRoomState(io, voiceRoomManager)
    
    // If users were promoted to speakers, notify everyone
    if (result.promotedUsers && result.promotedUsers.length > 0) {
      result.promotedUsers.forEach(promotedUser => {
        // Notify the promoted user specifically
        const promotedSocket = io.sockets.sockets.get(promotedUser.user.socketId)
        if (promotedSocket) {
          promotedSocket.emit('user_role_changed', promotedUser.user.id, VoiceRoomRole.SPEAKER)
        }
      })
      
      // Broadcast speaker changes to all users
      const speakers = voiceRoomManager.getSpeakers()
      io.to('voice_room').emit('speaker_changed', speakers)
    }
    
    // Update socket connection status
    socket.emit('connection_status', ConnectionStatus.DISCONNECTED)
    
    // Clear socket data
    socket.data.user = undefined
    socket.data.roomId = undefined
    
  } catch (error) {
    logger.error(`Error handling user leaving voice room: ${error}`)
  }
}

function broadcastRoomState(io: TypedServer, voiceRoomManager: GlobalVoiceRoomManager): void {
  try {
    const roomState = createVoiceRoomState(voiceRoomManager)
    io.to('voice_room').emit('voice_room_updated', roomState)
    
    // Also emit queue updates
    const listeners = voiceRoomManager.getListenerQueue()
    io.to('voice_room').emit('queue_updated', listeners)
    
    // Emit individual queue position updates to listeners
    listeners.forEach(listener => {
      const listenerSocket = io.sockets.sockets.get(listener.user.socketId)
      if (listenerSocket && listener.queuePosition) {
        listenerSocket.emit('queue_position', listener.queuePosition)
      }
    })
    
  } catch (error) {
    logger.error(`Error broadcasting room state: ${error}`)
  }
}

function createVoiceRoomState(voiceRoomManager: GlobalVoiceRoomManager): VoiceRoomState {
  const room = voiceRoomManager.getRoomState()
  return {
    roomId: room.id,
    speakers: room.speakers,
    listeners: room.listeners,
    totalUsers: room.speakers.length + room.listeners.length,
    maxSpeakers: room.maxSpeakers,
    isRecording: false,
    roomStartTime: room.createdAt
  }
}


// Utility function to get voice room statistics
export function getVoiceRoomStats(voiceRoomManager: GlobalVoiceRoomManager) {
  return voiceRoomManager.getRoomStats()
}