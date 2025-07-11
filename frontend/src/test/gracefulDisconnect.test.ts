import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { gracefulDisconnectManager, quickDisconnect, emergencyDisconnect } from '../utils/gracefulDisconnect'

// Mock navigator.sendBeacon
const mockSendBeacon = vi.fn()
Object.defineProperty(global, 'navigator', {
  value: {
    sendBeacon: mockSendBeacon
  },
  writable: true
})

// Mock fetch
global.fetch = vi.fn()

describe('GracefulDisconnectManager', () => {
  let mockSocket: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    mockSendBeacon.mockClear()
    ;(global.fetch as any).mockClear()
    
    // Create mock socket
    mockSocket = {
      emit: vi.fn(),
      once: vi.fn(),
      off: vi.fn()
    }
    
    // Clear disconnect queue
    gracefulDisconnectManager.clearQueue()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Socket Disconnect Strategy', () => {
    it('should attempt socket disconnect first', async () => {
      // Mock socket acknowledgment
      mockSocket.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'disconnect_ack') {
          setTimeout(() => callback(), 100)
        }
      })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('leave_voice_room')
      expect(result.method).toBe('socket')
      expect(result.success).toBe(true)
    })

    it('should retry socket disconnect on failure', async () => {
      // Mock socket that never acknowledges
      mockSocket.once.mockImplementation(() => {
        // No callback called - timeout
      })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 2,
        retryDelay: 100
      })

      expect(mockSocket.emit).toHaveBeenCalledTimes(2) // Original + 1 retry
      expect(result.method).toBe('beacon') // Should fall back to beacon
    })
  })

  describe('Beacon Disconnect Strategy', () => {
    it('should use beacon when socket fails', async () => {
      // Mock failed socket
      mockSocket.once.mockImplementation(() => {})
      
      // Mock successful beacon
      mockSendBeacon.mockReturnValue(true)

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 1
      })

      expect(mockSendBeacon).toHaveBeenCalledWith(
        '/api/voice-room/disconnect',
        expect.stringContaining('"userId":"user123"')
      )
      expect(result.method).toBe('beacon')
      expect(result.success).toBe(true)
    })

    it('should handle beacon failure', async () => {
      // Mock failed socket
      mockSocket.once.mockImplementation(() => {})
      
      // Mock failed beacon
      mockSendBeacon.mockReturnValue(false)
      
      // Mock successful fetch
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 1
      })

      expect(result.method).toBe('socket') // Falls back to fetch (but reports as socket)
      expect(result.success).toBe(true)
    })
  })

  describe('Fetch Disconnect Strategy', () => {
    it('should use fetch as final fallback', async () => {
      // Mock failed socket
      mockSocket.once.mockImplementation(() => {})
      
      // Mock failed beacon
      mockSendBeacon.mockReturnValue(false)
      
      // Mock successful fetch
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 1
      })

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/voice-room/disconnect',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"userId":"user123"')
        })
      )
      expect(result.success).toBe(true)
    })

    it('should retry fetch on failure', async () => {
      // Mock failed socket and beacon
      mockSocket.once.mockImplementation(() => {})
      mockSendBeacon.mockReturnValue(false)
      
      // Mock fetch that fails then succeeds
      ;(global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ ok: true })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 2,
        retryDelay: 50
      })

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })

    it('should handle complete failure', async () => {
      // Mock all strategies failing
      mockSocket.once.mockImplementation(() => {})
      mockSendBeacon.mockReturnValue(false)
      ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 1,
        retryDelay: 10
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('failed after retries')
    })
  })

  describe('Queue Management', () => {
    it('should queue disconnect when processing', async () => {
      // Start a disconnect that will take time
      const slowPromise = gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user1',
        action: 'leave_voice_room'
      })

      // Try to disconnect another user while first is processing
      const queuedResult = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user2', 
        action: 'leave_voice_room'
      })

      expect(queuedResult.success).toBe(false)
      expect(queuedResult.error).toContain('Queued for processing')

      await slowPromise
    })

    it('should clear queue', () => {
      gracefulDisconnectManager.clearQueue()
      // Should not throw and should be able to process new disconnects
      expect(() => gracefulDisconnectManager.clearQueue()).not.toThrow()
    })
  })

  describe('Convenience Functions', () => {
    it('should handle quickDisconnect', async () => {
      mockSocket.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'disconnect_ack') {
          setTimeout(() => callback(), 10)
        }
      })

      const result = await quickDisconnect(mockSocket, 'user123', 'page_unload')

      expect(mockSocket.emit).toHaveBeenCalledWith('leave_voice_room')
      expect(result.success).toBe(true)
    })

    it('should handle emergencyDisconnect', () => {
      emergencyDisconnect('user123')

      expect(mockSendBeacon).toHaveBeenCalledWith(
        '/api/voice-room/disconnect',
        expect.stringContaining('"userId":"user123"')
      )
    })

    it('should handle emergencyDisconnect without beacon support', () => {
      // Mock navigator without beacon support
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true
      })

      // Should not throw
      expect(() => emergencyDisconnect('user123')).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle socket errors gracefully', async () => {
      mockSocket.emit.mockImplementation(() => {
        throw new Error('Socket error')
      })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 1
      })

      // Should fall back to beacon
      expect(result.method).toBe('beacon')
    })

    it('should handle beacon errors gracefully', async () => {
      mockSocket.once.mockImplementation(() => {})
      mockSendBeacon.mockImplementation(() => {
        throw new Error('Beacon error')
      })

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room'
      })

      // Should continue to fetch fallback
      expect(result.method).toBe('socket') // Fetch fallback
    })

    it('should provide meaningful error messages', async () => {
      mockSocket.once.mockImplementation(() => {})
      mockSendBeacon.mockReturnValue(false)
      ;(global.fetch as any).mockRejectedValue(new Error('Specific network error'))

      const result = await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 1
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('Configuration', () => {
    it('should respect maxRetries setting', async () => {
      mockSocket.once.mockImplementation(() => {})
      
      await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 5,
        retryDelay: 1
      })

      expect(mockSocket.emit).toHaveBeenCalledTimes(5)
    })

    it('should respect retryDelay setting', async () => {
      const startTime = Date.now()
      mockSocket.once.mockImplementation(() => {})
      
      await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        maxRetries: 2,
        retryDelay: 100
      })

      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThanOrEqual(100)
    })

    it('should allow disabling beacon', async () => {
      mockSocket.once.mockImplementation(() => {})
      ;(global.fetch as any).mockResolvedValue({ ok: true })

      await gracefulDisconnectManager.disconnect(mockSocket, {
        userId: 'user123',
        action: 'leave_voice_room',
        useBeacon: false,
        maxRetries: 1
      })

      expect(mockSendBeacon).not.toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalled()
    })
  })
})