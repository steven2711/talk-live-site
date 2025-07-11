# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files (workspace setup - build from root)
COPY package*.json ./

# Copy backend source
COPY backend/ ./backend/

# Install dependencies including dev dependencies for build
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

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --silent && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/backend/dist ./dist

# Copy any additional files needed at runtime
COPY --from=builder /app/package.json ./
COPY --from=builder /app/backend/package.json ./backend/

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/server.js"]