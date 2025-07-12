# Mobile Browser Fix Deployed

## 🔧 Critical Changes Made

### Backend Changes
- **Reduced cleanup timeout from 2 minutes to 30 seconds**
  - File: `backend/src/services/voiceRoomSocketService.ts:475`
  - Old: `cleanupInactiveUsers(120 * 1000)` (2 minutes)
  - New: `cleanupInactiveUsers(30 * 1000)` (30 seconds)

### Frontend Changes
- **Added mobile device detection**
  - Detects mobile browsers using user agent
  - Mobile devices: 10-second disconnect timeout
  - Desktop devices: 30-second disconnect timeout

- **Enhanced mobile event handling**
  - Added `blur` event detection for app switching
  - Added Page Lifecycle API `freeze` event for mobile backgrounding
  - More aggressive cleanup for mobile browsers

## 📱 Mobile Browser Behavior

**The Problem**: Mobile browsers (iOS Safari, Chrome Mobile) don't reliably fire:
- `beforeunload` events when switching apps
- `pagehide` events when going to background
- `unload` events when pressing home button

**The Solution**: 
1. **Shorter timeouts** - 30 seconds max before cleanup
2. **Mobile detection** - 10 seconds for mobile, 30 for desktop
3. **Multiple event listeners** - `blur`, `freeze`, `visibilitychange`

## 🧪 Testing Instructions

### Test 1: Mobile App Switch
1. Join voice room on Phone A
2. **Switch to another app** (don't close browser)
3. Check Phone B - User A should disappear within **10-30 seconds**

### Test 2: Mobile Home Button
1. Join voice room on Phone A
2. **Press home button**
3. Check Phone B - User A should disappear within **10-30 seconds**

### Test 3: Mobile Browser Close
1. Join voice room on Phone A  
2. **Close browser entirely**
3. Check Phone B - User A should disappear within **10-30 seconds**

### Test 4: Desktop vs Mobile
1. Join on desktop and mobile
2. Test disconnect times:
   - **Desktop**: 30-second timeout
   - **Mobile**: 10-second timeout

## 🔍 Debug Console Messages

You'll now see these messages on mobile:

```
Page became hidden, starting disconnect timer
Using 10s timeout for mobile device
Window lost focus (mobile app switch?)
Page frozen by browser (mobile background)
Page still hidden after 10 seconds, disconnecting
🚪 You have left the voice room
```

## ⏱️ New Timing Expectations

- **Mobile disconnect**: 10-30 seconds maximum
- **Desktop disconnect**: 30-60 seconds maximum  
- **Server cleanup**: Every 15 seconds, removes users inactive >30 seconds
- **Heartbeat**: Every 15 seconds (unchanged)

## 🚀 Why This Should Work

1. **Aggressive Cleanup**: 30-second server timeout catches mobile browsers that don't fire events
2. **Mobile Detection**: Faster 10-second timeout for detected mobile devices
3. **Multiple Event Types**: More ways to detect when mobile apps go background
4. **Page Lifecycle API**: Uses modern browser APIs for mobile state detection

This should resolve the mobile lingering user issue you experienced in testing.