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
