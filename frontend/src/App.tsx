import React from 'react';
import { useChatStore } from './store/chatStore';
import WelcomeScreen from './components/WelcomeScreen';
import ChatInterface from './components/ChatInterface';
import WaitingScreen from './components/WaitingScreen';
import { ConnectionStatus } from './types';

function App() {
  const { connectionStatus, currentUser } = useChatStore();

  const renderScreen = () => {
    // Show welcome screen if no user or disconnected
    if (!currentUser || connectionStatus === 'disconnected') {
      return <WelcomeScreen />;
    }

    // Show waiting screen if connecting or in queue
    if (connectionStatus === 'connecting' || connectionStatus === 'waiting') {
      return <WaitingScreen />;
    }

    // Show chat interface if connected or paired
    if (connectionStatus === 'connected' || connectionStatus === 'paired') {
      return <ChatInterface />;
    }

    // Fallback to welcome screen
    return <WelcomeScreen />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Anonymous P2P Chat
          </h1>
          <p className="text-gray-600 max-w-md mx-auto">
            Connect instantly with someone new. No registration required.
          </p>
        </header>
        
        <main className="max-w-4xl mx-auto">
          {renderScreen()}
        </main>
        
        <footer className="text-center mt-16 text-sm text-gray-500">
          <p>
            Anonymous and secure. No data is stored or tracked.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;