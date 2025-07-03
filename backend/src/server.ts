import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { setupSocketHandlers } from './services/socketService'
import {
  setupVoiceRoomSocketHandlers,
  getVoiceRoomStats,
} from './services/voiceRoomSocketService'
import { ChatManager } from './services/chatManager'
import { GlobalVoiceRoomManager } from './services/globalVoiceRoomManager'
import { logger } from './utils/logger'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './types/index'

// Environment configuration
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Create Express app
const app = express()
const server = createServer(app)

// Initialize Socket.IO with CORS configuration
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
const chatManager = new ChatManager()

// Create global voice room manager instance
const voiceRoomManager = new GlobalVoiceRoomManager(2) // Max 2 speakers

// Middleware setup
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
setupSocketHandlers(io, chatManager)
setupVoiceRoomSocketHandlers(io, voiceRoomManager)

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
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`)
  logger.info(`Frontend URL: ${FRONTEND_URL}`)
})

export { app, server, io }
