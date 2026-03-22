// ============================================
// ملف: src/controllers/health.controller.js (المصحح)
// الوصف: فحوصات صحة النظام
// ============================================

const mongoose = require("mongoose");
const os = require('os');
const cache = require("../utils/cache.util");
const packageJson = require('../../package.json');

// ========== 1. دوال مساعدة ==========

/**
 * الحصول على استخدام الذاكرة
 */
const getMemoryUsage = () => {
  const used = process.memoryUsage();
  const total = os.totalmem();
  const free = os.freemem();
  
  return {
    process: {
      rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(used.external / 1024 / 1024)} MB`,
    },
    system: {
      total: `${Math.round(total / 1024 / 1024 / 1024)} GB`,
      free: `${Math.round(free / 1024 / 1024 / 1024)} GB`,
      usage: `${Math.round(((total - free) / total) * 100)}%`
    }
  };
};

/**
 * الحصول على استخدام الـ CPU
 */
const getCpuUsage = () => {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'unknown',
    speed: cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'unknown',
    loadAverage: {
      '1min': loadAvg[0].toFixed(2),
      '5min': loadAvg[1].toFixed(2),
      '15min': loadAvg[2].toFixed(2)
    }
  };
};

/**
 * فحص حالة قاعدة البيانات
 */
const checkDatabase = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    let responseTime = null;
    if (state === 1) {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      responseTime = Date.now() - start;
    }
    
    return {
      status: state === 1 ? 'healthy' : 'unhealthy',
      state: states[state],
      responseTime: responseTime ? `${responseTime}ms` : null,
      details: state === 1 ? {
        name: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      } : null
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      state: 'error',
      error: error.message
    };
  }
};

/**
 * فحص حالة الكاش
 */
const checkCache = () => {
  try {
    const stats = cache.getStats();
    
    return {
      status: 'healthy',
      stats: {
        keys: stats.keyCount || 0,
        hits: stats.advanced?.hits || 0,
        misses: stats.advanced?.misses || 0,
        hitRate: stats.advanced?.hitRate || '0%',
        size: stats.advanced?.size || { kilobytes: '0' }
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

// ========== 2. فحوصات الصحة ==========

/**
 * @desc    فحص صحة سريع
 * @route   GET /api/health
 * @access  Public
 */
exports.quickHealthCheck = async (req, res) => {
  try {
    const dbCheck = await checkDatabase();
    
    const health = {
      status: dbCheck.status === 'healthy' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      uptimeHuman: formatUptime(process.uptime()),
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'development',
      database: dbCheck.state
    };

    res.status(health.status === 'ok' ? 200 : 503).json({
      success: health.status === 'ok',
      ...health
    });
  } catch (error) {
    console.error("❌ Quick health check error:", error);
    res.status(503).json({
      success: false,
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
};

/**
 * @desc    فحص صحة مفصل
 * @route   GET /api/health/detailed
 * @access  Public
 */
exports.fullHealthCheck = async (req, res) => {
  try {
    const startTime = Date.now();

    const [db, cacheStatus, diskSpace] = await Promise.allSettled([
      checkDatabase(),
      checkCache(),
      checkDiskSpace()
    ]);

    const checks = [
      {
        name: 'Database',
        ...(db.status === 'fulfilled' ? db.value : {
          status: 'unhealthy',
          error: db.reason?.message || 'Check failed'
        })
      },
      {
        name: 'Cache',
        ...(cacheStatus.status === 'fulfilled' ? cacheStatus.value : {
          status: 'unhealthy',
          error: cacheStatus.reason?.message || 'Check failed'
        })
      },
      {
        name: 'Disk Space',
        ...(diskSpace.status === 'fulfilled' ? diskSpace.value : {
          status: 'unhealthy',
          error: diskSpace.reason?.message || 'Check failed'
        })
      }
    ];

    const allHealthy = checks.every(c => c.status === 'healthy');
    const hasWarning = checks.some(c => c.status === 'warning');

    const responseTime = Date.now() - startTime;

    const health = {
      status: allHealthy ? 'healthy' : hasWarning ? 'warning' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      uptime: process.uptime(),
      uptimeHuman: formatUptime(process.uptime()),
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: `${os.platform()} (${os.arch()})`,
      memory: getMemoryUsage(),
      cpu: getCpuUsage(),
      checks
    };

    res.status(health.status === 'healthy' ? 200 : 
               health.status === 'warning' ? 200 : 503).json({
      success: health.status !== 'unhealthy',
      ...health
    });
  } catch (error) {
    console.error("❌ Full health check error:", error);
    res.status(503).json({
      success: false,
      status: 'error',
      message: 'Detailed health check failed',
      error: error.message
    });
  }
};

// ========== 3. فحوصات Kubernetes/Docker ==========

/**
 * @desc    Readiness probe
 * @route   GET /api/health/ready
 * @access  Public
 */
exports.readinessProbe = async (req, res) => {
  try {
    const dbCheck = await checkDatabase();
    
    if (dbCheck.status === 'healthy') {
      res.status(200).json({ 
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ 
        status: 'not ready',
        reason: 'Database not connected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready',
      error: error.message 
    });
  }
};

/**
 * @desc    Liveness probe
 * @route   GET /api/health/live
 * @access  Public
 */
exports.livenessProbe = (req, res) => {
  res.status(200).json({ 
    status: 'alive',
    timestamp: new Date().toISOString()
  });
};

// ========== 4. معلومات النظام ==========

/**
 * @desc    الحصول على معلومات النظام
 * @route   GET /api/health/info
 * @access  Public
 */
exports.getSystemInfo = async (req, res) => {
  try {
    const info = {
      application: {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        author: packageJson.author,
        license: packageJson.license
      },
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: formatUptime(os.uptime()),
        loadAvg: os.loadavg()
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid,
        cwd: process.cwd(),
        memory: getMemoryUsage(),
        cpu: getCpuUsage()
      },
      network: {
        interfaces: os.networkInterfaces()
      }
    };

    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    console.error("❌ Get system info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get system info"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات الأداء
 * @route   GET /api/health/metrics
 * @access  Admin
 */
exports.getMetrics = async (req, res) => {
  try {
    const metrics = {
      requests: {
        total: global.requestCount || 0,
        perSecond: ((global.requestCount || 0) / process.uptime()).toFixed(2)
      },
      errors: {
        total: global.errorCount || 0,
        rate: global.requestCount ? 
          (((global.errorCount || 0) / global.requestCount) * 100).toFixed(2) + '%' : '0%'
      },
      responseTime: {
        average: global.averageResponseTime ? `${global.averageResponseTime.toFixed(2)}ms` : 'N/A',
        lastMinute: global.lastMinuteResponseTime ? `${global.lastMinuteResponseTime.toFixed(2)}ms` : 'N/A'
      },
      memory: getMemoryUsage(),
      cpu: getCpuUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error("❌ Get metrics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get metrics"
    });
  }
};

// ========== 5. دوال مساعدة ==========

/**
 * فحص مساحة القرص
 */
const checkDiskSpace = async () => {
  try {
    let diskSpace;
    try {
      const checkDiskSpaceModule = require('check-disk-space');
      diskSpace = await checkDiskSpaceModule('/');
    } catch (e) {
      diskSpace = {
        free: os.freemem() * 10,
        size: os.totalmem() * 20
      };
    }
    
    const freeGB = (diskSpace.free / 1024 / 1024 / 1024).toFixed(2);
    const totalGB = (diskSpace.size / 1024 / 1024 / 1024).toFixed(2);
    const usagePercent = ((1 - diskSpace.free / diskSpace.size) * 100).toFixed(2);
    
    return {
      status: usagePercent > 90 ? 'warning' : 'healthy',
      free: freeGB + 'GB',
      total: totalGB + 'GB',
      usage: usagePercent + '%'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: 'Unable to check disk space'
    };
  }
};

/**
 * تنسيق وقت التشغيل
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

module.exports = exports;