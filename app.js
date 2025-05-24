const cluster = require('cluster');
const os = require('os');
require('dotenv').config();
require('express-async-errors');

const numCPUs = os.cpus().length;
const isDevelopment = process.env.NODE_ENV === 'development';

if (cluster.isMaster && !isDevelopment) {
    console.log(`Master ${process.pid} is running`);
    
    // Fork workers
    const workerCount = Math.min(numCPUs, parseInt(process.env.MAX_WORKERS) || 4);
    for (let i = 0; i < workerCount; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        console.log('Starting a new worker');
        cluster.fork();
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Master received SIGTERM, shutting down gracefully');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    });
} else {
    // Worker process
    const express = require('express');
    const helmet = require('helmet');
    const compression = require('compression');
    const cors = require('cors');
    const rateLimit = require('express-rate-limit');
    
    const logger = require('./utils/logger');
    const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
    const screenshotRoutes = require('./routes/screenshot');
    const healthRoutes = require('./routes/health');

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        credentials: true
    }));

    // Compression middleware
    app.use(compression());

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    const limiter = rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30, // 30 requests per minute
        message: {
            error: 'Too many requests from this IP, please try again later.',
            retryAfter: 60
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            // Skip rate limiting for health checks
            return req.path === '/health';
        }
    });

    app.use(limiter);

    // Request logging
    app.use((req, res, next) => {
        logger.info(`${req.method} ${req.path}`, {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            query: req.query,
            timestamp: new Date().toISOString()
        });
        next();
    });

    // Routes
    app.use('/health', healthRoutes);
    app.use('/api', screenshotRoutes);

    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Endpoint not found',
            message: `The requested endpoint ${req.originalUrl} does not exist.`,
            availableEndpoints: [
                'GET /health',
                'GET /api/screenshot',
                'POST /api/screenshot'
            ]
        });
    });

    // Error handling middleware
    app.use(errorHandler);

    // Graceful shutdown
    const server = app.listen(PORT, () => {
        logger.info(`Worker ${process.pid} started on port ${PORT}`);
    });

    // Handle graceful shutdown
    const gracefulShutdown = (signal) => {
        logger.info(`${signal} received, shutting down gracefully`);
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });

        // Force close after 30 seconds
        setTimeout(() => {
            logger.error('Forcing server shutdown');
            process.exit(1);
        }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });
}