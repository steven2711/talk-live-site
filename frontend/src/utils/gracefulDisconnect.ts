/**
 * Graceful Disconnect Utility
 * 
 * Provides reliable disconnect signaling with retry logic and fallback mechanisms
 * for better user cleanup when leaving voice rooms.
 */

export interface DisconnectOptions {
  userId: string;
  reason?: string;
  maxRetries?: number;
  retryDelay?: number;
  useBeacon?: boolean;
}

export interface DisconnectResult {
  success: boolean;
  method: 'socket' | 'beacon' | 'none';
  retries: number;
  error?: string;
}

class GracefulDisconnectManager {
  private disconnectQueue: DisconnectOptions[] = [];
  private isProcessing = false;
  private defaultOptions: Partial<DisconnectOptions> = {
    maxRetries: 3,
    retryDelay: 1000,
    useBeacon: true
  };

  /**
   * Attempt graceful disconnect with multiple strategies
   */
  async disconnect(
    socket: any,
    options: DisconnectOptions
  ): Promise<DisconnectResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    console.log('Attempting graceful disconnect for user:', opts.userId);
    
    // Add to queue if currently processing
    if (this.isProcessing) {
      this.disconnectQueue.push(opts);
      return { success: false, method: 'none', retries: 0, error: 'Queued for processing' };
    }

    this.isProcessing = true;

    try {
      // Strategy 1: Socket.IO disconnect
      const socketResult = await this.attemptSocketDisconnect(socket, opts);
      if (socketResult.success) {
        return socketResult;
      }

      // Strategy 2: Beacon API for reliable signaling
      if (opts.useBeacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        const beaconResult = await this.attemptBeaconDisconnect(opts);
        if (beaconResult.success) {
          return beaconResult;
        }
      }

      // Strategy 3: Fetch API as fallback
      const fetchResult = await this.attemptFetchDisconnect(opts);
      return fetchResult;

    } finally {
      this.isProcessing = false;
      await this.processQueue();
    }
  }

  /**
   * Attempt disconnect via Socket.IO
   */
  private async attemptSocketDisconnect(
    socket: any,
    options: DisconnectOptions
  ): Promise<DisconnectResult> {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        // Emit disconnect event
        socket.emit('leave_voice_room');
        
        // Wait for acknowledgment or timeout
        const ackReceived = await this.waitForAcknowledgment(socket, 5000);
        
        if (ackReceived) {
          console.log(`Socket disconnect successful for user ${options.userId}`);
          return { success: true, method: 'socket', retries: retry };
        }
        
        if (retry < maxRetries - 1) {
          console.log(`Socket disconnect retry ${retry + 1} for user ${options.userId}`);
          await this.delay(retryDelay);
        }
      } catch (error) {
        console.error(`Socket disconnect error (retry ${retry + 1}):`, error);
        
        if (retry < maxRetries - 1) {
          await this.delay(retryDelay);
        }
      }
    }

    return { 
      success: false, 
      method: 'socket', 
      retries: maxRetries, 
      error: 'Socket disconnect failed after retries' 
    };
  }

  /**
   * Attempt disconnect via Beacon API
   */
  private async attemptBeaconDisconnect(
    options: DisconnectOptions
  ): Promise<DisconnectResult> {
    try {
      const disconnectData = JSON.stringify({
        userId: options.userId,
        action: 'leave_voice_room',
        reason: options.reason || 'page_unload',
        timestamp: Date.now()
      });

      const success = navigator.sendBeacon('/api/voice-room/disconnect', disconnectData);
      
      if (success) {
        console.log(`Beacon disconnect successful for user ${options.userId}`);
        return { success: true, method: 'beacon', retries: 0 };
      }
      
      return { 
        success: false, 
        method: 'beacon', 
        retries: 0, 
        error: 'Beacon send failed' 
      };
    } catch (error) {
      console.error('Beacon disconnect error:', error);
      return { 
        success: false, 
        method: 'beacon', 
        retries: 0, 
        error: String(error) 
      };
    }
  }

  /**
   * Attempt disconnect via Fetch API
   */
  private async attemptFetchDisconnect(
    options: DisconnectOptions
  ): Promise<DisconnectResult> {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await fetch('/api/voice-room/disconnect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: options.userId,
            action: 'leave_voice_room',
            reason: options.reason || 'manual_disconnect',
            timestamp: Date.now()
          })
        });

        if (response.ok) {
          console.log(`Fetch disconnect successful for user ${options.userId}`);
          return { success: true, method: 'socket', retries: retry };
        }

        if (retry < maxRetries - 1) {
          console.log(`Fetch disconnect retry ${retry + 1} for user ${options.userId}`);
          await this.delay(retryDelay);
        }
      } catch (error) {
        console.error(`Fetch disconnect error (retry ${retry + 1}):`, error);
        
        if (retry < maxRetries - 1) {
          await this.delay(retryDelay);
        }
      }
    }

    return { 
      success: false, 
      method: 'socket', 
      retries: maxRetries, 
      error: 'Fetch disconnect failed after retries' 
    };
  }

  /**
   * Wait for socket acknowledgment
   */
  private async waitForAcknowledgment(
    socket: any, 
    timeout: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.off('disconnect_ack');
        resolve(false);
      }, timeout);

      socket.once('disconnect_ack', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /**
   * Process queued disconnect operations
   */
  private async processQueue(): Promise<void> {
    if (this.disconnectQueue.length === 0) return;

    const nextDisconnect = this.disconnectQueue.shift();
    if (nextDisconnect) {
      console.log('Processing queued disconnect for user:', nextDisconnect.userId);
      // Process the next disconnect (simplified version)
      try {
        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          await this.attemptBeaconDisconnect(nextDisconnect);
        }
      } catch (error) {
        console.error('Error processing queued disconnect:', error);
      }
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Emergency disconnect for page unload
   */
  emergencyDisconnect(userId: string): void {
    // Synchronous disconnect attempt for page unload
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const disconnectData = JSON.stringify({
        userId,
        action: 'leave_voice_room',
        reason: 'emergency_disconnect',
        timestamp: Date.now()
      });

      navigator.sendBeacon('/api/voice-room/disconnect', disconnectData);
      console.log(`Emergency disconnect sent for user ${userId}`);
    }
  }

  /**
   * Clear disconnect queue
   */
  clearQueue(): void {
    this.disconnectQueue = [];
  }
}

// Export singleton instance
export const gracefulDisconnectManager = new GracefulDisconnectManager();

/**
 * Convenience function for quick disconnect
 */
export const quickDisconnect = async (
  socket: any,
  userId: string,
  reason?: string
): Promise<DisconnectResult> => {
  return gracefulDisconnectManager.disconnect(socket, { userId, reason });
};

/**
 * Emergency disconnect for page unload scenarios
 */
export const emergencyDisconnect = (userId: string): void => {
  gracefulDisconnectManager.emergencyDisconnect(userId);
};