# WebRTC Audio System Fix Implementation Plan

## Overview
This document provides a comprehensive fix for two critical issues:
1. **Audio Asymmetry**: Speakers cannot hear each other (only listeners hear speakers)
2. **Cleanup Failures**: Speakers remain visible after leaving (ghost users)

## Issue 1: Audio Asymmetry Fix

### Problem Analysis
- Current system only establishes unidirectional audio from speakers to listeners
- Speakers need bidirectional connections to hear each other
- The `speaker_joined` event exists but isn't properly utilized

### Root Cause
1. Missing speaker-to-speaker WebRTC connections
2. Audio mixing not configured for speakers to receive other speaker audio
3. Track handlers not properly set up for incoming speaker streams

### Implementation Steps

#### Frontend Changes

**1. Fix VoiceBroadcastManager.ts - Speaker Connection Handling**
```typescript
// In startSpeaking method (line ~305), ensure speaker connections are created:
if (speakerIds && speakerIds.length > 0) {
  console.log(`🎤 [WEBRTC] Creating WebRTC connections to ${speakerIds.length} speakers...`)
  for (const speakerId of speakerIds) {
    if (speakerId !== this.socket.id) {
      console.log(`🎤 [WEBRTC] Creating connection to speaker: ${speakerId}`)
      await this.createSpeakerConnection(speakerId)
    }
  }
}

// In createSpeakerConnection method (line ~501), fix the offer options:
const offer = await connection.createOffer({
  offerToReceiveAudio: true,  // CHANGE: Was false, needs to be true for bidirectional
  offerToReceiveVideo: false,
})
```

**2. Enhance Speaker-to-Speaker Audio Handling**
```typescript
// In addSpeakerStream method (line ~1222), ensure speakers process other speaker audio:
// Remove the early return for speakers - they need to hear other speakers
if (speakerId === this.socket.id) {
  console.log(`🔇 [AUDIO] Skipping own stream ${speakerId} to prevent self-hearing`)
  this.emitStateChange()
  return
}

// Continue with audio mixing for ALL remote streams (both from speakers and listeners perspective)
```

**3. Fix BroadcastingService.ts - Proper Speaker Management**
```typescript
// In handlePromotion method (line ~406), ensure existing speakers are included:
const speakerIds = this.roomState.speakers
  .map(s => s.id)
  .filter(id => id !== this.socket.id);

await this.broadcastManager.startSpeaking(listenerIds, speakerIds);
```

#### Backend Changes

**1. Enhance voiceRoomSocketService.ts - Speaker Notifications**
```typescript
// In broadcastRoomState function (line ~517), improve speaker notifications:
// After a new speaker joins, notify ALL speakers about each other
roomState.speakers.forEach(speaker => {
  const speakerSocket = io.sockets.sockets.get(speaker.user.socketId)
  if (speakerSocket) {
    // Notify about all OTHER speakers
    roomState.speakers.forEach(otherSpeaker => {
      if (otherSpeaker.user.id !== speaker.user.id) {
        speakerSocket.emit('speaker_joined', {
          speakerId: otherSpeaker.user.id,
          speakerUsername: otherSpeaker.user.username
        })
      }
    })
  }
})
```

## Issue 2: Cleanup Failures Fix

### Problem Analysis
- Users who disconnect abruptly remain visible as "ghost" speakers
- Heartbeat timeout is too long (120 seconds)
- Disconnect events not properly propagated

### Root Cause
1. Long heartbeat timeout allows stale connections to persist
2. Missing immediate cleanup on socket disconnect
3. No redundant cleanup mechanisms
4. Browser refresh/close not handled properly

### Implementation Steps

#### Frontend Changes

**1. Add Cleanup on Window Events**
```typescript
// In VoiceBroadcastManager constructor, add:
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    this.cleanup()
  })
  
  window.addEventListener('unload', () => {
    this.cleanup()
  })
}

// Enhance cleanup method (line ~2454):
async cleanup(): Promise<void> {
  console.log('🔊 [CLEANUP] Cleaning up VoiceBroadcastManager')
  
  // Notify server immediately about leaving
  this.socket.emit('leave_voice_room')
  
  // Stop all peer connections
  this.state.remotePeers.forEach((peer, peerId) => {
    this.socket.emit('peer_disconnected', peerId)
    peer.connection.close()
  })
  
  // Continue with existing cleanup...
}
```

