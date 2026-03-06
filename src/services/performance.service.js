// src/services/performance.service.js

const { performance } = require('perf_hooks');
const cache = require('../utils/cache.util');

class PerformanceService {
  constructor() {
    this.metrics = {
      queries: [],
      requests: [],
      startTime: Date.now()
    };
    
    // تنظيف تلقائي كل ساعة
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  // ========== 1. قياس وقت تنفيذ query ==========
  async measureQuery(label, queryFn) {
    const start = performance.now();
    try {
      const result = await queryFn();
      const duration = performance.now() - start;
      
      this.metrics.queries.push({
        label,
        duration: `${duration.toFixed(2)}ms`,
        value: duration,
        timestamp: new Date()
      });

      // تخزين في الكاش إذا كان بطيئاً (أكثر من 100ms)
      if (duration > 100) {
        console.warn(`⚠️ Slow query (${duration.toFixed(2)}ms): ${label}`);
        
        // حفظ في الكاش لمدة 5 دقائق
        const cacheKey = `slow_query:${label}:${Date.now()}`;
        cache.set(cacheKey, { label, duration, timestamp: new Date() }, 300);
      }

      // الاحتفاظ بآخر 100 query فقط
      if (this.metrics.queries.length > 100) {
        this.metrics.queries = this.metrics.queries.slice(-100);
      }

      return result;
    } catch (error) {
      console.error(`❌ Query failed: ${label}`, error);
      throw error;
    }
  }

  // ========== 2. Middleware لقياس أداء الطلبات ==========
  measureRequest() {
    return (req, res, next) => {
      const start = performance.now();
      const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 8);

      // إضافة معرف فريد للطلب
      req.requestId = requestId;

      res.on('finish', () => {
        const duration = performance.now() - start;
        
        this.metrics.requests.push({
          id: requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration: `${duration.toFixed(2)}ms`,
          value: duration,
          userId: req.user?.id || 'guest',
          timestamp: new Date()
        });

        // تحذير للطلبات البطيئة (أكثر من 1 ثانية)
        if (duration > 1000) {
          console.warn(`🐢 Slow request (${duration.toFixed(2)}ms): ${req.method} ${req.originalUrl}`);
          
          // حفظ في الكاش
          const cacheKey = `slow_request:${requestId}`;
          cache.set(cacheKey, {
            method: req.method,
            url: req.originalUrl,
            duration,
            timestamp: new Date()
          }, 300);
        }

        // تسجيل الطلبات السريعة جداً (اختياري)
        if (duration < 50) {
          console.log(`⚡ Fast request (${duration.toFixed(2)}ms): ${req.method} ${req.originalUrl}`);
        }

        // الاحتفاظ بآخر 100 request فقط
        if (this.metrics.requests.length > 100) {
          this.metrics.requests = this.metrics.requests.slice(-100);
        }
      });

      next();
    };
  }

