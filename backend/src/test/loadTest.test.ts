import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client'
import { GlobalVoiceRoomManager } from '../services/globalVoiceRoomManager'
import { setupVoiceRoomSocketHandlers } from '../services/voiceRoomSocketService'
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData 
} from '../types/index'

// Mock logger to reduce noise during load testing
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}))

describe('Voice Room Load Tests', () => {
  let httpServer: any
  let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
  let voiceRoomManager: GlobalVoiceRoomManager
  let serverPort: number
  let connectedSockets: ClientSocket[] = []

  beforeEach(async () => {
    // Create HTTP server and Socket.IO server
    httpServer = createServer()
    io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
      // Optimize for load testing
      pingTimeout: 10000,
      pingInterval: 5000,
      maxHttpBufferSize: 1e6
    })

    // Create voice room manager with higher capacity for load testing
    voiceRoomManager = new GlobalVoiceRoomManager(10) // Allow up to 10 speakers

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
    // Clean up all connections
    await Promise.all(connectedSockets.map(socket => {
      if (socket.connected) {
        return new Promise<void>((resolve) => {
          socket.disconnect()
          socket.on('disconnect', () => resolve())
          setTimeout(resolve, 1000) // Force resolve after 1s
        })
      }
      return Promise.resolve()
    }))
    
    connectedSockets = []

    // Close server
    io.close()
    httpServer.close()
  })

  const createClientSocket = (): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = ClientIO(`http://localhost:${serverPort}`, {
        timeout: 5000,
        forceNew: true
      })
      
      socket.on('connect', () => {
        connectedSockets.push(socket)
        resolve(socket)
      })
      socket.on('connect_error', reject)
      
      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    })
  }

  const joinVoiceRoom = (socket: ClientSocket, username: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      socket.emit('join_voice_room', username)
      
      socket.once('voice_room_joined', resolve)
      socket.once('error', reject)
      
      setTimeout(() => reject(new Error('Join timeout')), 10000)
    })
  }

  describe('Concurrent User Load', () => {
    it('should handle 50 concurrent users joining', async () => {
      const userCount = 50
      const connectionPromises: Promise<ClientSocket>[] = []
      
      // Create all connections concurrently
      for (let i = 0; i < userCount; i++) {
        connectionPromises.push(createClientSocket())
      }
      
      const sockets = await Promise.all(connectionPromises)
      expect(sockets).toHaveLength(userCount)
      
      // Join voice room concurrently
      const joinPromises = sockets.map((socket, index) => 
        joinVoiceRoom(socket, `LoadTestUser${index}`)
      )
      
      const results = await Promise.allSettled(joinPromises)
      const successes = results.filter(r => r.status === 'fulfilled')
      
      // Expect most to succeed (allowing for some timing issues)
      expect(successes.length).toBeGreaterThan(userCount * 0.9)
      
      // Verify room state
      const roomState = voiceRoomManager.getRoomState()
      expect(roomState.totalUsers).toBeGreaterThan(userCount * 0.9)
      expect(roomState.speakers.length).toBeLessThanOrEqual(10) // Max speakers
    }, 30000)

    it('should handle rapid user join/leave cycles', async () => {
      const cycles = 20
      const usersPerCycle = 5
      
      for (let cycle = 0; cycle < cycles; cycle++) {
        // Join users
        const sockets: ClientSocket[] = []
        
        for (let i = 0; i < usersPerCycle; i++) {
          const socket = await createClientSocket()
          await joinVoiceRoom(socket, `CycleUser${cycle}-${i}`)
          sockets.push(socket)
        }
        
        // Immediately disconnect all users
        await Promise.all(sockets.map(socket => {
          return new Promise<void>((resolve) => {
            socket.disconnect()
            resolve()
          })
        }))
        
        // Remove from our tracking
        connectedSockets = connectedSockets.filter(s => !sockets.includes(s))
        
        // Brief pause between cycles
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Room should be empty or nearly empty
      const finalState = voiceRoomManager.getRoomState()
      expect(finalState.totalUsers).toBeLessThan(5) // Allow for cleanup lag
    }, 60000)

    it('should maintain performance under sustained load', async () => {
      const measurePerformance = async (operation: () => Promise<any>) => {
        const start = process.hrtime.bigint()
        await operation()
        const end = process.hrtime.bigint()
        return Number(end - start) / 1000000 // Convert to milliseconds
      }
      
      const performanceMeasures: number[] = []
      
      // Perform 100 join operations and measure each
      for (let i = 0; i < 100; i++) {
        const duration = await measurePerformance(async () => {
          const socket = await createClientSocket()
          await joinVoiceRoom(socket, `PerfUser${i}`)
        })
        
        performanceMeasures.push(duration)
        
        // Brief pause to avoid overwhelming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      const avgDuration = performanceMeasures.reduce((a, b) => a + b, 0) / performanceMeasures.length
      const maxDuration = Math.max(...performanceMeasures)
      
      console.log(`Average join time: ${avgDuration.toFixed(2)}ms`)
      console.log(`Max join time: ${maxDuration.toFixed(2)}ms`)
      
      // Performance should not degrade significantly
      expect(avgDuration).toBeLessThan(5000) // 5 seconds average
      expect(maxDuration).toBeLessThan(10000) // 10 seconds max
    }, 120000)
  })

  describe('Memory and Resource Usage', () => {
    it('should not leak memory with repeated operations', async () => {
      const iterations = 50
      const memoryMeasurements: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
        
        const memBefore = process.memoryUsage().heapUsed
        
        // Perform operations
        const socket = await createClientSocket()
        await joinVoiceRoom(socket, `MemTestUser${i}`)
        socket.disconnect()
        
        // Remove from tracking
        connectedSockets = connectedSockets.filter(s => s !== socket)
        
        // Brief pause for cleanup
        await new Promise(resolve => setTimeout(resolve, 50))
        
        if (global.gc) {
          global.gc()
        }
        
        const memAfter = process.memoryUsage().heapUsed
        memoryMeasurements.push(memAfter - memBefore)
      }
      
      // Memory usage should not grow linearly
      const firstHalf = memoryMeasurements.slice(0, 25)
      const secondHalf = memoryMeasurements.slice(25)
      
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      
      // Second half should not be significantly larger (indicating memory leaks)
      expect(avgSecond).toBeLessThan(avgFirst * 2)
    }, 60000)

    it('should handle socket connection limits gracefully', async () => {
      const maxConnections = 100
      const connectionBatches: ClientSocket[][] = []
      let totalConnected = 0
      
      try {
        // Create connections in batches
        for (let batch = 0; batch < 10; batch++) {
          const batchSockets: ClientSocket[] = []
          
          const batchPromises = Array.from({ length: 10 }, async (_, i) => {
            try {
              const socket = await createClientSocket()
              await joinVoiceRoom(socket, `BatchUser${batch}-${i}`)
              batchSockets.push(socket)
              totalConnected++
              return socket
            } catch (error) {
              // Expected to fail at some point due to limits
              return null
            }
          })
          
          const results = await Promise.allSettled(batchPromises)
          const successfulSockets = results
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => (r as any).value)
          
          connectionBatches.push(successfulSockets)
          
          if (successfulSockets.length === 0) {
            break // Hit connection limit
          }
        }
        
        expect(totalConnected).toBeGreaterThan(50) // Should handle at least 50
        
        // Room state should remain consistent
        const roomState = voiceRoomManager.getRoomState()
        expect(roomState.totalUsers).toBeLessThanOrEqual(totalConnected)
        
      } finally {
        // Clean up in batches to avoid overwhelming
        for (const batch of connectionBatches) {
          await Promise.all(batch.map(socket => {
            if (socket && socket.connected) {
              socket.disconnect()
            }
          }))
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }, 120000)
  })

  describe('Error Handling Under Load', () => {
    it('should handle malformed messages gracefully', async () => {
      const socket = await createClientSocket()
      
      // Send various malformed messages
      const malformedMessages = [
        null,
        undefined,
        '',
        'invalid-json',
        { invalid: 'data' },
        Array(10000).fill('a').join(''), // Very long string
        { username: null },
        { username: undefined }
      ]
      
      malformedMessages.forEach(msg => {
        try {
          socket.emit('join_voice_room', msg as any)
        } catch (error) {
          // Expected to handle gracefully
        }
      })
      
      // Server should still be responsive
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Should still be able to join properly
      const validResult = await joinVoiceRoom(socket, 'ValidUser')
      expect(validResult).toBeDefined()
    })

    it('should recover from temporary resource exhaustion', async () => {
      // Simulate resource exhaustion by creating many connections quickly
      const rapidConnections: Promise<ClientSocket>[] = []
      
      for (let i = 0; i < 200; i++) {
        rapidConnections.push(
          createClientSocket().catch(() => null as any)
        )
      }
      
      const results = await Promise.allSettled(rapidConnections)
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value !== null
      ).map(r => (r as any).value)
      
      // Some connections should succeed
      expect(successful.length).toBeGreaterThan(0)
      
      // Clean up successful connections
      await Promise.all(successful.map((socket: ClientSocket) => {
        if (socket && socket.connected) {
          socket.disconnect()
        }
      }))
      
      // Should recover and allow new connections
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const recoverySocket = await createClientSocket()
      const recoveryResult = await joinVoiceRoom(recoverySocket, 'RecoveryUser')
      expect(recoveryResult).toBeDefined()
    }, 60000)
  })

  describe('Real-time Performance', () => {
    it('should maintain low latency under load', async () => {
      // Create baseline load
      const baselineSockets: ClientSocket[] = []
      for (let i = 0; i < 20; i++) {
        const socket = await createClientSocket()
        await joinVoiceRoom(socket, `BaselineUser${i}`)
        baselineSockets.push(socket)
      }
      
      // Measure response times for heartbeat
      const latencyMeasurements: number[] = []
      
      for (let i = 0; i < 10; i++) {
        const socket = baselineSockets[i % baselineSockets.length]
        
        const start = Date.now()
        
        await new Promise<void>((resolve) => {
          socket.emit('heartbeat', {
            userId: `user${i}`,
            timestamp: Date.now(),
            roomId: 'test-room'
          })
          
          socket.once('heartbeat_ack', () => {
            const latency = Date.now() - start
            latencyMeasurements.push(latency)
            resolve()
          })
        })
      }
      
      const avgLatency = latencyMeasurements.reduce((a, b) => a + b, 0) / latencyMeasurements.length
      
      console.log(`Average heartbeat latency: ${avgLatency.toFixed(2)}ms`)
      
      // Latency should remain reasonable under load
      expect(avgLatency).toBeLessThan(1000) // Less than 1 second
    })

    it('should handle burst traffic patterns', async () => {
      const burstSize = 25
      const burstCount = 5
      
      for (let burst = 0; burst < burstCount; burst++) {
        console.log(`Processing burst ${burst + 1}/${burstCount}`)
        
        // Create burst of connections
        const burstPromises = Array.from({ length: burstSize }, async (_, i) => {
          const socket = await createClientSocket()
          return joinVoiceRoom(socket, `BurstUser${burst}-${i}`)
        })
        
        const results = await Promise.allSettled(burstPromises)
        const successes = results.filter(r => r.status === 'fulfilled')
        
        // Most should succeed even in burst
        expect(successes.length).toBeGreaterThan(burstSize * 0.8)
        
        // Brief pause between bursts
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      
      // Final room state should be consistent
      const finalState = voiceRoomManager.getRoomState()
      expect(finalState.totalUsers).toBeGreaterThan(0)
    }, 120000)
  })
})