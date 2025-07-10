import { Server, Socket } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import { validateUsername } from '../utils/validation.js'
import { ChatManager } from './chatManager.js'
import { VoiceRoomManager } from './voiceRoomManager.js'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData,
  User
} from '../types/index.js'
import { ConnectionStatus, MessageType, VoiceRoomRole } from '../types/index.js'

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

export function setupSocketHandlers(io: TypedServer, chatManager: ChatManager): void {
  logger.info('Setting up Socket.IO event handlers')
  
  // Initialize voice room manager
  const voiceRoomManager = new VoiceRoomManager()

  io.on('connection', (socket: TypedSocket) => {
    logger.info(`New socket connection: ${socket.id}`)
    
    // Initialize connection status
    socket.emit('connection_status', ConnectionStatus.CONNECTED)

    // Handle user joining the queue
    socket.on('join_queue', (username: string) => {
      try {
        logger.info(`User ${username} attempting to join queue from socket ${socket.id}`)

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

        // Add user to queue
        const queuePosition = chatManager.addToQueue(user)
        socket.emit('queue_position', queuePosition)
        socket.emit('connection_status', ConnectionStatus.WAITING_FOR_PARTNER)

        // Check if user was immediately matched
        const room = chatManager.getUserRoom(user.id)
        if (room) {
          handleUserMatched(socket, user, room, chatManager, io)
        }

        logger.info(`User ${username} (${user.id}) joined queue at position ${queuePosition}`)

      } catch (error) {
        logger.error(`Error joining queue: ${error}`)
        socket.emit('error', error instanceof Error ? error.message : 'Failed to join queue')
      }
    })

    // Handle sending messages
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

        const room = chatManager.getUserRoom(user.id)
        if (!room) {
          socket.emit('error', 'You are not in a chat room')
          return
        }

        // Add message to room
        const message = chatManager.addMessage(room.id, user.id, content.trim())
        if (!message) {
          socket.emit('error', 'Failed to send message')
          return
        }

        // Broadcast message to all users in the room
        room.users.forEach(roomUser => {
          const userSocket = io.sockets.sockets.get(roomUser.socketId)
          if (userSocket) {
            userSocket.emit('message_received', message)
          }
        })

        // Update user activity
        chatManager.updateUserActivity(user.id)

        logger.debug(`Message sent by ${user.username} in room ${room.id}`)

      } catch (error) {
        logger.error(`Error sending message: ${error}`)
        socket.emit('error', 'Failed to send message')
      }
    })

    // Handle typing indicators
    socket.on('typing_start', () => {
      try {
        const user = socket.data.user
        if (!user) return

        const partner = chatManager.getRoomPartner(user.id)
        if (!partner) return

        const room = chatManager.getUserRoom(user.id)
        if (!room) return

        // Notify partner that user is typing
        const partnerUser = room.users.find(u => u.id === partner.id)
        if (partnerUser) {
          const partnerSocket = io.sockets.sockets.get(partnerUser.socketId)
          if (partnerSocket) {
            partnerSocket.emit('typing_indicator', true, user.username)
          }
        }

      } catch (error) {
        logger.error(`Error handling typing start: ${error}`)
      }
    })

    socket.on('typing_stop', () => {
      try {
        const user = socket.data.user
        if (!user) return

        const partner = chatManager.getRoomPartner(user.id)
        if (!partner) return

        const room = chatManager.getUserRoom(user.id)
        if (!room) return

        // Notify partner that user stopped typing
        const partnerUser = room.users.find(u => u.id === partner.id)
        if (partnerUser) {
          const partnerSocket = io.sockets.sockets.get(partnerUser.socketId)
          if (partnerSocket) {
            partnerSocket.emit('typing_indicator', false, user.username)
          }
        }

      } catch (error) {
        logger.error(`Error handling typing stop: ${error}`)
      }
    })

    // Handle user leaving chat
    socket.on('leave_chat', () => {
      try {
        const user = socket.data.user
        if (!user) return

        handleUserLeaving(socket, user, chatManager, io)
        logger.info(`User ${user.username} (${user.id}) left chat voluntarily`)

      } catch (error) {
        logger.error(`Error handling leave chat: ${error}`)
      }
    })

    // Handle ping for heartbeat
    socket.on('ping', () => {
      try {
        const user = socket.data.user
        if (user) {
          chatManager.updateUserActivity(user.id)
        }
        socket.emit('connection_status', ConnectionStatus.CONNECTED)
      } catch (error) {
        logger.error(`Error handling ping: ${error}`)
      }
    })

    // === VOICE ROOM HANDLERS ===

    // Handle joining voice room
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
        const roomState = voiceRoomManager.addUser(user)
        
        // Send room state to user
        socket.emit('voice_room_joined', roomState)
        
        // Broadcast room update to all users in the room
        broadcastVoiceRoomUpdate(io, voiceRoomManager)

        logger.info(`User ${username} (${user.id}) joined voice room`)

      } catch (error) {
        logger.error(`Error joining voice room: ${error}`)
        socket.emit('error', error instanceof Error ? error.message : 'Failed to join voice room')
      }
    })

    // Handle leaving voice room
    socket.on('leave_voice_room', () => {
      try {
        const user = socket.data.user
        if (!user) return

        voiceRoomManager.removeUser(user.id)
        
        // Broadcast room update to remaining users
        broadcastVoiceRoomUpdate(io, voiceRoomManager)
        
        socket.emit('connection_status', ConnectionStatus.DISCONNECTED)
        logger.info(`User ${user.username} (${user.id}) left voice room`)

      } catch (error) {
        logger.error(`Error handling leave voice room: ${error}`)
      }
    })

    // Handle speaker role request
    socket.on('request_speaker_role', () => {
      try {
        const user = socket.data.user
        if (!user) {
          socket.emit('error', 'User not authenticated')
          return
        }

        const result = voiceRoomManager.requestSpeakerRole(user.id)
        
        if (result.success) {
          // Broadcast room update to all users
          broadcastVoiceRoomUpdate(io, voiceRoomManager)
          
          // Notify the user of role change
          socket.emit('user_role_changed', user.id, VoiceRoomRole.SPEAKER)
          
          logger.info(`User ${user.username} promoted to speaker`)
        } else {
          socket.emit('error', result.message)
        }

      } catch (error) {
        logger.error(`Error handling speaker role request: ${error}`)
        socket.emit('error', 'Failed to process speaker request')
      }
    })

    // Handle volume changes
    socket.on('set_speaker_volume', (volume: number) => {
      try {
        const user = socket.data.user
        if (!user) return

        if (voiceRoomManager.setUserVolume(user.id, volume)) {
          // Broadcast volume change to other users
          const allUsers = voiceRoomManager.getAllUsers()
          allUsers.forEach(roomUser => {
            if (roomUser.user.id !== user.id) {
              const userSocket = io.sockets.sockets.get(roomUser.user.socketId)
              if (userSocket) {
                userSocket.emit('speaker_volume_changed', user.id, volume)
              }
            }
          })
        }

      } catch (error) {
        logger.error(`Error setting speaker volume: ${error}`)
      }
    })

    // Handle mute/unmute
    socket.on('mute_speaker', (muted: boolean) => {
      try {
        const user = socket.data.user
        if (!user) return

        if (voiceRoomManager.setUserMuted(user.id, muted)) {
          // Broadcast mute state to other users
          broadcastVoiceRoomUpdate(io, voiceRoomManager)
        }

      } catch (error) {
        logger.error(`Error handling mute speaker: ${error}`)
      }
    })

    // Handle audio level updates
    socket.on('send_audio_level', (level: number) => {
      try {
        const user = socket.data.user
        if (!user) return

        voiceRoomManager.updateAudioLevel(user.id, level)
        
        // Broadcast audio level to other users (throttled)
        const allUsers = voiceRoomManager.getAllUsers()
        allUsers.forEach(roomUser => {
          if (roomUser.user.id !== user.id) {
            const userSocket = io.sockets.sockets.get(roomUser.user.socketId)
            if (userSocket) {
              userSocket.emit('audio_level_update', {
                userId: user.id,
                audioLevel: level,
                timestamp: new Date()
              })
            }
          }
        })

      } catch (error) {
        logger.error(`Error handling audio level update: ${error}`)
      }
    })

    // Handle WebRTC signaling for voice room
    socket.on('voice_room_broadcast_signal', (message) => {
      try {
        const user = socket.data.user
        if (!user) return

        // Handle the broadcast signal
        voiceRoomManager.handleBroadcastSignal(message)
        
        // Forward the signal to the appropriate user(s)
        if (message.toUserId) {
          // Send to specific user
          const targetSocket = io.sockets.sockets.get(message.toUserId)
          if (targetSocket) {
            targetSocket.emit('voice_room_broadcast_signal', message)
          }
        } else {
          // Broadcast to all users in the room
          const allUsers = voiceRoomManager.getAllUsers()
          allUsers.forEach(roomUser => {
            if (roomUser.user.id !== user.id) {
              const userSocket = io.sockets.sockets.get(roomUser.user.socketId)
              if (userSocket) {
                userSocket.emit('voice_room_broadcast_signal', message)
              }
            }
          })
        }

      } catch (error) {
        logger.error(`Error handling voice room broadcast signal: ${error}`)
      }
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      try {
        const user = socket.data.user
        if (user) {
          // Handle regular chat disconnection
          handleUserLeaving(socket, user, chatManager, io)
          
          // Handle voice room disconnection
          const userRole = voiceRoomManager.getUserRole(user.id)
          if (userRole) {
            voiceRoomManager.removeUser(user.id)
            broadcastVoiceRoomUpdate(io, voiceRoomManager)
            logger.info(`User ${user.username} removed from voice room due to disconnection`)
          }
          
          logger.info(`User ${user.username} (${user.id}) disconnected: ${reason}`)
        } else {
          logger.info(`Anonymous socket ${socket.id} disconnected: ${reason}`)
        }
      } catch (error) {
        logger.error(`Error handling disconnect: ${error}`)
      }
    })
  })

  // Periodic cleanup
  setInterval(() => {
    chatManager.cleanupInactiveRooms()
    voiceRoomManager.cleanupInactiveUsers()
  }, 5 * 60 * 1000) // Run every 5 minutes

  logger.info('Socket.IO event handlers setup complete')
}

