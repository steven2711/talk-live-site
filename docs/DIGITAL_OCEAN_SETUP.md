# Digital Ocean Deployment Guide for WebRTC Application

This comprehensive guide will walk you through deploying your WebRTC voice chat application to Digital Ocean, ensuring proper support for peer-to-peer connections and real-time communication.

## Prerequisites

- Digital Ocean account
- Domain name (required for HTTPS/WebRTC)
- Basic knowledge of Linux/Ubuntu
- Git installed on your local machine

## Why Digital Ocean for WebRTC?

Digital Ocean provides:

- Full control over network configuration
- Proper UDP/WebSocket support for WebRTC signaling
- Dedicated IP addresses
- Better performance than shared hosting platforms
- Support for custom firewall rules

## Step 1: Create Digital Ocean Droplet

### 1.1 Create Droplet

```bash
# Minimum recommended specifications:
- OS: Ubuntu 20.04 LTS
- Plan: Basic ($12/month - 2GB RAM, 1 CPU, 50GB SSD)
- Datacenter: Choose closest to your users
- Authentication: SSH keys (recommended)
```

### 1.2 Initial Server Setup

```bash
# Connect to your droplet
ssh root@your-droplet-ip

# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y curl wget git ufw fail2ban htop

# Create a non-root user (optional but recommended)
adduser deploy
usermod -aG sudo deploy
```

## Step 2: Install Dependencies

### 2.1 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add user to docker group
usermod -aG docker $USER

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

## Step 3: DNS Configuration

### 3.1 Configure DNS Records

```bash
# Add these DNS records to your domain:
A     your-domain.com        -> your-droplet-ip
CNAME www.your-domain.com    -> your-domain.com
```

### 3.2 Verify DNS Propagation

```bash
# Test DNS resolution
nslookup your-domain.com
dig your-domain.com
```

## Step 4: Deploy Application

### 4.1 Clone Repository

```bash
# Clone your repository
git clone https://github.com/your-username/talk-live-site.git
cd talk-live-site
```

### 4.2 Configure Environment Variables

```bash
# Backend configuration
cp backend/.env.production backend/.env.production.local
nano backend/.env.production.local

# Update these values:
# - FRONTEND_URL=https://your-vercel-app.vercel.app
# - BACKEND_URL=https://your-domain.com
# - CORS_ORIGIN=https://your-vercel-app.vercel.app
# - SOCKET_IO_CORS_ORIGIN=https://your-vercel-app.vercel.app
```

### 4.3 Configure Deployment Script

```bash
# Edit deployment script
nano deploy.sh

# Update these variables:
DOMAIN="your-domain.com"
EMAIL="your-email@example.com"
```

### 4.4 Run Deployment

```bash
# Make script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

## Step 5: SSL Certificate Setup

### 5.1 Install Certbot

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 5.2 Configure Auto-renewal

```bash
# Test renewal
certbot renew --dry-run

# Auto-renewal is set up automatically by the deploy script
```

## Step 7: Firewall Configuration

### 7.1 Configure UFW

```bash
# Reset and configure firewall
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow necessary ports
ufw allow ssh
ufw allow http
ufw allow https

# Enable firewall
ufw --force enable

# Check status
ufw status
```

## Step 8: Monitoring and Maintenance

### 8.1 Set Up Monitoring

```bash
# The deploy script automatically sets up:
# - Health checks every 5 minutes
# - Log rotation
# - Resource monitoring
# - Automatic service restart on failure

# Check monitoring logs
tail -f /var/log/monitoring.log
```

### 8.2 Application Management

```bash
# View application status
systemctl status talk-live-app

# View logs
docker-compose logs -f

# Restart application
systemctl restart talk-live-app

# Update application
git pull origin main
./deploy.sh
```

## Step 9: Testing WebRTC Functionality

### 9.1 Test Basic Connectivity

```bash
# Test backend health
curl https://your-domain.com/health

