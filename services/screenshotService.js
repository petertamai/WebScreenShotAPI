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
           // '--disable-renderer-backgrounding',
           // '--disable-features=TranslateUI',
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
           // '--font-render-hinting=none',
           // '--disable-font-subpixel-positioning',
            
            // GPU and graphics
            '--use-gl=swiftshader',
            '--disable-gl-drawing-for-tests',
            
            // Disable some APIs that can be used for fingerprinting
            '--disable-speech-api',
            //'--disable-background-networking',
            //'--disable-background-mode',
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
    async simulateRandomMouseMovements(page) {
        await page.evaluate(async () => {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Perform 2-4 random mouse movements
            const movements = 2 + Math.floor(Math.random() * 3);
            
            for (let i = 0; i < movements; i++) {
                const x = Math.random() * window.innerWidth;
                const y = Math.random() * window.innerHeight;
                
                const steps = 10 + Math.floor(Math.random() * 20);
                const currentX = window.mouseX || window.innerWidth / 2;
                const currentY = window.mouseY || window.innerHeight / 2;
                
                for (let j = 0; j <= steps; j++) {
                    const progress = j / steps;
                    const eased = 1 - Math.pow(1 - progress, 2);
                    
                    window.mouseX = currentX + (x - currentX) * eased;
                    window.mouseY = currentY + (y - currentY) * eased;
                    
                    const event = new MouseEvent('mousemove', {
                        clientX: window.mouseX,
                        clientY: window.mouseY,
                        bubbles: true
                    });
                    document.dispatchEvent(event);
                    
                    await sleep(20 + Math.random() * 30);
                }
                
                await sleep(200 + Math.random() * 800);
            }
        });
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
                waitTime: parseInt(options.waitTime) || 1000,
                maxWaitTime: parseInt(options.maxWaitTime) || 30000,
                dynamicContentTimeout: parseInt(options.dynamicContentTimeout) || 15000
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
            
            // Navigate to URL with enhanced waiting
            const response = await page.goto(screenshotOptions.url, { 
                waitUntil: 'networkidle0', // Wait for no network requests for 500ms
                timeout: 60000
            });
    
            // Check if blocked
            if (response && response.status() === 403) {
                this.stats.blockedRequests++;
                throw new Error('Access denied - possible bot detection');
            }
    
            // Initial mouse movement after page load
            await this.simulateRandomMouseMovements(page);
            
            // Wait for basic page elements
            await this.waitForDynamicContent(page, screenshotOptions);
            
            // Enhanced content loading detection with mouse movements
            await this.ensureDynamicContentLoaded(page, screenshotOptions);
            
            // Wait additional time if specified with mouse activity
            if (screenshotOptions.waitTime > 0) {
                await this.waitWithMouseActivity(page, screenshotOptions.waitTime);
            }
    
            // Perform human-like scrolling with integrated mouse movements
            await this.simulateHumanScrollingWithMouse(page);
            
            // Final wait with mouse movements before screenshot
            await this.waitWithMouseActivity(page, 500 + Math.random() * 1000);
    
            let screenshot;
            if (screenshotOptions.type === 'top') {
                // Final mouse movement before top screenshot
                await this.simulateRandomMouseMovements(page);
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
                
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
                // Final mouse movement before full screenshot
                await this.simulateRandomMouseMovements(page);
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
                
                // Ensure all content is visible for full page
                await this.prepareForFullPageScreenshot(page);
                
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
// Enhanced method to wait for dynamic content with multiple strategies
async waitForDynamicContent(page, options) {
    const timeout = options.dynamicContentTimeout;
    const startTime = Date.now();
    
    try {
        // Strategy 1: Wait for specific selector if provided
        if (options.waitForSelector) {
            await page.waitForSelector(options.waitForSelector, { 
                visible: true, 
                timeout: Math.min(timeout, 10000) 
            });
        }
        
        // Strategy 2: Wait for common dynamic content indicators
        const commonSelectors = [
            'img[src]', // Images
            '[data-loaded]', // Elements with loaded attributes
            '.loaded', // Common loaded class
            '[style*="display: block"]', // Elements that become visible
            'iframe[src]' // Iframes
        ];
        
        for (const selector of commonSelectors) {
            try {
                await page.waitForSelector(selector, { 
                    timeout: 2000,
                    visible: true 
                });
                break; // Found at least one, continue
            } catch (e) {
                // Continue to next selector
            }
        }
        
        // Strategy 3: Wait for network requests to settle
        await this.waitForNetworkIdle(page, 2000);
        
        // Strategy 4: Wait for JavaScript execution to complete
        await this.waitForJavaScriptIdle(page);
        
    } catch (error) {
        logger.warn('Dynamic content detection timeout:', error.message);
        // Continue anyway - don't fail the entire screenshot
    }
}
async waitForNetworkIdle(page, timeout = 3000) {
    return new Promise((resolve) => {
        let requestCount = 0;
        let responseCount = 0;
        let timer;
        
        const resetTimer = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                page.off('request', onRequest);
                page.off('response', onResponse);
                resolve();
            }, 500); // 500ms of no network activity
        };
        
        const onRequest = () => {
            requestCount++;
            clearTimeout(timer);
        };
        
        const onResponse = () => {
            responseCount++;
            if (responseCount >= requestCount) {
                resetTimer();
            }
        };
        
        page.on('request', onRequest);
        page.on('response', onResponse);
        
        // Start timer
        resetTimer();
        
        // Maximum timeout
        setTimeout(() => {
            page.off('request', onRequest);
            page.off('response', onResponse);
            clearTimeout(timer);
            resolve();
        }, timeout);
    });
}

