// services/screenshotService.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const sharp = require('sharp');
const logger = require('../utils/logger');
const { formatUrl, validateUrl } = require('../utils/helpers');

// Configure stealth plugin
puppeteer.use(StealthPlugin());

// Additional plugins for enhanced stealth
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

class StealthTabPoolScreenshotService {
    constructor() {
        this.browser = null;
        this.browserLaunchPromise = null;
        this.tabs = new Map(); // Map to track active tabs
        this.maxTabs = parseInt(process.env.MAX_TABS) || 20;
        this.tabIdCounter = 0;
        this.isShuttingDown = false;
        this.browserRestartCount = 0;
        this.maxBrowserRestarts = 5;
        
        // User agents pool for rotation
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        ];
        
        // Stats tracking
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageProcessingTime: 0,
            activeTabsCount: 0,
            browserRestarts: 0,
            tabsCreated: 0,
            tabsClosed: 0,
            blockedRequests: 0
        };

        // Initialize browser on service start
        this.initializeBrowser();
    }

    async initializeBrowser() {
        if (this.browserLaunchPromise) {
            return this.browserLaunchPromise;
        }

        this.browserLaunchPromise = this._launchBrowser();
        
        try {
            this.browser = await this.browserLaunchPromise;
            logger.info('Stealth browser initialized successfully', {
                maxTabs: this.maxTabs,
                pid: this.browser.process()?.pid,
                stealth: true
            });
        } catch (error) {
            logger.error('Failed to initialize browser:', error);
            this.browserLaunchPromise = null;
            throw error;
        }

        return this.browser;
    }

    async _launchBrowser() {
        const executablePath = await this.getExecutablePath();
        
        // Enhanced launch arguments for stealth
        const args = chromium.args.concat([
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            
            // Additional stealth arguments
            '--disable-features=ChromeWhatsNewUI',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--password-store=basic',
            '--use-mock-keychain',
            '--force-color-profile=srgb',
            
            // Language and locale
            '--lang=en-US,en',
            
            // WebRTC leak prevention
            '--disable-webrtc-hw-encoding',
            '--disable-webrtc-hw-decoding',
            '--webrtc-ip-handling-policy=disable_non_proxied_udp',
            
            // Font rendering
            '--font-render-hinting=none',
            '--disable-font-subpixel-positioning',
            
            // GPU and graphics
            '--use-gl=swiftshader',
            '--disable-gl-drawing-for-tests',
            
            // Disable some APIs that can be used for fingerprinting
            '--disable-speech-api',
            '--disable-background-networking',
            '--disable-background-mode',
            '--disable-sync',
            '--metrics-recording-only',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-domain-reliability',
            '--disable-features=AudioServiceOutOfProcess',
            '--disable-print-preview',
            '--disable-site-isolation-trials',
            '--no-pings',
            '--no-service-autorun',
            '--disable-breakpad',
            '--disable-crash-reporter',
            '--disable-rate-limiting',
            '--disable-search-engine-choice-screen'
        ]);

        const browser = await puppeteer.launch({
            args,
            defaultViewport: null,
            executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
            
            // Additional stealth options
            ignoreDefaultArgs: ['--enable-automation'],
            
            // Slow down operations to appear more human
            slowMo: parseInt(process.env.SLOW_MO) || 0,
            
            // Don't leak real IP
            env: {
                ...process.env,
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8'
            }
        });

        // Monitor browser disconnection
        browser.on('disconnected', () => {
            logger.warn('Browser disconnected unexpectedly');
            this.browser = null;
            this.browserLaunchPromise = null;
            
            // Clear all tabs
            this.tabs.clear();
            
            // Attempt to restart browser if not shutting down
            if (!this.isShuttingDown && this.browserRestartCount < this.maxBrowserRestarts) {
                this.browserRestartCount++;
                this.stats.browserRestarts++;
                logger.info('Attempting to restart browser', { 
                    restartCount: this.browserRestartCount 
                });
                
                setTimeout(() => {
                    this.initializeBrowser().catch(err => {
                        logger.error('Failed to restart browser:', err);
                    });
                }, 2000);
            }
        });

        return browser;
    }

    async getExecutablePath() {
        if (process.env.CHROMIUM_PATH) {
            const fs = require('fs');
            try {
                if (fs.existsSync(process.env.CHROMIUM_PATH)) {
                    return process.env.CHROMIUM_PATH;
                }
            } catch (error) {
                logger.warn('Error checking CHROMIUM_PATH:', error.message);
            }
        }
        
        try {
            return await chromium.executablePath();
        } catch (error) {
            const possiblePaths = [
                '/opt/homebrew/bin/chromium',
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/usr/bin/google-chrome'
            ];

            const fs = require('fs');
            for (const path of possiblePaths) {
                if (fs.existsSync(path)) {
                    return path;
                }
            }
            throw new Error('No Chromium executable found');
        }
    }

    async getAvailableTab() {
        // Clean up closed tabs
        for (const [id, tab] of this.tabs.entries()) {
            if (tab.isClosed()) {
                this.tabs.delete(id);
                this.stats.tabsClosed++;
            }
        }

        // Check if we can create a new tab
        if (this.tabs.size < this.maxTabs) {
            return await this.createNewTab();
        }

        // Wait for a tab to become available
        const timeout = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            // Check for any idle tabs
            for (const [id, tab] of this.tabs.entries()) {
                if (!tab.isClosed() && tab.url() === 'about:blank') {
                    return { id, page: tab };
                }
            }
            
            // If no idle tabs, wait a bit and check again
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Re-check tab count in case some were closed
            if (this.tabs.size < this.maxTabs) {
                return await this.createNewTab();
            }
        }
        
        throw new Error('No available tabs - maximum concurrent screenshots reached');
    }

    async createNewTab() {
        if (!this.browser || !this.browser.isConnected()) {
            await this.initializeBrowser();
        }

        const tabId = ++this.tabIdCounter;
        const page = await this.browser.newPage();
        
        // Apply stealth enhancements to the page
        await this.applyStealthEnhancements(page);
        
        // Add to tabs map
        this.tabs.set(tabId, page);
        this.stats.tabsCreated++;
        this.stats.activeTabsCount = this.tabs.size;
        
        logger.debug('Created new stealth tab', { 
            tabId, 
            totalTabs: this.tabs.size 
        });
        
        return { id: tabId, page };
    }

    async applyStealthEnhancements(page) {
        // Set random user agent
        const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
        await page.setUserAgent(userAgent);
        
        // Set realistic viewport
        const viewports = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 1600, height: 900 }
        ];
        const viewport = viewports[Math.floor(Math.random() * viewports.length)];
        await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
        
        // Enable JavaScript
        await page.setJavaScriptEnabled(true);
        await page.setBypassCSP(true);
        
        // Set language
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });
        
        // Additional evasions
        await page.evaluateOnNewDocument(() => {
            // WebGL Vendor
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter.apply(this, arguments);
            };

            // Permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Chrome object
            if (!window.chrome) {
                Object.defineProperty(window, 'chrome', {
                    writable: true,
                    enumerable: true,
                    configurable: false,
                    value: {
                        runtime: {},
                        loadTimes: function() {},
                        csi: function() {},
                        app: {}
                    }
                });
            }

            // Plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    },
                    {
                        0: { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
                        description: "Portable Document Format",
                        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                        length: 1,
                        name: "Chrome PDF Viewer"
                    },
                    {
                        0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable" },
                        description: "Native Client Executable",
                        filename: "internal-nacl-plugin",
                        length: 2,
                        name: "Native Client"
                    }
                ]
            });

            // Languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            // Fix Notification permission
            const originalNotification = window.Notification;
            Object.defineProperty(window, 'Notification', {
                writable: true,
                enumerable: true,
                configurable: true,
                value: new Proxy(originalNotification, {
                    get(target, prop) {
                        if (prop === 'permission') {
                            return 'default';
                        }
                        return target[prop];
                    }
                })
            });
        });

        // Randomize window.screen properties
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(screen, 'width', { get: () => 1920 });
            Object.defineProperty(screen, 'height', { get: () => 1080 });
            Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
            Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
        });

        // Handle dialog boxes
        page.on('dialog', async dialog => {
            await dialog.dismiss();
        });

        // Block certain resource types for performance and stealth
        if (process.env.BLOCK_RESOURCES === 'true') {
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const resourceType = request.resourceType();
                const blockedTypes = ['font', 'media'];
                
                if (blockedTypes.includes(resourceType)) {
                    request.abort();
                } else {
                    request.continue();
                }
            });
        }
    }

    async closeTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (tab && !tab.isClosed()) {
            try {
                await tab.close();
                this.tabs.delete(tabId);
                this.stats.tabsClosed++;
                this.stats.activeTabsCount = this.tabs.size;
                
                logger.debug('Closed tab', { 
                    tabId, 
                    remainingTabs: this.tabs.size 
                });
            } catch (error) {
                logger.error('Error closing tab:', { tabId, error: error.message });
                this.tabs.delete(tabId);
            }
        }
    }

    async takeScreenshot(options) {
        const startTime = Date.now();
        let tabInfo = null;
        
        try {
            // Update stats
            this.stats.totalRequests++;
            
            // Validate URL
            if (!validateUrl(options.url)) {
                throw new Error('Invalid URL provided');
            }

            const formattedUrl = formatUrl(options.url);
            const screenshotOptions = {
                ...options,
                url: formattedUrl,
                width: parseInt(options.width) || 1366,
                height: parseInt(options.height) || 768,
                quality: Math.min(100, Math.max(0, parseInt(options.quality) || 80)),
                format: (options.format || 'png').toLowerCase(),
                type: (options.type || 'full').toLowerCase(),
                isMobile: options.isMobile === 'true' || options.isMobile === true,
                waitTime: parseInt(options.waitTime) || 1000
            };

            // Get an available tab
            tabInfo = await this.getAvailableTab();
            const { id: tabId, page } = tabInfo;
            
            logger.debug('Using stealth tab for screenshot', { 
                tabId, 
                url: screenshotOptions.url 
            });

            // Set viewport (override random viewport for this specific request)
            await page.setViewport({
                width: screenshotOptions.width,
                height: screenshotOptions.type === 'top' ? screenshotOptions.height : 800,
                deviceScaleFactor: 1,
                isMobile: screenshotOptions.isMobile
            });
            
            // Add random delay to appear more human
            const randomDelay = Math.floor(Math.random() * 500) + 100;
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            
            // Navigate to URL with stealth navigation
            const response = await page.goto(screenshotOptions.url, { 
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Check if blocked
            if (response && response.status() === 403) {
                this.stats.blockedRequests++;
                throw new Error('Access denied - possible bot detection');
            }

            // Wait additional time if specified
            await new Promise(resolve => setTimeout(resolve, screenshotOptions.waitTime));

            // Simulate human-like scrolling before screenshot
            await this.simulateHumanScrolling(page);

            let screenshot;
            if (screenshotOptions.type === 'top') {
                // Top screenshot
                await page.evaluate(() => {
                    document.body.style.overflow = 'hidden';
                    document.documentElement.style.overflow = 'hidden';
                });

                screenshot = await page.screenshot({ 
                    fullPage: false,
                    type: 'png',
                    clip: {
                        x: 0,
                        y: 0,
                        width: screenshotOptions.width,
                        height: screenshotOptions.height
                    }
                });
            } else {
                // Full page screenshot
                await page.evaluate(() => {
                    document.body.style.overflow = 'hidden';
                    document.documentElement.style.overflow = 'hidden';
                });

                screenshot = await page.screenshot({ 
                    fullPage: true,
                    type: 'png'
                });
            }

            // Navigate back to blank page to free resources
            await page.goto('about:blank');

            // Optimize image
            let optimizedImage;
            if (screenshotOptions.format === 'jpeg' || screenshotOptions.format === 'jpg') {
                optimizedImage = await sharp(screenshot)
                    .jpeg({ quality: screenshotOptions.quality })
                    .toBuffer();
            } else {
                optimizedImage = await sharp(screenshot)
                    .png({ quality: screenshotOptions.quality })
                    .toBuffer();
            }

            // Update stats
            const processingTime = Date.now() - startTime;
            this.stats.successfulRequests++;
            this.stats.averageProcessingTime = 
                (this.stats.averageProcessingTime * (this.stats.successfulRequests - 1) + processingTime) / 
                this.stats.successfulRequests;

            logger.info('Stealth screenshot completed', {
                tabId,
                url: screenshotOptions.url,
                processingTime,
                size: optimizedImage.length,
                activeTabs: this.tabs.size
            });

            return {
                image: optimizedImage.toString('base64'),
                contentType: screenshotOptions.format === 'png' ? 'image/png' : 'image/jpeg',
                size: optimizedImage.length,
                cached: false
            };

        } catch (error) {
            this.stats.failedRequests++;
            logger.error('Screenshot failed:', error);
            
            // Close the tab if there was an error
            if (tabInfo) {
                await this.closeTab(tabInfo.id);
            }
            
            throw error;
        }
    }

    async simulateHumanScrolling(page) {
        await page.evaluate(async () => {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Random scroll patterns
            const patterns = [
                // Quick scan
                async () => {
                    await sleep(500);
                    window.scrollBy(0, 300);
                    await sleep(700);
                    window.scrollBy(0, -150);
                    await sleep(500);
                },
                // Slow read
                async () => {
                    for (let i = 0; i < 3; i++) {
                        window.scrollBy(0, 100);
                        await sleep(800 + Math.random() * 400);
                    }
                },
                // Jump to bottom and back
                async () => {
                    const height = document.body.scrollHeight;
                    window.scrollTo(0, height);
                    await sleep(1000);
                    window.scrollTo(0, 0);
                    await sleep(500);
                }
            ];
            
            // Execute random pattern
            const pattern = patterns[Math.floor(Math.random() * patterns.length)];
            await pattern();
            
            // Return to top
            window.scrollTo(0, 0);
            await sleep(500);
        });
    }

    getStats() {
        return {
            ...this.stats,
            browserConnected: this.browser?.isConnected() || false,
            browserPid: this.browser?.process()?.pid || null,
            stealthMode: true
        };
    }

    async shutdown() {
        logger.info('Shutting down stealth screenshot service');
        this.isShuttingDown = true;
        
        // Close all tabs
        const closePromises = [];
        for (const [id, tab] of this.tabs.entries()) {
            closePromises.push(this.closeTab(id));
        }
        await Promise.all(closePromises);
        
        // Close browser
        if (this.browser && this.browser.isConnected()) {
            await this.browser.close();
        }
        
        logger.info('Stealth screenshot service shutdown complete');
    }
}

// Create singleton instance
const screenshotService = new StealthTabPoolScreenshotService();

// Graceful shutdown
process.on('SIGTERM', async () => {
    await screenshotService.shutdown();
});

process.on('SIGINT', async () => {
    await screenshotService.shutdown();
});

module.exports = screenshotService;