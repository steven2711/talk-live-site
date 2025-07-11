# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy root package files for workspace setup
COPY package*.json ./

# Copy backend source and package.json
COPY backend/ ./backend/

# Install all dependencies (including dev dependencies for build)
RUN npm ci --silent

# Build the backend application
RUN npm run build --workspace=backend

# Production stage
FROM node:18-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy backend package.json and install production dependencies
COPY backend/package.json ./package.json
RUN npm ci --only=production --silent && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/backend/dist ./dist

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "import('http').then(http => http.get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }))"

# Start the application
CMD ["node", "dist/server.js"]