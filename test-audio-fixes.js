// Test script for verifying WebRTC audio fixes
// Run this in the browser console when testing

console.log('🧪 WebRTC Audio Fix Test Script');

// Test 1: Verify bidirectional audio setup
function testBidirectionalAudio() {
  console.log('\n📋 TEST 1: Bidirectional Audio');
  
  const manager = window.voiceBroadcastManager;
  if (!manager) {
    console.error('❌ VoiceBroadcastManager not found on window');
    return;
  }
  
  console.log('Current role:', manager.role);
  console.log('Is active:', manager.isActive);
  console.log('Peer count:', manager.peerCount);
  console.log('Speaker count:', manager.speakerCount);
  
  // Check remote peers
  const peers = manager.state.remotePeers;
  console.log('\n🔗 Remote Peers:');
  peers.forEach((peer, id) => {
    console.log(`- ${id}: ${peer.role}, connection state: ${peer.connection.connectionState}`);
    
    // Check if we're receiving audio from speakers
    const receivers = peer.connection.getReceivers();
    const audioReceivers = receivers.filter(r => r.track && r.track.kind === 'audio');
    console.log(`  Audio receivers: ${audioReceivers.length}`);
    
    // Check if we're sending audio to this peer
    const senders = peer.connection.getSenders();
    const audioSenders = senders.filter(s => s.track && s.track.kind === 'audio');
    console.log(`  Audio senders: ${audioSenders.length}`);
  });
  
  // Check speaker streams
  console.log('\n🎵 Speaker Streams:');
  const speakerStreams = manager.state.speakerStreams;
  speakerStreams.forEach((stream, id) => {
    console.log(`- ${id}: active=${stream.active}, tracks=${stream.getTracks().length}`);
    stream.getTracks().forEach(track => {
      console.log(`  Track: ${track.kind}, enabled=${track.enabled}, muted=${track.muted}`);
    });
  });
}

// Test 2: Verify cleanup mechanisms
function testCleanupMechanisms() {
  console.log('\n📋 TEST 2: Cleanup Mechanisms');
  
  // Check if beforeunload handler is registered
  const hasBeforeUnload = window.onbeforeunload !== null || 
    window.addEventListener.toString().includes('beforeunload');
  console.log('Has beforeunload handler:', hasBeforeUnload);
  
  // Simulate cleanup
  console.log('\n🧹 Simulating cleanup...');
  const manager = window.voiceBroadcastManager;
  if (manager) {
    // Log current connections
    console.log('Active connections before cleanup:', manager.peerCount);
    
    // Trigger cleanup (don't actually run in production!)
    // manager.cleanup();
    console.log('⚠️  To test cleanup, manually refresh or close the browser');
  }
}

// Test 3: Monitor connection health
function monitorConnectionHealth() {
  console.log('\n📋 TEST 3: Connection Health Monitor');
  
  const manager = window.voiceBroadcastManager;
  if (!manager) return;
  
  let monitorCount = 0;
  const interval = setInterval(() => {
    console.log(`\n🔍 Health Check #${++monitorCount}`);
    
    manager.state.remotePeers.forEach((peer, id) => {
      const conn = peer.connection;
      console.log(`Peer ${id}:`);
      console.log(`  Connection: ${conn.connectionState}`);
      console.log(`  ICE: ${conn.iceConnectionState}`);
      console.log(`  Signaling: ${conn.signalingState}`);
      
      // Check for stuck connections
      if (conn.connectionState === 'connecting' || conn.iceConnectionState === 'checking') {
        console.warn(`  ⚠️  Possible stuck connection detected!`);
      }
    });
    
    if (monitorCount >= 5) {
      clearInterval(interval);
      console.log('✅ Health monitoring complete');
    }
  }, 3000);
}

// Test 4: Verify audio context state
function testAudioContext() {
  console.log('\n📋 TEST 4: Audio Context State');
  
  const manager = window.voiceBroadcastManager;
  if (!manager || !manager.state.audioContext) {
    console.error('❌ No audio context found');
    return;
  }
  
  const ctx = manager.state.audioContext;
  console.log('Audio Context State:', ctx.state);
  console.log('Sample Rate:', ctx.sampleRate);
  console.log('Current Time:', ctx.currentTime);
  console.log('Base Latency:', ctx.baseLatency);
  
  if (manager.state.mixedAudioDestination) {
    console.log('Mixed Audio Destination:', {
      channelCount: manager.state.mixedAudioDestination.channelCount,
      numberOfInputs: manager.state.mixedAudioDestination.numberOfInputs,
      numberOfOutputs: manager.state.mixedAudioDestination.numberOfOutputs
    });
  }
  
  // Check audio element
  if (manager.state.audioElement) {
    const audio = manager.state.audioElement;
    console.log('\n🔊 Audio Element:');
    console.log('  Paused:', audio.paused);
    console.log('  Volume:', audio.volume);
    console.log('  Muted:', audio.muted);
    console.log('  Ready State:', audio.readyState);
    console.log('  Has source:', !!audio.srcObject);
  }
}

// Run all tests
function runAllTests() {
  console.log('🚀 Running all WebRTC audio fix tests...\n');
  
  testBidirectionalAudio();
  setTimeout(() => testCleanupMechanisms(), 1000);
  setTimeout(() => monitorConnectionHealth(), 2000);
  setTimeout(() => testAudioContext(), 3000);
  
  console.log('\n💡 TIP: Use window.debugAudioState() for detailed audio debugging');
}

// Auto-run tests
runAllTests();

// Export test functions for manual use
window.audioTests = {
  testBidirectionalAudio,
  testCleanupMechanisms,
  monitorConnectionHealth,
  testAudioContext,
  runAllTests
};