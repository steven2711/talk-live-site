# Actual Fix Implementation for Voice Room Issues

## Issue 1: Audio Asymmetry - The Real Problem

The code already has `offerToReceiveAudio: true`, but the **actual problem** is that when `speaker_promoted` event is received, the new speaker gets the list of listeners but **NOT the list of existing speakers**.

### The Problem

In `voiceRoomSocketService.ts`, when the server emits `speaker_promoted`:
```typescript
// This only sends listenerIds, NOT other speaker IDs!
promotedSocket.emit('speaker_promoted', {
  newSpeakerId: promotedUser.user.id,
  listenerIds: listeners.map(l => l.user.id)  // Missing speaker IDs!
})
```

### The Fix

**File**: `backend/src/services/voiceRoomSocketService.ts`
**Location**: Around line 497 (in the promotion handling)

Change the `speaker_promoted` event to include existing speakers:

```typescript
// Get current speakers (excluding the promoted user)
const speakers = voiceRoomManager.getSpeakers()
const otherSpeakerIds = speakers
  .filter(s => s.user.id !== promotedUser.user.id)
  .map(s => s.user.id)

promotedSocket.emit('speaker_promoted', {
  newSpeakerId: promotedUser.user.id,
  listenerIds: listeners.map(l => l.user.id),
  speakerIds: otherSpeakerIds  // ADD THIS!
})
```

**File**: `frontend/src/services/BroadcastingService.ts`
**Location**: Line 167

Update the event handler to accept speaker IDs:

```typescript
this.socket.on('speaker_promoted', async (data: { 
  newSpeakerId: string, 
  listenerIds: string[],
  speakerIds?: string[]  // ADD THIS
}) => {
  if (data.newSpeakerId === this.socket.id) {
    await this.handlePromotion(data.listenerIds, data.speakerIds || []);
  } else {
    this.handlePeerPromotion(data.newSpeakerId);
  }
});
```

And update handlePromotion to accept speaker IDs:

```typescript
private async handlePromotion(listenerIds: string[], existingSpeakerIds?: string[]): Promise<void> {
  try {
    // Use provided speaker IDs or get from room state
    const speakerIds = existingSpeakerIds || this.roomState.speakers
      .map(s => s.id)
      .filter(id => id !== this.socket.id);
    
    await this.transitionManager.handleSpeakerPromotion(this.socket.id!, listenerIds);
    await this.broadcastManager.startSpeaking(listenerIds, speakerIds);
    // ... rest of the code
  }
}
```

## Issue 2: Cleanup Failure - Missing Broadcast

The beacon disconnect endpoint removes users but doesn't notify other clients!

### The Fix

**File**: `backend/src/server.ts`
**Location**: After line 248

Make the Socket.io instance accessible to the Express routes:

```typescript
// At the top of server.ts, after creating io:
export const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Then in the disconnect endpoint (line 240), after removing the user:
const result = voiceRoomManager.removeUser(userId)

// ADD THIS: Broadcast the update to all connected sockets
io.to('voice_room').emit('peer_disconnected', userId)

// Recreate and broadcast the room state
const roomState = {
  roomId: voiceRoomManager.getRoomState().id,
  speakers: voiceRoomManager.getSpeakers(),
  listeners: voiceRoomManager.getListenerQueue(),
  totalUsers: voiceRoomManager.getTotalUserCount(),
  maxSpeakers: voiceRoomManager.getRoomState().maxSpeakers,
  isRecording: false,
  roomStartTime: voiceRoomManager.getRoomState().createdAt
}

io.to('voice_room').emit('voice_room_updated', roomState)

// If users were promoted, notify them
if (result.promotedUsers && result.promotedUsers.length > 0) {
  result.promotedUsers.forEach(promotedUser => {
    const promotedSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.data?.user?.id === promotedUser.user.id)
    
    if (promotedSocket) {
      const listeners = voiceRoomManager.getListenerQueue()
      const speakers = voiceRoomManager.getSpeakers()
      const otherSpeakerIds = speakers
        .filter(s => s.user.id !== promotedUser.user.id)
        .map(s => s.user.id)
      
      promotedSocket.emit('speaker_promoted', {
        newSpeakerId: promotedUser.user.id,
        listenerIds: listeners.map(l => l.user.id),
        speakerIds: otherSpeakerIds
      })
    }
  })
}
```

## Testing the Fixes

### Test Audio Fix:
1. User A joins and becomes speaker
2. User B joins and becomes speaker
3. Both should hear each other immediately
4. Check browser console for "Creating connection to speaker" logs

### Test Cleanup Fix:
1. User A joins as speaker
2. User B joins as speaker
3. User A closes browser tab
4. User B should see User A disappear immediately (not after 30+ seconds)

## Summary

1. **Audio Issue**: New speakers aren't told about existing speakers when promoted
2. **Cleanup Issue**: Beacon disconnect doesn't broadcast updates to other users

Both fixes are simple and targeted, addressing the exact root causes without major architectural changes.