# Migration Plan: 1-on-1 Chat to Global Voice Room

## File-by-File Migration Strategy

### Backend Changes

#### 1. Replace ChatManager → GlobalVoiceRoomManager
**File**: `/backend/src/services/chatManager.ts`
**Action**: Complete replacement

**Current Functions to Replace**:
- `addToQueue()` → `addUserToRoom()`
- `tryMatchUsers()` → `autoPromoteFromQueue()`
- `createRoom()` → Not needed (single global room)
- `getRoomPartner()` → `getSpeakers()`, `getListenerQueue()`
- `removeUserFromRoom()` → Enhanced with speaker slot management

**New Functions to Add**:
- `requestSpeakerSlot()`
- `voluntaryLeaveSpeaker()`
- `promotToSpeaker()`
- `updateQueuePositions()`
- `calculateEstimatedWaitTime()`
- `enforceMaxSpeakingTime()`

#### 2. Update Socket Service
**File**: `/backend/src/services/socketService.ts`
**Action**: Major refactor

**Current Socket Events to Remove**:
- `partner_found`
- `partner_left`
- `message_received` (will be replaced with voice-only)
- `send_message` (will be replaced with voice-only)
- `typing_start/stop` (not needed for voice)

**New Socket Events to Add**:
- `join_global_room`
- `leave_global_room`
- `request_speaker_slot`
- `voluntary_speaker_leave`
- `promoted_to_speaker`
- `demoted_to_listener`
- `speaker_joined`
- `speaker_left`
- `queue_position_updated`
- `room_updated`
- `room_stats`

#### 3. Update Type Definitions
**File**: `/backend/src/types/chat.ts`
**Action**: Add new interfaces, keep existing ones for compatibility

**New Types to Add**:
```typescript
interface GlobalVoiceRoom
interface VoiceRoomStats  
interface SpeakerRequestResult
interface VoiceRoomJoinResult
interface GlobalVoiceRoomState
```

**Updated Types**:
```typescript
// Enhance User interface
interface User {
  // ... existing fields ...
  role: 'speaker' | 'listener'
  queuePosition?: number
  speakerSlotIndex?: 0 | 1
  speakingStartTime?: Date
  totalSpeakingTime: number
}

// Update ConnectionStatus enum
enum ConnectionStatus {
  // ... existing statuses ...
  IN_GLOBAL_ROOM = 'in_global_room'
  WAITING_FOR_SPEAKER_SLOT = 'waiting_for_speaker_slot'
  SPEAKING = 'speaking'
}
```

#### 4. Update Server Entry Point
**File**: `/backend/src/server.ts`
**Action**: Replace ChatManager with GlobalVoiceRoomManager

**Changes**:
```typescript
// Replace
import { ChatManager } from './services/chatManager'
import { setupSocketHandlers } from './services/socketService'

// With
import { GlobalVoiceRoomManager } from './services/globalVoiceRoomManager'
import { setupGlobalRoomHandlers } from './services/globalSocketService'

// Replace initialization
const chatManager = new ChatManager()
setupSocketHandlers(io, chatManager)

// With
const roomManager = new GlobalVoiceRoomManager()
setupGlobalRoomHandlers(io, roomManager)
```

### Frontend Changes

#### 1. Replace Chat Store → Global Room Store
**File**: `/frontend/src/store/chatStore.ts`
**Action**: Complete replacement

**Current State to Remove**:
- `partner` (single partner object)
- `messages` (text chat array)
- `typingIndicators`

**New State to Add**:
- `speakers: [User | null, User | null]`
- `userRole: 'speaker' | 'listener'`
- `speakerSlotIndex: 0 | 1 | null`
- `queuePosition: number | null`
- `roomState: GlobalVoiceRoomState`
- `roomStats: VoiceRoomStats`
- `speakerVolumes: [number, number]`

**Current Actions to Replace**:
- `connect()` → `joinGlobalRoom()`
- `sendMessage()` → Not needed (voice only)
- `setTyping()` → Not needed (voice only)

**New Actions to Add**:
- `requestSpeakerSlot()`
- `leaveSpeakerQueue()`
- `voluntaryLeaveSpeaker()`
- `setSpeakerVolume()`
- `toggleMute()`

#### 2. Update Type Definitions
**File**: `/frontend/src/types/chat.ts`
**Action**: Add global room types, keep existing for compatibility

**New Types to Add**:
```typescript
interface GlobalVoiceRoomState
interface VoiceRoomStats
interface SpeakerSlotProps
interface ListenerQueueProps
interface RoomStatsProps
```

