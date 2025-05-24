const winston = require('winston');
const path = require('path');

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta, null, 2)}`;
        }
        
        return logMessage;
    })
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let logMessage = `${timestamp} ${level}: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta)}`;
        }
        
        return logMessage;
    })
);

// Create transports array
const transports = [];

// Console transport (always enabled)
transports.push(
    new winston.transports.Console({
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.NODE_ENV === 'development' ? consoleFormat : logFormat,
        handleExceptions: true,
        handleRejections: true
    })
);

// File transports (only in production or when explicitly enabled)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
    const logDir = process.env.LOG_DIR || './logs';
    
    // Ensure log directory exists
    const fs = require('fs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // Combined log file
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            level: 'info',
            format: logFormat,
            maxsize: 50 * 1024 * 1024, // 50MB
            maxFiles: 5,
            tailable: true
        })
    );

    // Error log file
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            format: logFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true
        })
    );

    // Access log file for HTTP requests
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'access.log'),
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            maxsize: 100 * 1024 * 1024, // 100MB
            maxFiles: 10,
            tailable: true
        })
    );
}

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
        service: 'screenshot-service',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        hostname: require('os').hostname()
    },
    transports,
    exitOnError: false
});

// Performance logging utility
logger.performance = (label, startTime) => {
    const duration = Date.now() - startTime;
    logger.info(`Performance: ${label}`, {
        duration: `${duration}ms`,
        performanceMetric: true
    });
    return duration;
};

// Request logging utility
logger.request = (req, res, duration) => {
    const logData = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: res.get('Content-Length'),
        requestType: 'http'
    };

    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode}`, logData);
};

// Security logging utility
logger.security = (event, details = {}) => {
    logger.warn(`Security Event: ${event}`, {
        ...details,
        securityEvent: true,
        timestamp: new Date().toISOString()
    });
};

// Business logic logging utility
logger.business = (event, details = {}) => {
    logger.info(`Business Event: ${event}`, {
        ...details,
        businessEvent: true,
        timestamp: new Date().toISOString()
    });
};

// Health check logging utility
logger.health = (status, metrics = {}) => {
    logger.info(`Health Check: ${status}`, {
        ...metrics,
        healthCheck: true,
        timestamp: new Date().toISOString()
    });
};

// Screenshot specific logging utility
logger.screenshot = (action, details = {}) => {
    logger.info(`Screenshot: ${action}`, {
        ...details,
        screenshotEvent: true,
        timestamp: new Date().toISOString()
    });
};

// Error aggregation for monitoring
let errorCounts = new Map();
let lastErrorReport = Date.now();

const originalError = logger.error;
logger.error = function(message, meta = {}) {
    // Call original error method
    originalError.call(this, message, meta);
    
    // Aggregate errors for monitoring
    const errorKey = typeof message === 'string' ? message : JSON.stringify(message);
    const count = errorCounts.get(errorKey) || 0;
    errorCounts.set(errorKey, count + 1);
    
    // Report error aggregation every 5 minutes
    const now = Date.now();
    if (now - lastErrorReport > 300000) { // 5 minutes
        if (errorCounts.size > 0) {
            logger.info('Error Summary Report', {
                errorCounts: Object.fromEntries(errorCounts),
                totalErrors: Array.from(errorCounts.values()).reduce((a, b) => a + b, 0),
                reportType: 'errorAggregation'
            });
        }
        errorCounts.clear();
        lastErrorReport = now;
    }
};

// Graceful shutdown logging
logger.shutdown = () => {
    logger.info('Logger shutting down gracefully');
    return new Promise((resolve) => {
        // Wait for any pending writes
        setTimeout(() => {
            winston.loggers.close();
            resolve();
        }, 1000);
    });
};

// Log system startup
logger.info('Logger initialised', {
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
    fileLogging: process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true',
    transportsCount: transports.length
});

module.exports = logger;