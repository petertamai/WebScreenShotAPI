const Joi = require('joi');
const logger = require('../utils/logger');

// Validation schemas
const screenshotSchema = Joi.object({
    url: Joi.string()
        .required()
        .pattern(/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/)
        .message('URL must be a valid web address'),
    
    width: Joi.number()
        .integer()
        .min(320)
        .max(3840)
        .default(1366)
        .messages({
            'number.min': 'Width must be at least 320 pixels',
            'number.max': 'Width cannot exceed 3840 pixels'
        }),
    
    height: Joi.number()
        .integer()
        .min(240)
        .max(2160)
        .default(768)
        .messages({
            'number.min': 'Height must be at least 240 pixels',
            'number.max': 'Height cannot exceed 2160 pixels'
        }),
    
    type: Joi.string()
        .valid('full', 'top')
        .default('full')
        .messages({
            'any.only': 'Type must be either "full" or "top"'
        }),
    
    format: Joi.string()
        .valid('png', 'jpg', 'jpeg')
        .default('png')
        .messages({
            'any.only': 'Format must be png, jpg, or jpeg'
        }),
    
    quality: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(80)
        .messages({
            'number.min': 'Quality must be at least 1',
            'number.max': 'Quality cannot exceed 100'
        }),
    
    mobile: Joi.alternatives()
        .try(
            Joi.boolean(),
            Joi.string().valid('true', 'false')
        )
        .default(false)
        .messages({
            'alternatives.match': 'Mobile must be true or false'
        })
});

/**
 * Middleware to validate screenshot requests
 */
const validateScreenshotRequest = async (req, res, next) => {
    try {
        // Combine query and body parameters (body takes precedence)
        const requestData = {
            ...req.query,
            ...req.body
        };

        // Special handling for mobile parameter
        if (requestData.mobile !== undefined) {
            if (typeof requestData.mobile === 'string') {
                requestData.mobile = requestData.mobile.toLowerCase() === 'true';
            }
        }

        // Validate against schema
        const { error, value } = screenshotSchema.validate(requestData, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
        });

        if (error) {
            const validationErrors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context.value
            }));

            logger.warn('Validation failed', {
                errors: validationErrors,
                requestData,
                ip: req.ip
            });

            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'One or more request parameters are invalid',
                details: validationErrors,
                examples: {
                    get: '/api/screenshot?url=https://example.com&width=1366&type=full&quality=80',
                    post: {
                        url: 'https://example.com',
                        width: 1366,
                        height: 768,
                        type: 'top',
                        format: 'png',
                        quality: 80,
                        mobile: false
                    }
                },
                timestamp: new Date().toISOString()
            });
        }

        // Add validated data to request object
        req.validatedData = value;
        
        // Update req.query and req.body with validated values for backward compatibility
        if (req.method === 'GET') {
            req.query = value;
        } else {
            req.body = value;
        }

        logger.debug('Request validation successful', {
            originalData: requestData,
            validatedData: value,
            method: req.method,
            ip: req.ip
        });

        next();

    } catch (error) {
        logger.error('Validation middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal validation error',
            message: 'An error occurred while validating the request',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Custom validation for URLs with additional security checks
 */
const validateUrl = (url) => {
    try {
        // Basic URL validation
        const { error } = Joi.string().uri({ scheme: ['http', 'https'] }).validate(url);
        if (error) return false;

        const urlObj = new URL(url);
        
        // Security checks
        const blockedHosts = (process.env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
        const hostname = urlObj.hostname.toLowerCase();
        
        // Check for blocked hosts
        if (blockedHosts.some(blocked => hostname === blocked || hostname.endsWith('.' + blocked))) {
            logger.warn('Blocked host attempted', { url, hostname });
            return false;
        }

        // Check for private IP ranges (additional security)
        if (isPrivateIP(hostname)) {
            logger.warn('Private IP attempted', { url, hostname });
            return false;
        }

        // Check for suspicious patterns
        if (hostname.includes('..') || hostname.includes('%')) {
            logger.warn('Suspicious hostname pattern', { url, hostname });
            return false;
        }

        return true;

    } catch (error) {
        logger.error('URL validation error:', error);
        return false;
    }
};

/**
 * Check if hostname is a private IP address
 */
const isPrivateIP = (hostname) => {
    const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./,
        /^::1$/,
        /^fc00:/,
        /^fe80:/
    ];

    return privateRanges.some(range => range.test(hostname));
};

/**
 * Middleware to validate API keys (if enabled)
 */
const validateApiKey = (req, res, next) => {
    const apiKeysEnabled = process.env.API_KEYS_ENABLED === 'true';
    
    if (!apiKeysEnabled) {
        return next();
    }

    const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.body.apiKey;
    const validApiKeys = (process.env.VALID_API_KEYS || '').split(',').filter(Boolean);

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required',
            message: 'Please provide a valid API key in the x-api-key header or apiKey parameter',
            timestamp: new Date().toISOString()
        });
    }

    if (!validApiKeys.includes(apiKey)) {
        logger.warn('Invalid API key attempted', {
            apiKey: apiKey.substring(0, 8) + '...',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        return res.status(403).json({
            success: false,
            error: 'Invalid API key',
            message: 'The provided API key is not valid',
            timestamp: new Date().toISOString()
        });
    }

    logger.debug('API key validation successful', {
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip
    });

    next();
};

module.exports = {
    validateScreenshotRequest,
    validateUrl,
    validateApiKey,
    screenshotSchema
};