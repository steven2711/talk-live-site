import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { setupSocketHandlers } from './services/socketService.js'
import {
  setupVoiceRoomSocketHandlers,
  getVoiceRoomStats,
} from './services/voiceRoomSocketService.js'
import { ChatManager } from './services/chatManager.js'
import { GlobalVoiceRoomManager } from './services/globalVoiceRoomManager.js'
import { logger } from './utils/logger.js'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './types/index.js'

// Log startup
logger.info('Starting server initialization...')

// Environment configuration
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

logger.info('Environment configuration:', {
  PORT,
  NODE_ENV,
  FRONTEND_URL,
  processEnvPort: process.env.PORT,
  processEnvNodeEnv: process.env.NODE_ENV,
  processEnvFrontendUrl: process.env.FRONTEND_URL
})

// Create Express app
logger.info('Creating Express app and HTTP server...')
const app = express()
const server = createServer(app)

// Initialize Socket.IO with CORS configuration
logger.info('Initializing Socket.IO server...')
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin:
      NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL || 'http://localhost:3000']
        : [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Create chat manager instance
logger.info('Creating chat manager instance...')
const chatManager = new ChatManager()

// Create global voice room manager instance
logger.info('Creating global voice room manager instance...')
const voiceRoomManager = new GlobalVoiceRoomManager(2) // Max 2 speakers

// Middleware setup
logger.info('Setting up Express middleware...')
app.use(
  helmet({
    contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
)

app.use(
  cors({
    origin:
      NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL || 'http://localhost:3000']
        : [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  })
)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api', limiter)

// Simple root endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
  })
})

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Health check endpoint alias (for frontend compatibility)
app.get('/health-check', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// API endpoint for chat statistics
app.get('/api/stats', (_req, res) => {
  const chatStats = chatManager.getStats()
  const voiceRoomStats = getVoiceRoomStats(voiceRoomManager)
  res.json({
    chat: chatStats,
    voiceRoom: voiceRoomStats,
  })
})

// API endpoint for voice room state
app.get('/api/voice-room', (_req, res) => {
  const roomState = voiceRoomManager.getRoomState()
  const stats = getVoiceRoomStats(voiceRoomManager)
  res.json({
    room: roomState,
    stats,
  })
})

// API endpoint to force remove a user (for testing/admin)
app.post('/api/voice-room/force-remove/:userId', (req, res) => {
  try {
    const { userId } = req.params
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }
    
    logger.info(`Force removing user ${userId} from voice room`)
    
    if (!voiceRoomManager.hasUser(userId)) {
      return res.json({ 
        success: false, 
        message: 'User not found in voice room',
        userId 
      })
    }
    
    const result = voiceRoomManager.removeUser(userId)
    logger.info(`Force removed user ${userId} from voice room`)
    
    return res.json({ 
      success: true, 
      message: 'User force removed successfully',
      removedUser: userId,
      promotedUsers: result.promotedUsers?.length || 0
    })
    
  } catch (error) {
    logger.error('Error force removing user:', error)
    return res.status(500).json({ 
      error: 'Internal server error during force remove',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// API endpoint to reset voice room (clear all users - for testing)
app.post('/api/voice-room/reset', (_req, res) => {
  try {
    logger.warn('RESETTING VOICE ROOM - removing all users')
    voiceRoomManager.resetRoom()
    
    res.json({ 
      success: true, 
      message: 'Voice room reset successfully - all users removed'
    })
    
  } catch (error) {
    logger.error('Error resetting voice room:', error)
    res.status(500).json({ 
      error: 'Internal server error during reset',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// API endpoint for voice room disconnect (handles beacon requests)
app.post('/api/voice-room/disconnect', (req, res) => {
  try {
    const { userId, action, reason } = req.body
    
    // Validate required fields - action is optional
    if (!userId) {
      logger.warn('Invalid disconnect request - missing userId:', req.body)
      return res.status(400).json({ 
        error: 'Missing required field: userId' 
      })
    }
    
    // Default action if not provided
    const finalAction = action || 'leave_voice_room'
    
    logger.info(`Beacon disconnect request: userId=${userId}, action=${finalAction}, reason=${reason}`)
    
    // Check if user exists before trying to remove
    if (!voiceRoomManager.hasUser(userId)) {
      logger.warn(`Failed to remove user ${userId} via beacon disconnect - user not found`)
      return res.json({ 
        success: false, 
        message: 'User not found in voice room',
        userId 
      })
    }
    
    // Remove user from voice room
    const result = voiceRoomManager.removeUser(userId)
    
    logger.info(`Successfully removed user ${userId} via beacon disconnect`)
    
    // Handle promotions if any users were promoted
    if (result.promotedUsers && result.promotedUsers.length > 0) {
      logger.info(`Promoted ${result.promotedUsers.length} users to speaker after disconnect`)
    }
    
    // In a real implementation, we'd broadcast the update to all connected sockets
    // For now, we'll rely on the periodic cleanup to handle updates
    
    return res.json({ 
      success: true, 
      message: 'User disconnected successfully',
      removedUser: userId,
      promotedUsers: result.promotedUsers?.length || 0
    })
    
  } catch (error) {
    logger.error('Error handling beacon disconnect:', error)
    return res.status(500).json({ 
      error: 'Internal server error during disconnect',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Setup Socket.IO event handlers
logger.info('Setting up Socket.IO event handlers...')
try {
  setupSocketHandlers(io, chatManager)
  setupVoiceRoomSocketHandlers(io, voiceRoomManager)
  logger.info('Socket.IO event handlers setup completed')
} catch (error) {
  logger.error('Failed to setup Socket.IO handlers:', error)
  throw error
}

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error('Express error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
)

// Handle 404
app.use('*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

// Start server
logger.info(`Attempting to start server on port ${PORT}...`)
server.listen(PORT, () => {
  logger.info('=== SERVER STARTED SUCCESSFULLY ===')
  logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`)
  logger.info(`Frontend URL: ${FRONTEND_URL}`)
  logger.info(`Health check available at: http://localhost:${PORT}/health`)
  logger.info('===================================')
})

server.on('error', (error: Error) => {
  logger.error('Server failed to start:', error)
  process.exit(1)
})

export { app, server, io }
