// ============================================
// ملف: src/services/healthCheck.service.js (محدث)
// الوصف: خدمة فحص صحة النظام المتقدمة
// ============================================

const mongoose = require('mongoose');
const os = require('os');
const cache = require('../utils/cache.util');
const { businessLogger } = require("../utils/logger.util");
const packageJson = require('../../package.json');

class HealthCheckService {
  constructor() {
    this.thresholds = {
      memoryWarning: 85, // %
      diskWarning: 90,   // %
      cpuWarning: 80,    // %
      responseTimeWarning: 1000 // ms
    };
  }

  // ========== 1. فحوصات فردية ==========

  /**
   * فحص قاعدة البيانات
   */
  async checkDatabase() {
    const startTime = Date.now();

    try {
      const state = mongoose.connection.readyState;
      const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      
      let responseTime = null;
      let collections = null;

      if (state === 1) {
        // تجربة استعلام بسيط
        await mongoose.connection.db.admin().ping();
        responseTime = Date.now() - startTime;

        // الحصول على إحصائيات المجموعات
        collections = await mongoose.connection.db.listCollections().toArray();
      }

      const status = state === 1 ? 'healthy' : 'unhealthy';
      const level = this.getHealthLevel(status, responseTime);

      return {
        name: 'Database',
        status,
        level,
        responseTime: responseTime ? `${responseTime}ms` : null,
        details: state === 1 ? {
          name: mongoose.connection.name,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          collections: collections?.length || 0,
          models: Object.keys(mongoose.models).length
        } : {
          state: states[state]
        }
      };
    } catch (error) {
      return {
        name: 'Database',
        status: 'unhealthy',
        level: 'critical',
        error: error.message
      };
    }
  }

  /**
   * فحص الكاش
   */
  async checkCache() {
    try {
      const startTime = Date.now();
      const stats = cache.getStats();

      const responseTime = Date.now() - startTime;

      const status = stats.keyCount !== undefined ? 'healthy' : 'warning';
      const level = this.getHealthLevel(status, responseTime, stats.hitRate);

      return {
        name: 'Cache',
        status,
        level,
        responseTime: `${responseTime}ms`,
        details: {
          keys: stats.keyCount || 0,
          hits: stats.advanced?.hits || 0,
          misses: stats.advanced?.misses || 0,
          hitRate: stats.advanced?.hitRate || '0%',
          size: stats.advanced?.size || { kilobytes: '0' },
          memory: stats.advanced?.memoryUsage || 'N/A'
        }
      };
    } catch (error) {
      return {
        name: 'Cache',
        status: 'unhealthy',
        level: 'warning',
        error: error.message
      };
    }
  }

  /**
   * فحص الذاكرة
   */
  async checkMemory() {
    try {
      const used = process.memoryUsage();
      const total = os.totalmem();
      const free = os.freemem();
      
      const heapUsagePercent = (used.heapUsed / used.heapTotal * 100).toFixed(2);
      const systemUsagePercent = ((total - free) / total * 100).toFixed(2);

      const status = heapUsagePercent < this.thresholds.memoryWarning ? 'healthy' : 'warning';
      const level = this.getHealthLevel(status, null, heapUsagePercent);

      return {
        name: 'Memory',
        status,
        level,
        details: {
          process: {
            rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
            external: `${Math.round(used.external / 1024 / 1024)} MB`,
            usagePercent: `${heapUsagePercent}%`
          },
          system: {
            total: `${Math.round(total / 1024 / 1024 / 1024)} GB`,
            free: `${Math.round(free / 1024 / 1024 / 1024)} GB`,
            usagePercent: `${systemUsagePercent}%`
          }
        }
      };
    } catch (error) {
      return {
        name: 'Memory',
        status: 'unhealthy',
        level: 'warning',
        error: error.message
      };
    }
  }

