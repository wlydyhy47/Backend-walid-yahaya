# نظام الترحيلات (Migrations)

## 📋 نظرة عامة

نظام الترحيلات يساعد في تحديث قاعدة البيانات بشكل آمن ومنظم عند إضافة ميزات جديدة أو تغيير هيكل البيانات.

## 🚀 الأوامر المتاحة

### تشغيل الترحيلات

```bash
# تشغيل جميع الترحيلات المعلقة
npm run migrate

# تشغيل الترحيلات حتى اسم معين
npm run migrate -- --up-to 20240310_003_update_orders

# محاكاة التشغيل بدون تغيير البيانات
npm run migrate:dry-run

# الرجوع عن آخر ترحيل
npm run rollback

# الرجوع عن 3 ترحيلات
npm run rollback:step -- 3

# الرجوع إلى ترحيل معين
npm run rollback:to -- 20240310_002_update_store_stats

# إنشاء ترحيل جديد مع وصف
npm run migrate:create -- "add_new_field" "وصف الترحيل"

# عرض حالة الترحيلات
npm run migrate:status

#/
عند إنشاء ترحيل جديد، اتبع هذا النمط:
module.exports = {
  name: '20240310_005_my_migration',
  description: 'وصف ما يفعله الترحيل',

  async up() {
    // كود الترقية هنا
    const affected = { users: 0 };
    
    // ... العمليات على قاعدة البيانات
    
    return { affected };
  },

  async down() {
    // كود الرجوع هنا
    return { success: true };
  }
};
#/


⚠️ تنبيهات مهمة
قبل تشغيل الترحيلات في الإنتاج: اعمل نسخة احتياطية من قاعدة البيانات

الترحيلات غير قابلة للتعديل: بمجرد تطبيقها، لا تعدل ملف الترحيل

اختبار الترحيلات: اختبر الترحيلات في بيئة تطوير أولاً

التوثيق: وضّح ما يفعله كل ترحيل في وصفه

🔄 تسلسل الترحيلات
الترحيلات تطبق حسب الترتيب الزمني (حسب الاسم). استخدم التنسيق:
YYYYMMDD_NNN_description.js

مثال: 20240310_001_add_loyalty_points.js

text

---

## **📋 ما تم إنجازه:**

| # | الملف | الوصف |
|---|-------|-------|
| 1 | `src/migrations/index.js` | مدير الترحيلات الرئيسي |
| 2 | `src/migrations/migrate.js` | سكريبت تشغيل الترحيلات |
| 3 | `src/migrations/rollback.js` | سكريبت الرجوع عن الترحيلات |
| 4 | `src/migrations/scripts/20240310_001_add_loyalty_points.js` | إضافة نقاط الولاء |
| 5 | `src/migrations/scripts/20240310_002_update_store_stats.js` | تحديث إحصائيات المطاعم |
| 6 | `src/migrations/scripts/20240310_003_update_orders.js` | تحديث بيانات الطلبات |
| 7 | `src/migrations/scripts/20240310_004_create_analytics.js` | إنشاء بيانات تحليلية |
| 8 | `package.json` (محدث) | إضافة سكريبتات npm |
| 9 | `README.md` للـ Migrations | توثيق النظام |

---

## **كيفية استخدام نظام الترحيلات:**

### 1️⃣ **عرض حالة الترحيلات:**
```bash
npm run migrate:status
2️⃣ تشغيل جميع الترحيلات المعلقة:
bash
npm run migrate
3️⃣ محاكاة التشغيل (تجربة بدون تغيير):
bash
npm run migrate:dry-run
4️⃣ الرجوع عن آخر ترحيل:
bash
npm run rollback
5️⃣ إنشاء ترحيل جديد:
bash
npm run migrate:create -- "add_new_feature" "وصف الميزة الجديدة"