# Environment Setup Guide

This guide explains how to set up and use the environment configuration for the Talk Live application.

## Environment Files

The application uses environment-specific configuration files:

- `.env.development` - Local development settings
- `.env.production` - Production settings
- `docker-compose.yml` - Production Docker setup
- `docker-compose.dev.yml` - Development Docker setup

## URLs Configuration

### Production URLs

- **Frontend**: https://www.soyouweresaying.com (Vercel)
- **Backend API**: https://api.soyouweresaying.com (Digital Ocean)

### Development URLs

- **Frontend**: http://localhost:3000 (Local Vite Dev Server)
- **Backend API**: http://localhost:3001
- **Nginx Proxy**: http://localhost:8080

## Quick Start

### Development Mode

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up --build

# Access the application
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
# Nginx Proxy: http://localhost:8080
```

### Production Mode

```bash
# Start production environment
docker-compose up --build

# Access the application
# Frontend: https://www.soyouweresaying.com
# Backend: https://api.soyouweresaying.com
```

## Environment Variables

### Backend Variables

| Variable                  | Description             | Development             | Production                        |
| ------------------------- | ----------------------- | ----------------------- | --------------------------------- |
| `NODE_ENV`                | Node environment        | `development`           | `production`                      |
| `PORT`                    | Server port             | `3001`                  | `3001`                            |
| `HOST`                    | Server host             | `localhost`             | `0.0.0.0`                         |
| `FRONTEND_URL`            | Frontend URL for CORS   | `http://localhost:3000` | `https://www.soyouweresaying.com` |
| `CORS_ORIGIN`             | CORS origin             | `http://localhost:3000` | `https://www.soyouweresaying.com` |
| `CORS_CREDENTIALS`        | CORS credentials        | `true`                  | `true`                            |
| `RATE_LIMIT_WINDOW_MS`    | Rate limit window       | `900000`                | `900000`                          |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit max requests | `100`                   | `100`                             |
| `SOCKET_IO_CORS_ORIGIN`   | Socket.io CORS origin   | `http://localhost:3000` | `https://www.soyouweresaying.com` |
| `SOCKET_IO_TRANSPORT`     | Socket.io transport     | `websocket,polling`     | `websocket,polling`               |
| `LOG_LEVEL`               | Logging level           | `debug`                 | `info`                            |

### Frontend Variables

| Variable                             | Description            | Development             | Production                        |
| ------------------------------------ | ---------------------- | ----------------------- | --------------------------------- |
| `VITE_API_URL`                       | Backend API URL        | `http://localhost:3001` | `https://api.soyouweresaying.com` |
| `VITE_DEV_MODE`                      | Development mode       | `true`                  | `false`                           |
| `VITE_NODE_ENV`                      | Node environment       | `development`           | `production`                      |
| `VITE_WEBRTC_DEBUG`                  | WebRTC debugging       | `true`                  | `false`                           |
| `VITE_WEBRTC_LOGGING`                | WebRTC logging         | `true`                  | `false`                           |
| `VITE_ENABLE_ANALYTICS`              | Analytics              | `false`                 | `true`                            |
| `VITE_ENABLE_ERROR_REPORTING`        | Error reporting        | `false`                 | `true`                            |
| `VITE_ENABLE_PERFORMANCE_MONITORING` | Performance monitoring | `false`                 | `true`                            |

## Docker Commands

### Development

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# Start in background
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop development environment
docker-compose -f docker-compose.dev.yml down

# Rebuild and start
docker-compose -f docker-compose.dev.yml up --build
```

### Production

```bash
# Start production environment
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop production environment
docker-compose down

# Rebuild and start
docker-compose up --build
```

## Service Architecture

### Development Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │     Nginx       │
│   (Port 3000)   │◄──►│   (Port 3001)   │◄──►│   (Port 8080)   │
│                 │    │                 │    │                 │
│   React + Vite  │    │   Node.js API   │    │   Reverse Proxy │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Production Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │
│   (Vercel)      │◄──►│   (Digital Ocean)│
│                 │    │                 │
│   React + Vite  │    │   Node.js API   │
└─────────────────┘    └─────────────────┘
```

## Health Checks

The application includes health check endpoints:

- **Backend Health**: `http://localhost:3001/health` (dev) or `https://api.soyouweresaying.com/health` (prod)
- **Nginx Health**: `http://localhost:8080/health` (dev)

## Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 3000, 3001, and 8080 are available
2. **Environment variables**: Ensure `.env.development` or `.env.production` files exist
3. **Docker permissions**: Run with appropriate permissions if needed
4. **Network issues**: Check if Docker networks are properly configured

### Logs

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs backend
docker-compose logs nginx

# Follow logs in real-time
docker-compose logs -f
```

### Rebuilding

```bash
# Rebuild all services
docker-compose build --no-cache

# Rebuild specific service
docker-compose build backend
```

## Security Notes

- Production environment variables are configured for HTTPS
- CORS is properly configured for both environments
- Rate limiting is enabled
- Security headers are configured in nginx
- Non-root users are used in Docker containers

## Next Steps

1. Set up SSL certificates for production
2. Configure domain DNS settings
3. Set up monitoring and logging
4. Configure backup strategies
5. Set up CI/CD pipelines