# Test WebSocket connection
curl -I -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://your-domain.com/socket.io/
```

### 9.2 Test WebRTC Features

1. Open your application in two browser windows
2. Test voice room joining
3. Verify audio levels are detected
4. Test speaking/listening functionality
5. Check browser developer tools for WebRTC errors

## Step 10: Performance Optimization

### 10.1 Enable Gzip Compression

```bash
# Already configured in nginx.conf
# Verify compression is working
curl -H "Accept-Encoding: gzip" -I https://your-domain.com
```

### 10.2 Set Up CDN (Optional)

- Configure CloudFlare or similar CDN
- Enable static asset caching
- Configure proper cache headers

## Troubleshooting

### Common Issues

#### 1. WebRTC Not Working

```bash
# Check if ports are blocked
netstat -tlnp | grep :443
netstat -tlnp | grep :80

# Verify HTTPS is working
curl -I https://your-domain.com

# Check WebSocket connection
curl -I -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://your-domain.com/socket.io/
```

#### 2. Audio Issues

```bash
# Check TURN servers are accessible
# Test with https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

# Verify STUN/TURN configuration in VoiceBroadcastManager.ts
```

#### 3. CORS Issues

```bash
# Check backend CORS configuration
grep -r "CORS_ORIGIN" backend/

# Verify nginx CORS headers
curl -I -H "Origin: https://your-frontend-domain.com" https://your-domain.com/health
```

#### 4. SSL Certificate Issues

```bash
# Check certificate status
certbot certificates

# Renew certificate
certbot renew --force-renewal

# Check nginx SSL configuration
nginx -t
```

### Log Files

```bash
# Application logs
docker-compose logs -f

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u talk-live-app -f

# Monitoring logs
tail -f /var/log/monitoring.log
```

## Security Considerations

### 1. Regular Updates

```bash
# Update system packages
apt update && apt upgrade -y

# Update Docker images
docker-compose pull
docker-compose up -d
```

### 2. Backup Strategy

```bash
# Create backup
./deploy.sh backup

# Automated backups are set up by the deploy script
ls -la /opt/backups/
```

### 3. Security Headers

- All security headers are configured in nginx.conf
- HSTS is enabled
- CSP headers are set
- XSS protection is enabled

## Cost Estimation

### Monthly Costs (Digital Ocean)

- Basic Droplet (2GB RAM): $12/month
- Bandwidth: $0.01/GB (first 1TB free)
- Additional storage: $0.10/GB/month
- Load balancer (if needed): $12/month

### Total estimated cost: $15-25/month

## Performance Benchmarks

### Expected Performance

- **Concurrent Users**: 50-100 users per droplet
- **Response Time**: <100ms for API calls
- **WebSocket Latency**: <50ms
- **Audio Quality**: High quality with proper TURN servers

### Scaling Options

- **Vertical Scaling**: Upgrade to larger droplets
- **Horizontal Scaling**: Add load balancer + multiple droplets
- **Database**: Add managed PostgreSQL if needed
- **CDN**: Add CloudFlare for static assets

## Support and Maintenance

### Regular Tasks

1. **Weekly**: Check logs and monitoring
2. **Monthly**: Review security updates
3. **Quarterly**: Performance review and optimization
4. **Annually**: SSL certificate renewal (automated)

### Emergency Procedures

```bash
# Quick restart
systemctl restart talk-live-app

# Rollback to previous version
cd /opt/backups
tar -xzf talk-live-app-YYYYMMDD-HHMMSS.tar.gz
# Follow restore procedure
```

## Next Steps

1. **Set up monitoring**: Consider adding Prometheus/Grafana
2. **Add analytics**: Integrate usage tracking
3. **Implement logging**: Centralized logging with ELK stack
4. **Add testing**: Automated testing pipeline
5. **Consider scaling**: Plan for growth

## Conclusion

Your WebRTC application is now deployed on Digital Ocean with:

- ✅ Proper WebRTC support
- ✅ HTTPS/SSL encryption
- ✅ Scalable architecture
- ✅ Monitoring and logging
- ✅ Automated deployment
- ✅ Security best practices

The deployment provides full control over the network stack, ensuring reliable WebRTC connections that weren't possible with Railway's shared hosting environment.