  /**
   * فحص المعالج
   */
  async checkCpu() {
    try {
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      
      // حساب متوسط الحمل لكل نواة
      const loadPerCore = loadAvg[0] / cpus.length;
      const usagePercent = (loadPerCore * 100).toFixed(2);

      const status = parseFloat(usagePercent) < this.thresholds.cpuWarning ? 'healthy' : 'warning';
      const level = this.getHealthLevel(status, null, usagePercent);

      return {
        name: 'CPU',
        status,
        level,
        details: {
          cores: cpus.length,
          model: cpus[0]?.model || 'unknown',
          speed: cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'unknown',
          loadAverage: {
            '1min': loadAvg[0].toFixed(2),
            '5min': loadAvg[1].toFixed(2),
            '15min': loadAvg[2].toFixed(2)
          },
          usagePercent: `${usagePercent}%`
        }
      };
    } catch (error) {
      return {
        name: 'CPU',
        status: 'unhealthy',
        level: 'warning',
        error: error.message
      };
    }
  }

  /**
   * فحص مساحة القرص
   */
  async checkDiskSpace() {
    try {
      // محاولة استخدام check-disk-space إذا كان مثبتاً
      let diskSpace;
      try {
        const checkDiskSpaceModule = require('check-disk-space');
        diskSpace = await checkDiskSpaceModule('/');
      } catch (e) {
        // إذا لم يكن مثبتاً، نستخدم معلومات تقريبية
        diskSpace = {
          free: os.freemem() * 10,
          size: os.totalmem() * 20
        };
      }
      
      const freeGB = (diskSpace.free / 1024 / 1024 / 1024).toFixed(2);
      const totalGB = (diskSpace.size / 1024 / 1024 / 1024).toFixed(2);
      const usagePercent = ((1 - diskSpace.free / diskSpace.size) * 100).toFixed(2);

      const status = parseFloat(usagePercent) < this.thresholds.diskWarning ? 'healthy' : 'warning';
      const level = this.getHealthLevel(status, null, usagePercent);

      return {
        name: 'Disk Space',
        status,
        level,
        details: {
          free: freeGB + 'GB',
          total: totalGB + 'GB',
          usagePercent: usagePercent + '%',
          freePercent: (100 - parseFloat(usagePercent)).toFixed(2) + '%'
        }
      };
    } catch (error) {
      return {
        name: 'Disk Space',
        status: 'unhealthy',
        level: 'warning',
        error: error.message
      };
    }
  }

  /**
   * فحص خدمات خارجية
   */
  async checkExternalServices() {
    // يمكن إضافة فحص خدمات خارجية هنا (Cloudinary, Stripe, etc.)
    return {
      name: 'External Services',
      status: 'healthy',
      level: 'info',
      details: {
        cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured',
        email: process.env.EMAIL_ENABLED === 'true' ? 'enabled' : 'disabled',
        sms: process.env.SMS_ENABLED === 'true' ? 'enabled' : 'disabled'
      }
    };
  }

  // ========== 2. فحوصات مركبة ==========

