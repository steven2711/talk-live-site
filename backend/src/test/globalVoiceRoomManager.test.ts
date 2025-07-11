import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GlobalVoiceRoomManager } from '../services/globalVoiceRoomManager'
import { VoiceRoomRole } from '../types/chat'
import type { User } from '../types/chat'

// Mock logger to avoid console spam during tests
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}))

describe('GlobalVoiceRoomManager', () => {
  let manager: GlobalVoiceRoomManager
  let testUser1: User
  let testUser2: User
  let testUser3: User

  beforeEach(() => {
    manager = new GlobalVoiceRoomManager(2) // Max 2 speakers
    
    testUser1 = {
      id: 'user1',
      username: 'TestUser1',
      socketId: 'socket1',
      connectedAt: new Date(),
      lastActivity: new Date()
    }
    
    testUser2 = {
      id: 'user2',
      username: 'TestUser2',
      socketId: 'socket2',
      connectedAt: new Date(),
      lastActivity: new Date()
    }
    
    testUser3 = {
      id: 'user3',
      username: 'TestUser3',
      socketId: 'socket3',
      connectedAt: new Date(),
      lastActivity: new Date()
    }
  })

  describe('User Management', () => {
    it('should add first user as speaker', () => {
      const result = manager.addUser(testUser1)
      
      expect(result.role).toBe(VoiceRoomRole.SPEAKER)
      expect(result.queuePosition).toBeUndefined()
      expect(manager.hasUser(testUser1.id)).toBe(true)
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(1)
      expect(roomState.speakers[0].user.id).toBe(testUser1.id)
      expect(roomState.listeners).toHaveLength(0)
    })

    it('should add second user as speaker when under limit', () => {
      manager.addUser(testUser1)
      const result = manager.addUser(testUser2)
      
      expect(result.role).toBe(VoiceRoomRole.SPEAKER)
      expect(result.queuePosition).toBeUndefined()
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(2)
      expect(roomState.listeners).toHaveLength(0)
    })

    it('should add third user as listener when speaker limit reached', () => {
      manager.addUser(testUser1)
      manager.addUser(testUser2)
      const result = manager.addUser(testUser3)
      
      expect(result.role).toBe(VoiceRoomRole.LISTENER)
      expect(result.queuePosition).toBe(1)
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(2)
      expect(roomState.listeners).toHaveLength(1)
      expect(roomState.listeners[0].queuePosition).toBe(1)
    })

    it('should not add same user twice', () => {
      const firstResult = manager.addUser(testUser1)
      const secondResult = manager.addUser(testUser1)
      
      expect(firstResult.role).toBe(VoiceRoomRole.SPEAKER)
      expect(secondResult.role).toBe(VoiceRoomRole.SPEAKER) // Should return existing role
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(1) // Still only one user
    })

    it('should check if user exists', () => {
      expect(manager.hasUser(testUser1.id)).toBe(false)
      
      manager.addUser(testUser1)
      expect(manager.hasUser(testUser1.id)).toBe(true)
      
      manager.removeUser(testUser1.id)
      expect(manager.hasUser(testUser1.id)).toBe(false)
    })
  })

  describe('User Removal and Promotion', () => {
    it('should remove speaker and promote listener', () => {
      // Add 2 speakers and 1 listener
      manager.addUser(testUser1) // Speaker
      manager.addUser(testUser2) // Speaker
      manager.addUser(testUser3) // Listener (queue position 1)
      
      // Remove first speaker
      const result = manager.removeUser(testUser1.id)
      
      expect(result.promotedUsers).toBeDefined()
      expect(result.promotedUsers!).toHaveLength(1)
      expect(result.promotedUsers![0].user.id).toBe(testUser3.id)
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(2) // Still 2 speakers
      expect(roomState.listeners).toHaveLength(0) // No listeners
      expect(roomState.speakers.find(s => s.user.id === testUser3.id)).toBeDefined()
    })

    it('should remove listener without promotion', () => {
      manager.addUser(testUser1) // Speaker
      manager.addUser(testUser2) // Speaker
      manager.addUser(testUser3) // Listener
      
      const result = manager.removeUser(testUser3.id)
      
      expect(result.promotedUsers).toBeUndefined()
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(2)
      expect(roomState.listeners).toHaveLength(0)
    })

    it('should handle removing non-existent user', () => {
      const result = manager.removeUser('nonexistent')
      
      expect(result.promotedUsers).toBeUndefined()
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(0)
      expect(roomState.listeners).toHaveLength(0)
    })

    it('should update queue positions after listener removal', () => {
      manager.addUser(testUser1) // Speaker
      manager.addUser(testUser2) // Speaker
      
      const user4 = { ...testUser3, id: 'user4', username: 'TestUser4' }
      const user5 = { ...testUser3, id: 'user5', username: 'TestUser5' }
      
      manager.addUser(testUser3) // Listener position 1
      manager.addUser(user4)     // Listener position 2
      manager.addUser(user5)     // Listener position 3
      
      // Remove middle listener
      manager.removeUser(user4.id)
      
      const roomState = manager.getRoomState()
      expect(roomState.listeners).toHaveLength(2)
      expect(roomState.listeners[0].queuePosition).toBe(1) // testUser3
      expect(roomState.listeners[1].queuePosition).toBe(2) // user5 (was 3, now 2)
    })
  })

  describe('Activity Tracking', () => {
    it('should update user activity', () => {
      manager.addUser(testUser1)
      const originalActivity = testUser1.lastActivity
      
      // Wait a bit and update activity
      setTimeout(() => {
        manager.updateUserActivity(testUser1.id)
        
        const roomState = manager.getRoomState()
        const user = roomState.speakers.find(s => s.user.id === testUser1.id)
        expect(user!.user.lastActivity.getTime()).toBeGreaterThan(originalActivity.getTime())
      }, 10)
    })

    it('should handle activity update for non-existent user', () => {
      // Should not throw error
      expect(() => {
        manager.updateUserActivity('nonexistent')
      }).not.toThrow()
    })
  })

  describe('Cleanup Operations', () => {
    it('should remove inactive users', () => {
      // Add users with old activity timestamp
      const oldUser = {
        ...testUser1,
        lastActivity: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      }
      
      manager.addUser(oldUser)
      manager.addUser(testUser2) // Active user
      
      const removedUsers = manager.cleanupInactiveUsers(5 * 60 * 1000) // 5 minute threshold
      
      expect(removedUsers).toContain(oldUser.id)
      expect(manager.hasUser(oldUser.id)).toBe(false)
      expect(manager.hasUser(testUser2.id)).toBe(true)
    })

    it('should not remove active users', () => {
      manager.addUser(testUser1)
      manager.addUser(testUser2)
      
      const removedUsers = manager.cleanupInactiveUsers(5 * 60 * 1000)
      
      expect(removedUsers).toHaveLength(0)
      expect(manager.hasUser(testUser1.id)).toBe(true)
      expect(manager.hasUser(testUser2.id)).toBe(true)
    })

    it('should reset room completely', () => {
      manager.addUser(testUser1)
      manager.addUser(testUser2)
      manager.addUser(testUser3)
      
      manager.resetRoom()
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(0)
      expect(roomState.listeners).toHaveLength(0)
      expect(manager.hasUser(testUser1.id)).toBe(false)
      expect(manager.hasUser(testUser2.id)).toBe(false)
      expect(manager.hasUser(testUser3.id)).toBe(false)
    })
  })

  describe('Room Statistics', () => {
    it('should provide accurate room stats', () => {
      manager.addUser(testUser1) // Speaker
      manager.addUser(testUser2) // Speaker
      manager.addUser(testUser3) // Listener
      
      const stats = manager.getRoomStats()
      
      expect(stats.totalUsers).toBe(3)
      expect(stats.speakerCount).toBe(2)
      expect(stats.listenerCount).toBe(1)
      expect(stats.queueLength).toBe(1)
      expect(stats.roomUptime).toBeGreaterThan(0)
    })

    it('should handle empty room stats', () => {
      const stats = manager.getRoomStats()
      
      expect(stats.totalUsers).toBe(0)
      expect(stats.speakerCount).toBe(0)
      expect(stats.listenerCount).toBe(0)
      expect(stats.queueLength).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid user additions and removals', () => {
      // Rapid additions
      for (let i = 0; i < 10; i++) {
        const user = {
          id: `user${i}`,
          username: `TestUser${i}`,
          socketId: `socket${i}`,
          connectedAt: new Date(),
          lastActivity: new Date()
        }
        manager.addUser(user)
      }
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(2) // Max speakers
      expect(roomState.listeners).toHaveLength(8) // Rest are listeners
      
      // Rapid removals
      for (let i = 0; i < 10; i++) {
        manager.removeUser(`user${i}`)
      }
      
      const finalState = manager.getRoomState()
      expect(finalState.speakers).toHaveLength(0)
      expect(finalState.listeners).toHaveLength(0)
    })

    it('should maintain queue order after multiple speaker removals', () => {
      // Fill speakers
      manager.addUser(testUser1) // Speaker
      manager.addUser(testUser2) // Speaker
      
      // Add listeners
      const listeners = []
      for (let i = 3; i <= 6; i++) {
        const user = {
          id: `user${i}`,
          username: `TestUser${i}`,
          socketId: `socket${i}`,
          connectedAt: new Date(),
          lastActivity: new Date()
        }
        listeners.push(user)
        manager.addUser(user)
      }
      
      // Remove both speakers - should promote first two listeners
      manager.removeUser(testUser1.id)
      manager.removeUser(testUser2.id)
      
      const roomState = manager.getRoomState()
      expect(roomState.speakers).toHaveLength(2)
      expect(roomState.listeners).toHaveLength(2)
      
      // Check that the right users were promoted (first in queue)
      const speakerIds = roomState.speakers.map(s => s.user.id)
      expect(speakerIds).toContain('user3')
      expect(speakerIds).toContain('user4')
    })
  })
})