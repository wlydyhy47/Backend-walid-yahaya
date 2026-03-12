// ============================================
// ملف: src/migrations/index.js
// الوصف: نظام إدارة الترحيلات (Migrations)
// ============================================

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { businessLogger } = require('../utils/logger.util');

class MigrationManager {
  constructor() {
    this.migrations = [];
    this.migrationCollection = 'migrations';
    this.scriptsDir = path.join(__dirname, 'scripts');
  }

  /**
   * تهيئة مدير الترحيلات
   */
  async initialize() {
    try {
      // التأكد من وجود مجلد scripts
      await fs.mkdir(this.scriptsDir, { recursive: true });

      // إنشاء مجموعة الترحيلات إذا لم تكن موجودة
      if (!mongoose.models[this.migrationCollection]) {
        const migrationSchema = new mongoose.Schema({
          name: { type: String, required: true, unique: true },
          description: String,
          appliedAt: { type: Date, default: Date.now },
          duration: Number,
          status: { 
            type: String, 
            enum: ['pending', 'success', 'failed', 'rolledback'],
            default: 'pending'
          },
          error: String,
          affected: {
            users: Number,
            orders: Number,
            restaurants: Number,
            items: Number,
            reviews: Number
          },
          metadata: mongoose.Schema.Types.Mixed
        });

        mongoose.model(this.migrationCollection, migrationSchema);
      }

      // تحميل ملفات الترحيلات
      await this.loadMigrations();

      businessLogger.info(`Migration manager initialized with ${this.migrations.length} migrations`);
    } catch (error) {
      businessLogger.error('Failed to initialize migration manager:', error);
      throw error;
    }
  }

  /**
   * تحميل ملفات الترحيلات
   */
  async loadMigrations() {
    try {
      const files = await fs.readdir(this.scriptsDir);
      
      // فلترة ملفات JavaScript فقط
      const migrationFiles = files
        .filter(f => f.endsWith('.js') && !f.startsWith('_'))
        .sort(); // ترتيب تصاعدي

      this.migrations = [];

      for (const file of migrationFiles) {
        try {
          const migrationPath = path.join(this.scriptsDir, file);
          const migration = require(migrationPath);
          
          // التحقق من صحة الترحيل
          if (migration.name && (migration.up || migration.down)) {
            this.migrations.push({
              ...migration,
              filename: file,
              path: migrationPath
            });
          } else {
            businessLogger.warn(`Invalid migration file: ${file}`);
          }
        } catch (error) {
          businessLogger.error(`Error loading migration ${file}:`, error);
        }
      }
    } catch (error) {
      businessLogger.error('Error loading migrations:', error);
      throw error;
    }
  }

  /**
   * الحصول على الترحيلات المطبقة
   */
  async getAppliedMigrations() {
    const Migration = mongoose.model(this.migrationCollection);
    return await Migration.find().sort({ appliedAt: 1 }).lean();
  }

  /**
   * الحصول على الترحيلات المعلقة
   */
  async getPendingMigrations() {
    const applied = await this.getAppliedMigrations();
    const appliedNames = applied.map(m => m.name);

    return this.migrations.filter(m => !appliedNames.includes(m.name));
  }

  /**
   * تشغيل الترحيلات
   */
  async migrate(options = {}) {
    const {
      upTo = null,
      force = false,
      dryRun = false
    } = options;

    const Migration = mongoose.model(this.migrationCollection);
    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      businessLogger.info('No pending migrations');
      return { success: true, message: 'No pending migrations' };
    }

    businessLogger.info(`Found ${pending.length} pending migrations`);

    const results = {
      total: pending.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      migrations: []
    };

    for (const migration of pending) {
      // التوقف إذا وصلنا إلى الترحيل المحدد
      if (upTo && migration.name > upTo) {
        results.skipped++;
        continue;
      }

      businessLogger.info(`Running migration: ${migration.name} - ${migration.description || ''}`);

      if (dryRun) {
        businessLogger.info(`[DRY RUN] Would run: ${migration.name}`);
        results.successful++;
        continue;
      }

      const startTime = Date.now();

      try {
        // تشغيل الترحيل
        const result = await migration.up();

        // تسجيل الترحيل في قاعدة البيانات
        await Migration.create({
          name: migration.name,
          description: migration.description,
          appliedAt: new Date(),
          duration: Date.now() - startTime,
          status: 'success',
          affected: result?.affected || {},
          metadata: result?.metadata || {}
        });

        results.successful++;
        results.migrations.push({
          name: migration.name,
          status: 'success',
          duration: Date.now() - startTime,
          affected: result?.affected
        });

        businessLogger.info(`✅ Migration ${migration.name} completed in ${Date.now() - startTime}ms`);
      } catch (error) {
        businessLogger.error(`❌ Migration ${migration.name} failed:`, error);

        // تسجيل الفشل
        await Migration.create({
          name: migration.name,
          description: migration.description,
          appliedAt: new Date(),
          duration: Date.now() - startTime,
          status: 'failed',
          error: error.message
        });

        results.failed++;
        results.migrations.push({
          name: migration.name,
          status: 'failed',
          error: error.message
        });

        // إذا لم نستخدم force، نتوقف عند أول فشل
        if (!force) {
          break;
        }
      }
    }

