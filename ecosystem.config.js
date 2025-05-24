// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'screenshot-service',
      script: './app.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        MAX_TABS: 20
      },
      
      // Development environment
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug',
        MAX_TABS: 10
      },
      
      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info',
        MAX_TABS: 20
      },
      
      // Performance settings
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      
      // Restart settings
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Auto restart on file changes (development only)
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        '*.log'
      ],
      
      // Health monitoring
      health_check_http: {
        enable: true,
        url: 'http://localhost:3000/health',
        interval: 30000,
        timeout: 5000,
        max_fails: 3
      },
      
      // Log settings
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      merge_logs: true,
      log_type: 'json',
      
      // Advanced settings
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Cron restart (restart daily at 3 AM)
      cron_restart: '0 3 * * *',
      
      // Resource monitoring
      autorestart: true,
      
      // Instance management
      increment_var: 'PORT',
      
      // Process title
      name: 'screenshot-service',
      
      // Source map support
      source_map_support: true,
      
      // Disable automatic restart on specific exit codes
      stop_exit_codes: [0],
      
      // Tab pool specific settings
      env_tab_pool: {
        MAX_TABS: 20,
        BROWSER_RESTART_THRESHOLD: 100, // Restart browser after 100 screenshots
        TAB_CLEANUP_INTERVAL: 30000     // Clean up idle tabs every 30 seconds
      }
    }
  ],

  deploy: {
    production: {
      user: process.env.DEPLOY_USER || 'node',
      host: process.env.DEPLOY_HOST || 'localhost',
      ref: 'origin/main',
      repo: process.env.DEPLOY_REPO || 'git@github.com:username/screenshot-service.git',
      path: process.env.DEPLOY_PATH || '/var/www/screenshot-service',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production',
        MAX_TABS: 20
      }
    },
    
    staging: {
      user: process.env.DEPLOY_USER || 'node',
      host: process.env.STAGING_HOST || 'localhost',
      ref: 'origin/develop',
      repo: process.env.DEPLOY_REPO || 'git@github.com:username/screenshot-service.git',
      path: process.env.STAGING_PATH || '/var/www/screenshot-service-staging',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': '',
      env: {
        NODE_ENV: 'staging',
        MAX_TABS: 15
      }
    }
  }
};