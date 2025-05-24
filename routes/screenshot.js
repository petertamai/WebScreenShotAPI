const express = require('express');
const router = express.Router();
const screenshotService = require('../services/screenshotService');
const { validateScreenshotRequest } = require('../middleware/validator');
const logger = require('../utils/logger');

/**
 * GET /api/screenshot
 * Takes a screenshot with query parameters
 */
router.get('/screenshot', validateScreenshotRequest, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const options = {
            url: req.query.url,
            width: req.query.width,
            height: req.query.height,
            type: req.query.type,
            format: req.query.format,
            quality: req.query.quality,
            isMobile: req.query.mobile
        };

        logger.info('GET screenshot request received', { 
            options, 
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const result = await screenshotService.takeScreenshot(options);
        const processingTime = Date.now() - startTime;

        // Set response headers
        res.set({
            'Content-Type': result.contentType,
            'Content-Length': Buffer.from(result.image, 'base64').length,
            'X-Processing-Time': `${processingTime}ms`,
            'X-Image-Width': result.dimensions?.width,
            'X-Image-Height': result.dimensions?.height,
            'X-Cached': result.cached,
            'Cache-Control': 'public, max-age=3600'
        });

        // Send base64 encoded image
        const imageBuffer = Buffer.from(result.image, 'base64');
        res.send(imageBuffer);

        logger.info('GET screenshot completed', {
            processingTime,
            imageSize: result.size,
            cached: result.cached,
            dimensions: result.dimensions
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        logger.error('GET screenshot failed', {
            error: error.message,
            processingTime,
            options: req.query
        });

        res.status(error.message.includes('Invalid URL') ? 400 : 
                  error.message.includes('Too many') ? 429 : 500)
           .json({
               error: 'Screenshot generation failed',
               message: error.message,
               processingTime,
               timestamp: new Date().toISOString()
           });
    }
});

/**
 * POST /api/screenshot
 * Takes a screenshot with JSON body parameters
 */
router.post('/screenshot', validateScreenshotRequest, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const options = {
            url: req.body.url || req.query.url,
            width: req.body.width || req.query.width,
            height: req.body.height || req.query.height,
            type: req.body.type || req.query.type,
            format: req.body.format || req.query.format,
            quality: req.body.quality || req.query.quality,
            isMobile: req.body.mobile || req.query.mobile
        };

        logger.info('POST screenshot request received', { 
            options, 
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const result = await screenshotService.takeScreenshot(options);
        const processingTime = Date.now() - startTime;

        // Response format based on Accept header
        const acceptsJson = req.accepts(['json', 'image/*']) === 'json';

        if (acceptsJson) {
            // JSON response with base64 image
            res.set({
                'Content-Type': 'application/json',
                'X-Processing-Time': `${processingTime}ms`,
                'X-Cached': result.cached
            });

            res.json({
                success: true,
                data: {
                    image: result.image,
                    contentType: result.contentType,
                    size: result.size,
                    dimensions: result.dimensions,
                    cached: result.cached,
                    processingTime
                },
                timestamp: new Date().toISOString()
            });
        } else {
            // Binary image response
            res.set({
                'Content-Type': result.contentType,
                'Content-Length': Buffer.from(result.image, 'base64').length,
                'X-Processing-Time': `${processingTime}ms`,
                'X-Image-Width': result.dimensions?.width,
                'X-Image-Height': result.dimensions?.height,
                'X-Cached': result.cached,
                'Cache-Control': 'public, max-age=3600'
            });

            const imageBuffer = Buffer.from(result.image, 'base64');
            res.send(imageBuffer);
        }

        logger.info('POST screenshot completed', {
            processingTime,
            imageSize: result.size,
            cached: result.cached,
            dimensions: result.dimensions,
            responseType: acceptsJson ? 'json' : 'binary'
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        logger.error('POST screenshot failed', {
            error: error.message,
            processingTime,
            options: req.body
        });

        res.status(error.message.includes('Invalid URL') ? 400 : 
                  error.message.includes('Too many') ? 429 : 500)
           .json({
               success: false,
               error: 'Screenshot generation failed',
               message: error.message,
               processingTime,
               timestamp: new Date().toISOString()
           });
    }
});

/**
 * GET /api/screenshot/stats
 * Get service statistics
 */
router.get('/screenshot/stats', (req, res) => {
    try {
        const stats = screenshotService.getStats();
        
        res.json({
            success: true,
            data: {
                ...stats,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid,
                nodeVersion: process.version
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Stats request failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve stats',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;