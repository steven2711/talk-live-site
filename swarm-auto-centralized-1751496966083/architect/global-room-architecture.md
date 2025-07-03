# Global Voice Room Architecture Redesign

## Executive Summary
Complete architectural transformation from 1-on-1 chat system to a global voice room with speaker queue management.

## Current Architecture Analysis

### Current 1-on-1 System:
- **ChatManager**: Queue-based user matching (2 users per room)
- **Socket Events**: Partner-based messaging (`partner_found`, `partner_left`)
- **UI**: Single partner interface with individual voice calls
- **WebRTC**: Direct peer-to-peer connections between matched users
- **Data Flow**: Queue → Match → Private Room → 1-on-1 Communication

### Limitations:
- Scalability: Only supports isolated 1-on-1 conversations
- Community: No shared group experience
- Queue Management: Linear matching instead of role-based access
- Voice Broadcasting: Limited to direct peer connections

## New Global Voice Room Architecture

### Core Concept
**ONE** global voice room where:
- Maximum 2 users can speak simultaneously (active speakers)
- All other users listen and queue for speaking opportunities
- Auto-promotion from listener queue when speaker slots become available
- Visual queue position tracking for all users

## Data Structure Redesign

### New Core Types

```typescript
// Global Voice Room State
interface GlobalVoiceRoom {
  id: 'global-room' // Always the same ID
  speakers: [User | null, User | null] // Exactly 2 speaker slots
  listenerQueue: User[] // Ordered queue of listeners wanting to speak
  allUsers: Map<string, User> // All connected users
  createdAt: Date
  lastActivity: Date
  totalUsersEver: number
}

// Enhanced User with Role
interface User {
  id: string
  username: string
  socketId: string
  role: 'speaker' | 'listener'
  joinTime: Date
  lastActivity: Date
  queuePosition?: number // Only set for users in listener queue
  speakingStartTime?: Date // When they became a speaker
  totalSpeakingTime: number // Cumulative speaking time
}

// Room Statistics
interface VoiceRoomStats {
  currentSpeakers: number // 0-2
  totalListeners: number
  queueLength: number
  averageWaitTime: number
  totalUsers: number
  activeUsers: number
}
```

### New Socket Events

```typescript
interface ServerToClientEvents {
  // Global room events
  room_joined: (roomState: GlobalVoiceRoomState) => void
  room_left: () => void
  room_updated: (roomState: GlobalVoiceRoomState) => void
  
  // Speaker management
  promoted_to_speaker: (slotIndex: 0 | 1) => void
  demoted_to_listener: () => void
  speaker_joined: (user: User, slotIndex: 0 | 1) => void
  speaker_left: (slotIndex: 0 | 1) => void
  
  // Queue management
  queue_position_updated: (position: number, totalQueue: number) => void
  queue_joined: (position: number) => void
  queue_left: () => void
  
  // WebRTC broadcasting
  speaker_stream_started: (userId: string, slotIndex: 0 | 1) => void
  speaker_stream_ended: (userId: string, slotIndex: 0 | 1) => void
  mixed_audio_stream: (audioData: ArrayBuffer) => void
  
  // System events
  room_stats: (stats: VoiceRoomStats) => void
  error: (error: string) => void
}

interface ClientToServerEvents {
  // Room joining
  join_global_room: (username: string) => void
  leave_global_room: () => void
  
  // Queue management
  request_speaker_slot: () => void
  leave_speaker_queue: () => void
  voluntary_speaker_leave: () => void
  
  // WebRTC broadcasting
  speaker_offer: (offer: RTCSessionDescriptionInit) => void
  speaker_answer: (answer: RTCSessionDescriptionInit, slotIndex: 0 | 1) => void
  speaker_ice_candidate: (candidate: RTCIceCandidateInit, slotIndex: 0 | 1) => void
  
  // Audio control
  mute_speaker: (isMuted: boolean) => void
  adjust_volume: (level: number) => void
  
  // Heartbeat
  ping: () => void
}
```

## Backend Architecture Redesign

### New GlobalVoiceRoomManager

