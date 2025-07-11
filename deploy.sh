#!/bin/bash

# Digital Ocean Deployment Script for WebRTC Application
# This script handles the complete deployment process

set -e  # Exit on any error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
DOMAIN="${DOMAIN:-api.soyouweresaying.com}"  # Backend domain
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-www.soyouweresaying.com}"  # Frontend domain (Vercel)
EMAIL="${EMAIL:-admin@soyouweresaying.com}"
APP_NAME="talk-live-app"
DOCKER_COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="/opt/backups"
LOG_FILE="/var/log/deployment.log"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        print_warning "Certbot is not installed. Installing..."
        apt-get update && apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Check if ufw is installed
    if ! command -v ufw &> /dev/null; then
        print_warning "UFW is not installed. Installing..."
        apt-get update && apt-get install -y ufw
    fi
    
    print_success "Prerequisites check completed"
}

# Function to setup firewall
setup_firewall() {
    print_status "Setting up firewall..."
    
    # Reset UFW to defaults
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    
    # Allow HTTP and HTTPS
    ufw allow http
    ufw allow https
    
    # Allow specific ports if needed
    # ufw allow 3001/tcp  # Backend port (should be internal only)
    
    # Enable UFW
    ufw --force enable
    
    print_success "Firewall setup completed"
}

# Function to setup SSL certificates
setup_ssl() {
    print_status "Setting up SSL certificates..."
    
    if [ "$DOMAIN" == "your-domain.com" ]; then
        print_warning "Domain not configured. Skipping SSL setup."
        print_warning "Please update the DOMAIN variable in this script."
        return
    fi
    
    # Create SSL directory
    mkdir -p /opt/ssl
    
    # Check if certificates already exist
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        print_warning "SSL certificates already exist. Skipping certificate generation."
    else
        # Stop nginx if running
        docker-compose down || true
        
        # Get SSL certificates
        certbot certonly --standalone \
            --non-interactive \
            --agree-tos \
            --email "$EMAIL" \
            -d "$DOMAIN"
        
        # Copy certificates to our SSL directory
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /opt/ssl/
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /opt/ssl/
    fi
    
    # Set up certificate renewal
    if ! crontab -l | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    fi
    
    print_success "SSL setup completed"
}

# Function to create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    # Create application directory
    mkdir -p /opt/$APP_NAME
    
    # Create logs directory
    mkdir -p /var/log/$APP_NAME
    mkdir -p /opt/$APP_NAME/logs
    mkdir -p /opt/$APP_NAME/logs/nginx
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Create SSL directory
    mkdir -p /opt/ssl
    
    # Set proper permissions
    chown -R 1001:1001 /opt/$APP_NAME/logs
    chmod 755 /opt/$APP_NAME/logs
    
    print_success "Directories created"
}

# Function to backup current deployment
backup_deployment() {
    print_status "Creating backup of current deployment..."
    
    BACKUP_NAME="$APP_NAME-$(date +%Y%m%d-%H%M%S)"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
    
    if [ -d "/opt/$APP_NAME" ]; then
        mkdir -p "$BACKUP_PATH"
        
        # Backup application files
        cp -r "/opt/$APP_NAME" "$BACKUP_PATH/"
        
        # Backup database if it exists
        # docker-compose exec -T postgres pg_dump -U postgres app > "$BACKUP_PATH/database.sql" || true
        
        # Compress backup
        tar -czf "$BACKUP_PATH.tar.gz" -C "$BACKUP_DIR" "$BACKUP_NAME"
        rm -rf "$BACKUP_PATH"
        
        print_success "Backup created: $BACKUP_PATH.tar.gz"
    else
        print_warning "No existing deployment found. Skipping backup."
    fi
}

# Function to deploy application
deploy_application() {
    print_status "Deploying application..."
    
    # Copy files to deployment directory
    cp -r . "/opt/$APP_NAME/"
    cd "/opt/$APP_NAME"
    
    # Update nginx configuration with actual domain
    if [ "$DOMAIN" != "your-domain.com" ]; then
        sed -i "s/your-domain.com/$DOMAIN/g" nginx.conf
        sed -i "s/your-frontend-domain.com/$FRONTEND_DOMAIN/g" nginx.conf
    fi
    
    # Update environment files
    if [ "$DOMAIN" != "your-domain.com" ]; then
        sed -i "s/your-backend-domain.com/$DOMAIN/g" backend/.env.production
        sed -i "s/your-frontend-domain.com/$FRONTEND_DOMAIN/g" backend/.env.production
    fi
    
    # Update docker-compose.yml
    if [ "$DOMAIN" != "your-domain.com" ]; then
        sed -i "s/your-domain.com/$DOMAIN/g" docker-compose.yml
    fi
    
    # Build and start containers
    docker-compose build --no-cache
    docker-compose up -d
    
    print_success "Application deployed"
}

