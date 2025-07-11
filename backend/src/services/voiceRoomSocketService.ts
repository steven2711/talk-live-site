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
  VoiceRoomState,
  WebRTCOfferData,
  WebRTCAnswerData,
  WebRTCIceCandidateData
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

    // Handle enhanced heartbeat for voice room monitoring
    socket.on('heartbeat', (data: { userId: string; timestamp: number; roomId: string }) => {
      try {
        const user = socket.data.user
        
        // Debug logging
        logger.debug(`Heartbeat received - Socket ID: ${socket.id}, User in socket.data: ${user ? user.id : 'none'}, Heartbeat user ID: ${data.userId}`)
        
        if (user && user.id === data.userId) {
          // Update user activity
          user.lastActivity = new Date()
          
          // Update voice room manager activity
          voiceRoomManager.updateUserActivity(user.id)
          
          logger.debug(`Voice room heartbeat received from user ${user.id}`)
          
          // Send heartbeat acknowledgment
          socket.emit('heartbeat_ack', { timestamp: Date.now() })
        } else {
          // Try to find user by ID in voice room manager
          const userStatus = voiceRoomManager.getUserVoiceStatus(data.userId)
          if (userStatus && userStatus.user.socketId === socket.id) {
            // Re-associate user with socket
            socket.data.user = userStatus.user
            socket.data.user.lastActivity = new Date()
            
            // Update voice room manager activity
            voiceRoomManager.updateUserActivity(data.userId)
            
            logger.info(`Re-associated user ${data.userId} with socket ${socket.id}`)
            
            // Send heartbeat acknowledgment
            socket.emit('heartbeat_ack', { timestamp: Date.now() })
          } else {
            logger.warn(`Voice room heartbeat received from unauthorized user: ${data.userId} (socket: ${socket.id}, user in socket.data: ${user ? user.id : 'none'})`)
          }
        }
      } catch (error) {
        logger.error(`Error handling voice room heartbeat: ${error}`)
      }
    })

    // Handle audio level updates (broadcast to all other users in the room)
    socket.on('send_audio_level', (audioLevel: number) => {
      try {
        let user = socket.data.user
        
        if (!user) {
          // Try to find user by socket ID in voice room manager
          const allUsers = [...voiceRoomManager.getSpeakers(), ...voiceRoomManager.getListenerQueue()]
          const foundUserStatus = allUsers.find(userStatus => userStatus.user.socketId === socket.id)
          
          if (foundUserStatus) {
            // Re-associate user with socket
            socket.data.user = foundUserStatus.user
            user = foundUserStatus.user
            logger.info(`Re-associated user ${user.id} with socket ${socket.id} for audio level`)
          } else {
            logger.warn(`Audio level received from unauthenticated user (socket: ${socket.id})`)
            return
          }
        }

        const userStatus = voiceRoomManager.getUserVoiceStatus(user.id)
        if (!userStatus) {
          logger.warn(`Audio level received from user ${user.id} not in voice room`)
          return
        }

        // Update audio level in voice room manager
        voiceRoomManager.updateAudioLevel(user.id, audioLevel)

        // Broadcast audio level to all OTHER users in the voice room
        socket.to('voice_room').emit('audio_level_update', {
          userId: user.id,
          audioLevel,
          timestamp: new Date()
        })

        logger.debug(`Audio level ${audioLevel} broadcast from user ${user.username}`)

      } catch (error) {
        logger.error(`Error handling audio level update: ${error}`)
      }
    })

    // ===== WebRTC Signaling Handlers =====
    
    // Handle ready_to_listen event to coordinate WebRTC connections
    socket.on('ready_to_listen', (data: { speakerIds: string[] }) => {
      try {
        const user = socket.data.user
        if (!user) {
          logger.warn('ready_to_listen received from unauthenticated user')
          return
        }

        logger.info(`🎧 [WEBRTC] User ${user.username} (${user.id}) ready to listen to speakers: ${data.speakerIds.join(', ')}`)

        // For each speaker, notify them that this listener is ready
        data.speakerIds.forEach(speakerId => {
          const speakerSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.data.user?.id === speakerId)
          
          if (speakerSocket) {
            speakerSocket.emit('listener_ready', {
              listenerId: user.id,
              listenerUsername: user.username
            })
            logger.info(`🎧 [WEBRTC] Notified speaker ${speakerId} that listener ${user.id} is ready`)
          } else {
            logger.warn(`Speaker ${speakerId} not found for ready_to_listen notification`)
          }
        })

      } catch (error) {
        logger.error(`Error handling ready_to_listen: ${error}`)
      }
    })
    
    // Handle WebRTC offer (Speaker → Listener/Speaker)
    socket.on('broadcast_offer', (data: WebRTCOfferData) => {
      try {
        const user = socket.data.user
        if (!user) {
          logger.warn('WebRTC offer received from unauthenticated user')
          return
        }

        logger.info(`🎤 [WEBRTC] Offer from ${user.username} (${user.id}) to ${data.listenerId}`)

        // Find the target user's socket
        const targetUser = Array.from(io.sockets.sockets.values())
          .find(s => s.data.user?.id === data.listenerId)

        if (targetUser) {
          // Forward the offer to the target user
          targetUser.emit('broadcast_offer', {
            offer: data.offer,
            speakerId: user.id,
            speakerUsername: user.username
          })
          logger.info(`🎤 [WEBRTC] Offer forwarded to ${data.listenerId}`)
        } else {
          logger.warn(`Target user ${data.listenerId} not found for WebRTC offer`)
        }

      } catch (error) {
        logger.error(`Error handling WebRTC offer: ${error}`)
      }
    })

    // Handle WebRTC answer (Listener/Speaker → Speaker)
    socket.on('broadcast_answer', (data: WebRTCAnswerData) => {
      try {
        const user = socket.data.user
        if (!user) {
          logger.warn('WebRTC answer received from unauthenticated user')
          return
        }

        logger.info(`🎧 [WEBRTC] Answer from ${user.username} (${user.id}) to ${data.speakerId}`)

        // Find the target speaker's socket
        const targetUser = Array.from(io.sockets.sockets.values())
          .find(s => s.data.user?.id === data.speakerId)

        if (targetUser) {
          // Forward the answer to the target speaker
          targetUser.emit('broadcast_answer', {
            answer: data.answer,
            listenerId: user.id
          })
          logger.info(`🎧 [WEBRTC] Answer forwarded to ${data.speakerId}`)
        } else {
          logger.warn(`Target speaker ${data.speakerId} not found for WebRTC answer`)
        }

      } catch (error) {
        logger.error(`Error handling WebRTC answer: ${error}`)
      }
    })

    // Handle WebRTC ICE candidates (bidirectional)
    socket.on('broadcast_ice_candidate', (data: WebRTCIceCandidateData) => {
      try {
        const user = socket.data.user
        if (!user) {
          logger.warn('WebRTC ICE candidate received from unauthenticated user')
          return
        }

        logger.info(`🧊 [WEBRTC] ICE candidate from ${user.username} (${user.id}) to ${data.peerId}`)

        // Find the target peer's socket
        const targetUser = Array.from(io.sockets.sockets.values())
          .find(s => s.data.user?.id === data.peerId)

        if (targetUser) {
          // Forward the ICE candidate to the target peer
          targetUser.emit('broadcast_ice_candidate', {
            candidate: data.candidate,
            peerId: user.id
          })
          logger.info(`🧊 [WEBRTC] ICE candidate forwarded to ${data.peerId}`)
        } else {
          logger.warn(`Target peer ${data.peerId} not found for WebRTC ICE candidate`)
        }

      } catch (error) {
        logger.error(`Error handling WebRTC ICE candidate: ${error}`)
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

  // Improved heartbeat mechanism with balanced cleanup intervals
  setInterval(() => {
    try {
      const removedUsers = voiceRoomManager.cleanupInactiveUsers(120 * 1000) // 2 minutes inactivity
      if (removedUsers.length > 0) {
        logger.info(`Voice room service: Cleaned up ${removedUsers.length} inactive users`)
        broadcastRoomState(io, voiceRoomManager)
      }
    } catch (error) {
      logger.error(`Error during voice room cleanup: ${error}`)
    }
  }, 15 * 1000) // Run every 15 seconds for balanced cleanup

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
    
    // Debug logging
    logger.info(`🏠 Broadcasting room state update: ${roomState.speakers.length} speakers, ${roomState.listeners.length} listeners`)
    roomState.speakers.forEach(speaker => {
      logger.info(`🏠 Speaker: ${speaker.user.username} (${speaker.user.id})`)
    })
    
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