// Helper function to broadcast voice room updates to all users
function broadcastVoiceRoomUpdate(io: TypedServer, voiceRoomManager: VoiceRoomManager): void {
  try {
    const roomState = voiceRoomManager.getRoomState()
    const allUsers = voiceRoomManager.getAllUsers()
    
    allUsers.forEach(user => {
      const userSocket = io.sockets.sockets.get(user.user.socketId)
      if (userSocket) {
        userSocket.emit('voice_room_updated', roomState)
      }
    })
  } catch (error) {
    logger.error(`Error broadcasting voice room update: ${error}`)
  }
}

function handleUserMatched(
  socket: TypedSocket, 
  user: User, 
  room: any, 
  chatManager: ChatManager, 
  io: TypedServer
): void {
  try {
    // Update socket data
    socket.data.roomId = room.id
    
    // Update connection status
    socket.emit('connection_status', ConnectionStatus.IN_CHAT)
    
    // Get partner info
    const partner = chatManager.getRoomPartner(user.id)
    if (partner) {
      socket.emit('partner_found', partner)
      
      // Notify partner
      const partnerUser = room.users.find((u: User) => u.id === partner.id)
      if (partnerUser) {
        const partnerSocket = io.sockets.sockets.get(partnerUser.socketId)
        if (partnerSocket) {
          partnerSocket.data.roomId = room.id
          partnerSocket.emit('connection_status', ConnectionStatus.IN_CHAT)
          
          const { socketId, ...userWithoutSocket } = user
          partnerSocket.emit('partner_found', userWithoutSocket)
        }
      }
    }

    // Send system message if exists
    if (room.messages.length > 0) {
      const systemMessage = room.messages[room.messages.length - 1]
      if (systemMessage.type === MessageType.SYSTEM) {
        socket.emit('message_received', systemMessage)
        
        // Also send to partner if they exist
        const partnerUser = room.users.find((u: User) => u.id !== user.id)
        if (partnerUser) {
          const partnerSocket = io.sockets.sockets.get(partnerUser.socketId)
          if (partnerSocket) {
            partnerSocket.emit('message_received', systemMessage)
          }
        }
      }
    }

    logger.info(`User ${user.username} successfully matched and connected to chat`)

  } catch (error) {
    logger.error(`Error handling user match: ${error}`)
    socket.emit('error', 'Failed to connect to chat')
  }
}

function handleUserLeaving(
  socket: TypedSocket, 
  user: User, 
  chatManager: ChatManager, 
  io: TypedServer
): void {
  try {
    // Get partner before removing user
    const partner = chatManager.getRoomPartner(user.id)
    const room = chatManager.getUserRoom(user.id)
    
    // Remove user from queue and room
    chatManager.removeUser(user.id)
    
    // Notify partner if exists
    if (partner && room) {
      const partnerUser = room.users.find(u => u.id === partner.id)
      if (partnerUser) {
        const partnerSocket = io.sockets.sockets.get(partnerUser.socketId)
        if (partnerSocket) {
          partnerSocket.emit('partner_left')
          partnerSocket.emit('connection_status', ConnectionStatus.PARTNER_DISCONNECTED)
          partnerSocket.emit('chat_ended')
        }
      }
    }
    
    // Update socket connection status
    socket.emit('connection_status', ConnectionStatus.DISCONNECTED)
    socket.emit('chat_ended')
    
    // Clear socket data
    socket.data.user = undefined
    socket.data.roomId = undefined
    
  } catch (error) {
    logger.error(`Error handling user leaving: ${error}`)
  }
}