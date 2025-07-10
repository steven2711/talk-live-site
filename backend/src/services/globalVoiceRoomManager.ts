import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import type { 
  User, 
  GlobalVoiceRoom, 
  VoiceRoomUser
} from '../types/index.js'
import { VoiceRoomRole } from '../types/index.js'

export interface QueuePromotionResult {
  promotedUsers: VoiceRoomUser[]
  updatedListeners: VoiceRoomUser[]
}

export class GlobalVoiceRoomManager {
  private voiceRoom: GlobalVoiceRoom
  private userVoiceData: Map<string, VoiceRoomUser> = new Map() // userId -> VoiceRoomUser

  constructor(maxSpeakers: number = 2) {
    this.voiceRoom = {
      id: uuidv4(),
      name: 'Global Voice Room',
      speakers: [],
      listeners: [],
      queue: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true,
      maxSpeakers
    }
    
    logger.info(`Global voice room created with ID: ${this.voiceRoom.id}, max speakers: ${maxSpeakers}`)
  }

  /**
   * Add user to the global voice room
   * Auto-assigns speaker role if slot available, otherwise adds to listener queue
   */
  addUser(user: User): { role: VoiceRoomRole; queuePosition?: number } {
    // Check if user is already in the room
    if (this.userVoiceData.has(user.id)) {
      const existingUser = this.userVoiceData.get(user.id)!
      return {
        role: existingUser.role,
        queuePosition: existingUser.queuePosition
      }
    }

    let role: VoiceRoomRole
    let queuePosition: number | undefined

    // Auto-assign speaker role if slot available
    if (this.voiceRoom.speakers.length < this.voiceRoom.maxSpeakers) {
      role = VoiceRoomRole.SPEAKER
      queuePosition = undefined
    } else {
      role = VoiceRoomRole.LISTENER
      queuePosition = this.voiceRoom.listeners.length + 1
    }

    const voiceUser: VoiceRoomUser = {
      user,
      role,
      joinedAt: new Date(),
      queuePosition,
      isMuted: false,
      audioLevel: 0,
      volume: 1
    }

    this.userVoiceData.set(user.id, voiceUser)

    if (role === VoiceRoomRole.SPEAKER) {
      this.voiceRoom.speakers.push(voiceUser)
      logger.info(`User ${user.username} (${user.id}) joined as speaker`)
    } else {
      this.voiceRoom.listeners.push(voiceUser)
      this.updateListenerQueuePositions()
      logger.info(`User ${user.username} (${user.id}) joined as listener at position ${queuePosition}`)
    }

    return { role, queuePosition }
  }

  /**
   * Remove user from the voice room
   * Automatically promotes next speakers if necessary
   */
  removeUser(userId: string): { promotedUsers?: VoiceRoomUser[] } {
    const voiceUser = this.userVoiceData.get(userId)
    if (!voiceUser) {
      return {}
    }

    this.userVoiceData.delete(userId)

    if (voiceUser.role === VoiceRoomRole.SPEAKER) {
      // Remove from speakers
      this.voiceRoom.speakers = this.voiceRoom.speakers.filter(s => s.user.id !== userId)
      logger.info(`Speaker ${voiceUser.user.username} (${userId}) left the room`)
      
      // Promote next speaker(s)
      const promotionResult = this.promoteNextSpeakers()
      return { promotedUsers: promotionResult.promotedUsers }
    } else {
      // Remove from listeners
      this.voiceRoom.listeners = this.voiceRoom.listeners.filter(l => l.user.id !== userId)
      this.updateListenerQueuePositions()
      logger.info(`Listener ${voiceUser.user.username} (${userId}) left the room`)
      return {}
    }
  }

  /**
   * Promote the next listener to speaker if slot available
   */
  promoteNextSpeaker(): VoiceRoomUser | null {
    if (this.voiceRoom.speakers.length >= this.voiceRoom.maxSpeakers || this.voiceRoom.listeners.length === 0) {
      return null
    }

    // Get the first listener in queue (lowest queuePosition)
    const nextListener = this.voiceRoom.listeners.reduce((prev, current) => 
      (prev.queuePosition || 0) < (current.queuePosition || 0) ? prev : current
    )

    // Promote to speaker
    nextListener.role = VoiceRoomRole.SPEAKER
    delete nextListener.queuePosition

    // Move from listeners to speakers
    this.voiceRoom.listeners = this.voiceRoom.listeners.filter(l => l.user.id !== nextListener.user.id)
    this.voiceRoom.speakers.push(nextListener)

    // Update listener queue positions
    this.updateListenerQueuePositions()

    // Update user voice data
    this.userVoiceData.set(nextListener.user.id, nextListener)

    logger.info(`Promoted ${nextListener.user.username} from listener to speaker`)
    return nextListener
  }

  /**
   * Promote multiple speakers to fill available slots
   * Used when multiple speakers leave simultaneously
   */
  private promoteNextSpeakers(): QueuePromotionResult {
    const promotedUsers: VoiceRoomUser[] = []
    
    while (this.voiceRoom.speakers.length < this.voiceRoom.maxSpeakers && this.voiceRoom.listeners.length > 0) {
      const promoted = this.promoteNextSpeaker()
      if (promoted) {
        promotedUsers.push(promoted)
      } else {
        break
      }
    }

    return {
      promotedUsers,
      updatedListeners: [...this.voiceRoom.listeners]
    }
  }

