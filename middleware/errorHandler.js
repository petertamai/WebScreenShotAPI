const logger = require('../utils/logger');

/**
 * Global error handling middleware
 */
const errorHandler = (error, req, res, next) => {
    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
        return next(error);
    }

    // Log the error with context
    const errorContext = {
        message: error.message,
        stack: error.stack,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown'
    };

    // Determine error type and appropriate status code
    let statusCode = 500;
    let errorType = 'INTERNAL_SERVER_ERROR';
    let userMessage = 'An internal server error occurred';

    if (error.name === 'ValidationError') {
        statusCode = 400;
        errorType = 'VALIDATION_ERROR';
        userMessage = 'Invalid request parameters';
    } else if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        statusCode = 408;
        errorType = 'TIMEOUT_ERROR';
        userMessage = 'Request timed out. Please try again.';
    } else if (error.message.includes('Too many')) {
        statusCode = 429;
        errorType = 'RATE_LIMIT_ERROR';
        userMessage = error.message;
    } else if (error.message.includes('Invalid URL') || error.message.includes('URL')) {
        statusCode = 400;
        errorType = 'INVALID_URL_ERROR';
        userMessage = 'Invalid or inaccessible URL provided';
    } else if (error.message.includes('Browser') || error.message.includes('page')) {
        statusCode = 503;
        errorType = 'SERVICE_UNAVAILABLE';
        userMessage = 'Screenshot service temporarily unavailable. Please try again.';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        statusCode = 400;
        errorType = 'CONNECTION_ERROR';
        userMessage = 'Unable to reach the specified URL';
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        statusCode = 504;
        errorType = 'GATEWAY_TIMEOUT';
        userMessage = 'Connection to the target URL timed out';
    }

    // Log based on severity
    if (statusCode >= 500) {
        logger.error('Server error occurred', errorContext);
    } else if (statusCode >= 400) {
        logger.warn('Client error occurred', errorContext);
    }

    // Prepare error response
    const errorResponse = {
        success: false,
        error: {
            type: errorType,
            message: userMessage,
            statusCode
        },
        timestamp: new Date().toISOString()
    };

    // Add additional details in development mode
    if (process.env.NODE_ENV === 'development') {
        errorResponse.debug = {
            originalMessage: error.message,
            stack: error.stack,
            requestDetails: {
                method: req.method,
                url: req.originalUrl,
                headers: req.headers,
                query: req.query,
                body: req.body
            }
        };
    }

    // Add request ID if available
    if (req.id) {
        errorResponse.requestId = req.id;
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
    const errorResponse = {
        success: false,
        error: {
            type: 'NOT_FOUND',
            message: `The requested endpoint ${req.originalUrl} was not found`,
            statusCode: 404
        },
        availableEndpoints: [
            'GET /health',
            'GET /health/detailed',
            'GET /api/screenshot',
            'POST /api/screenshot',
            'GET /api/screenshot/stats'
        ],
        timestamp: new Date().toISOString()
    };

    logger.warn('404 Not Found', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    res.status(404).json(errorResponse);
};

/**
 * Async error wrapper for route handlers
 */
const asyncErrorWrapper = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Custom error classes
 */
class ScreenshotError extends Error {
    constructor(message, statusCode = 500, type = 'SCREENSHOT_ERROR') {
        super(message);
        this.name = 'ScreenshotError';
        this.statusCode = statusCode;
        this.type = type;
    }
}

class ValidationError extends Error {
    constructor(message, details = null) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        this.type = 'VALIDATION_ERROR';
        this.details = details;
    }
}

class RateLimitError extends Error {
    constructor(message = 'Too many requests') {
        super(message);
        this.name = 'RateLimitError';
        this.statusCode = 429;
        this.type = 'RATE_LIMIT_ERROR';
    }
}

class TimeoutError extends Error {
    constructor(message = 'Request timed out') {
        super(message);
        this.name = 'TimeoutError';
        this.statusCode = 408;
        this.type = 'TIMEOUT_ERROR';
    }
}

/**
 * Error monitoring and alerting
 */
const monitorErrors = (error, context) => {
    // Count error occurrences
    if (!global.errorCounts) {
        global.errorCounts = new Map();
    }

    const errorKey = `${error.name}:${error.message.substring(0, 50)}`;
    const count = global.errorCounts.get(errorKey) || 0;
    global.errorCounts.set(errorKey, count + 1);

    // Alert on repeated errors
    if (count > 10 && count % 10 === 0) {
        logger.error('Repeated error detected', {
            errorKey,
            count,
            context,
            needsInvestigation: true
        });
    }

    // Clean up old error counts periodically
    if (Math.random() < 0.01) { // 1% chance
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        
        for (const [key, data] of global.errorCounts.entries()) {
            if (data.lastSeen < oneHourAgo) {
                global.errorCounts.delete(key);
            }
        }
    }
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncErrorWrapper,
    ScreenshotError,
    ValidationError,
    RateLimitError,
    TimeoutError,
    monitorErrors
};