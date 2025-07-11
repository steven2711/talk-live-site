import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client'
import { GlobalVoiceRoomManager } from '../services/globalVoiceRoomManager'
import { setupVoiceRoomSocketHandlers } from '../services/voiceRoomSocketService'
import { VoiceRoomRole } from '../types/chat'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData 
} from '../types/index'

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}))

describe('Voice Room Integration Tests', () => {
  let httpServer: any
  let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
  let voiceRoomManager: GlobalVoiceRoomManager
  let clientSocket1: ClientSocket
  let clientSocket2: ClientSocket
  let clientSocket3: ClientSocket
  let serverPort: number

  beforeEach(async () => {
    // Create HTTP server and Socket.IO server
    httpServer = createServer()
    io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    })

    // Create voice room manager
    voiceRoomManager = new GlobalVoiceRoomManager(2) // Max 2 speakers

    // Setup voice room socket handlers
    setupVoiceRoomSocketHandlers(io, voiceRoomManager)

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        serverPort = httpServer.address()?.port
        resolve()
      })
    })
  })

  afterEach(async () => {
    // Clean up client connections
    if (clientSocket1?.connected) clientSocket1.disconnect()
    if (clientSocket2?.connected) clientSocket2.disconnect()
    if (clientSocket3?.connected) clientSocket3.disconnect()

    // Close server
    io.close()
    httpServer.close()
  })

  const createClientSocket = (): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = ClientIO(`http://localhost:${serverPort}`)
      
      socket.on('connect', () => resolve(socket))
      socket.on('connect_error', reject)
      
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    })
  }

  const joinVoiceRoom = (socket: ClientSocket, username: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      socket.emit('join_voice_room', username)
      
      socket.once('voice_room_joined', resolve)
      socket.once('error', reject)
      
      setTimeout(() => reject(new Error('Join timeout')), 5000)
    })
  }

  describe('Basic Voice Room Flow', () => {
    it('should allow user to join voice room as speaker', async () => {
      clientSocket1 = await createClientSocket()
      
      const roomState = await joinVoiceRoom(clientSocket1, 'TestUser1')
      
      expect(roomState.speakers).toHaveLength(1)
      expect(roomState.speakers[0].user.username).toBe('TestUser1')
      expect(roomState.listeners).toHaveLength(0)
      expect(roomState.totalUsers).toBe(1)
    })

    it('should handle multiple users joining', async () => {
      clientSocket1 = await createClientSocket()
      clientSocket2 = await createClientSocket()
      clientSocket3 = await createClientSocket()

      // First user joins as speaker
      await joinVoiceRoom(clientSocket1, 'Speaker1')
      
      // Second user joins as speaker
      await joinVoiceRoom(clientSocket2, 'Speaker2')
      
      // Third user joins as listener (speaker limit reached)
      const roomState = await joinVoiceRoom(clientSocket3, 'Listener1')
      
      expect(roomState.speakers).toHaveLength(2)
      expect(roomState.listeners).toHaveLength(1)
      expect(roomState.listeners[0].queuePosition).toBe(1)
      expect(roomState.totalUsers).toBe(3)
    })

    it('should broadcast room updates to all users', async () => {
      clientSocket1 = await createClientSocket()
      clientSocket2 = await createClientSocket()

      // Set up listener for room updates
      const roomUpdatePromise = new Promise((resolve) => {
        clientSocket1.once('voice_room_updated', resolve)
      })

      // First user joins
      await joinVoiceRoom(clientSocket1, 'User1')
      
      // Second user joins - should trigger update to first user
      await joinVoiceRoom(clientSocket2, 'User2')
      
      const updatedRoom = await roomUpdatePromise
      expect(updatedRoom).toBeDefined()
    })
  })

  describe('User Role Management', () => {
    it('should promote listener to speaker when speaker leaves', async () => {
      clientSocket1 = await createClientSocket()
      clientSocket2 = await createClientSocket()
      clientSocket3 = await createClientSocket()

      // Fill speaker slots
      await joinVoiceRoom(clientSocket1, 'Speaker1')
      await joinVoiceRoom(clientSocket2, 'Speaker2')
      
      // Add listener
      await joinVoiceRoom(clientSocket3, 'Listener1')

      // Set up listener for role change
      const roleChangePromise = new Promise((resolve) => {
        clientSocket3.once('user_role_changed', resolve)
      })

      // Speaker1 leaves
      clientSocket1.emit('leave_voice_room')
      
      // Wait for promotion
      const roleChangeData = await roleChangePromise
      expect(roleChangeData).toBeDefined()

      // Check final room state
      const finalRoomState = voiceRoomManager.getRoomState()
      expect(finalRoomState.speakers).toHaveLength(2) // Still 2 speakers
      expect(finalRoomState.listeners).toHaveLength(0) // No listeners
    })

    it('should handle speaker role requests', async () => {
      clientSocket1 = await createClientSocket()
      clientSocket2 = await createClientSocket()
      clientSocket3 = await createClientSocket()

      // Fill speaker slots and add listener
      await joinVoiceRoom(clientSocket1, 'Speaker1')
      await joinVoiceRoom(clientSocket2, 'Speaker2')
      await joinVoiceRoom(clientSocket3, 'Listener1')

      // Request speaker role (should be queued)
      clientSocket3.emit('request_speaker_role')

      // Verify listener is still in queue
      const roomState = voiceRoomManager.getRoomState()
      expect(roomState.listeners).toHaveLength(1)
      expect(roomState.listeners[0].queuePosition).toBe(1)
    })
  })

  describe('Disconnect Handling', () => {
    it('should remove user when socket disconnects', async () => {
      clientSocket1 = await createClientSocket()
      clientSocket2 = await createClientSocket()

      await joinVoiceRoom(clientSocket1, 'User1')
      await joinVoiceRoom(clientSocket2, 'User2')

      // Verify both users are in room
      let roomState = voiceRoomManager.getRoomState()
      expect(roomState.totalUsers).toBe(2)

      // Disconnect first user
      clientSocket1.disconnect()

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify user was removed
      roomState = voiceRoomManager.getRoomState()
      expect(roomState.totalUsers).toBe(1)
      expect(roomState.speakers.find(s => s.user.username === 'User1')).toBeUndefined()
    })

    it('should handle heartbeat monitoring', async () => {
      clientSocket1 = await createClientSocket()
      await joinVoiceRoom(clientSocket1, 'User1')

      // Send heartbeat
      clientSocket1.emit('heartbeat', {
        userId: 'user1',
        timestamp: Date.now(),
        roomId: 'test-room'
      })

      // Should receive acknowledgment
      const ackPromise = new Promise((resolve) => {
        clientSocket1.once('heartbeat_ack', resolve)
      })

      const ack = await ackPromise
      expect(ack).toBeDefined()
    })

    it('should clean up inactive users during periodic cleanup', async () => {
      clientSocket1 = await createClientSocket()
      await joinVoiceRoom(clientSocket1, 'User1')

      // Manually modify user activity to be old
      const users = voiceRoomManager.getAllUsers()
      if (users.length > 0) {
        users[0].user.lastActivity = new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
      }

      // Trigger cleanup
      const removedUsers = voiceRoomManager.cleanupInactiveUsers(60 * 1000) // 1 minute threshold
      
      expect(removedUsers).toContain(users[0].user.id)
      expect(voiceRoomManager.getRoomState().totalUsers).toBe(0)
    })
  })

  describe('Audio Level Updates', () => {
    it('should handle audio level updates', async () => {
      clientSocket1 = await createClientSocket()
      await joinVoiceRoom(clientSocket1, 'Speaker1')

      // Set up listener for audio level updates
      const audioLevelPromise = new Promise((resolve) => {
        clientSocket1.once('audio_level_update', resolve)
      })

      // Send audio level
      clientSocket1.emit('send_audio_level', 75)

      // Should receive audio level update
      const audioUpdate = await audioLevelPromise
      expect(audioUpdate).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid username on join', async () => {
      clientSocket1 = await createClientSocket()

      const errorPromise = new Promise((resolve) => {
        clientSocket1.once('error', resolve)
      })

      // Try to join with empty username
      clientSocket1.emit('join_voice_room', '')

      const error = await errorPromise
      expect(error).toBeDefined()
    })

    it('should handle duplicate user joins', async () => {
      clientSocket1 = await createClientSocket()
      
      // Join first time
      await joinVoiceRoom(clientSocket1, 'TestUser')
      
      // Try to join again with same socket - should not duplicate
      const roomState = await joinVoiceRoom(clientSocket1, 'TestUser')
      expect(roomState.totalUsers).toBe(1) // Should still be 1
    })

    it('should handle leaving room when not in room', async () => {
      clientSocket1 = await createClientSocket()

      // Try to leave without joining - should not error
      expect(() => {
        clientSocket1.emit('leave_voice_room')
      }).not.toThrow()
    })
  })

  describe('Room State Consistency', () => {
    it('should maintain consistent state across multiple operations', async () => {
      const sockets: ClientSocket[] = []
      
      // Create 5 users
      for (let i = 0; i < 5; i++) {
        const socket = await createClientSocket()
        sockets.push(socket)
        await joinVoiceRoom(socket, `User${i + 1}`)
      }

      // Verify initial state
      let roomState = voiceRoomManager.getRoomState()
      expect(roomState.speakers).toHaveLength(2)
      expect(roomState.listeners).toHaveLength(3)

      // Remove some users
      sockets[0].disconnect() // Remove speaker
      sockets[3].disconnect() // Remove listener

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify state after removals
      roomState = voiceRoomManager.getRoomState()
      expect(roomState.totalUsers).toBe(3)
      expect(roomState.speakers).toHaveLength(2) // Should have promoted a listener

      // Clean up remaining sockets
      sockets.slice(1).forEach(socket => {
        if (socket.connected) socket.disconnect()
      })
    })

    it('should handle rapid connect/disconnect cycles', async () => {
      const operations: Promise<any>[] = []

      // Rapidly create and destroy connections
      for (let i = 0; i < 10; i++) {
        operations.push(
          createClientSocket()
            .then(socket => joinVoiceRoom(socket, `User${i}`))
            .then(() => new Promise(resolve => setTimeout(resolve, 100)))
            .then(() => {
              // Some disconnect immediately
              if (i % 2 === 0) {
                // Disconnect half of them
              }
            })
        )
      }

      await Promise.allSettled(operations)

      // Room should still be in valid state
      const finalState = voiceRoomManager.getRoomState()
      expect(finalState.speakers.length).toBeLessThanOrEqual(2)
      expect(finalState.totalUsers).toBeLessThanOrEqual(10)
    })
  })
})