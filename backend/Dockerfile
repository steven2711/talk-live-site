FROM node:18-alpine

WORKDIR /app

# Copy the entire project (build context is root)
COPY . .

# Install dependencies
RUN npm ci

# Build the backend
RUN npm run build:backend

# Create logs directory with proper permissions
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "import('http').then(http => http.get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }))"

CMD ["node", "backend/dist/server.js"]