# Function to run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    # Wait for services to start
    sleep 30
    
    # Check if containers are running
    if ! docker-compose ps | grep -q "Up"; then
        print_error "Some containers are not running"
        docker-compose logs
        exit 1
    fi
    
    # Check backend health
    for i in {1..10}; do
        if curl -f http://localhost:3001/health > /dev/null 2>&1; then
            print_success "Backend health check passed"
            break
        fi
        
        if [ $i -eq 10 ]; then
            print_error "Backend health check failed"
            docker-compose logs backend
            exit 1
        fi
        
        print_status "Waiting for backend to start... (attempt $i/10)"
        sleep 5
    done
    
    # Check nginx
    if curl -f http://localhost/health > /dev/null 2>&1; then
        print_success "Nginx health check passed"
    else
        print_warning "Nginx health check failed"
    fi
    
    print_success "Health checks completed"
}

# Function to setup monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."
    
    # Create monitoring script
    cat > /usr/local/bin/monitor-app.sh << 'EOF'
#!/bin/bash
LOG_FILE="/var/log/monitoring.log"
APP_NAME="talk-live-app"

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Check if containers are running
if ! docker-compose -f "/opt/$APP_NAME/docker-compose.yml" ps | grep -q "Up"; then
    log_message "ERROR: Some containers are not running"
    # Send alert or restart containers
    docker-compose -f "/opt/$APP_NAME/docker-compose.yml" up -d
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    log_message "WARNING: Disk usage is ${DISK_USAGE}%"
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{print ($3/$2) * 100.0}')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    log_message "WARNING: Memory usage is ${MEMORY_USAGE}%"
fi

# Check application health
if ! curl -f http://localhost/health > /dev/null 2>&1; then
    log_message "ERROR: Application health check failed"
fi
EOF

    chmod +x /usr/local/bin/monitor-app.sh
    
    # Add to crontab
    if ! crontab -l | grep -q "monitor-app.sh"; then
        (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/monitor-app.sh") | crontab -
    fi
    
    print_success "Monitoring setup completed"
}

# Function to setup log rotation
setup_log_rotation() {
    print_status "Setting up log rotation..."
    
    cat > /etc/logrotate.d/$APP_NAME << EOF
/var/log/$APP_NAME/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        docker-compose -f /opt/$APP_NAME/docker-compose.yml restart nginx
    endscript
}
EOF
    
    print_success "Log rotation setup completed"
}

# Function to cleanup old backups
cleanup_old_backups() {
    print_status "Cleaning up old backups..."
    
    # Keep only last 7 backups
    find "$BACKUP_DIR" -name "$APP_NAME-*.tar.gz" -mtime +7 -delete
    
    print_success "Old backups cleaned up"
}

# Function to show deployment summary
show_summary() {
    print_success "Deployment completed successfully!"
    echo
    echo "Summary:"
    echo "- Application: $APP_NAME"
    echo "- Domain: $DOMAIN"
    echo "- SSL: $([ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] && echo "Enabled" || echo "Disabled")"
    echo "- Firewall: Enabled"
    echo "- Monitoring: Enabled"
    echo "- Log rotation: Enabled"
    echo
    echo "URLs:"
    echo "- Health check: http://localhost/health"
    echo "- Application: http://localhost"
    if [ "$DOMAIN" != "your-domain.com" ]; then
        echo "- Public URL: https://$DOMAIN"
    fi
    echo
    echo "Management commands:"
    echo "- View logs: docker-compose logs -f"
    echo "- Restart app: docker-compose restart"
    echo "- Stop app: docker-compose down"
    echo "- Update app: ./deploy.sh"
    echo
    echo "Important files:"
    echo "- Application: /opt/$APP_NAME"
    echo "- Logs: /var/log/$APP_NAME"
    echo "- Backups: $BACKUP_DIR"
}

# Main deployment function
main() {
    print_status "Starting Digital Ocean deployment..."
    log_message "Starting deployment"
    
    check_root
    check_prerequisites
    setup_firewall
    create_directories
    backup_deployment
    setup_ssl
    deploy_application
    run_health_checks
    setup_monitoring
    setup_log_rotation
    cleanup_old_backups
    show_summary
    
    log_message "Deployment completed successfully"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "backup")
        backup_deployment
        ;;
    "cleanup")
        cleanup_old_backups
        ;;
    "health")
        run_health_checks
        ;;
    "ssl")
        setup_ssl
        ;;
    "monitor")
        setup_monitoring
        ;;
    *)
        echo "Usage: $0 [deploy|backup|cleanup|health|ssl|monitor]"
        echo "  deploy  - Full deployment (default)"
        echo "  backup  - Create backup only"
        echo "  cleanup - Clean old backups"
        echo "  health  - Run health checks"
        echo "  ssl     - Setup SSL certificates"
        echo "  monitor - Setup monitoring"
        exit 1
        ;;
esac