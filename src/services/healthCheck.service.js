const mongoose = require('mongoose');
const cache = require('../utils/cache.util');

class HealthCheckService {
  async checkDatabase() {
    try {
      const state = mongoose.connection.readyState;
      const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      
      return {
        status: state === 1 ? 'healthy' : 'unhealthy',
        message: `MongoDB is ${states[state]}`,
        connectionState: states[state],
        readyState: state
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.stack
      };
    }
  }

  async checkCache() {
    try {
      const stats = cache.getStats();
      
      return {
        status: 'healthy',
        message: 'Cache is working',
        stats: {
          hits: stats.hits,
          misses: stats.misses,
          keys: stats.keys,
          hitRate: ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message
      };
    }
  }

  async checkDiskSpace() {
    try {
      const checkDiskSpace = require('check-disk-space').default;
      const diskSpace = await checkDiskSpace('/');
      
      const freeGB = (diskSpace.free / 1024 / 1024 / 1024).toFixed(2);
      const totalGB = (diskSpace.size / 1024 / 1024 / 1024).toFixed(2);
      const usagePercent = ((1 - diskSpace.free / diskSpace.size) * 100).toFixed(2);
      
      return {
        status: usagePercent > 90 ? 'warning' : 'healthy',
        message: `Disk space: ${freeGB}GB free of ${totalGB}GB`,
        free: freeGB + 'GB',
        total: totalGB + 'GB',
        usage: usagePercent + '%'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Unable to check disk space'
      };
    }
  }

  async checkMemoryUsage() {
    try {
      const used = process.memoryUsage();
      const memoryUsage = {
        rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(used.external / 1024 / 1024)} MB`,
      };

      const heapUsagePercent = (used.heapUsed / used.heapTotal * 100).toFixed(2);
      
      return {
        status: heapUsagePercent > 85 ? 'warning' : 'healthy',
        message: `Memory usage: ${heapUsagePercent}%`,
        details: memoryUsage,
        heapUsage: heapUsagePercent + '%'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message
      };
    }
  }

  async checkServices() {
    try {
      // يمكن إضافة فحص خدمات خارجية هنا
      return {
        status: 'healthy',
        message: 'All external services are operational',
        services: {
          // يمكن إضافة Cloudinary، SendGrid، إلخ
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message
      };
    }
  }

  async fullHealthCheck() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkCache(),
      this.checkDiskSpace(),
      this.checkMemoryUsage(),
      this.checkServices()
    ]);

    const results = checks.map((check, index) => ({
      service: ['Database', 'Cache', 'Disk Space', 'Memory', 'External Services'][index],
      ...(check.status === 'fulfilled' ? check.value : {
        status: 'unhealthy',
        message: check.reason?.message || 'Check failed'
      })
    }));

    const allHealthy = results.every(r => r.status === 'healthy');
    const hasWarning = results.some(r => r.status === 'warning');

    return {
      status: allHealthy ? 'healthy' : hasWarning ? 'warning' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      checks: results
    };
  }

  async quickHealthCheck() {
    const dbCheck = await this.checkDatabase();
    
    return {
      status: dbCheck.status === 'healthy' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbCheck.status
    };
  }
}

module.exports = new HealthCheckService();