```typescript
export class GlobalVoiceRoomManager {
  private globalRoom: GlobalVoiceRoom
  private users: Map<string, User> = new Map()
  private speakerSlots: [User | null, User | null] = [null, null]
  private listenerQueue: User[] = []
  private userSockets: Map<string, string> = new Map() // userId -> socketId
  
  // Core room management
  addUserToRoom(user: User): VoiceRoomJoinResult
  removeUserFromRoom(userId: string): void
  
  // Speaker slot management
  requestSpeakerSlot(userId: string): SpeakerRequestResult
  leaveSpeakerSlot(userId: string): void
  autoPromoteFromQueue(): User | null
  
  // Queue management
  addToSpeakerQueue(userId: string): number
  removeFromSpeakerQueue(userId: string): void
  updateQueuePositions(): void
  
  // Broadcasting coordination
  getSpeakerAudioSources(): AudioSource[]
  broadcastToListeners(audioData: ArrayBuffer): void
  
  // Statistics and monitoring
  getRoomStats(): VoiceRoomStats
  getGlobalRoomState(): GlobalVoiceRoomState
}
```

### Speaker Slot Management Algorithm

```typescript
class SpeakerSlotManager {
  // Auto-promotion logic when speaker leaves
  autoPromoteFromQueue(): void {
    if (this.hasAvailableSpeakerSlot() && this.listenerQueue.length > 0) {
      const nextSpeaker = this.listenerQueue.shift()!
      const availableSlot = this.getAvailableSpeakerSlot()
      
      this.assignSpeakerSlot(nextSpeaker, availableSlot)
      this.broadcastSpeakerChange(nextSpeaker, availableSlot)
      this.updateAllQueuePositions()
    }
  }
  
  // Fairness algorithm - prevent long-term speaker hoarding
  enforceMaxSpeakingTime(): void {
    const MAX_SPEAKING_TIME = 10 * 60 * 1000 // 10 minutes
    
    this.speakerSlots.forEach((speaker, slotIndex) => {
      if (speaker && this.getSpeakingDuration(speaker) > MAX_SPEAKING_TIME) {
        this.voluntarilyRotateSpeaker(speaker, slotIndex)
      }
    })
  }
}
```

## Frontend Architecture Redesign

### New Global Room Store

```typescript
interface GlobalRoomState {
  // Room state
  roomState: GlobalVoiceRoomState | null
  connectionStatus: ConnectionStatus
  
  // User role and status
  currentUser: User | null
  userRole: 'speaker' | 'listener'
  speakerSlotIndex: 0 | 1 | null
  queuePosition: number | null
  
  // Speaker information
  speakers: [User | null, User | null]
  totalListeners: number
  queueLength: number
  
  // Audio state
  isAudioEnabled: boolean
  isMuted: boolean
  speakerVolumes: [number, number] // Volume for each speaker slot
  mixedAudioStream: MediaStream | null
  
  // Actions
  joinGlobalRoom: (username: string) => void
  leaveGlobalRoom: () => void
  requestSpeakerSlot: () => void
  leaveSpeakerQueue: () => void
  voluntaryLeaveSpeaker: () => void
  adjustSpeakerVolume: (slotIndex: 0 | 1, volume: number) => void
  toggleMute: () => void
}
```

### New UI Components

```typescript
// Main global room interface
interface GlobalVoiceRoomProps {
  roomState: GlobalVoiceRoomState
  userRole: 'speaker' | 'listener'
  onRequestSpeaker: () => void
  onLeaveSpeaker: () => void
}

// Speaker slots display
interface SpeakerSlotsProps {
  speakers: [User | null, User | null]
  currentUserId: string
  onVolumeChange: (slotIndex: 0 | 1, volume: number) => void
}

// Listener queue display
interface ListenerQueueProps {
  queue: User[]
  currentUserPosition: number | null
  totalWaitTime: number
  onJoinQueue: () => void
  onLeaveQueue: () => void
}

// Room statistics panel
interface RoomStatsProps {
  stats: VoiceRoomStats
  updateInterval: number
}
```

## WebRTC Broadcasting Architecture

### Multi-User Audio Broadcasting

