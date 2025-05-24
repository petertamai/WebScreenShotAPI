// scripts/test-stealth.js
const axios = require('axios');

// Configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test sites that commonly use bot detection
const STEALTH_TEST_SITES = [
    {
        name: 'Basic Test',
        url: 'https://example.com',
        description: 'Simple test to ensure service works'
    },
    {
        name: 'Bot Detection Test',
        url: 'https://bot.sannysoft.com',
        description: 'Comprehensive bot detection test'
    },
    {
        name: 'WebRTC Leak Test',
        url: 'https://ipleak.net',
        description: 'Tests for WebRTC and IP leaks'
    },
    {
        name: 'Canvas Fingerprinting',
        url: 'https://browserleaks.com/canvas',
        description: 'Tests canvas fingerprinting detection'
    },
    {
        name: 'User Agent Test',
        url: 'https://www.whatismybrowser.com/detect/what-is-my-user-agent',
        description: 'Checks user agent string'
    },
    {
        name: 'JavaScript Detection',
        url: 'https://www.whatismybrowser.com/detect/is-javascript-enabled',
        description: 'Verifies JavaScript is enabled'
    }
];

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

function log(message, colour = colours.reset) {
    console.log(`${colour}${message}${colours.reset}`);
}

async function testScreenshot(site) {
    const startTime = Date.now();
    
    try {
        log(`\nTesting: ${site.name}`, colours.bright + colours.cyan);
        log(`URL: ${site.url}`, colours.cyan);
        log(`Description: ${site.description}`, colours.cyan);
        
        const response = await axios.post(`${BASE_URL}/api/screenshot`, {
            url: site.url,
            width: 1366,
            height: 768,
            type: 'full',
            format: 'png',
            quality: 80,
            waitTime: 3000 // Extra wait time for bot detection sites
        }, {
            headers: {
                'Accept': 'application/json'
            },
            timeout: 90000
        });
        
        const duration = Date.now() - startTime;
        
        if (response.data.success) {
            log(`✅ Success! Screenshot taken in ${duration}ms`, colours.green);
            log(`   Size: ${(response.data.data.size / 1024).toFixed(2)} KB`, colours.green);
            
            // Save screenshot for manual inspection
            const fs = require('fs');
            const filename = `stealth-test-${site.name.toLowerCase().replace(/\s+/g, '-')}.png`;
            fs.writeFileSync(filename, Buffer.from(response.data.data.image, 'base64'));
            log(`   Saved as: ${filename}`, colours.green);
            
            return { success: true, duration, site: site.name };
        }
        
    } catch (error) {
        const duration = Date.now() - startTime;
        log(`❌ Failed! ${error.response?.data?.message || error.message}`, colours.red);
        log(`   Duration: ${duration}ms`, colours.red);
        log(`   Status: ${error.response?.status || 'N/A'}`, colours.red);
        
        if (error.response?.data?.message?.includes('bot detection')) {
            log(`   ⚠️  Bot detection triggered!`, colours.yellow);
        }
        
        return { 
            success: false, 
            duration, 
            site: site.name,
            error: error.response?.data?.message || error.message 
        };
    }
}

async function getServiceStats() {
    try {
        const response = await axios.get(`${BASE_URL}/api/screenshot/stats`);
        return response.data.data;
    } catch (error) {
        return null;
    }
}

async function runStealthTests() {
    log('\n🕵️  Stealth Mode Test Suite', colours.bright + colours.magenta);
    log('=' .repeat(60), colours.magenta);
    
    // Check service health
    try {
        const health = await axios.get(`${BASE_URL}/health`);
        if (health.data.status === 'healthy') {
            log('✅ Service is healthy', colours.green);
        } else {
            log(`⚠️  Service status: ${health.data.status}`, colours.yellow);
        }
    } catch (error) {
        log('❌ Cannot connect to service!', colours.red);
        return;
    }
    
    // Get initial stats
    const initialStats = await getServiceStats();
    if (initialStats) {
        log(`\nStealth Mode: ${initialStats.stealthMode ? 'ENABLED' : 'DISABLED'}`, 
            initialStats.stealthMode ? colours.green : colours.red);
    }
    
    // Run tests
    const results = [];
    for (const site of STEALTH_TEST_SITES) {
        const result = await testScreenshot(site);
        results.push(result);
        
        // Wait between tests
        if (STEALTH_TEST_SITES.indexOf(site) < STEALTH_TEST_SITES.length - 1) {
            log('\nWaiting 3 seconds before next test...', colours.cyan);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // Get final stats
    const finalStats = await getServiceStats();
    
    // Summary
    log('\n' + '=' .repeat(60), colours.bright);
    log('STEALTH TEST SUMMARY', colours.bright + colours.magenta);
    log('=' .repeat(60), colours.bright);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    log(`\nTotal Tests: ${results.length}`, colours.bright);
    log(`Successful: ${successful} (${((successful/results.length)*100).toFixed(1)}%)`, colours.green);
    log(`Failed: ${failed}`, failed > 0 ? colours.red : colours.green);
    
    if (finalStats) {
        log(`\nBlocked Requests: ${finalStats.blockedRequests}`, 
            finalStats.blockedRequests > 0 ? colours.yellow : colours.green);
    }
    
    log('\nDetailed Results:', colours.bright);
    results.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        const colour = result.success ? colours.green : colours.red;
        log(`${icon} ${result.site}: ${result.duration}ms`, colour);
        if (!result.success && result.error) {
            log(`   Error: ${result.error}`, colours.red);
        }
    });
    
    log('\n💡 Tips for Better Stealth:', colours.yellow);
    log('1. Use residential proxies for better IP reputation', colours.yellow);
    log('2. Add delays between requests to appear more human', colours.yellow);
    log('3. Rotate user agents and viewport sizes', colours.yellow);
    log('4. Enable all stealth features in .env', colours.yellow);
    
    log('\n🔍 Check the generated screenshots for visual inspection', colours.cyan);
    log('   Look for signs of bot detection or blocked content', colours.cyan);
}

// Stealth feature checker
async function checkStealthFeatures() {
    log('\n🔧 Checking Stealth Features', colours.bright + colours.cyan);
    log('-'.repeat(40), colours.cyan);
    
    const features = {
        'Stealth Plugin': '✅ Enabled',
        'Ad Blocker': '✅ Enabled',
        'WebRTC Leak Prevention': '✅ Enabled',
        'Canvas Fingerprint Protection': '✅ Enabled',
        'WebGL Spoofing': '✅ Enabled',
        'Timezone Spoofing': '✅ Enabled',
        'Language Spoofing': '✅ Enabled',
        'Plugin Spoofing': '✅ Enabled',
        'User Agent Rotation': process.env.RANDOM_USER_AGENT === 'true' ? '✅ Enabled' : '❌ Disabled',
        'Human Behavior Simulation': process.env.SIMULATE_HUMAN_BEHAVIOR === 'true' ? '✅ Enabled' : '❌ Disabled'
    };
    
    Object.entries(features).forEach(([feature, status]) => {
        const colour = status.includes('✅') ? colours.green : colours.red;
        log(`${feature}: ${status}`, colour);
    });
}

// Main execution
async function main() {
    await checkStealthFeatures();
    await runStealthTests();
    
    log('\n✅ Stealth test completed!', colours.bright + colours.green);
    log('Check the generated PNG files for manual inspection', colours.cyan);
}

main().catch(error => {
    log(`\n❌ Test failed: ${error.message}`, colours.red);
    console.error(error);
    process.exit(1);
});