import { logger } from '../utils/logger.js';
import { VoiceRoomUser, VoiceRoomRole, GlobalVoiceRoom, VoiceRoomState, User, VoiceRoomBroadcastMessage } from '../types/chat.js';

export class VoiceRoomManager {
  private globalRoom: GlobalVoiceRoom;
  private userAudioLevels: Map<string, number> = new Map();
  private lastActivityUpdate: Map<string, Date> = new Map();

  constructor() {
    this.globalRoom = {
      id: 'global-voice-room',
      name: 'Global Voice Room',
      isActive: true,
      speakers: [],
      listeners: [],
      queue: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      maxSpeakers: 2
    };

    logger.info('Voice room manager initialized');
  }

  /**
   * Add a user to the voice room
   */
  addUser(user: User): VoiceRoomState {
    const now = new Date();
    
    // Check if user is already in the room
    if (this.findUser(user.id)) {
      logger.warn(`User ${user.id} is already in the voice room`);
      return this.getRoomState();
    }

    const voiceRoomUser: VoiceRoomUser = {
      user,
      role: VoiceRoomRole.LISTENER,
      joinedAt: now,
      isMuted: false,
      audioLevel: 0,
      volume: 1.0
    };

    // If there are available speaker slots, make them a speaker
    if (this.globalRoom.speakers.length < this.globalRoom.maxSpeakers) {
      voiceRoomUser.role = VoiceRoomRole.SPEAKER;
      this.globalRoom.speakers.push(voiceRoomUser);
      logger.info(`User ${user.username} joined as speaker`);
    } else {
      // Add to listeners and set queue position
      voiceRoomUser.queuePosition = this.getNextQueuePosition();
      this.globalRoom.listeners.push(voiceRoomUser);
      this.updateQueuePositions();
      logger.info(`User ${user.username} joined as listener at position ${voiceRoomUser.queuePosition}`);
    }

    this.globalRoom.lastActivity = now;
    this.lastActivityUpdate.set(user.id, now);

    return this.getRoomState();
  }

  /**
   * Remove a user from the voice room
   */
  removeUser(userId: string): VoiceRoomState {
    const user = this.findUser(userId);
    if (!user) {
      logger.warn(`User ${userId} not found in voice room`);
      return this.getRoomState();
    }

    const wasRemoved = this.removeUserFromArrays(userId);
    if (wasRemoved) {
      this.userAudioLevels.delete(userId);
      this.lastActivityUpdate.delete(userId);
      
      // If a speaker left, promote the next listener
      if (user.role === VoiceRoomRole.SPEAKER) {
        this.promoteNextListener();
      } else {
        // Update queue positions for remaining listeners
        this.updateQueuePositions();
      }

      this.globalRoom.lastActivity = new Date();
      logger.info(`User ${user.user.username} removed from voice room`);
    }

    return this.getRoomState();
  }

  /**
   * Request speaker role for a user
   */
  requestSpeakerRole(userId: string): { success: boolean; message: string } {
    const user = this.findUser(userId);
    if (!user) {
      return { success: false, message: 'User not found in voice room' };
    }

    if (user.role === VoiceRoomRole.SPEAKER) {
      return { success: false, message: 'User is already a speaker' };
    }

    if (this.globalRoom.speakers.length >= this.globalRoom.maxSpeakers) {
      return { success: false, message: 'Speaker slots are full' };
    }

    // Promote user to speaker
    this.removeUserFromArrays(userId);
    user.role = VoiceRoomRole.SPEAKER;
    delete user.queuePosition;
    this.globalRoom.speakers.push(user);
    
    // Update queue positions for remaining listeners
    this.updateQueuePositions();
    
    this.globalRoom.lastActivity = new Date();
    logger.info(`User ${user.user.username} promoted to speaker`);

    return { success: true, message: 'Promoted to speaker' };
  }

