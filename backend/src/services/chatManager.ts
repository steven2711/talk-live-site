import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import type { 
  User, 
  ChatRoom, 
  QueueUser, 
  Message, 
  ChatStats,
  UserWithoutSocket
} from '../types/index.js'
import { MessageType } from '../types/index.js'

export class ChatManager {
  private users: Map<string, User> = new Map()
  private rooms: Map<string, ChatRoom> = new Map()
  private queue: QueueUser[] = []
  private userRooms: Map<string, string> = new Map() // userId -> roomId
  private userQueues: Map<string, number> = new Map() // userId -> queue position

  /**
   * Add user to the matching queue
   */
  addToQueue(user: User): number {
    // Check if user is already in queue
    const existingQueueIndex = this.queue.findIndex(q => q.user.id === user.id)
    if (existingQueueIndex !== -1) {
      return existingQueueIndex + 1
    }

    // Check if user is already in a room
    if (this.userRooms.has(user.id)) {
      throw new Error('User is already in a chat room')
    }

    this.users.set(user.id, user)
    
    const queueUser: QueueUser = {
      user,
      queuePosition: this.queue.length + 1,
      waitingSince: new Date()
    }

    this.queue.push(queueUser)
    this.userQueues.set(user.id, this.queue.length)
    
    logger.info(`User ${user.username} (${user.id}) added to queue at position ${this.queue.length}`)
    
    // Try to match immediately
    this.tryMatchUsers()
    
    return this.queue.length
  }

  /**
   * Remove user from queue
   */
  removeFromQueue(userId: string): void {
    const queueIndex = this.queue.findIndex(q => q.user.id === userId)
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1)
      this.userQueues.delete(userId)
      
      // Update queue positions
      this.queue.forEach((queueUser, index) => {
        queueUser.queuePosition = index + 1
        this.userQueues.set(queueUser.user.id, index + 1)
      })
      
