const express = require('express');
const router = express.Router();
const os = require('os');
const logger = require('../utils/logger');

// Health check configuration
const MEMORY_THRESHOLD = parseFloat(process.env.MEMORY_THRESHOLD) || 0.85; // 85%
const CPU_THRESHOLD = parseFloat(process.env.CPU_THRESHOLD) || 0.90; // 90%
const UPTIME_THRESHOLD = parseInt(process.env.MAX_UPTIME_HOURS) || 24; // 24 hours

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();
let healthCheckCount = 0;
let lastRestartTime = Date.now();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', async (req, res) => {
    try {
        healthCheckCount++;
        const healthData = await getHealthData();
        
        if (healthData.status === 'healthy') {
            res.status(200).json(healthData);
        } else {
            logger.warn('Health check failed', healthData);
            res.status(503).json(healthData);
            
            // Trigger restart if unhealthy
            if (healthData.critical) {
                setTimeout(() => {
                    logger.error('Critical health issue detected, triggering restart');
                    process.exit(1);
                }, 5000); // Give time for response
            }
        }
    } catch (error) {
        logger.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /health/detailed
 * Detailed health information
 */
router.get('/detailed', async (req, res) => {
    try {
        const healthData = await getDetailedHealthData();
        res.status(healthData.status === 'healthy' ? 200 : 503).json(healthData);
    } catch (error) {
        logger.error('Detailed health check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Detailed health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /health/restart
 * Manual restart endpoint (for debugging)
 */
router.post('/restart', (req, res) => {
    logger.warn('Manual restart triggered', { 
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.json({
        message: 'Restart triggered',
        timestamp: new Date().toISOString()
    });
    
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

async function getHealthData() {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = usedMemory / totalMemory;
    
    const cpuUsagePercent = getCpuUsage();
    const uptimeHours = process.uptime() / 3600;
    
    const issues = [];
    let critical = false;

    // Check memory usage
    if (memoryUsagePercent > MEMORY_THRESHOLD) {
        issues.push(`High memory usage: ${(memoryUsagePercent * 100).toFixed(1)}%`);
        if (memoryUsagePercent > 0.95) critical = true;
    }

    // Check CPU usage
    if (cpuUsagePercent > CPU_THRESHOLD) {
        issues.push(`High CPU usage: ${(cpuUsagePercent * 100).toFixed(1)}%`);
        if (cpuUsagePercent > 0.98) critical = true;
    }

    // Check uptime
    if (uptimeHours > UPTIME_THRESHOLD) {
        issues.push(`Long uptime: ${uptimeHours.toFixed(1)} hours`);
    }

    // Check heap usage
    const heapUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
    if (heapUsagePercent > 0.90) {
        issues.push(`High heap usage: ${(heapUsagePercent * 100).toFixed(1)}%`);
        if (heapUsagePercent > 0.95) critical = true;
    }

    const status = issues.length === 0 ? 'healthy' : critical ? 'critical' : 'warning';

    return {
        status,
        critical,
        issues,
        metrics: {
            uptime: process.uptime(),
            uptimeHours: uptimeHours.toFixed(2),
            memoryUsage: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
                heapUsagePercent: (heapUsagePercent * 100).toFixed(1)
            },
            systemMemory: {
                total: Math.round(totalMemory / 1024 / 1024),
                free: Math.round(freeMemory / 1024 / 1024),
                used: Math.round(usedMemory / 1024 / 1024),
                usagePercent: (memoryUsagePercent * 100).toFixed(1)
            },
            cpu: {
                usagePercent: (cpuUsagePercent * 100).toFixed(1),
                loadAverage: os.loadavg()
            }
        },
        environment: {
            nodeVersion: process.version,
            platform: os.platform(),
            arch: os.arch(),
            pid: process.pid
        },
        healthCheckCount,
        lastRestartTime: new Date(lastRestartTime).toISOString(),
        timestamp: new Date().toISOString()
    };
}

async function getDetailedHealthData() {
    const basicHealth = await getHealthData();
    
    // Additional detailed checks
    const networkInterfaces = os.networkInterfaces();
    const cpus = os.cpus();
    
    return {
        ...basicHealth,
        detailed: {
            environment: {
                ...basicHealth.environment,
                hostname: os.hostname(),
                homedir: os.homedir(),
                tmpdir: os.tmpdir(),
                endianness: os.endianness()
            },
            network: Object.keys(networkInterfaces).map(name => ({
                name,
                addresses: networkInterfaces[name].map(addr => ({
                    address: addr.address,
                    family: addr.family,
                    internal: addr.internal
                }))
            })),
            cpu: {
                count: cpus.length,
                model: cpus[0]?.model,
                speed: cpus[0]?.speed,
                usage: basicHealth.metrics.cpu
            },
            gc: {
                heapCodeStatistics: typeof v8 !== 'undefined' ? v8.getHeapCodeStatistics() : null,
                heapSpaceStatistics: typeof v8 !== 'undefined' ? v8.getHeapSpaceStatistics() : null
            }
        }
    };
}

function getCpuUsage() {
    try {
        const currentCpuUsage = process.cpuUsage(lastCpuUsage);
        const currentTime = Date.now();
        const timeDiff = currentTime - lastCpuTime;
        
        if (timeDiff > 0) {
            const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system;
            const cpuPercent = (totalCpuTime / 1000) / timeDiff;
            
            lastCpuUsage = process.cpuUsage();
            lastCpuTime = currentTime;
            
            return Math.min(cpuPercent, 1); // Cap at 100%
        }
        
        return 0;
    } catch (error) {
        logger.error('Error calculating CPU usage:', error);
        return 0;
    }
}

module.exports = router;