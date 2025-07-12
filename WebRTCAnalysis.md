# WebRTC One-Way Audio Analysis

## Issue Summary
Speaker A can speak to B (B hears A), but B cannot speak to A (A doesn't hear B).

## Root Cause Analysis

### 1. **Critical Finding: Asymmetric Connection Setup**

The root cause is in the `speaker_joined` event handling in `VoiceBroadcastManager.ts` (lines 201-229):

```typescript
// When Speaker B joins, Speaker A receives this event:
socket.on('speaker_joined', async (data: { speakerId: string; speakerUsername: string }) => {
  // Speaker A creates a connection TO Speaker B
  if (this.state.role === 'speaker' && this.state.isActive && data.speakerId !== this.socket.id) {
    await this.createSpeakerConnection(data.speakerId)
  }
})
```

**Problem**: When Speaker B joins after Speaker A is already in the room:
- Speaker A creates a connection TO Speaker B (A → B)
- But Speaker B never creates a connection TO Speaker A (B → A)

### 2. **Connection Flow Analysis**

#### Current Flow (Broken):
1. Speaker A joins first
2. Speaker B joins second
3. Server emits `speaker_joined` event to all speakers (including A)
4. Speaker A receives event and creates connection A → B
5. Speaker B receives its own `speaker_joined` event but ignores it (correct)
6. **MISSING**: Speaker B never creates connection B → A

#### Why It's One-Way:
- In `createSpeakerConnection()` (line 722), the offer is created with:
  ```typescript
  const offer = await connection.createOffer({
    offerToReceiveAudio: false, // We're sending audio, not receiving
    offerToReceiveVideo: false,
  })
  ```
- This creates a unidirectional connection for sending audio only
- The `ontrack` handler is set up but never receives tracks because the remote peer isn't sending

### 3. **Server-Side Broadcasting Issue**

In `voiceRoomSocketService.ts` (lines 541-555), the server broadcasts `speaker_joined` events:

```typescript
// Notify all speakers when a new speaker joins
roomState.speakers.forEach(speaker => {
  const speakerSocket = io.sockets.sockets.get(speaker.user.socketId)
  if (speakerSocket) {
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

**Problem**: This broadcasts ALL speakers to EACH speaker, but it happens AFTER the initial connection. The newly joined speaker (B) doesn't know about existing speakers (A) at the time of joining.

### 4. **Missing Initial Speaker Discovery**

When Speaker B calls `startSpeaking()` (line 253), it receives:
- `listenerIds`: List of listeners to connect to
- `speakerIds`: List of existing speakers (optional parameter)

But the `speakerIds` parameter is not being properly populated when a new speaker joins.

## Solution

The fix requires ensuring bidirectional connections between all speakers:

1. **When a speaker joins**, they need to be informed of ALL existing speakers
2. **Existing speakers** need to be notified of the new speaker
3. **Both sides** must create connections to each other

### Specific Changes Needed:

1. In `startSpeaking()`, ensure the new speaker connects to ALL existing speakers
2. Modify the server to send the list of existing speakers when a new speaker joins
3. Ensure `speaker_joined` event handling creates bidirectional connections
4. Consider using `offerToReceiveAudio: true` in speaker-to-speaker connections

## Verification Points

To confirm this is the issue:
1. Check if Speaker A's `remotePeers` Map contains Speaker B
2. Check if Speaker B's `remotePeers` Map contains Speaker A
3. Check the `ontrack` event logs - it should fire for BOTH speakers
4. Verify ICE connection states for both directions

## Impact

This bug affects all multi-speaker scenarios where speakers join at different times. The first speaker can always be heard by later speakers, but later speakers cannot be heard by earlier ones.