      logger.info(`User ${userId} removed from queue`)
    }
  }

  /**
   * Try to match two users from the queue
   */
  private tryMatchUsers(): ChatRoom | null {
    if (this.queue.length < 2) {
      return null
    }

    // Get the first two users in queue
    const user1Queue = this.queue.shift()!
    const user2Queue = this.queue.shift()!
    
    const user1 = user1Queue.user
    const user2 = user2Queue.user

    // Remove from user queues tracking
    this.userQueues.delete(user1.id)
    this.userQueues.delete(user2.id)

    // Create chat room
    const room = this.createRoom([user1, user2])
    
    logger.info(`Matched users ${user1.username} and ${user2.username} in room ${room.id}`)
    
    // Update queue positions for remaining users
    this.queue.forEach((queueUser, index) => {
      queueUser.queuePosition = index + 1
      this.userQueues.set(queueUser.user.id, index + 1)
    })
    
    return room
  }

  /**
   * Create a new chat room
   */
  private createRoom(users: User[]): ChatRoom {
    const roomId = uuidv4()
    
    const room: ChatRoom = {
      id: roomId,
      users: [...users],
      messages: [],
      createdAt: new Date(),
      isActive: true
    }

    this.rooms.set(roomId, room)
    
    // Track user-room relationships
    users.forEach(user => {
      this.userRooms.set(user.id, roomId)
    })

    // Add system message
    const systemMessage: Message = {
      id: uuidv4(),
      content: `Chat started between ${users.map(u => u.username).join(' and ')}`,
      senderId: 'system',
      senderUsername: 'System',
      timestamp: new Date(),
      type: MessageType.SYSTEM
    }
    
    room.messages.push(systemMessage)
    
    return room
  }

  /**
   * Add message to room
   */
  addMessage(roomId: string, senderId: string, content: string): Message | null {
    const room = this.rooms.get(roomId)
    if (!room || !room.isActive) {
      return null
    }

    const sender = room.users.find(u => u.id === senderId)
    if (!sender) {
      return null
    }

    const message: Message = {
      id: uuidv4(),
      content,
      senderId,
      senderUsername: sender.username,
      timestamp: new Date(),
      type: MessageType.TEXT
    }

    room.messages.push(message)
    
    // Update sender's last activity
    sender.lastActivity = new Date()
    this.users.set(senderId, sender)
    
    logger.debug(`Message added to room ${roomId} by ${sender.username}`)
    
    return message
  }

  /**
   * Get user's current room
   */
  getUserRoom(userId: string): ChatRoom | null {
    const roomId = this.userRooms.get(userId)
    if (!roomId) {
      return null
    }
    
    return this.rooms.get(roomId) || null
  }

  /**
   * Get user's queue position
   */
  getUserQueuePosition(userId: string): number | null {
    return this.userQueues.get(userId) || null
  }

  /**
   * Remove user from their current room
   */
  removeUserFromRoom(userId: string): void {
    const roomId = this.userRooms.get(userId)
    if (!roomId) {
      return
    }

    const room = this.rooms.get(roomId)
    if (!room) {
      return
    }

    // Remove user from room
    room.users = room.users.filter(u => u.id !== userId)
    this.userRooms.delete(userId)
    
    // If room is empty, mark as inactive
    if (room.users.length === 0) {
      room.isActive = false
      logger.info(`Room ${roomId} marked as inactive - no users remaining`)
    } else {
      // Add system message about user leaving
      const user = this.users.get(userId)
      if (user) {
        const systemMessage: Message = {
          id: uuidv4(),
          content: `${user.username} has left the chat`,
          senderId: 'system',
          senderUsername: 'System',
          timestamp: new Date(),
          type: MessageType.SYSTEM
        }
        room.messages.push(systemMessage)
      }
      
      logger.info(`User ${userId} removed from room ${roomId}`)
    }
  }

  /**
   * Clean up user data completely
   */
  removeUser(userId: string): void {
    this.removeFromQueue(userId)
    this.removeUserFromRoom(userId)
    this.users.delete(userId)
    
    logger.info(`User ${userId} completely removed from system`)
  }

  /**
   * Get room partner for a user
   */
  getRoomPartner(userId: string): UserWithoutSocket | null {
    const room = this.getUserRoom(userId)
    if (!room) {
      return null
    }

    const partner = room.users.find(u => u.id !== userId)
    if (!partner) {
      return null
    }

    // Return partner without socket ID for security
    const { socketId, ...partnerWithoutSocket } = partner
    return partnerWithoutSocket
  }

  /**
   * Get chat statistics
   */
  getStats(): ChatStats {
    const activeRooms = Array.from(this.rooms.values()).filter(room => room.isActive)
    const totalMessages = activeRooms.reduce((sum, room) => sum + room.messages.length, 0)
    
    // Calculate average wait time
    const now = new Date()
    const averageWaitTime = this.queue.length > 0 
      ? this.queue.reduce((sum, q) => sum + (now.getTime() - q.waitingSince.getTime()), 0) / this.queue.length / 1000
      : 0

    return {
      activeUsers: this.users.size,
      activeRooms: activeRooms.length,
      queueLength: this.queue.length,
      totalMessagesExchanged: totalMessages,
      averageWaitTime: Math.round(averageWaitTime)
    }
  }

  /**
   * Clean up inactive rooms (called periodically)
   */
  cleanupInactiveRooms(): void {
    const now = new Date()
    const maxInactiveTime = 5 * 60 * 1000 // 5 minutes
    
    for (const [roomId, room] of this.rooms) {
      if (!room.isActive || room.users.length === 0) {
        const inactiveTime = now.getTime() - room.createdAt.getTime()
        if (inactiveTime > maxInactiveTime) {
          this.rooms.delete(roomId)
          logger.info(`Cleaned up inactive room ${roomId}`)
        }
      }
    }
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | null {
    return this.users.get(userId) || null
  }

  /**
   * Update user's last activity
   */
  updateUserActivity(userId: string): void {
    const user = this.users.get(userId)
    if (user) {
      user.lastActivity = new Date()
      this.users.set(userId, user)
    }
  }
}