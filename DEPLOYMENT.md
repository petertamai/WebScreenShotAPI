# Deployment Guide - EasyPanel & Ubuntu Server

This guide covers deployment of the Screenshot Service on Ubuntu Server 22.04 using EasyPanel with GitHub integration.

## 🐳 EasyPanel Deployment (Recommended)

### Prerequisites
- EasyPanel dashboard access
- GitHub repository with the screenshot service code
- Ubuntu 22.04 server

### Step 1: GitHub Repository Setup

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial screenshot service setup"
   git remote add origin https://github.com/yourusername/screenshot-service.git
   git push -u origin main
   ```

### Step 2: EasyPanel Configuration

1. **Create New Service in EasyPanel**:
   - Go to your EasyPanel dashboard
   - Click "Create Service"
   - Choose "GitHub" as source

2. **Repository Settings**:
   - Repository: `yourusername/screenshot-service`
   - Branch: `main`
   - Build context: `/` (root)

3. **Docker Configuration**:
   - Dockerfile path: `Dockerfile` (or `Dockerfile.ubuntu` for Ubuntu base)
   - Port: `3000`

4. **Environment Variables** (Add these in EasyPanel):
   ```bash
   NODE_ENV=production
   PORT=3000
   CHROMIUM_PATH=/usr/bin/chromium-browser
   DEFAULT_WIDTH=1366
   DEFAULT_HEIGHT=768
   DEFAULT_QUALITY=80
   MAX_CONCURRENT_REQUESTS=3
   MAX_BROWSERS=2
   RATE_LIMIT_MAX_REQUESTS=30
   ENABLE_CACHE=true
   LOG_LEVEL=info
   ```

5. **Resource Limits** (Recommended):
   - Memory: 1GB - 2GB
   - CPU: 1-2 cores

### Step 3: Deploy

1. Click "Deploy" in EasyPanel
2. Monitor the build logs
3. Once deployed, test the health endpoint

## 🖥️ Direct Ubuntu Server Deployment

### Option 1: Using Docker

1. **Install Docker**:
   ```bash
   sudo apt update
   sudo apt install docker.io docker-compose
   sudo systemctl start docker
   sudo systemctl enable docker
   ```

2. **Clone and build**:
   ```bash
   git clone https://github.com/yourusername/screenshot-service.git
   cd screenshot-service
   docker build -t screenshot-service .
   ```

3. **Run container**:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e CHROMIUM_PATH=/usr/bin/chromium-browser \
     --name screenshot-service \
     --restart unless-stopped \
     screenshot-service
   ```

### Option 2: Direct Installation

1. **Install Node.js 18+**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install Chromium and dependencies**:
   ```bash
   # Run the automated setup script
   npm run setup:ubuntu
   
   # Or manually:
   sudo apt update
   sudo apt install -y chromium-browser fonts-liberation libappindicator1
   ```

3. **Install and start the service**:
   ```bash
   git clone https://github.com/yourusername/screenshot-service.git
   cd screenshot-service
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   
   # Install PM2 for process management
   sudo npm install -g pm2
   npm run pm2:start
   
   # Setup PM2 to start on boot
   pm2 startup
   pm2 save
   ```

## 🧪 Testing Your Deployment

### Health Check
```bash
curl http://your-server:3000/health
```

### Screenshot Test
```bash
# GET request
curl "http://your-server:3000/api/screenshot?url=https://example.com&width=800&type=top" -o test.png

# POST request
curl -X POST http://your-server:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "width": 800, "type": "top"}' \
  -H "Accept: application/json"
```

## 🔧 Troubleshooting

### Common Issues

1. **Chromium not found**:
   ```bash
   # Check if Chromium is installed
   which chromium-browser
   
   # Install if missing
   sudo apt install chromium-browser
   ```

2. **Permission denied**:
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER /path/to/screenshot-service
   chmod +x scripts/install-chromium-ubuntu.sh
   ```

3. **Memory issues**:
   ```bash
   # Check memory usage
   free -h
   
   # Reduce concurrent requests in .env
   MAX_CONCURRENT_REQUESTS=1
   MAX_BROWSERS=1
   ```

4. **Docker build fails**:
   ```bash
   # Use Ubuntu-based Dockerfile
   docker build -f Dockerfile.ubuntu -t screenshot-service .
   ```

### Performance Optimization

**For low-memory servers (< 2GB RAM)**:
```bash
MAX_CONCURRENT_REQUESTS=1
MAX_BROWSERS=1
BROWSER_TIMEOUT_MS=30000
BLOCKED_RESOURCES=font,media,other,image
MEMORY_THRESHOLD=0.75
```

**For high-traffic servers**:
```bash
MAX_CONCURRENT_REQUESTS=5
MAX_BROWSERS=3
ENABLE_CACHE=true
RATE_LIMIT_MAX_REQUESTS=60
```

## 🚀 Auto-deployment with GitHub

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Server

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.4
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.KEY }}
        script: |
          cd /path/to/screenshot-service
          git pull origin main
          npm install
          pm2 restart screenshot-service
```

## 📊 Monitoring

### PM2 Monitoring
```bash
pm2 monit
pm2 logs screenshot-service
pm2 show screenshot-service
```

### Health Monitoring
Set up a cron job to monitor the service:
```bash
# Add to crontab (crontab -e)
*/5 * * * * curl -f http://localhost:3000/health || systemctl restart screenshot-service
```

## 🔒 Security Considerations

1. **Firewall setup**:
   ```bash
   sudo ufw allow 3000
   sudo ufw enable
   ```

2. **Reverse proxy with Nginx** (recommended):
   ```bash
   sudo apt install nginx
   # Configure Nginx to proxy to localhost:3000
   ```

3. **Enable API keys** (optional):
   ```bash
   API_KEYS_ENABLED=true
   VALID_API_KEYS=your-secret-key-1,your-secret-key-2
   ```

---

**Support**: If you encounter issues, check the logs directory and the health endpoint for diagnostics.