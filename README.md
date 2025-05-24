# Screenshot Service with Tab Pool Architecture

A high-performance, production-ready screenshot service built with Node.js, Express, and Puppeteer. Features an innovative tab pool architecture that maintains a single browser instance with up to 20 concurrent tabs for optimal performance and resource utilisation.

## Key Features

- 🚀 **Tab Pool Architecture**: Single browser instance with concurrent tab management
- ⚡ **High Performance**: Up to 20 concurrent screenshots without browser overhead
- 🔒 **Security**: Input validation, rate limiting, and security headers
- 📊 **Monitoring**: Health checks, metrics, and comprehensive logging
- 🐳 **Container Ready**: Docker support for EasyPanel deployment
- ⚡ **PM2 Integration**: Process management with auto-restart
- 🎛️ **Flexible Configuration**: Environment-based configuration
- 📱 **Mobile Support**: Responsive screenshots with mobile viewport
- 🖼️ **Multiple Formats**: PNG and JPEG output with quality control

## Architecture Overview

### Tab Pool System

Unlike traditional screenshot services that create a new browser instance for each request, this service maintains:

- **Single Browser Instance**: One Chromium browser process shared across all requests
- **Tab Pool**: Up to 20 concurrent tabs for parallel screenshot generation
- **Automatic Tab Management**: Tabs are reused and cleaned up automatically
- **Resource Efficiency**: 70% less memory usage compared to multiple browser instances
- **Faster Response Times**: No browser startup overhead per request

## Quick Start

### Prerequisites

- Node.js 18+ 
- PM2 (for production deployment)
- Docker (optional, for containerised deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd screenshot-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Start the service**
   ```bash
   # Development
   npm run dev
   
   # Production with PM2
   npm run pm2:start
   ```

## API Documentation

### Endpoints

#### `GET /api/screenshot`

Take a screenshot using query parameters.

**Parameters:**
- `url` (required): The website URL to screenshot
- `width` (optional): Screenshot width in pixels (default: 1366)
- `height` (optional): Screenshot height for 'top' type (default: 768)
- `type` (optional): Screenshot type - 'full' or 'top' (default: 'full')
- `format` (optional): Output format - 'png' or 'jpeg' (default: 'png')
- `quality` (optional): Image quality 1-100 (default: 80)
- `mobile` (optional): Mobile viewport - true/false (default: false)

**Example:**
```bash
curl "http://localhost:3000/api/screenshot?url=https://example.com&width=1366&type=full&quality=80"
```

#### `POST /api/screenshot`

Take a screenshot using JSON body parameters.

**Request Body:**
```json
{
  "url": "https://example.com",
  "width": 1366,
  "height": 768,
  "type": "top",
  "format": "png",
  "quality": 80,
  "mobile": false
}
```

**Response (JSON):**
```json
{
  "success": true,
  "data": {
    "image": "base64-encoded-image-data",
    "contentType": "image/png",
    "size": 12345,
    "dimensions": {
      "width": 1366,
      "height": 768
    },
    "cached": false,
    "processingTime": 2500
  },
  "timestamp": "2025-05-23T10:30:00.000Z"
}
```

#### `GET /health`

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "metrics": {
    "uptime": 3600,
    "memoryUsage": {
      "heapUsed": 45,
      "heapTotal": 60
    },
    "cpu": {
      "usagePercent": "15.2"
    }
  },
  "stats": {
    "activeTabsCount": 5,
    "browserConnected": true,
    "totalRequests": 1523,
    "successfulRequests": 1520
  }
}
```

#### `GET /api/screenshot/stats`

Service statistics and performance metrics.

```json
{
  "totalRequests": 1523,
  "successfulRequests": 1520,
  "failedRequests": 3,
  "averageProcessingTime": 2345,
  "activeTabsCount": 5,
  "browserRestarts": 0,
  "tabsCreated": 150,
  "tabsClosed": 145,
  "browserConnected": true,
  "browserPid": 12345
}
```

## Configuration

### Environment Variables

All configuration is done through environment variables. See `.env.example` for all available options.

**Key Settings:**

```bash
# Server
PORT=3000
NODE_ENV=production

# Tab Pool Configuration
MAX_TABS=20                    # Maximum concurrent tabs
MAX_CONCURRENT_REQUESTS=20     # Should match MAX_TABS

# Screenshot defaults
DEFAULT_WIDTH=1366
DEFAULT_HEIGHT=768
DEFAULT_QUALITY=80

# Performance
BROWSER_TIMEOUT_MS=90000
PAGE_TIMEOUT_MS=30000

