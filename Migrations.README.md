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