  /**
   * Update queue positions for all listeners
   */
  private updateListenerQueuePositions(): void {
    this.voiceRoom.listeners
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime()) // Sort by join time
      .forEach((listener, index) => {
        listener.queuePosition = index + 1
        this.userVoiceData.set(listener.user.id, listener)
      })
  }

  /**
   * Get current speakers
   */
  getSpeakers(): VoiceRoomUser[] {
    return [...this.voiceRoom.speakers]
  }

  /**
   * Get listener queue ordered by position
   */
  getListenerQueue(): VoiceRoomUser[] {
    return [...this.voiceRoom.listeners].sort((a, b) => 
      (a.queuePosition || 0) - (b.queuePosition || 0)
    )
  }

  /**
   * Get complete room state
   */
  getRoomState(): GlobalVoiceRoom {
    return {
      ...this.voiceRoom,
      speakers: [...this.voiceRoom.speakers],
      listeners: [...this.voiceRoom.listeners]
    }
  }

  /**
   * Get user's current voice status
   */
  getUserVoiceStatus(userId: string): VoiceRoomUser | null {
    return this.userVoiceData.get(userId) || null
  }

  /**
   * Get all users in the voice room
   */
  getAllUsers(): VoiceRoomUser[] {
    return [...this.voiceRoom.speakers, ...this.voiceRoom.listeners]
  }

  /**
   * Get total user count
   */
  getTotalUserCount(): number {
    return this.voiceRoom.speakers.length + this.voiceRoom.listeners.length
  }

  /**
   * Get queue position for a specific user
   */
  getUserQueuePosition(userId: string): number | null {
    const voiceUser = this.userVoiceData.get(userId)
    return voiceUser?.queuePosition || null
  }

  /**
   * Move listener to end of queue (useful for queue management)
   */
  moveListenerToEndOfQueue(userId: string): boolean {
    const voiceUser = this.userVoiceData.get(userId)
    if (!voiceUser || voiceUser.role !== VoiceRoomRole.LISTENER) {
      return false
    }

    // Remove from current position
    this.voiceRoom.listeners = this.voiceRoom.listeners.filter(l => l.user.id !== userId)
    
    // Add to end
    voiceUser.joinedAt = new Date() // Update join time to move to end
    this.voiceRoom.listeners.push(voiceUser)
    
    // Update all positions
    this.updateListenerQueuePositions()
    
    logger.info(`Moved ${voiceUser.user.username} to end of listener queue`)
    return true
  }

  /**
   * Update user activity timestamp
   */
  updateUserActivity(userId: string): void {
    const voiceUser = this.userVoiceData.get(userId);
    if (voiceUser) {
      voiceUser.user.lastActivity = new Date();
      logger.debug(`Updated activity for user ${userId}`);
    }
  }

  /**
   * Clean up inactive users (called periodically)
   */
  cleanupInactiveUsers(maxInactiveTime: number = 300000): string[] { // 5 minutes default
    const now = new Date()
    const removedUserIds: string[] = []

    // Check all users for inactivity
    for (const [userId, voiceUser] of this.userVoiceData) {
      const inactiveTime = now.getTime() - voiceUser.user.lastActivity.getTime()
      
      if (inactiveTime > maxInactiveTime) {
        this.removeUser(userId)
        removedUserIds.push(userId)
        logger.info(`Removed inactive user ${voiceUser.user.username} (${userId}) after ${Math.round(inactiveTime / 1000)}s of inactivity`)
      }
    }

    return removedUserIds
  }

  /**
   * Reset the voice room (for testing or maintenance)
   */
  resetRoom(): void {
    this.voiceRoom.speakers = []
    this.voiceRoom.listeners = []
    this.userVoiceData.clear()
    this.voiceRoom.createdAt = new Date()
    
    logger.info(`Voice room ${this.voiceRoom.id} has been reset`)
  }

  /**
   * Get room statistics
   */
  getRoomStats(): {
    totalUsers: number
    speakerCount: number
    listenerCount: number
    queueLength: number
    averageWaitTime: number
    roomUptime: number
  } {
    const now = new Date()
    const averageWaitTime = this.voiceRoom.listeners.length > 0 
      ? this.voiceRoom.listeners.reduce((sum, listener) => 
          sum + (now.getTime() - listener.joinedAt.getTime()), 0
        ) / this.voiceRoom.listeners.length / 1000
      : 0

    return {
      totalUsers: this.getTotalUserCount(),
      speakerCount: this.voiceRoom.speakers.length,
      listenerCount: this.voiceRoom.listeners.length,
      queueLength: this.voiceRoom.listeners.length,
      averageWaitTime: Math.round(averageWaitTime),
      roomUptime: Math.round((now.getTime() - this.voiceRoom.createdAt.getTime()) / 1000)
    }
  }
}