# Use the official Node.js 18 image with Alpine Linux
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# Install system dependencies required for Chromium and Sharp
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ttf-liberation \
    ttf-dejavu \
    fontconfig \
    vips-dev \
    build-base \
    python3 \
    make \
    g++ \
    libc6-compat \
    udev \
    && rm -rf /var/cache/apk/*

# Verify Chromium installation
RUN chromium-browser --version

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S screenshot -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs && chown -R screenshot:nodejs logs

# Create .env file from example if it doesn't exist
RUN if [ ! -f .env ]; then cp .env.example .env; fi

# Set ownership of the app directory
RUN chown -R screenshot:nodejs /usr/src/app

# Switch to non-root user
USER screenshot

# Expose the port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "app.js"]