**2. Enhance Connection Health Monitoring**
```typescript
// In startConnectionHealthMonitoring (line ~1926), make more aggressive:
private startConnectionHealthMonitoring(): void {
  // Check every 5 seconds instead of 15
  setInterval(() => {
    this.checkConnectionHealth()
  }, 5000)
  
  // Check for stuck connections every 5 seconds instead of 10
  setInterval(() => {
    this.checkStuckConnections()
  }, 5000)
}

// Reduce stuck connection timeout from 20s to 10s
if (Date.now() - peer.stuckSince > 10000) { // Was 20000
  console.warn(`🔄 [WEBRTC] Connection stuck for 10s, restarting`)
  this.attemptConnectionRecovery(peerId)
}
```

#### Backend Changes

**1. Reduce Heartbeat Timeout in voiceRoomSocketService.ts**
```typescript
// Line ~459, change cleanup interval:
setInterval(() => {
  try {
    // Reduce from 120 seconds to 30 seconds
    const removedUsers = voiceRoomManager.cleanupInactiveUsers(30 * 1000)
    if (removedUsers.length > 0) {
      logger.info(`Voice room service: Cleaned up ${removedUsers.length} inactive users`)
      broadcastRoomState(io, voiceRoomManager)
      
      // Emit peer_disconnected for each removed user
      removedUsers.forEach(user => {
        io.to('voice_room').emit('peer_disconnected', user.id)
      })
    }
  } catch (error) {
    logger.error(`Error during voice room cleanup: ${error}`)
  }
}, 5 * 1000) // Run every 5 seconds instead of 15
```

**2. Enhance Disconnect Handling**
```typescript
// In disconnect handler (line ~443), add immediate cleanup:
socket.on('disconnect', (reason) => {
  try {
    const user = socket.data.user
    if (user) {
      // Immediately notify all users about disconnection
      io.to('voice_room').emit('peer_disconnected', user.id)
      
      // Handle cleanup
      handleUserLeavingVoiceRoom(socket, user, voiceRoomManager, io)
      logger.info(`User ${user.username} (${user.id}) disconnected: ${reason}`)
    }
  } catch (error) {
    logger.error(`Error handling disconnect: ${error}`)
  }
})
```

**3. Add Periodic State Verification**
```typescript
// Add new interval for state verification:
setInterval(() => {
  try {
    // Verify all connected sockets match room state
    const connectedSocketIds = Array.from(io.sockets.sockets.keys())
    const roomUsers = [...voiceRoomManager.getSpeakers(), ...voiceRoomManager.getListenerQueue()]
    
    roomUsers.forEach(userStatus => {
      if (!connectedSocketIds.includes(userStatus.user.socketId)) {
        logger.warn(`Found orphaned user ${userStatus.user.id}, removing`)
        voiceRoomManager.removeUser(userStatus.user.id)
      }
    })
    
    broadcastRoomState(io, voiceRoomManager)
  } catch (error) {
    logger.error(`Error during state verification: ${error}`)
  }
}, 10 * 1000) // Every 10 seconds
```

## Testing Plan

### Audio Asymmetry Testing
1. Join with 3 users (A, B, C)
2. Make A and B speakers
3. Verify A can hear B and B can hear A
4. Add C as third speaker
5. Verify all speakers hear each other

### Cleanup Testing
1. Join with multiple users as speakers
2. Test various disconnect scenarios:
   - Browser refresh
   - Browser close
   - Network disconnect
   - Process kill
3. Verify user is removed within 30 seconds
4. Verify no ghost users remain

## Deployment Steps
1. Test all changes locally
2. Deploy backend changes first
3. Deploy frontend changes
4. Monitor logs for proper cleanup behavior
5. Verify audio connections in production

## Rollback Plan
If issues occur:
1. Revert frontend deployment
2. Revert backend deployment
3. Investigate logs for root cause
4. Apply hotfix if needed