  /**
   * Update user's audio level
   */
  updateAudioLevel(userId: string, audioLevel: number): void {
    this.userAudioLevels.set(userId, audioLevel);
    
    const user = this.findUser(userId);
    if (user) {
      user.audioLevel = audioLevel;
      this.lastActivityUpdate.set(userId, new Date());
    }
  }

  /**
   * Set user's volume
   */
  setUserVolume(userId: string, volume: number): boolean {
    const user = this.findUser(userId);
    if (!user) {
      return false;
    }

    user.volume = Math.max(0, Math.min(1, volume));
    this.globalRoom.lastActivity = new Date();
    logger.debug(`User ${user.user.username} volume set to ${user.volume}`);
    
    return true;
  }

  /**
   * Mute/unmute user
   */
  setUserMuted(userId: string, muted: boolean): boolean {
    const user = this.findUser(userId);
    if (!user) {
      return false;
    }

    user.isMuted = muted;
    this.globalRoom.lastActivity = new Date();
    logger.debug(`User ${user.user.username} ${muted ? 'muted' : 'unmuted'}`);
    
    return true;
  }

  /**
   * Get current room state
   */
  getRoomState(): VoiceRoomState {
    return {
      roomId: this.globalRoom.id,
      speakers: [...this.globalRoom.speakers],
      listeners: [...this.globalRoom.listeners],
      totalUsers: this.globalRoom.speakers.length + this.globalRoom.listeners.length,
      maxSpeakers: this.globalRoom.maxSpeakers,
      isRecording: false, // Could be extended later
      roomStartTime: this.globalRoom.createdAt
    };
  }

  /**
   * Get all users in the room
   */
  getAllUsers(): VoiceRoomUser[] {
    return [...this.globalRoom.speakers, ...this.globalRoom.listeners];
  }

  /**
   * Get user role
   */
  getUserRole(userId: string): VoiceRoomRole | null {
    const user = this.findUser(userId);
    return user ? user.role : null;
  }

  /**
   * Get users by role
   */
  getUsersByRole(role: VoiceRoomRole): VoiceRoomUser[] {
    if (role === VoiceRoomRole.SPEAKER) {
      return [...this.globalRoom.speakers];
    } else if (role === VoiceRoomRole.LISTENER) {
      return [...this.globalRoom.listeners];
    }
    return [];
  }

  /**
   * Get speaker IDs for broadcasting
   */
  getSpeakerIds(): string[] {
    return this.globalRoom.speakers.map(speaker => speaker.user.id);
  }

  /**
   * Get listener IDs for broadcasting
   */
  getListenerIds(): string[] {
    return this.globalRoom.listeners.map(listener => listener.user.id);
  }

  /**
   * Handle WebRTC signaling
   */
  handleBroadcastSignal(message: VoiceRoomBroadcastMessage): void {
    // Log the signaling message
    logger.debug(`Broadcast signal: ${message.type} from ${message.fromUserId} to ${message.toUserId || 'all'}`);
    
    // In a real implementation, this would route the message to the appropriate users
    // For now, we just log it
  }

  /**
   * Update user activity timestamp
   */
  updateUserActivity(userId: string): void {
    const now = new Date();
    this.lastActivityUpdate.set(userId, now);
    
    // Find and update the user in the global room
    const user = this.globalRoom.speakers.find(s => s.user.id === userId) || 
                 this.globalRoom.listeners.find(l => l.user.id === userId);
    
    if (user) {
      user.user.lastActivity = now;
      logger.debug(`Updated activity for user ${userId}`);
    }
  }

