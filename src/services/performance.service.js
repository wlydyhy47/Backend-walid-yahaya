// ============================================
// ملف: src/services/performance.service.js (محدث)
// الوصف: خدمة مراقبة وتحليل الأداء المتقدمة
// ============================================

const { performance } = require('perf_hooks');
const cache = require('../utils/cache.util');
const { businessLogger } = require("../utils/logger.util");
const os = require('os');

class PerformanceService {
  constructor() {
    this.metrics = {
      queries: [],
      requests: [],
      errors: [],
      slowQueries: [],
      slowRequests: [],
      startTime: Date.now()
    };

    this.thresholds = {
      slowQuery: 100,      // 100ms
      verySlowQuery: 500,  // 500ms
      slowRequest: 1000,   // 1s
      verySlowRequest: 3000 // 3s
    };

    this.stats = {
      totalRequests: 0,
      totalQueries: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      peakMemory: 0,
      peakCpu: 0
    };

    // تنظيف تلقائي كل ساعة
    setInterval(() => this.cleanup(), 60 * 60 * 1000);

    // تحديث الإحصائيات كل دقيقة
    setInterval(() => this.updateStats(), 60 * 1000);
  }

  // ========== 1. قياس الأداء ==========

  /**
   * قياس وقت تنفيذ Query
   */
  async measureQuery(label, queryFn, options = {}) {
    const start = performance.now();
    const memoryBefore = process.memoryUsage().heapUsed;

    try {
      const result = await queryFn();
      const duration = performance.now() - start;
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryUsed = memoryAfter - memoryBefore;

      const queryMetric = {
        label,
        duration,
        memoryUsed,
        timestamp: new Date(),
        success: true
      };

      this.metrics.queries.push(queryMetric);
      this.stats.totalQueries++;

      // تسجيل الاستعلامات البطيئة
      if (duration > this.thresholds.slowQuery) {
        this.metrics.slowQueries.push({
          ...queryMetric,
          threshold: duration > this.thresholds.verySlowQuery ? 'VERY_SLOW' : 'SLOW'
        });

        const level = duration > this.thresholds.verySlowQuery ? 'warn' : 'info';
        businessLogger[level](`Slow query detected`, {
          label,
          duration: `${duration.toFixed(2)}ms`,
          memoryUsed: `${(memoryUsed / 1024 / 1024).toFixed(2)}MB`
        });

        // تخزين في الكاش للتحليل
        const cacheKey = `slow_query:${label}:${Date.now()}`;
        cache.set(cacheKey, { label, duration, timestamp: new Date() }, 300);
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;

      this.metrics.errors.push({
        type: 'query',
        label,
        duration,
        error: error.message,
        timestamp: new Date()
      });

      this.stats.totalErrors++;

      businessLogger.error(`Query failed: ${label}`, {
        duration: `${duration.toFixed(2)}ms`,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Middleware لقياس أداء الطلبات
   */
  measureRequest() {
    return (req, res, next) => {
      const start = performance.now();
      const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const memoryBefore = process.memoryUsage().heapUsed;

      // إضافة معرف فريد للطلب
      req.requestId = requestId;
      req.startTime = start;

      // تسجيل بداية الطلب
      businessLogger.debug(`Request started`, {
        requestId,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.id || 'guest'
      });

      // الاستماع لحدث الانتهاء
      res.on('finish', () => {
        const duration = performance.now() - start;
        const memoryAfter = process.memoryUsage().heapUsed;
        const memoryUsed = memoryAfter - memoryBefore;

        const requestMetric = {
          id: requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration,
          memoryUsed,
          userId: req.user?.id || 'guest',
          userAgent: req.get('user-agent'),
          ip: req.ip,
          timestamp: new Date()
        };

        this.metrics.requests.push(requestMetric);
        this.stats.totalRequests++;

        // تحديث متوسط وقت الاستجابة
        this.updateAverageResponseTime(duration);

        // تسجيل الذروة
        if (memoryUsed > this.stats.peakMemory) {
          this.stats.peakMemory = memoryUsed;
        }

        // تسجيل الطلبات البطيئة
        if (duration > this.thresholds.slowRequest) {
          this.metrics.slowRequests.push({
            ...requestMetric,
            threshold: duration > this.thresholds.verySlowRequest ? 'VERY_SLOW' : 'SLOW'
          });

          const level = duration > this.thresholds.verySlowRequest ? 'warn' : 'info';
          businessLogger[level](`Slow request detected`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            duration: `${duration.toFixed(2)}ms`,
            status: res.statusCode
          });

          // تخزين في الكاش
          const cacheKey = `slow_request:${requestId}`;
          cache.set(cacheKey, requestMetric, 300);
        }

        // تسجيل الطلبات السريعة (اختياري)
        if (duration < 50) {
          businessLogger.debug(`Fast request`, {
            requestId,
            duration: `${duration.toFixed(2)}ms`
          });
        }

        // الحفاظ على آخر 1000 طلب فقط
        if (this.metrics.requests.length > 1000) {
          this.metrics.requests = this.metrics.requests.slice(-1000);
        }
      });

      // الاستماع للأخطاء
      res.on('error', (error) => {
        this.metrics.errors.push({
          type: 'request',
          requestId,
          error: error.message,
          timestamp: new Date()
        });

        this.stats.totalErrors++;
      });

      next();
    };
  }

  /**
   * تحديث متوسط وقت الاستجابة
   */
  updateAverageResponseTime(duration) {
    const total = this.stats.avgResponseTime * (this.stats.totalRequests - 1) + duration;
    this.stats.avgResponseTime = total / this.stats.totalRequests;
  }

  // ========== 2. إحصائيات النظام ==========

  /**
   * تحديث إحصائيات النظام
   */
  updateStats() {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const loadAvg = os.loadavg();

      this.stats.currentMemory = {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      };

      this.stats.currentCpu = {
        user: cpuUsage.user,
        system: cpuUsage.system
      };

      this.stats.loadAverage = {
        '1min': loadAvg[0],
        '5min': loadAvg[1],
        '15min': loadAvg[2]
      };

      this.stats.uptime = process.uptime();
      this.stats.timestamp = new Date();

      // تحديث الذروة
      if (memoryUsage.heapUsed > this.stats.peakMemory) {
        this.stats.peakMemory = memoryUsage.heapUsed;
      }
    } catch (error) {
      businessLogger.error('Update stats error:', error);
    }
  }

  // ========== 3. الحصول على الإحصائيات ==========

  /**
   * الحصول على إحصائيات الأداء
   */
  getStats() {
    // متوسط وقت الاستعلامات
    const avgQueryTime = this.metrics.queries.length > 0
      ? this.metrics.queries.reduce((sum, q) => sum + q.duration, 0) / this.metrics.queries.length
      : 0;

    // متوسط وقت الطلبات
    const avgRequestTime = this.metrics.requests.length > 0
      ? this.metrics.requests.reduce((sum, r) => sum + r.duration, 0) / this.metrics.requests.length
      : 0;

    // أبطأ استعلام
    const slowestQuery = this.metrics.queries.length > 0
      ? this.metrics.queries.reduce((slowest, current) => 
          current.duration > (slowest?.duration || 0) ? current : slowest, null)
      : null;

    // أبطأ طلب
    const slowestRequest = this.metrics.requests.length > 0
      ? this.metrics.requests.reduce((slowest, current) => 
          current.duration > (slowest?.duration || 0) ? current : slowest, null)
      : null;

    // الاستعلامات حسب التكرار
    const queryFrequency = {};
    this.metrics.queries.forEach(q => {
      queryFrequency[q.label] = (queryFrequency[q.label] || 0) + 1;
    });

    // الطلبات حسب المسار
    const requestsByUrl = {};
    this.metrics.requests.forEach(r => {
      const key = `${r.method} ${r.url.split('?')[0]}`;
      requestsByUrl[key] = (requestsByUrl[key] || 0) + 1;
    });

    // الطلبات حسب الحالة
    const requestsByStatus = {};
    this.metrics.requests.forEach(r => {
      requestsByStatus[r.status] = (requestsByStatus[r.status] || 0) + 1;
    });

    // الطلبات حسب الساعة
    const requestsByHour = new Array(24).fill(0);
    this.metrics.requests.forEach(r => {
      const hour = new Date(r.timestamp).getHours();
      requestsByHour[hour]++;
    });

    // الأخطاء حسب النوع
    const errorsByType = {};
    this.metrics.errors.forEach(e => {
      errorsByType[e.type] = (errorsByType[e.type] || 0) + 1;
    });

    // إحصائيات الذاكرة
    const memoryStats = {
      current: this.formatMemory(this.stats.currentMemory),
      peak: this.formatMemory({ heapUsed: this.stats.peakMemory }),
      average: this.formatMemory({ 
        heapUsed: this.metrics.requests.length > 0
          ? this.metrics.requests.reduce((sum, r) => sum + (r.memoryUsed || 0), 0) / this.metrics.requests.length
          : 0
      })
    };

    return {
      summary: {
        uptime: this.formatUptime(process.uptime()),
        totalQueries: this.metrics.queries.length,
        totalRequests: this.metrics.requests.length,
        totalErrors: this.metrics.errors.length,
        averageQueryTime: `${avgQueryTime.toFixed(2)}ms`,
        averageRequestTime: `${avgRequestTime.toFixed(2)}ms`,
        slowQueries: this.metrics.slowQueries.length,
        slowRequests: this.metrics.slowRequests.length,
        errorRate: this.metrics.requests.length > 0
          ? ((this.metrics.errors.length / this.metrics.requests.length) * 100).toFixed(2) + '%'
          : '0%'
      },
      slowest: {
        query: slowestQuery ? {
          label: slowestQuery.label,
          duration: `${slowestQuery.duration.toFixed(2)}ms`,
          timestamp: slowestQuery.timestamp
        } : null,
        request: slowestRequest ? {
          method: slowestRequest.method,
          url: slowestRequest.url,
          duration: `${slowestRequest.duration.toFixed(2)}ms`,
          status: slowestRequest.status,
          timestamp: slowestRequest.timestamp
        } : null
      },
      frequency: {
        topQueries: Object.entries(queryFrequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([label, count]) => ({ label, count })),
        topEndpoints: Object.entries(requestsByUrl)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([url, count]) => ({ url, count }))
      },
      distribution: {
        byStatus: requestsByStatus,
        byHour: requestsByHour
      },
      errors: {
        byType: errorsByType,
        recent: this.metrics.errors.slice(-10)
      },
      system: {
        memory: memoryStats,
        cpu: this.stats.currentCpu,
        loadAverage: this.stats.loadAverage,
        nodeVersion: process.version,
        platform: `${os.platform()} (${os.arch()})`,
        pid: process.pid
      },
      recent: {
        queries: this.metrics.queries.slice(-10).map(q => ({
          label: q.label,
          duration: `${q.duration.toFixed(2)}ms`,
          timestamp: q.timestamp
        })),
        requests: this.metrics.requests.slice(-10).map(r => ({
          method: r.method,
          url: r.url,
          duration: `${r.duration.toFixed(2)}ms`,
          status: r.status,
          userId: r.userId,
          timestamp: r.timestamp
        }))
      },
      timestamp: new Date()
    };
  }

  /**
   * الحصول على تقرير الأداء (نصي)
   */
  getReport() {
    const stats = this.getStats();
    
    const formatDate = (date) => {
      return new Date(date).toLocaleString('ar-SA');
    };

    return `
╔════════════════════════════════════════════════════════════╗
║                    📊 تقرير أداء النظام                     ║
╠════════════════════════════════════════════════════════════╣
║                                                              ║
║  ⏱️  وقت التشغيل: ${stats.summary.uptime.padEnd(30)}          ║
║  📈 إجمالي الاستعلامات: ${stats.summary.totalQueries.toString().padEnd(25)} ║
║  📊 إجمالي الطلبات: ${stats.summary.totalRequests.toString().padEnd(27)} ║
║  ❌ إجمالي الأخطاء: ${stats.summary.totalErrors.toString().padEnd(28)} ║
║                                                              ║
║  ⚡ متوسط وقت الاستعلام: ${stats.summary.averageQueryTime.padEnd(24)} ║
║  🚀 متوسط وقت الطلب: ${stats.summary.averageRequestTime.padEnd(26)} ║
║  🐢 الاستعلامات البطيئة: ${stats.summary.slowQueries.toString().padEnd(25)} ║
║  🐌 الطلبات البطيئة: ${stats.summary.slowRequests.toString().padEnd(27)} ║
║  📉 نسبة الأخطاء: ${stats.summary.errorRate.padEnd(29)} ║
║                                                              ║
╟──────────────────────────────────────────────────────────────╢
║                                                              ║
║  🔝 أكثر 5 استعلامات تكراراً:                                ║
${stats.frequency.topQueries.slice(0, 5).map(q => 
  `  • ${q.label}: ${q.count} مرة`.padEnd(55)
).join('\n')}
║                                                              ║
║  🔝 أكثر 5 endpoints طلباً:                                  ║
${stats.frequency.topEndpoints.slice(0, 5).map(e => 
  `  • ${e.url}: ${e.count} طلب`.padEnd(55)
).join('\n')}
║                                                              ║
╟──────────────────────────────────────────────────────────────╢
║                                                              ║
║  🐢 أبطأ استعلام:                                            ║
${stats.slowest.query ? 
  `  • ${stats.slowest.query.label}: ${stats.slowest.query.duration}` : 
  '  • لا يوجد'
}
║                                                              ║
║  🐌 أبطأ طلب:                                                ║
${stats.slowest.request ? 
  `  • ${stats.slowest.request.method} ${stats.slowest.request.url}: ${stats.slowest.request.duration}` : 
  '  • لا يوجد'
}
║                                                              ║
╟──────────────────────────────────────────────────────────────╢
║                                                              ║
║  💾 الذاكرة:                                                  ║
║  • الحالية: ${stats.system.memory.current.heapUsed}        ║
║  • الذروة: ${stats.system.memory.peak.heapUsed}             ║
║  • المتوسط: ${stats.system.memory.average.heapUsed}         ║
║                                                              ║
║  🔧 النظام:                                                   ║
║  • Node.js: ${stats.system.nodeVersion}                      ║
║  • المنصة: ${stats.system.platform}                          ║
║  • PID: ${stats.system.pid}                                  ║
║                                                              ║
╚════════════════════════════════════════════════════════════╝

⏰ تم التحديث: ${formatDate(stats.timestamp)}
    `;
  }

  // ========== 4. دوال مساعدة ==========

  /**
   * تنظيف البيانات القديمة
   */
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    // الاحتفاظ بالبيانات الحديثة فقط
    this.metrics.queries = this.metrics.queries.filter(
      q => new Date(q.timestamp).getTime() > oneHourAgo
    );

    this.metrics.requests = this.metrics.requests.filter(
      r => new Date(r.timestamp).getTime() > oneHourAgo
    );

    this.metrics.slowQueries = this.metrics.slowQueries.filter(
      q => new Date(q.timestamp).getTime() > oneDayAgo
    );

    this.metrics.slowRequests = this.metrics.slowRequests.filter(
      r => new Date(r.timestamp).getTime() > oneDayAgo
    );

    this.metrics.errors = this.metrics.errors.filter(
      e => new Date(e.timestamp).getTime() > oneDayAgo
    );

    businessLogger.info('Performance metrics cleaned up', {
      queries: this.metrics.queries.length,
      requests: this.metrics.requests.length,
      errors: this.metrics.errors.length
    });
  }

  /**
   * إعادة تعيين الإحصائيات
   */
  reset() {
    this.metrics = {
      queries: [],
      requests: [],
      errors: [],
      slowQueries: [],
      slowRequests: [],
      startTime: Date.now()
    };

    this.stats = {
      totalRequests: 0,
      totalQueries: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      peakMemory: 0,
      peakCpu: 0
    };

    businessLogger.info('Performance metrics reset');
  }

  /**
   * تنسيق الذاكرة
   */
  formatMemory(memory) {
    if (!memory) return { rss: '0', heapUsed: '0' };

    return {
      rss: memory.rss ? `${(memory.rss / 1024 / 1024).toFixed(2)} MB` : '0 MB',
      heapTotal: memory.heapTotal ? `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB` : '0 MB',
      heapUsed: memory.heapUsed ? `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB` : '0 MB',
      external: memory.external ? `${(memory.external / 1024 / 1024).toFixed(2)} MB` : '0 MB'
    };
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

  /**
   * الحصول على توصيات الأداء
   */
  getRecommendations() {
    const stats = this.getStats();
    const recommendations = [];

    // توصيات للاستعلامات البطيئة
    if (stats.summary.slowQueries > 10) {
      recommendations.push({
        type: 'warning',
        title: 'استعلامات بطيئة',
        description: `هناك ${stats.summary.slowQueries} استعلام بطيء. يُنصح بمراجعة الفهارس وتحسين الاستعلامات.`,
        action: 'مراجعة الاستعلامات البطيئة'
      });
    }

    // توصيات للطلبات البطيئة
    if (stats.summary.slowRequests > 5) {
      recommendations.push({
        type: 'warning',
        title: 'طلبات بطيئة',
        description: `هناك ${stats.summary.slowRequests} طلب بطيء. قد تحتاج إلى تحسين أداء endpoints معينة.`,
        action: 'تحليل الطلبات البطيئة'
      });
    }

    // توصيات للذاكرة
    if (stats.system.memory.current.heapUsed > 500 * 1024 * 1024) {
      recommendations.push({
        type: 'critical',
        title: 'استخدام ذاكرة مرتفع',
        description: `استخدام الذاكرة الحالي مرتفع: ${stats.system.memory.current.heapUsed}`,
        action: 'مراجعة تسريبات الذاكرة'
      });
    }

    // توصيات لمعدل الأخطاء
    const errorRate = parseFloat(stats.summary.errorRate);
    if (errorRate > 5) {
      recommendations.push({
        type: 'warning',
        title: 'معدل أخطاء مرتفع',
        description: `معدل الأخطاء ${errorRate}% وهو أعلى من المعدل الطبيعي.`,
        action: 'مراجعة سجل الأخطاء'
      });
    }

    return recommendations;
  }

  
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = new PerformanceService();