  // ========== 3. الحصول على إحصائيات الأداء ==========
  getStats() {
    // متوسط وقت الاستعلامات
    const avgQueryTime = this.metrics.queries.length > 0
      ? this.metrics.queries.reduce((sum, q) => sum + q.value, 0) / this.metrics.queries.length
      : 0;

    // متوسط وقت الطلبات
    const avgRequestTime = this.metrics.requests.length > 0
      ? this.metrics.requests.reduce((sum, r) => sum + r.value, 0) / this.metrics.requests.length
      : 0;

    // أبطأ استعلام
    const slowestQuery = this.metrics.queries.length > 0
      ? this.metrics.queries.reduce((slowest, current) => 
          current.value > (slowest?.value || 0) ? current : slowest
        , null)
      : null;

    // أبطأ طلب
    const slowestRequest = this.metrics.requests.length > 0
      ? this.metrics.requests.reduce((slowest, current) => 
          current.value > (slowest?.value || 0) ? current : slowest
        , null)
      : null;

    // الاستعلامات الأكثر تكراراً
    const queryFrequency = {};
    this.metrics.queries.forEach(q => {
      queryFrequency[q.label] = (queryFrequency[q.label] || 0) + 1;
    });

    // الطلبات حسب المسار
    const requestsByUrl = {};
    this.metrics.requests.forEach(r => {
      const key = `${r.method} ${r.url}`;
      requestsByUrl[key] = (requestsByUrl[key] || 0) + 1;
    });

    return {
      summary: {
        uptime: `${((Date.now() - this.metrics.startTime) / 1000 / 60).toFixed(2)} minutes`,
        totalQueries: this.metrics.queries.length,
        totalRequests: this.metrics.requests.length,
        averageQueryTime: `${avgQueryTime.toFixed(2)}ms`,
        averageRequestTime: `${avgRequestTime.toFixed(2)}ms`,
        slowQueries: this.metrics.queries.filter(q => q.value > 100).length,
        slowRequests: this.metrics.requests.filter(r => r.value > 1000).length,
        fastRequests: this.metrics.requests.filter(r => r.value < 50).length
      },
      slowest: {
        query: slowestQuery ? {
          label: slowestQuery.label,
          duration: slowestQuery.duration,
          timestamp: slowestQuery.timestamp
        } : null,
        request: slowestRequest ? {
          method: slowestRequest.method,
          url: slowestRequest.url,
          duration: slowestRequest.duration,
          timestamp: slowestRequest.timestamp
        } : null
      },
      frequency: {
        topQueries: Object.entries(queryFrequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([label, count]) => ({ label, count })),
        topRequests: Object.entries(requestsByUrl)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([url, count]) => ({ url, count }))
      },
      recent: {
        queries: this.metrics.queries.slice(-5).map(q => ({
          label: q.label,
          duration: q.duration,
          timestamp: q.timestamp
        })),
        requests: this.metrics.requests.slice(-5).map(r => ({
          method: r.method,
          url: r.url,
          duration: r.duration,
          status: r.status,
          userId: r.userId,
          timestamp: r.timestamp
        }))
      }
    };
  }

  // ========== 4. تصفية البيانات القديمة ==========
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    this.metrics.queries = this.metrics.queries.filter(
      q => new Date(q.timestamp).getTime() > oneHourAgo
    );
    
    this.metrics.requests = this.metrics.requests.filter(
      r => new Date(r.timestamp).getTime() > oneHourAgo
    );

    console.log(`🧹 Cleaned up performance metrics: ${this.metrics.queries.length} queries, ${this.metrics.requests.length} requests remain`);
  }

  // ========== 5. إعادة تعيين الإحصائيات ==========
  reset() {
    this.metrics = {
      queries: [],
      requests: [],
      startTime: Date.now()
    };
    console.log('🔄 Performance metrics reset');
  }

  // ========== 6. الحصول على تقرير الأداء (نصي) ==========
  getReport() {
    const stats = this.getStats();
    
    return `
📊 **Performance Report**
━━━━━━━━━━━━━━━━━━━━━━━━
⏱️  Uptime: ${stats.summary.uptime}
📈 Total Queries: ${stats.summary.totalQueries}
📊 Total Requests: ${stats.summary.totalRequests}
⚡ Avg Query: ${stats.summary.averageQueryTime}
🚀 Avg Request: ${stats.summary.averageRequestTime}
🐢 Slow Queries: ${stats.summary.slowQueries}
🐌 Slow Requests: ${stats.summary.slowRequests}

🔝 Top Queries:
${stats.frequency.topQueries.map(q => `  • ${q.label}: ${q.count} times`).join('\n')}

🔝 Top Endpoints:
${stats.frequency.topRequests.map(r => `  • ${r.url}: ${r.count} requests`).join('\n')}

🐌 Slowest Query: ${stats.slowest.query ? `${stats.slowest.query.label} (${stats.slowest.query.duration})` : 'None'}
🐢 Slowest Request: ${stats.slowest.request ? `${stats.slowest.request.method} ${stats.slowest.request.url} (${stats.slowest.request.duration})` : 'None'}
━━━━━━━━━━━━━━━━━━━━━━━━
    `;
  }
}

module.exports = new PerformanceService();