#### 3. Replace App Component Logic
**File**: `/frontend/src/App.tsx`
**Action**: Update routing logic

**Changes**:
```typescript
// Replace store import
import { useChatStore } from './store/chatStore'
// With
import { useGlobalRoomStore } from './store/globalRoomStore'

// Update connection status checks
// Replace partner-based logic with room-based logic
```

#### 4. Component Replacements

**Replace ChatInterface** (`/frontend/src/components/ChatInterface.tsx`):
- Create new `GlobalVoiceRoomInterface.tsx`
- Replace message list with speaker slots display
- Replace message input with speaker controls
- Add listener queue display
- Add room statistics panel

**Replace WaitingScreen** (`/frontend/src/components/WaitingScreen.tsx`):
- Update to show "Joining global room..." instead of "Finding partner..."
- Show room statistics while loading
- Remove queue position for partner matching

**Update VoiceCallButton** (`/frontend/src/components/VoiceCallButton.tsx`):
- Replace 1-on-1 call logic with speaker request logic
- Update button states for global room context
- Add queue position display

**Remove Obsolete Components**:
- `MessageList.tsx` (voice-only system)
- `IncomingCallModal.tsx` (no incoming calls in global room)
- `ActiveCallInterface.tsx` (replaced with speaker interface)

**New Components to Create**:
- `SpeakerSlots.tsx` - Display active speakers
- `ListenerQueue.tsx` - Show queue and position
- `RoomStats.tsx` - Display room statistics
- `SpeakerControls.tsx` - Mute, volume, leave speaker controls

## Migration Steps

### Phase 1: Backend Foundation (Day 1)
1. Create `GlobalVoiceRoomManager` class
2. Create new socket service with global room events
3. Update type definitions
4. Test basic room joining/leaving

### Phase 2: Backend Integration (Day 2)
1. Replace ChatManager usage in server.ts
2. Implement speaker slot management logic
3. Add queue management and auto-promotion
4. Test multi-user scenarios

### Phase 3: Frontend Store (Day 3)
1. Create GlobalRoomStore
2. Implement all socket event handlers
3. Add speaker/listener state management
4. Test frontend-backend communication

### Phase 4: UI Components (Day 4-5)
1. Create new global room components
2. Replace existing components
3. Update App.tsx routing
4. Style and polish UI

### Phase 5: WebRTC Integration (Day 6-7)
1. Implement speaker broadcasting
2. Add listener audio reception
3. Implement audio mixing
4. Add volume and mute controls

### Phase 6: Testing & Polish (Day 8)
1. Load testing with multiple users
2. Audio quality testing
3. Queue fairness testing
4. Bug fixes and optimization

## Data Migration

### No Database Migration Required
- Current system uses in-memory storage
- All existing chat sessions will be terminated
- Users will need to reconnect to new global room

### Session Handling
- All existing WebSocket connections will be disconnected
- Users will be redirected to rejoin the new global room
- No user data preservation needed (anonymous system)

## Deployment Strategy

### Rolling Deployment Not Possible
- This is a breaking change requiring full system replacement
- Recommend maintenance window deployment

### Deployment Steps:
1. **Announce Maintenance**: Notify users 24 hours in advance
2. **Deploy Backend**: Replace server with new global room system
3. **Deploy Frontend**: Update client with new UI
4. **Test Live**: Verify system works with real traffic
5. **Monitor**: Watch for issues in first few hours

### Rollback Plan:
- Keep previous version deployable
- If critical issues occur, can rollback to 1-on-1 system
- Users would lose global room sessions but system would be functional

## Risk Mitigation

### High-Risk Areas:
1. **WebRTC Complexity**: Speaker broadcasting to many listeners
2. **Audio Quality**: Mixed audio from multiple speakers
3. **Queue Management**: Fair access and auto-promotion
4. **Scalability**: Many concurrent listeners

### Mitigation Strategies:
1. **Gradual User Limits**: Start with 20 users, scale up
2. **Audio Fallbacks**: Degrade quality if needed
3. **Queue Monitoring**: Real-time queue health checks
4. **Load Testing**: Simulate high user loads before deployment

## Success Metrics

### Technical Metrics:
- Room supports 50+ concurrent users
- < 500ms speaker slot transition time
- < 100ms audio latency for listeners
- > 99% uptime

### User Experience Metrics:
- Average queue wait time < 5 minutes
- User session duration > 15 minutes
- Queue abandonment rate < 30%
- Audio quality rating > 4/5

This migration transforms the system from a simple 1-on-1 chat to a sophisticated global voice community platform while maintaining the anonymous, registration-free user experience.