    businessLogger.info('Migration completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      skipped: results.skipped
    });

    return results;
  }

  /**
   * الرجوع عن الترحيلات
   */
  async rollback(options = {}) {
    const {
      steps = 1,
      to = null,
      dryRun = false
    } = options;

    const Migration = mongoose.model(this.migrationCollection);
    const applied = await this.getAppliedMigrations();

    if (applied.length === 0) {
      businessLogger.info('No migrations to rollback');
      return { success: true, message: 'No migrations to rollback' };
    }

    // تحديد الترحيلات للرجوع عنها
    let toRollback = [];

    if (to) {
      // الرجوع إلى ترحيل معين
      const index = applied.findIndex(m => m.name === to);
      if (index === -1) {
        throw new Error(`Migration ${to} not found`);
      }
      toRollback = applied.slice(index + 1).reverse();
    } else {
      // الرجوع بعدد معين من الخطوات
      toRollback = applied.reverse().slice(0, steps);
    }

    businessLogger.info(`Rolling back ${toRollback.length} migrations`);

    const results = {
      total: toRollback.length,
      successful: 0,
      failed: 0,
      migrations: []
    };

    for (const migration of toRollback) {
      const migrationScript = this.migrations.find(m => m.name === migration.name);

      if (!migrationScript) {
        businessLogger.warn(`Migration script not found: ${migration.name}`);
        results.failed++;
        continue;
      }

      businessLogger.info(`Rolling back: ${migration.name}`);

      if (dryRun) {
        businessLogger.info(`[DRY RUN] Would rollback: ${migration.name}`);
        results.successful++;
        continue;
      }

      const startTime = Date.now();

      try {
        // تشغيل الترحيل العكسي
        await migrationScript.down();

        // حذف سجل الترحيل
        await Migration.deleteOne({ name: migration.name });

        results.successful++;
        results.migrations.push({
          name: migration.name,
          status: 'rolledback',
          duration: Date.now() - startTime
        });

        businessLogger.info(`✅ Rolled back ${migration.name} in ${Date.now() - startTime}ms`);
      } catch (error) {
        businessLogger.error(`❌ Failed to rollback ${migration.name}:`, error);
        results.failed++;
        results.migrations.push({
          name: migration.name,
          status: 'failed',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * الحصول على حالة الترحيلات
   */
  async getStatus() {
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();

    return {
      total: this.migrations.length,
      applied: applied.length,
      pending: pending.length,
      lastMigration: applied[applied.length - 1] || null,
      migrations: this.migrations.map(m => {
        const appliedMigration = applied.find(a => a.name === m.name);
        return {
          name: m.name,
          description: m.description,
          status: appliedMigration ? 'applied' : 'pending',
          appliedAt: appliedMigration?.appliedAt || null,
          duration: appliedMigration?.duration || null,
          affected: appliedMigration?.affected || {}
        };
      })
    };
  }

  /**
   * إنشاء ترحيل جديد
   */
  async createMigration(name, description = '') {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace(/T/g, '_');
    const filename = `${timestamp}_${name}.js`;
    const filePath = path.join(this.scriptsDir, filename);

    const template = `// ============================================
// ملف: ${filename}
// الوصف: ${description}
// التاريخ: ${new Date().toLocaleString('ar-SA')}
// ============================================

const mongoose = require('mongoose');

module.exports = {
  name: '${timestamp}_${name}',
  description: '${description}',

  /**
   * ترقية (تطبيق التغييرات)
   */
  async up() {
    const affected = {
      users: 0,
      orders: 0,
      restaurants: 0,
      items: 0,
      reviews: 0
    };

    // TODO: أضف كود الترقية هنا
    
    return {
      affected,
      metadata: {
        timestamp: new Date()
      }
    };
  },

  /**
   * الرجوع عن التغييرات
   */
  async down() {
    // TODO: أضف كود الرجوع هنا
    
    return {
      success: true,
      timestamp: new Date()
    };
  }
};
`;

    await fs.writeFile(filePath, template);
    businessLogger.info(`Created migration: ${filename}`);

    return {
      name: `${timestamp}_${name}`,
      filename,
      path: filePath
    };
  }
}

module.exports = new MigrationManager();