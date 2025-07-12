# WebRTC Audio Asymmetry Issue - Root Cause Analysis

## Executive Summary
Speaker B cannot be heard by Speaker A due to incorrect WebRTC offer configuration in `createSpeakerConnection()`.

## Root Cause
In `VoiceBroadcastManager.ts`, line 722:
```typescript
const offer = await connection.createOffer({
  offerToReceiveAudio: false, // We're sending audio, not receiving
  offerToReceiveVideo: false,
});
```

The comment "We're sending audio, not receiving" is incorrect for speaker-to-speaker connections. Speakers need BIDIRECTIONAL audio to hear each other.

## The Audio Flow Breakdown

### Current (Broken) Flow:
1. **Speaker A joins** → Creates offers with `offerToReceiveAudio: false`
2. **Speaker B joins** → Receives `speaker_joined` event
3. **Speaker B creates connection to A** → Also uses `offerToReceiveAudio: false`
4. **Result**: Neither speaker configured to receive audio from the other

### Why It Works for Listeners:
- In `handleBroadcastOffer()` line 960, listeners create answers with `offerToReceiveAudio: true`
- This allows listeners to receive audio from speakers
- But speaker-to-speaker connections both use the "sending only" configuration

## The Exact Breaking Point
The audio flow breaks at the WebRTC offer creation stage:
- **Location**: `VoiceBroadcastManager.ts`, line 722
- **Function**: `createSpeakerConnection()`
- **Issue**: `offerToReceiveAudio: false` prevents receiving audio from peer speakers

## Evidence from Code Analysis

### 1. Speaker Join Event Handling (Working)
Backend properly notifies existing speakers when new speakers join:
```typescript
// voiceRoomSocketService.ts, line 548
speakerSocket.emit('speaker_joined', {
  speakerId: otherSpeaker.user.id,
  speakerUsername: otherSpeaker.user.username
})
```

### 2. Frontend Handler (Working)
Frontend correctly attempts to create speaker-to-speaker connections:
```typescript
// VoiceBroadcastManager.ts, line 201
socket.on('speaker_joined', async (data) => {
  if (this.state.role === 'speaker' && this.state.isActive && data.speakerId !== this.socket.id) {
    await this.createSpeakerConnection(data.speakerId)
  }
})
```

### 3. Offer Creation (BROKEN)
The offer disables audio reception:
```typescript
// Line 722 - This is the bug!
offerToReceiveAudio: false
```

## Why Previous Fix Didn't Work
Changing `offerToReceiveAudio` to `true` in `handleBroadcastAnswer` (line 960) only affected LISTENERS creating answers, not SPEAKERS creating offers.

## The Solution
Change line 722 in `createSpeakerConnection()` to:
```typescript
const offer = await connection.createOffer({
  offerToReceiveAudio: true, // Enable bidirectional audio for speakers
  offerToReceiveVideo: false,
});
```

## Verification Steps
1. The `ontrack` event handler (line 638) is properly configured to handle incoming streams
2. The `addSpeakerStream()` function (line 1222) correctly processes speaker audio
3. Audio mixing is set up for both speakers and listeners
4. The issue is purely in the offer configuration

## Impact
This single-line change will enable bidirectional audio between all speakers, fixing the asymmetric audio issue.