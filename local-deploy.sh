#!/bin/bash

# Talk Live Site Deployment Script
# This script performs a complete deployment of the application

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    error "docker-compose.yml not found. Please run this script from the project root directory."
fi

log "Starting deployment process..."

# Step 1: Stop all containers
log "Stopping all containers..."
sudo docker-compose down || error "Failed to stop containers"

# Step 2: Clean up Docker system
log "Cleaning up Docker system..."
sudo docker system prune -f || warning "Docker system prune failed, continuing..."

# Step 3: Pull latest code
log "Pulling latest code from git..."
git pull || error "Failed to pull latest code"

# Step 4: Build backend with no cache
log "Building backend container (no cache)..."
sudo docker-compose build --no-cache backend || error "Failed to build backend"

# Step 5: Start all services
log "Starting all services..."
sudo docker-compose up -d backend || error "Failed to start services"

# Step 6: Start nginx
log "Starting nginx..."
docker-compose up -d nginx || error "Failed to start nginx"

# Step 7: Wait a moment for services to start
log "Waiting for services to start..."
sleep 5

# Step 8: Check if services are running
log "Checking service status..."
sudo docker-compose ps

# Step 9: Health check (optional)
log "Performing health check..."
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    log "Backend health check passed!"
else
    warning "Backend health check failed. Check logs with: sudo docker-compose logs backend"
fi

log "Deployment completed successfully!"
log "You can check logs with:"
log "  sudo docker-compose logs backend"
log "  sudo docker-compose logs nginx"