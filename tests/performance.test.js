// ============================================
// ملف: tests/performance.test.js
// الوصف: اختبارات الأداء
// ============================================

const request = require('supertest');
const app = require('../src/app');
const performanceService = require('../src/services/performance.service');
const setupApp = require('./helpers/setupApp');

// تعريف دالة sleep محلياً
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let testApp;

// تهيئة السيرفر قبل كل الاختبارات
beforeAll(async () => {
  testApp = await setupApp();
});

describe('⚡ اختبارات الأداء (Performance)', () => {
  
  // ========== 1. اختبارات قياس وقت الاستجابة ==========
  describe('Response Time', () => {
    it('يجب أن تكون استجابة الصفحة الرئيسية سريعة', async () => {
      const start = Date.now();
      
      await request(testApp)
        .get('/')
        .expect(200);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // أقل من 500ms
    });

    it('يجب أن تكون استجابة المطاعم سريعة', async () => {
      const start = Date.now();
      
      await request(testApp)
        .get('/api/v1/restaurants')
        .expect(200);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // أقل من 1000ms
    });
  });

  // ========== 2. اختبارات قياس الأداء تحت الضغط ==========
  describe('Load Testing', () => {
    it('يجب التعامل مع طلبات متعددة', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(testApp)
            .get('/health')
            .expect(200)
        );
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });
  });

  // ========== 3. اختبارات Performance Service ==========
  describe('Performance Service', () => {
    beforeEach(() => {
      performanceService.reset();
    });

    it('يجب تسجيل الاستعلامات', async () => {
      await performanceService.measureQuery('test-query', async () => {
        return { data: 'test' };
      });

      const stats = performanceService.getStats();
      expect(stats.summary.totalQueries).toBe(1);
    });

    it('يجب تسجيل الاستعلامات البطيئة', async () => {
      await performanceService.measureQuery('slow-query', async () => {
        await sleep(200);
        return { data: 'test' };
      });

      const stats = performanceService.getStats();
      expect(stats.summary.slowQueries).toBe(1);
    });

    it('يجب حساب متوسط وقت الاستجابة', async () => {
      for (let i = 0; i < 5; i++) {
        await performanceService.measureQuery(`query-${i}`, async () => {
          await sleep(50);
          return { data: 'test' };
        });
      }

      const stats = performanceService.getStats();
      expect(stats.summary.averageQueryTime).toBeDefined();
    });

    it('يجب توفير تقرير أداء', () => {
      const report = performanceService.getReport();
      expect(report).toContain('تقرير أداء النظام');
    });
  });
});