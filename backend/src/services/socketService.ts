import { Server, Socket } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import { validateUsername } from '../utils/validation.js'
import { ChatManager } from './chatManager.js'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData,
  User
} from '../types/index.js'
import { ConnectionStatus, MessageType } from '../types/index.js'

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

export function setupSocketHandlers(io: TypedServer, chatManager: ChatManager): void {
  logger.info('Setting up Socket.IO event handlers')

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

    // Handle enhanced heartbeat for chat monitoring
    socket.on('heartbeat', (data: { userId: string; timestamp: number; roomId: string }) => {
      try {
        const user = socket.data.user
        if (user && user.id === data.userId) {
          // Update user activity in chat manager
          chatManager.updateUserActivity(user.id)
          
          // Send heartbeat acknowledgment
          socket.emit('heartbeat_ack', { timestamp: Date.now() })
        } else {
          logger.warn(`Heartbeat received from unauthorized user: ${data.userId}`)
        }
      } catch (error) {
        logger.error(`Error handling heartbeat: ${error}`)
      }
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      try {
        const user = socket.data.user
        if (user) {
          // Handle regular chat disconnection
          handleUserLeaving(socket, user, chatManager, io)
          
          logger.info(`User ${user.username} (${user.id}) disconnected: ${reason}`)
        } else {
          logger.info(`Anonymous socket ${socket.id} disconnected: ${reason}`)
        }
      } catch (error) {
        logger.error(`Error handling disconnect: ${error}`)
      }
    })
  })

  // Regular chat cleanup
  setInterval(() => {
    chatManager.cleanupInactiveRooms()
  }, 30 * 1000) // Run every 30 seconds for chat cleanup

  logger.info('Socket.IO event handlers setup complete')
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