// scripts/performance-test.js
const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_SITES = [
    'https://example.com',
    'https://google.com',
    'https://github.com',
    'https://stackoverflow.com',
    'https://wikipedia.org'
];

// Test configurations
const TESTS = {
    sequential: {
        name: 'Sequential Requests',
        requests: 20,
        concurrent: 1
    },
    moderate: {
        name: 'Moderate Concurrent Load',
        requests: 50,
        concurrent: 10
    },
    high: {
        name: 'High Concurrent Load',
        requests: 100,
        concurrent: 20
    },
    stress: {
        name: 'Stress Test',
        requests: 200,
        concurrent: 30
    }
};

// Colours for output
const colours = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// Helper functions
function log(message, colour = colours.reset) {
    console.log(`${colour}${message}${colours.reset}`);
}

function formatTime(ms) {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

async function makeScreenshotRequest(url, testRun) {
    const startTime = performance.now();
    
    try {
        const response = await axios.post(`${BASE_URL}/api/screenshot`, {
            url: url,
            width: 1366,
            height: 768,
            type: 'full',
            format: 'png',
            quality: 80
        }, {
            headers: {
                'Accept': 'application/json'
            },
            timeout: 60000
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        return {
            success: true,
            duration: duration,
            size: response.data.data.size,
            cached: response.data.data.cached,
            processingTime: response.data.data.processingTime
        };
    } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        return {
            success: false,
            duration: duration,
            error: error.response?.data?.message || error.message,
            status: error.response?.status
        };
    }
}

async function runConcurrentRequests(requests, concurrent, testName) {
    const results = [];
    const queue = [...Array(requests)].map((_, i) => ({
        index: i,
        url: TEST_SITES[i % TEST_SITES.length]
    }));
    
    const startTime = performance.now();
    
    // Process queue with concurrency limit
    const activeRequests = new Set();
    const processedRequests = [];
    
    while (queue.length > 0 || activeRequests.size > 0) {
        // Start new requests up to concurrent limit
        while (activeRequests.size < concurrent && queue.length > 0) {
            const request = queue.shift();
            const promise = makeScreenshotRequest(request.url, testName)
                .then(result => {
                    processedRequests.push({ ...result, index: request.index });
                    activeRequests.delete(promise);
                    
                    // Progress indicator
                    const progress = Math.round((processedRequests.length / requests) * 100);
                    process.stdout.write(`\r${colours.cyan}Progress: ${progress}% (${processedRequests.length}/${requests})${colours.reset}`);
                });
            
            activeRequests.add(promise);
        }
        
        // Wait for at least one request to complete
        if (activeRequests.size > 0) {
            await Promise.race(activeRequests);
        }
    }
    
    const endTime = performance.now();
    console.log('\n'); // New line after progress
    
    return {
        results: processedRequests,
        totalDuration: endTime - startTime
    };
}

async function getHealthCheck() {
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function getTabStats() {
    try {
        const response = await axios.get(`${BASE_URL}/api/screenshot/stats`);
        return response.data.data;
    } catch (error) {
        return null;
    }
}

async function runTest(testConfig) {
    log(`\n${'='.repeat(60)}`, colours.bright);
    log(`Running: ${testConfig.name}`, colours.bright + colours.cyan);
    log(`Requests: ${testConfig.requests}, Concurrent: ${testConfig.concurrent}`, colours.cyan);
    log('='.repeat(60), colours.bright);
    
    // Get initial health check
    const initialHealth = await getHealthCheck();
    const initialStats = await getTabStats();
    
    // Run the test
    const { results, totalDuration } = await runConcurrentRequests(
        testConfig.requests,
        testConfig.concurrent,
        testConfig.name
    );
    
    // Get final health check
    const finalHealth = await getHealthCheck();
    const finalStats = await getTabStats();
    
    // Calculate statistics
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const durations = results.filter(r => r.success).map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const totalSize = results.filter(r => r.success).reduce((a, r) => a + r.size, 0);
    
    // Display results
    log('\nTest Results:', colours.bright + colours.green);
    log(`Total Duration: ${formatTime(totalDuration)}`);
    log(`Requests/Second: ${(testConfig.requests / (totalDuration / 1000)).toFixed(2)}`);
    log(`Success Rate: ${((successful / testConfig.requests) * 100).toFixed(1)}%`);
    
    if (successful > 0) {
        log('\nResponse Times:', colours.bright + colours.yellow);
        log(`Average: ${formatTime(avgDuration)}`);
        log(`Minimum: ${formatTime(minDuration)}`);
        log(`Maximum: ${formatTime(maxDuration)}`);
        log(`Total Data: ${formatBytes(totalSize)}`);
    }
    
    if (failed > 0) {
        log(`\nFailed Requests: ${failed}`, colours.bright + colours.red);
        const errors = {};
        results.filter(r => !r.success).forEach(r => {
            const key = `${r.status || 'Network'}: ${r.error}`;
            errors[key] = (errors[key] || 0) + 1;
        });
        Object.entries(errors).forEach(([error, count]) => {
            log(`  ${error}: ${count}`, colours.red);
        });
    }
    
    // Tab pool statistics
    if (initialStats && finalStats) {
        log('\nTab Pool Performance:', colours.bright + colours.magenta);
        log(`Max Tabs: ${process.env.MAX_TABS || 20}`);
        log(`Peak Active Tabs: ${finalStats.activeTabsCount}`);
        log(`Tabs Created: ${finalStats.tabsCreated - initialStats.tabsCreated}`);
        log(`Browser Restarts: ${finalStats.browserRestarts - initialStats.browserRestarts}`);
        log(`Tab Reuse Rate: ${((1 - (finalStats.tabsCreated - initialStats.tabsCreated) / testConfig.requests) * 100).toFixed(1)}%`);
    }
    
    // System health
    if (finalHealth) {
        log('\nSystem Health:', colours.bright + colours.cyan);
        log(`Status: ${finalHealth.status}`);
        log(`Memory Usage: ${finalHealth.metrics.memoryUsage.heapUsagePercent}%`);
        log(`CPU Usage: ${finalHealth.metrics.cpu.usagePercent}%`);
        log(`Tab Usage: ${finalHealth.metrics.tabPool.tabUsagePercent}%`);
        
        if (finalHealth.issues.length > 0) {
            log('Issues:', colours.yellow);
            finalHealth.issues.forEach(issue => log(`  - ${issue}`, colours.yellow));
        }
    }
    
    return {
        testName: testConfig.name,
        successful,
        failed,
        avgDuration,
        totalDuration,
        requestsPerSecond: testConfig.requests / (totalDuration / 1000)
    };
}

async function main() {
    log('\n🚀 Screenshot Service Performance Test', colours.bright + colours.green);
    log(`Testing: ${BASE_URL}`, colours.cyan);
    log(`Test Sites: ${TEST_SITES.length} different URLs`, colours.cyan);
    
    // Check service health
    const health = await getHealthCheck();
    if (!health) {
        log('\n❌ Cannot connect to screenshot service!', colours.red);
        log(`Make sure the service is running at ${BASE_URL}`, colours.red);
        process.exit(1);
    }
    
    if (health.status !== 'healthy') {
        log(`\n⚠️  Service health: ${health.status}`, colours.yellow);
        health.issues.forEach(issue => log(`  - ${issue}`, colours.yellow));
    }
    
    // Run tests
    const testResults = [];
    const testNames = process.argv.slice(2);
    const testsToRun = testNames.length > 0 
        ? testNames.filter(name => TESTS[name]).map(name => ({ name, ...TESTS[name] }))
        : Object.entries(TESTS).map(([name, config]) => ({ name, ...config }));
    
    if (testsToRun.length === 0) {
        log('\n❌ No valid tests specified!', colours.red);
        log('Available tests: ' + Object.keys(TESTS).join(', '), colours.yellow);
        process.exit(1);
    }
    
    for (const test of testsToRun) {
        const result = await runTest(test);
        testResults.push(result);
        
        // Wait between tests
        if (testsToRun.indexOf(test) < testsToRun.length - 1) {
            log('\nWaiting 5 seconds before next test...', colours.cyan);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    // Summary
    log(`\n${'='.repeat(60)}`, colours.bright);
    log('PERFORMANCE TEST SUMMARY', colours.bright + colours.green);
    log('='.repeat(60), colours.bright);
    
    testResults.forEach(result => {
        log(`\n${result.testName}:`, colours.bright);
        log(`  Success Rate: ${((result.successful / (result.successful + result.failed)) * 100).toFixed(1)}%`);
        log(`  Avg Response: ${formatTime(result.avgDuration)}`);
        log(`  Throughput: ${result.requestsPerSecond.toFixed(2)} req/s`);
    });
    
    log('\n✅ Performance test completed!', colours.bright + colours.green);
}

// Run tests
main().catch(error => {
    log(`\n❌ Test failed: ${error.message}`, colours.red);
    console.error(error);
    process.exit(1);
});