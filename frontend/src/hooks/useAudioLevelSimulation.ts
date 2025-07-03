import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';

/**
 * Custom hook to simulate audio level updates for demo purposes
 * In a real implementation, this would connect to actual microphone input
 */
export const useAudioLevelSimulation = (mockVoiceRoomState?: any) => {
  const { voiceRoomState, sendAudioLevel, currentUser } = useChatStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    // Use actual voice room state or mock data
    const effectiveVoiceRoomState = voiceRoomState || mockVoiceRoomState;
    
    // Only simulate audio levels if user is a speaker
    if (!effectiveVoiceRoomState || !currentUser) return;
    
    const currentUserIsSpeaker = effectiveVoiceRoomState.speakers.some(
      (speaker: any) => speaker.id === currentUser.id
    );
    
    if (!currentUserIsSpeaker) return;

    let isActive = false;
    let baseLevel = 0;

    // Simulate periodic speaking activity
    const speakingInterval = setInterval(() => {
      isActive = !isActive;
      baseLevel = isActive ? Math.random() * 60 + 20 : 0; // 20-80% when active, 0% when inactive
    }, 2000 + Math.random() * 3000); // Random intervals between 2-5 seconds

    // Animate audio levels smoothly
    const animateAudioLevel = () => {
      if (isActive) {
        // Add natural variation when speaking
        const variation = (Math.sin(Date.now() / 200) + 1) * 10; // Natural wave pattern
        const noiseVariation = (Math.random() - 0.5) * 20; // Random variation
        const currentLevel = Math.max(0, Math.min(100, baseLevel + variation + noiseVariation));
        
        sendAudioLevel(currentLevel);
      } else {
        // Gradual fade to silence
        const currentLevel = Math.max(0, baseLevel * 0.9);
        baseLevel = currentLevel;
        sendAudioLevel(currentLevel);
      }
      
      animationRef.current = requestAnimationFrame(animateAudioLevel);
    };

    animationRef.current = requestAnimationFrame(animateAudioLevel);

    return () => {
      clearInterval(speakingInterval);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [voiceRoomState, currentUser, sendAudioLevel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
};

/**
 * Hook to simulate realistic speaker transitions and queue management
 */
export const useVoiceRoomSimulation = () => {
  const { voiceRoomState, currentUser } = useChatStore();

  useEffect(() => {
    // Simulate periodic speaker role changes
    if (!voiceRoomState || voiceRoomState.listeners.length === 0) return;

    const rotationInterval = setInterval(() => {
      // In a real implementation, this would be handled by the backend
      // This is just for demo purposes to show how speaker transitions would work
      console.log('Speaker rotation would happen here in real implementation');
    }, 30000); // Rotate speakers every 30 seconds

    return () => clearInterval(rotationInterval);
  }, [voiceRoomState]);

  useEffect(() => {
    // Simulate queue position updates
    if (!voiceRoomState || !currentUser) return;

    const queueUpdateInterval = setInterval(() => {
      // In real implementation, queue updates would come from server
      console.log('Queue position updates would happen here');
    }, 5000);

    return () => clearInterval(queueUpdateInterval);
  }, [voiceRoomState, currentUser]);
};