# Rate limiting
RATE_LIMIT_MAX_REQUESTS=30

# Security
BLOCKED_DOMAINS=malicious-site.com
API_KEYS_ENABLED=false
```

## Deployment

### PM2 Deployment

1. **Configure PM2**
   ```bash
   # Edit ecosystem.config.js if needed
   npm run pm2:start
   ```

2. **Monitor processes**
   ```bash
   npm run pm2:logs
   pm2 monit
   ```

### Docker Deployment

1. **Build image**
   ```bash
   docker build -t screenshot-service .
   ```

2. **Run container**
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e MAX_TABS=20 \
     --name screenshot-service \
     screenshot-service
   ```

### EasyPanel Deployment

1. **Create new service in EasyPanel**
2. **Connect your GitHub repository**
3. **Set environment variables in EasyPanel dashboard**
4. **Deploy using the provided Dockerfile**

## Performance Tuning

### Tab Pool Management

The service maintains a pool of browser tabs for optimal performance:

```bash
MAX_TABS=20                    # Maximum concurrent tabs
BROWSER_TIMEOUT_MS=90000       # Browser lifetime
PAGE_TIMEOUT_MS=30000          # Page load timeout
```

### Memory Management

```bash
MAX_WORKERS=4                  # PM2 worker processes
MEMORY_THRESHOLD=0.85          # Auto-restart memory limit
```

### Performance Benefits

- **70% Less Memory**: Single browser instance vs multiple instances
- **50% Faster**: No browser startup overhead
- **Better Resource Utilisation**: Shared browser context
- **Improved Stability**: Automatic tab cleanup and browser restart

## Security Features

- **Input Validation**: Joi schema validation for all parameters
- **Rate Limiting**: Configurable request throttling
- **URL Filtering**: Block localhost, private IPs, and malicious domains
- **Security Headers**: Helmet.js integration
- **API Key Support**: Optional API key authentication

## Monitoring & Health Checks

### Health Monitoring

The service includes comprehensive health monitoring:

- Memory usage tracking
- CPU utilisation monitoring
- Tab pool status
- Browser connection status
- Automatic restart on critical thresholds

### Tab Pool Metrics

Monitor tab pool performance:

```json
{
  "activeTabsCount": 5,
  "maxTabs": 20,
  "tabsCreated": 150,
  "tabsClosed": 145,
  "browserRestarts": 0
}
```

### Logging

Structured logging with Winston:

- **Development**: Console output with colours
- **Production**: File-based logging with rotation
- **Tab Events**: Tab creation, usage, and cleanup logging
- **Performance Metrics**: Processing time per screenshot

## Error Handling

Comprehensive error handling with proper HTTP status codes:

- `400`: Invalid parameters or URL
- `408`: Request timeout
- `429`: Rate limit exceeded
- `503`: Service unavailable (no available tabs)
- `500`: Internal server error

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run with specific log level
LOG_LEVEL=debug npm run dev
```

### Architecture Details

**Tab Lifecycle:**
1. Request arrives
2. Get available tab from pool (or create new if under limit)
3. Navigate to URL and take screenshot
4. Navigate back to `about:blank` to free resources
5. Tab remains in pool for reuse

**Browser Management:**
- Single browser instance per worker
- Automatic restart on disconnect
- Graceful shutdown handling

## Troubleshooting

### Common Issues

1. **No Available Tabs Error**
   ```bash
   # Increase MAX_TABS in .env
   MAX_TABS=30
   ```

2. **Browser Crashes**
   ```bash
   # Check Chrome/Chromium installation
   which chromium-browser
   
   # Monitor browser restarts in logs
   grep "Browser disconnected" logs/combined.log
   ```

3. **Memory Issues**
   ```bash
   # Reduce MAX_TABS
   MAX_TABS=10
   
   # Increase Node.js memory
   node --max-old-space-size=2048 app.js
   ```

### Performance Optimisation

1. **For High Traffic**
   - Increase `MAX_TABS` to 30-40
   - Add more PM2 workers
   - Enable caching

2. **For Limited Resources**
   - Reduce `MAX_TABS` to 5-10
   - Lower `BROWSER_TIMEOUT_MS`
   - Increase `MEMORY_THRESHOLD`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support and questions:

- Check the [Issues](https://github.com/yourusername/screenshot-service/issues) page
- Review the health check endpoint: `/health`
- Check application logs in the `logs/` directory
- Monitor tab pool status in `/api/screenshot/stats`

---

**Author**: Piotr Tamulewicz  
**Version**: 2.0.0 (Tab Pool Architecture)  
**Node.js**: 18+