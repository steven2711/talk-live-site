# Deployment Guide

This guide covers the deployment setup for the Talk Live application using Vercel for the frontend and Digital Ocean for the backend.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │
│   (Vercel)      │◄──►│   (Digital Ocean)│
│                 │    │                 │
│   React + Vite  │    │   Node.js API   │
└─────────────────┘    └─────────────────┘
```

## Frontend Deployment (Vercel)

### Prerequisites

- Vercel account
- GitHub repository connected to Vercel

### Environment Variables

Set these in your Vercel project settings:

```bash
VITE_API_URL=https://api.soyouweresaying.com
VITE_DEV_MODE=false
VITE_NODE_ENV=production
VITE_WEBRTC_DEBUG=false
VITE_WEBRTC_LOGGING=false
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_REPORTING=true
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_CSP=true
VITE_ENABLE_HTTPS_REDIRECT=true
VITE_ENABLE_HSTS=true
VITE_ENABLE_SERVICE_WORKER=true
VITE_ENABLE_OFFLINE_MODE=false
VITE_ENABLE_PUSH_NOTIFICATIONS=false
VITE_THEME_MODE=auto
VITE_ENABLE_DARK_MODE=true
VITE_ENABLE_ANIMATIONS=true
VITE_ENABLE_SOUNDS=true
VITE_ENABLE_DEVTOOLS=false
VITE_ENABLE_CONSOLE_LOGS=false
VITE_ENABLE_DEBUG_PANEL=false
VITE_BUILD_ANALYZE=false
VITE_BUILD_SOURCEMAPS=false
VITE_BUILD_MINIFY=true
VITE_BUILD_TARGET=es2015
```

### Deployment Steps

1. Connect your GitHub repository to Vercel
2. Set the build command to: `npm run build`
3. Set the output directory to: `dist`
4. Configure the environment variables above
5. Deploy

## Backend Deployment (Digital Ocean)

### Prerequisites

- Digital Ocean account
- Droplet with Docker installed
- Domain configured with DNS

### Server Setup

1. **Create a Digital Ocean Droplet**

   ```bash
   # Ubuntu 22.04 LTS recommended
   # 2GB RAM minimum
   # 1 vCPU minimum
   ```

2. **Install Docker and Docker Compose**

   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh

   # Add user to docker group
   sudo usermod -aG docker $USER

   # Install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

3. **Clone Repository**

   ```bash
   git clone <your-repo-url>
   cd talk-live-site
   ```

4. **Set Up Environment**

   ```bash
   # Copy production environment file
   cp .env.production .env

   # Verify configuration
   cat .env
   ```

5. **Set Up SSL Certificates**

   ```bash
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx -y

   # Create SSL directory
   sudo mkdir -p /etc/nginx/ssl

   # Get SSL certificate (replace with your domain)
   sudo certbot certonly --standalone -d api.soyouweresaying.com

   # Copy certificates to nginx directory
   sudo cp /etc/letsencrypt/live/api.soyouweresaying.com/fullchain.pem /etc/nginx/ssl/
   sudo cp /etc/letsencrypt/live/api.soyouweresaying.com/privkey.pem /etc/nginx/ssl/
   ```

6. **Deploy Application**

   ```bash
   # Start the application
   docker-compose up -d

   # Check status
   docker-compose ps

   # View logs
   docker-compose logs -f
   ```

### DNS Configuration

Configure your domain's DNS settings:

```
Type    Name    Value
A       api     <your-droplet-ip>
```

### Firewall Configuration

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Monitoring and Maintenance

### Health Checks

- Backend: `https://api.soyouweresaying.com/health`
- Should return `200 OK`

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

### Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up --build -d
```

### SSL Certificate Renewal

```bash
# Set up automatic renewal
sudo crontab -e

# Add this line for monthly renewal
0 12 1 * * /usr/bin/certbot renew --quiet && docker-compose restart nginx
```

## Troubleshooting

### Common Issues

1. **SSL Certificate Issues**

   ```bash
   # Check certificate status
   sudo certbot certificates

   # Renew manually if needed
   sudo certbot renew
   ```

2. **Port Conflicts**

   ```bash
   # Check what's using port 80/443
   sudo netstat -tulpn | grep :80
   sudo netstat -tulpn | grep :443
   ```

3. **Docker Issues**

   ```bash
   # Check Docker status
   sudo systemctl status docker

   # Restart Docker if needed
   sudo systemctl restart docker
   ```

4. **Application Issues**

   ```bash
   # Check container status
   docker-compose ps

   # Restart services
   docker-compose restart

   # Rebuild if needed
   docker-compose down
   docker-compose up --build -d
   ```

### Performance Monitoring

```bash
# Check resource usage
docker stats

# Check disk space
df -h

# Check memory usage
free -h
```

## Security Considerations

1. **Keep system updated**

   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Regular backups**

   ```bash
   # Backup environment files
   cp .env .env.backup.$(date +%Y%m%d)
   ```

3. **Monitor logs for suspicious activity**

   ```bash
   # Check nginx access logs
   sudo tail -f /var/log/nginx/access.log
   ```

4. **Use strong passwords and SSH keys**

## Cost Optimization

- Use Digital Ocean's basic droplet plan ($6/month)
- Consider using Digital Ocean's managed database if needed
- Monitor bandwidth usage
- Use Vercel's free tier for frontend hosting

## Next Steps

1. Set up monitoring (e.g., UptimeRobot)
2. Configure automated backups
3. Set up CI/CD pipeline
4. Implement logging aggregation
5. Set up alerting for downtime