```typescript
class GlobalRoomWebRTC {
  private speakerConnections: Map<string, RTCPeerConnection> = new Map()
  private listenerConnections: Map<string, RTCPeerConnection> = new Map()
  private audioMixer: AudioMixer
  
  // Speaker broadcasting to all listeners
  setupSpeakerBroadcast(speakerUser: User, slotIndex: 0 | 1): void {
    // Create peer connections to all listeners
    this.broadcastSpeakerStreamToAllListeners(speakerUser, slotIndex)
  }
  
  // Audio mixing for multiple speakers
  mixSpeakerAudio(speaker1Stream: MediaStream, speaker2Stream: MediaStream): MediaStream {
    return this.audioMixer.combineStreams([speaker1Stream, speaker2Stream])
  }
  
  // Listener receives mixed audio from both speakers
  setupListenerReceive(listenerUser: User): void {
    // Receive mixed audio stream from both active speakers
    this.createListenerConnection(listenerUser)
  }
}
```

## Implementation Roadmap

### Phase 1: Backend Core Transformation (2-3 days)
1. Replace ChatManager with GlobalVoiceRoomManager
2. Implement speaker slot management system
3. Create new socket event handlers
4. Add queue position tracking and auto-promotion logic
5. Update all socket events to room-based instead of partner-based

### Phase 2: Data Layer Migration (1 day)
1. Replace all 1-on-1 data structures with global room types
2. Update TypeScript interfaces in both backend and frontend
3. Migrate existing user session handling to role-based system

### Phase 3: Frontend Redesign (2-3 days)
1. Replace ChatStore with GlobalRoomStore
2. Redesign all UI components for global room interface
3. Implement speaker slots and listener queue components
4. Add room statistics and user count displays

### Phase 4: WebRTC Broadcasting (3-4 days)
1. Replace 1-on-1 WebRTC with multi-user broadcasting system
2. Implement audio mixing for multiple speakers
3. Create listener audio reception system
4. Add volume controls and audio quality management

### Phase 5: Advanced Features (1-2 days)
1. Implement fairness algorithms (max speaking time)
2. Add room moderation capabilities
3. Enhanced queue management (estimated wait times)
4. Real-time statistics and monitoring

## Migration Strategy

### Database Migration (if applicable)
- No database changes needed (current system is in-memory)
- All existing chat rooms will be obsoleted
- Users will need to reconnect to the new global room system

### Backward Compatibility
- **None required** - This is a complete paradigm shift
- All existing 1-on-1 sessions will be terminated
- Users will be redirected to the new global room interface

### Testing Strategy
1. **Load Testing**: Simulate 50+ concurrent users with speaker queue management
2. **WebRTC Testing**: Test audio quality with multiple speakers and listeners
3. **Queue Fairness Testing**: Ensure proper queue position management and auto-promotion
4. **Disconnection Handling**: Test speaker slot recovery when users disconnect
5. **Audio Mixing Testing**: Verify quality of mixed audio from multiple speakers

## Risk Assessment

### High Risk Areas
1. **WebRTC Complexity**: Broadcasting to many listeners is more complex than 1-on-1
2. **Audio Quality**: Mixing multiple speaker streams while maintaining quality
3. **Scalability**: Managing large numbers of listeners efficiently
4. **Queue Fairness**: Ensuring fair access to speaking opportunities

### Mitigation Strategies
1. **Gradual Rollout**: Start with smaller user limits and scale up
2. **Audio Fallbacks**: Implement graceful degradation for poor connections
3. **Queue Limits**: Set maximum queue size to prevent infinite waiting
4. **Monitoring**: Real-time metrics for audio quality and user experience

## Success Metrics

### User Experience
- Average wait time in queue < 5 minutes
- Audio quality rating > 4/5
- User session duration > 15 minutes average
- Queue abandonment rate < 30%

### Technical Performance
- Support for 100+ concurrent users
- < 500ms speaker slot transition time
- > 99% uptime for global room
- < 100ms audio latency for listeners

## Conclusion

This architecture transformation converts the system from a limited 1-on-1 chat to a scalable community voice platform. The key innovation is the managed speaker slot system with automatic queue progression, creating a structured yet dynamic group conversation experience.

The implementation requires careful attention to WebRTC broadcasting, fair queue management, and audio quality maintenance, but will result in a much more engaging and scalable platform for users to connect and communicate.