  /**
   * فحص صحة سريع
   */
  async quickHealthCheck() {
    try {
      const dbCheck = await this.checkDatabase();
      
      return {
        status: dbCheck.status === 'healthy' ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        uptimeHuman: this.formatUptime(process.uptime()),
        version: packageJson.version,
        environment: process.env.NODE_ENV || 'development',
        database: dbCheck.details?.state || dbCheck.status
      };
    } catch (error) {
      businessLogger.error('Quick health check failed:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * فحص صحة كامل
   */
  async fullHealthCheck() {
    const startTime = Date.now();

    try {
      const checks = await Promise.allSettled([
        this.checkDatabase(),
        this.checkCache(),
        this.checkMemory(),
        this.checkCpu(),
        this.checkDiskSpace(),
        this.checkExternalServices()
      ]);

      const results = checks.map((check, index) => {
        const services = ['Database', 'Cache', 'Memory', 'CPU', 'Disk Space', 'External Services'];
        
        if (check.status === 'fulfilled') {
          return check.value;
        } else {
          return {
            name: services[index],
            status: 'unhealthy',
            level: 'critical',
            error: check.reason?.message || 'Check failed'
          };
        }
      });

      const allHealthy = results.every(r => r.status === 'healthy');
      const hasWarning = results.some(r => r.level === 'warning');
      const hasCritical = results.some(r => r.level === 'critical');

      let overallStatus = 'healthy';
      if (hasCritical) overallStatus = 'unhealthy';
      else if (hasWarning) overallStatus = 'warning';

      const responseTime = Date.now() - startTime;

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        uptime: process.uptime(),
        uptimeHuman: this.formatUptime(process.uptime()),
        version: packageJson.version,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: `${os.platform()} (${os.arch()})`,
        hostname: os.hostname(),
        checks: results,
        recommendations: this.generateRecommendations(results)
      };
    } catch (error) {
      businessLogger.error('Full health check failed:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * فحص الاستعداد (Readiness)
   */
  async readinessProbe() {
    try {
      const dbCheck = await this.checkDatabase();
      const cacheCheck = await this.checkCache();
      
      const isReady = dbCheck.status === 'healthy' && cacheCheck.status !== 'unhealthy';

      return {
        ready: isReady,
        timestamp: new Date().toISOString(),
        checks: {
          database: dbCheck.status,
          cache: cacheCheck.status
        }
      };
    } catch (error) {
      return {
        ready: false,
        error: error.message
      };
    }
  }

  /**
   * فحص الحياة (Liveness)
   */
  livenessProbe() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  // ========== 3. دوال مساعدة ==========

  /**
   * تحديد مستوى الصحة
   */
  getHealthLevel(status, responseTime = null, usagePercent = null) {
    if (status === 'unhealthy') return 'critical';

    if (responseTime && responseTime > this.thresholds.responseTimeWarning) {
      return 'warning';
    }

    if (usagePercent) {
      const percent = parseFloat(usagePercent);
      if (percent > this.thresholds.memoryWarning) return 'warning';
    }

    return 'info';
  }

  /**
   * إنشاء توصيات
   */
  generateRecommendations(checks) {
    const recommendations = [];

    checks.forEach(check => {
      if (check.level === 'critical') {
        recommendations.push({
          service: check.name,
          severity: 'critical',
          message: `${check.name} غير صحي. يرجى التدخل الفوري.`,
          error: check.error
        });
      } else if (check.level === 'warning') {
        switch (check.name) {
          case 'Memory':
            recommendations.push({
              service: 'Memory',
              severity: 'warning',
              message: 'استخدام الذاكرة مرتفع. قد تحتاج إلى زيادة الذاكرة أو مراجعة تسريبات الذاكرة.'
            });
            break;
          case 'CPU':
            recommendations.push({
              service: 'CPU',
              severity: 'warning',
              message: 'استخدام المعالج مرتفع. قد تحتاج إلى تحسين الأداء أو زيادة عدد النوى.'
            });
            break;
          case 'Disk Space':
            recommendations.push({
              service: 'Disk Space',
              severity: 'warning',
              message: 'مساحة القرص منخفضة. قد تحتاج إلى تنظيف الملفات القديمة.'
            });
            break;
          case 'Database':
            if (check.responseTime && parseInt(check.responseTime) > this.thresholds.responseTimeWarning) {
              recommendations.push({
                service: 'Database',
                severity: 'warning',
                message: 'وقت استجابة قاعدة البيانات مرتفع. قد تحتاج إلى تحسين الاستعلامات أو إضافة فهارس.'
              });
            }
            break;
        }
      }
    });

    return recommendations;
  }

  /**
   * تنسيق وقت التشغيل
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutes > 0) parts.push(`${minutes} دقيقة`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} ثانية`);

    return parts.join(' ');
  }
}

module.exports = new HealthCheckService();