  /**
   * Clean up inactive users with enhanced heartbeat failure detection
   */
  cleanupInactiveUsers(): number {
    const now = new Date();
    const inactivityThreshold = 2 * 60 * 1000; // Reduced to 2 minutes for faster cleanup
    const warningThreshold = 90 * 1000; // Warn after 90 seconds
    let removedCount = 0;
    let warningCount = 0;

    const allUsers = this.getAllUsers();
    
    for (const user of allUsers) {
      const lastActivity = this.lastActivityUpdate.get(user.user.id);
      if (lastActivity) {
        const inactivityDuration = now.getTime() - lastActivity.getTime();
        
        if (inactivityDuration > inactivityThreshold) {
          // Remove user after 2 minutes of inactivity
          this.removeUser(user.user.id);
          removedCount++;
          logger.info(`Removed inactive user: ${user.user.username} (inactive for ${Math.round(inactivityDuration / 1000)}s)`);
        } else if (inactivityDuration > warningThreshold) {
          // Log warning for users inactive for more than 90 seconds
          warningCount++;
          logger.warn(`User ${user.user.username} inactive for ${Math.round(inactivityDuration / 1000)}s - will be removed soon`);
        }
      } else {
        // No activity record - remove immediately
        this.removeUser(user.user.id);
        removedCount++;
        logger.warn(`Removed user with no activity record: ${user.user.username}`);
      }
    }

    if (removedCount > 0) {
      logger.info(`Cleaned up ${removedCount} inactive users from voice room`);
    }
    
    if (warningCount > 0) {
      logger.debug(`${warningCount} users approaching inactivity threshold`);
    }

    return removedCount;
  }

  /**
   * Get room statistics
   */
  getStats(): {
    totalUsers: number;
    speakers: number;
    listeners: number;
    averageAudioLevel: number;
    roomUptime: number;
  } {
    const totalUsers = this.globalRoom.speakers.length + this.globalRoom.listeners.length;
    const audioLevels = Array.from(this.userAudioLevels.values());
    const averageAudioLevel = audioLevels.length > 0 
      ? audioLevels.reduce((sum, level) => sum + level, 0) / audioLevels.length 
      : 0;
    
    const roomUptime = Date.now() - this.globalRoom.createdAt.getTime();

    return {
      totalUsers,
      speakers: this.globalRoom.speakers.length,
      listeners: this.globalRoom.listeners.length,
      averageAudioLevel,
      roomUptime
    };
  }

  private findUser(userId: string): VoiceRoomUser | undefined {
    return this.globalRoom.speakers.find(u => u.user.id === userId) ||
           this.globalRoom.listeners.find(u => u.user.id === userId);
  }

  private removeUserFromArrays(userId: string): boolean {
    const speakerIndex = this.globalRoom.speakers.findIndex(u => u.user.id === userId);
    if (speakerIndex !== -1) {
      this.globalRoom.speakers.splice(speakerIndex, 1);
      return true;
    }

    const listenerIndex = this.globalRoom.listeners.findIndex(u => u.user.id === userId);
    if (listenerIndex !== -1) {
      this.globalRoom.listeners.splice(listenerIndex, 1);
      return true;
    }

    return false;
  }

  private promoteNextListener(): void {
    // Find the listener with queue position 1
    const nextSpeaker = this.globalRoom.listeners.find(listener => listener.queuePosition === 1);
    
    if (nextSpeaker && this.globalRoom.speakers.length < this.globalRoom.maxSpeakers) {
      // Remove from listeners
      const listenerIndex = this.globalRoom.listeners.indexOf(nextSpeaker);
      this.globalRoom.listeners.splice(listenerIndex, 1);
      
      // Add to speakers
      nextSpeaker.role = VoiceRoomRole.SPEAKER;
      delete nextSpeaker.queuePosition;
      this.globalRoom.speakers.push(nextSpeaker);
      
      // Update remaining queue positions
      this.updateQueuePositions();
      
      logger.info(`User ${nextSpeaker.user.username} promoted from queue to speaker`);
    }
  }

  private updateQueuePositions(): void {
    // Sort listeners by join time and assign queue positions
    this.globalRoom.listeners.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    
    this.globalRoom.listeners.forEach((listener, index) => {
      listener.queuePosition = index + 1;
    });
  }

  private getNextQueuePosition(): number {
    return this.globalRoom.listeners.length + 1;
  }
}