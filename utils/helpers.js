const logger = require('./logger');

/**
 * Format URL to ensure it has a protocol
 * @param {string} url - The URL to format
 * @returns {string} - Formatted URL with protocol
 */
const formatUrl = (url) => {
    if (!url) {
        throw new Error('URL is required');
    }

    // Remove any whitespace
    url = url.trim();

    // Check if URL already has a protocol
    if (url.match(/^https?:\/\//i)) {
        return url;
    }

    // Add https by default
    return `https://${url}`;
};

/**
 * Validate URL format and security
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
const validateUrl = (url) => {
    try {
        const urlObj = new URL(url);
        
        // Check protocol
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return false;
        }

        // Check for blocked domains
        const blockedDomains = (process.env.BLOCKED_DOMAINS || '').split(',').filter(Boolean);
        const hostname = urlObj.hostname.toLowerCase();
        
        if (blockedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
            logger.security('Blocked domain access attempted', { url, hostname });
            return false;
        }

        // Check for localhost and private IPs
        const localhostPatterns = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '::1',
            /^10\./,
            /^172\.(1[6-9]|2\d|3[01])\./,
            /^192\.168\./,
            /^169\.254\./
        ];

        if (localhostPatterns.some(pattern => {
            if (typeof pattern === 'string') {
                return hostname === pattern;
            }
            return pattern.test(hostname);
        })) {
            logger.security('Private IP/localhost access attempted', { url, hostname });
            return false;
        }

        return true;
    } catch (error) {
        logger.warn('URL validation failed', { url, error: error.message });
        return false;
    }
};

/**
 * Sanitise filename for safe usage
 * @param {string} filename - The filename to sanitise
 * @returns {string} - Sanitised filename
 */
const sanitiseFilename = (filename) => {
    return filename
        .replace(/[^a-z0-9.-]/gi, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
};

/**
 * Convert bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} - Human readable size
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Generate a unique request ID
 * @returns {string} - Unique request ID
 */
const generateRequestId = () => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the delay
 */
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Promise that resolves with the function result
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (i === maxRetries) {
                break;
            }

            const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
            logger.warn(`Retry attempt ${i + 1}/${maxRetries} failed, retrying in ${delay}ms`, {
                error: error.message,
                attempt: i + 1,
                maxRetries,
                delay
            });
            
            await sleep(delay);
        }
    }

    throw lastError;
};

/**
 * Create a timeout promise
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Timeout error message
 * @returns {Promise} - Promise that rejects after timeout
 */
const createTimeout = (ms, message = 'Operation timed out') => {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
};

/**
 * Race a promise against a timeout
 * @param {Promise} promise - Promise to race
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Timeout error message
 * @returns {Promise} - Promise that resolves/rejects with the first result
 */
const promiseWithTimeout = (promise, timeoutMs, timeoutMessage) => {
    return Promise.race([
        promise,
        createTimeout(timeoutMs, timeoutMessage)
    ]);
};

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} - Cloned object
 */
const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }
    
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
};

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 * @param {*} value - Value to check
 * @returns {boolean} - Whether the value is empty
 */
const isEmpty = (value) => {
    if (value === null || value === undefined) {
        return true;
    }
    
    if (typeof value === 'string' || Array.isArray(value)) {
        return value.length === 0;
    }
    
    if (typeof value === 'object') {
        return Object.keys(value).length === 0;
    }
    
    return false;
};

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
const throttle = (func, limit) => {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} - Client IP address
 */
const getClientIP = (req) => {
    return req.ip ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'unknown';
};

/**
 * Parse user agent string
 * @param {string} userAgent - User agent string
 * @returns {Object} - Parsed user agent information
 */
const parseUserAgent = (userAgent) => {
    if (!userAgent) {
        return { browser: 'unknown', os: 'unknown', device: 'unknown' };
    }

    const browser = userAgent.includes('Chrome') ? 'Chrome' :
                   userAgent.includes('Firefox') ? 'Firefox' :
                   userAgent.includes('Safari') ? 'Safari' :
                   userAgent.includes('Edge') ? 'Edge' : 'unknown';

    const os = userAgent.includes('Windows') ? 'Windows' :
              userAgent.includes('Mac') ? 'macOS' :
              userAgent.includes('Linux') ? 'Linux' :
              userAgent.includes('Android') ? 'Android' :
              userAgent.includes('iOS') ? 'iOS' : 'unknown';

    const device = userAgent.includes('Mobile') ? 'mobile' :
                  userAgent.includes('Tablet') ? 'tablet' : 'desktop';

    return { browser, os, device };
};

/**
 * Hash string using simple hash function
 * @param {string} str - String to hash
 * @returns {string} - Hashed string
 */
const simpleHash = (str) => {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString();
};

module.exports = {
    formatUrl,
    validateUrl,
    sanitiseFilename,
    formatBytes,
    generateRequestId,
    sleep,
    retryWithBackoff,
    createTimeout,
    promiseWithTimeout,
    deepClone,
    isEmpty,
    debounce,
    throttle,
    getClientIP,
    parseUserAgent,
    simpleHash
};