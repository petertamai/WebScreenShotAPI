const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const logger = require('../utils/logger');
const { formatUrl, validateUrl } = require('../utils/helpers');

class SimpleScreenshotService {
    constructor() {
        // No complex tab pool - just simple screenshot taking
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

    async takeScreenshot(options) {
        let browser = null;
        let page = null;
        
        try {
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
                isMobile: options.isMobile === 'true' || options.isMobile === true
            };

            // LAUNCH BROWSER - EXACTLY LIKE YOUR ORIGINAL
            const executablePath = await this.getExecutablePath();
            
            browser = await puppeteer.launch({
                args: chromium.args.concat([
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]),
                defaultViewport: null,
                executablePath,
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });

            page = await browser.newPage();
            await page.setJavaScriptEnabled(true);
            await page.setBypassCSP(true);
            
            await page.setViewport({
                width: screenshotOptions.width,
                height: screenshotOptions.type === 'top' ? screenshotOptions.height : 800,
                deviceScaleFactor: 1,
                isMobile: screenshotOptions.isMobile
            });
            
            // NAVIGATE - EXACTLY LIKE YOUR ORIGINAL
            await page.goto(screenshotOptions.url, { 
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            let screenshot;
            if (screenshotOptions.type === 'top') {
                // TOP SCREENSHOT
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
                // FULL PAGE - YOUR EXACT ORIGINAL WORKING CODE
                await page.evaluate(async () => {
                    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                    // Scroll down
                    await new Promise((resolve) => {
                        let totalHeight = 0;
                        const distance = 100;
                        const timer = setInterval(() => {
                            window.scrollBy(0, distance);
                            totalHeight += distance;
                            if(totalHeight >= document.body.scrollHeight){
                                clearInterval(timer);
                                resolve();
                            }
                        }, 100);
                    });

                    await sleep(1000); // Wait a bit at the bottom

                    // Scroll up
                    await new Promise((resolve) => {
                        let totalHeight = document.body.scrollHeight;
                        const distance = -100;
                        const timer = setInterval(() => {
                            window.scrollBy(0, distance);
                            totalHeight += distance;
                            if(totalHeight <= 0){
                                clearInterval(timer);
                                resolve();
                            }
                        }, 100);
                    });

                    await sleep(1000); // Wait a bit at the top
                });

                // Hide scrollbar
                await page.evaluate(() => {
                    document.body.style.overflow = 'hidden';
                    document.documentElement.style.overflow = 'hidden';
                });

                screenshot = await page.screenshot({ 
                    fullPage: true,
                    type: 'png'
                });
            }

            // OPTIMIZE IMAGE - YOUR EXACT ORIGINAL CODE
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

            return {
                image: optimizedImage.toString('base64'),
                contentType: screenshotOptions.format === 'png' ? 'image/png' : 'image/jpeg',
                size: optimizedImage.length,
                cached: false
            };

        } catch (error) {
            logger.error('Screenshot failed:', error);
            throw error;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (error) {
                    logger.error('Error closing page:', error);
                }
            }
            if (browser) {
                try {
                    await browser.close();
                } catch (error) {
                    logger.error('Error closing browser:', error);
                }
            }
        }
    }
}

module.exports = new SimpleScreenshotService();