// Method to wait for JavaScript execution to complete
async waitForJavaScriptIdle(page) {
    return page.evaluate(() => {
        return new Promise((resolve) => {
            let rafCount = 0;
            const maxRafs = 10;
            
            const checkIdle = () => {
                rafCount++;
                if (rafCount >= maxRafs) {
                    resolve();
                } else {
                    requestAnimationFrame(checkIdle);
                }
            };
            
            // Check if document is ready
            if (document.readyState === 'complete') {
                requestAnimationFrame(checkIdle);
            } else {
                window.addEventListener('load', () => {
                    requestAnimationFrame(checkIdle);
                });
            }
            
            // Timeout after 5 seconds
            setTimeout(resolve, 5000);
        });
    });
}

// Enhanced method that combines waiting with mouse activity
async waitWithMouseActivity(page, duration) {
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    while (Date.now() < endTime) {
        // Perform mouse movements during wait
        await this.simulateRandomMouseMovements(page);
        
        const remaining = endTime - Date.now();
        const waitTime = Math.min(remaining, 500 + Math.random() * 1000);
        
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Enhanced scrolling method with integrated mouse movements
async simulateHumanScrollingWithMouse(page) {
    await page.evaluate(async () => {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        // Enhanced mouse movement with better easing
        const moveMouseTo = async (x, y, duration = 200) => {
            const steps = Math.max(8, Math.floor(duration / 25));
            const currentX = window.mouseX || Math.random() * window.innerWidth;
            const currentY = window.mouseY || Math.random() * window.innerHeight;
            
            for (let i = 0; i <= steps; i++) {
                const progress = i / steps;
                // Smoother easing with acceleration and deceleration
                const eased = progress < 0.5 
                    ? 2 * progress * progress 
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                const newX = currentX + (x - currentX) * eased;
                const newY = currentY + (y - currentY) * eased;
                
                // Natural micro-movements
                const jitterX = (Math.random() - 0.5) * 3;
                const jitterY = (Math.random() - 0.5) * 3;
                
                window.mouseX = newX + jitterX;
                window.mouseY = newY + jitterY;
                
                // Dispatch mouse events
                const event = new MouseEvent('mousemove', {
                    clientX: window.mouseX,
                    clientY: window.mouseY,
                    bubbles: true
                });
                document.dispatchEvent(event);
                
                await sleep(25);
            }
        };
        
        // Scroll patterns with continuous mouse tracking
        const scrollPatterns = [
            // Reading pattern with text following
            async () => {
                const documentHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
                
                // Start from top
                window.scrollTo(0, 0);
                await moveMouseTo(
                    window.innerWidth * (0.2 + Math.random() * 0.6),
                    100 + Math.random() * 100,
                    400
                );
                
                const scrollSteps = Math.min(8, Math.floor(documentHeight / 200));
                const stepSize = documentHeight / scrollSteps;
                
                for (let i = 1; i <= scrollSteps; i++) {
                    // Scroll down
                    const targetScroll = stepSize * i;
                    const currentScroll = window.pageYOffset;
                    const scrollDistance = targetScroll - currentScroll;
                    
                    // Gradual scroll with mouse following
                    const scrollSubSteps = Math.max(3, Math.floor(scrollDistance / 100));
                    for (let j = 1; j <= scrollSubSteps; j++) {
                        const scrollTo = currentScroll + (scrollDistance * j) / scrollSubSteps;
                        window.scrollTo(0, scrollTo);
                        
                        // Move mouse to follow scroll
                        await moveMouseTo(
                            window.mouseX + (Math.random() - 0.5) * 100,
                            Math.min(window.innerHeight * 0.8, 100 + (j * 50)),
                            100
                        );
                        
                        await sleep(100 + Math.random() * 200);
                    }
                    
                    // Pause at each section with natural mouse movement
                    await moveMouseTo(
                        200 + Math.random() * (window.innerWidth - 400),
                        200 + Math.random() * 300,
                        300 + Math.random() * 200
                    );
                    
                    await sleep(500 + Math.random() * 1000);
                }
                
                // Return to top
                window.scrollTo(0, 0);
                await moveMouseTo(
                    window.innerWidth * 0.5,
                    100 + Math.random() * 100,
                    600
                );
                await sleep(300);
            }
        ];
        
        // Execute scrolling pattern
        const pattern = scrollPatterns[0]; // Use the comprehensive reading pattern
        await pattern();
        
        // Final mouse positioning
        await moveMouseTo(
            window.innerWidth * (0.3 + Math.random() * 0.4),
            100 + Math.random() * 150,
            500
        );
    });
}

// Method to prepare page for full screenshot
async prepareForFullPageScreenshot(page) {
    await page.evaluate(() => {
        // Trigger lazy loading by scrolling to bottom first
        const documentHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
        );
        
        window.scrollTo(0, documentHeight);
        
        // Force load any lazy images
        const lazyImages = document.querySelectorAll('img[data-src], img[loading="lazy"]');
        lazyImages.forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
            }
            // Trigger load event
            const event = new Event('load');
            img.dispatchEvent(event);
        });
        
        // Scroll back to top
        window.scrollTo(0, 0);
    });
    
    // Wait for any triggered content to load
    await this.waitWithMouseActivity(page, 1000);
}
// Method to ensure all dynamic content is loaded with multiple checks
async ensureDynamicContentLoaded(page, options) {
    const maxAttempts = 5;
    const checkInterval = 1000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Mouse movement during each check
        await this.simulateRandomMouseMovements(page);
        
        const contentStable = await page.evaluate(() => {
            // Check for loading indicators
            const loadingElements = document.querySelectorAll(
                '.loading, .spinner, [data-loading="true"], .skeleton, .placeholder'
            );
            if (loadingElements.length > 0) {
                const visibleLoading = Array.from(loadingElements).some(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
                if (visibleLoading) return false;
            }
            
            // Check for lazy loading images
            const lazyImages = document.querySelectorAll('img[data-src], img[loading="lazy"]');
            const unloadedImages = Array.from(lazyImages).filter(img => {
                return !img.complete || !img.src || img.src.includes('data:');
            });
            if (unloadedImages.length > 0) return false;
            
            // Check for empty content containers that might be loading
            const contentContainers = document.querySelectorAll(
                '[class*="content"], [class*="main"], [id*="content"], [id*="main"], article, section'
            );
            const emptyContainers = Array.from(contentContainers).filter(container => {
                return container.children.length === 0 && container.textContent.trim().length < 10;
            });
            
            // If more than half of content containers are empty, content might still be loading
            if (emptyContainers.length > contentContainers.length / 2 && contentContainers.length > 2) {
                return false;
            }
            
            return true;
        });
        
        if (contentStable) {
            break;
        }
        
        // Wait with mouse activity
        await this.waitWithMouseActivity(page, checkInterval);
    }
}


    async simulateHumanScrolling(page) {
        await page.evaluate(async () => {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Helper function to simulate mouse movement
            const moveMouseTo = async (x, y, duration = 200) => {
                const steps = Math.max(5, Math.floor(duration / 20));
                const currentX = window.mouseX || Math.random() * window.innerWidth;
                const currentY = window.mouseY || Math.random() * window.innerHeight;
                
                for (let i = 0; i <= steps; i++) {
                    const progress = i / steps;
                    // Easing function for natural movement
                    const eased = 1 - Math.pow(1 - progress, 3);
                    
                    const newX = currentX + (x - currentX) * eased;
                    const newY = currentY + (y - currentY) * eased;
                    
                    // Add small random variations
                    const jitterX = (Math.random() - 0.5) * 2;
                    const jitterY = (Math.random() - 0.5) * 2;
                    
                    window.mouseX = newX + jitterX;
                    window.mouseY = newY + jitterY;
                    
                    // Dispatch mouse move event
                    const event = new MouseEvent('mousemove', {
                        clientX: window.mouseX,
                        clientY: window.mouseY,
                        bubbles: true
                    });
                    document.dispatchEvent(event);
                    
                    await sleep(20);
                }
            };
            
            // Helper function to get random element to hover over
            const getRandomHoverTarget = () => {
                const elements = document.querySelectorAll('a, button, [onclick], .clickable, h1, h2, h3, img');
                if (elements.length === 0) return null;
                return elements[Math.floor(Math.random() * elements.length)];
            };
            
            // Random scroll patterns with mouse movements
            const patterns = [
                // Quick scan with mouse following
                async () => {
                    await sleep(300);
                    
                    // Move mouse to center of viewport
                    await moveMouseTo(
                        window.innerWidth * (0.3 + Math.random() * 0.4),
                        window.innerHeight * 0.3,
                        400
                    );
                    await sleep(200);
                    
                    window.scrollBy(0, 300);
                    
                    // Move mouse down as we scroll
                    await moveMouseTo(
                        window.mouseX + (Math.random() - 0.5) * 100,
                        window.mouseY + 150,
                        300
                    );
                    await sleep(500);
                    
                    window.scrollBy(0, -150);
                    
                    // Move mouse up slightly
                    await moveMouseTo(
                        window.mouseX + (Math.random() - 0.5) * 50,
                        window.mouseY - 80,
                        200
                    );
                    await sleep(400);
                },
                
                // Slow read with hover interactions
                async () => {
                    for (let i = 0; i < 3; i++) {
                        // Scroll down
                        window.scrollBy(0, 100);
                        
                        // Move mouse to follow content
                        await moveMouseTo(
                            100 + Math.random() * (window.innerWidth - 200),
                            200 + Math.random() * 300,
                            300 + Math.random() * 200
                        );
                        
                        await sleep(400 + Math.random() * 400);
                        
                        // Occasionally hover over an element
                        if (Math.random() < 0.6) {
                            const element = getRandomHoverTarget();
                            if (element) {
                                const rect = element.getBoundingClientRect();
                                if (rect.top >= 0 && rect.top <= window.innerHeight) {
                                    await moveMouseTo(
                                        rect.left + rect.width / 2,
                                        rect.top + rect.height / 2,
                                        150 + Math.random() * 100
                                    );
                                    await sleep(300 + Math.random() * 500);
                                }
                            }
                        }
                        
                        await sleep(400 + Math.random() * 400);
                    }
                },
                
                // Jump to bottom and back with natural mouse movement
                async () => {
                    const height = document.body.scrollHeight;
                    
                    // Move mouse before scrolling
                    await moveMouseTo(
                        window.innerWidth * 0.5,
                        window.innerHeight * 0.7,
                        300
                    );
                    
                    // Scroll to bottom in steps
                    const scrollSteps = 5;
                    for (let i = 1; i <= scrollSteps; i++) {
                        window.scrollTo(0, (height * i) / scrollSteps);
                        
                        // Move mouse to follow scroll
                        await moveMouseTo(
                            window.mouseX + (Math.random() - 0.5) * 200,
                            Math.min(window.innerHeight * 0.8, window.mouseY + 50),
                            100
                        );
                        
                        await sleep(200 + Math.random() * 200);
                    }
                    
                    await sleep(800);
                    
                    // Scroll back to top in steps
                    for (let i = scrollSteps - 1; i >= 0; i--) {
                        window.scrollTo(0, (height * i) / scrollSteps);
                        
                        // Move mouse up as we scroll up
                        await moveMouseTo(
                            window.mouseX + (Math.random() - 0.5) * 100,
                            Math.max(100, window.mouseY - 50),
                            100
                        );
                        
                        await sleep(150 + Math.random() * 150);
                    }
                    
                    await sleep(300);
                },
                
                // Reading pattern with text following
                async () => {
                    const textElements = document.querySelectorAll('p, div, span, article');
                    const visibleText = Array.from(textElements).filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.top >= 0 && rect.top <= window.innerHeight && 
                               el.textContent.trim().length > 50;
                    });
                    
                    if (visibleText.length > 0) {
                        for (let i = 0; i < Math.min(3, visibleText.length); i++) {
                            const element = visibleText[i];
                            const rect = element.getBoundingClientRect();
                            
                            // Move mouse to start of text
                            await moveMouseTo(
                                rect.left + 20,
                                rect.top + 20,
                                400 + Math.random() * 200
                            );
                            
                            // Simulate reading by moving mouse across text
                            const readingSteps = 3 + Math.floor(Math.random() * 4);
                            for (let j = 0; j < readingSteps; j++) {
                                await moveMouseTo(
                                    rect.left + (rect.width * (j + 1)) / readingSteps,
                                    rect.top + 20 + (Math.random() - 0.5) * 10,
                                    200 + Math.random() * 100
                                );
                                await sleep(300 + Math.random() * 500);
                            }
                            
                            // Small scroll to next section
                            if (i < visibleText.length - 1) {
                                window.scrollBy(0, 80 + Math.random() * 40);
                                await sleep(300);
                            }
                        }
                    }
                }
            ];
            
            // Execute random pattern
            const pattern = patterns[Math.floor(Math.random() * patterns.length)];
            await pattern();
            
            // Final mouse movement to a natural position
            await moveMouseTo(
                200 + Math.random() * (window.innerWidth - 400),
                100 + Math.random() * 200,
                500
            );
            
            // Return to top
            window.scrollTo(0, 0);
            await sleep(300);
            
            // Move mouse to top area
            await moveMouseTo(
                window.innerWidth * (0.2 + Math.random() * 0.6),
                100 + Math.random() * 100,
                400
            );
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