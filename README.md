# Screenshot Service

A high-performance, production-ready screenshot service built with Node.js, Express, and Puppeteer. Designed for scalability, reliability, and ease of deployment.

## Features

- 🚀 **High Performance**: Clustering, browser pooling, and intelligent caching
- 🔒 **Security**: Input validation, rate limiting, and security headers
- 📊 **Monitoring**: Health checks, metrics, and comprehensive logging
- 🐳 **Container Ready**: Docker support for EasyPanel deployment
- ⚡ **PM2 Integration**: Process management with auto-restart
- 🎛️ **Flexible Configuration**: Environment-based configuration
- 📱 **Mobile Support**: Responsive screenshots with mobile viewport
- 🖼️ **Multiple Formats**: PNG and JPEG output with quality control

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
  }
}
```

#### `GET /api/screenshot/stats`

Service statistics and performance metrics.

## Configuration

### Environment Variables

All configuration is done through environment variables. See `.env.example` for all available options.

**Key Settings:**

```bash
# Server
PORT=3000
NODE_ENV=production

# Screenshot defaults
DEFAULT_WIDTH=1366
DEFAULT_HEIGHT=768
DEFAULT_QUALITY=80

# Performance
MAX_CONCURRENT_REQUESTS=5
MAX_BROWSERS=3
BROWSER_TIMEOUT_MS=90000

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
     --name screenshot-service \
     screenshot-service
   ```

### EasyPanel Deployment

1. **Create new service in EasyPanel**
2. **Connect your GitHub repository**
3. **Set environment variables in EasyPanel dashboard**
4. **Deploy using the provided Dockerfile**

## Performance Tuning

### Browser Pool Management

The service maintains a pool of browser instances for optimal performance:

```bash
MAX_BROWSERS=3                 # Maximum browser instances
BROWSER_TIMEOUT_MS=90000       # Browser lifetime
MAX_CONCURRENT_REQUESTS=5      # Concurrent screenshot limit
```

### Memory Management

```bash
MAX_WORKERS=4                  # PM2 worker processes
MEMORY_THRESHOLD=0.85          # Auto-restart memory limit
```

### Caching

Enable intelligent caching to improve response times:

```bash
ENABLE_CACHE=true             # Enable screenshot caching
```

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
- Automatic restart on critical thresholds
- Browser pool health checks

### Logging

Structured logging with Winston:

- **Development**: Console output with colours
- **Production**: File-based logging with rotation
- **Access logs**: HTTP request logging
- **Error aggregation**: Error pattern detection

### Metrics

Performance metrics available at `/api/screenshot/stats`:

- Active requests count
- Browser pool status
- Cache hit rates
- System resource usage

## Error Handling

Comprehensive error handling with proper HTTP status codes:

- `400`: Invalid parameters or URL
- `408`: Request timeout
- `429`: Rate limit exceeded
- `503`: Service unavailable
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

### Adding Features

The modular architecture makes it easy to extend:

- **Routes**: Add new endpoints in `routes/`
- **Services**: Business logic in `services/`
- **Middleware**: Request processing in `middleware/`
- **Utilities**: Helper functions in `utils/`

## Troubleshooting

### Common Issues

1. **Browser Launch Fails**
   ```bash
   # Check Chrome/Chromium installation
   which chromium-browser
   
   # Verify dependencies
   ldd $(which chromium-browser)
   ```

2. **Memory Issues**
   ```bash
   # Increase memory limits
   node --max-old-space-size=2048 app.js
   ```

3. **Permission Errors**
   ```bash
   # Check file permissions
   ls -la logs/
   
   # Fix ownership
   chown -R node:node logs/
   ```

### Performance Issues

1. **Slow Screenshots**
   - Reduce `MAX_CONCURRENT_REQUESTS`
   - Increase `BROWSER_TIMEOUT_MS`
   - Enable caching

2. **High Memory Usage**
   - Reduce `MAX_BROWSERS`
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

---

**Author**: Piotr Tamulewicz  
**Version**: 1.0.0  
**Node.js**: 18+