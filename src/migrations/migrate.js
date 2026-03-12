// ============================================
// ملف: src/migrations/migrate.js
// الوصف: سكريبت تشغيل الترحيلات
// ============================================

// #!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const migrationManager = require('./index');
const connectDB = require('../config/db');
const { businessLogger } = require('../utils/logger.util');

/**
 * معالجة الخيارات
 */
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    command: 'migrate',
    upTo: null,
    steps: 1,
    to: null,
    force: false,
    dryRun: false,
    create: null,
    description: ''
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--up-to':
        options.upTo = args[++i];
        break;
      case '--steps':
      case '-s':
        options.steps = parseInt(args[++i]) || 1;
        break;
      case '--to':
        options.to = args[++i];
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--create':
        options.command = 'create';
        options.create = args[++i];
        options.description = args[++i] || '';
        break;
      case '--status':
        options.command = 'status';
        break;
      case '--rollback':
      case '-r':
        options.command = 'rollback';
        break;
      case '--help':
      case '-h':
        options.command = 'help';
        break;
    }
  }

  return options;
};

/**
 * عرض المساعدة
 */
const showHelp = () => {
  console.log(`
📋 أوامر الترحيلات (Migrations):

  تشغيل الترحيلات:
    node src/migrations/migrate.js                    تشغيل جميع الترحيلات المعلقة
    node src/migrations/migrate.js --up-to NAME       تشغيل الترحيلات حتى اسم معين
    node src/migrations/migrate.js --dry-run          محاكاة التشغيل بدون تطبيق

  الرجوع عن الترحيلات:
    node src/migrations/migrate.js --rollback         الرجوع عن آخر ترحيل
    node src/migrations/migrate.js --rollback --steps N   الرجوع عن N ترحيل
    node src/migrations/migrate.js --rollback --to NAME   الرجوع إلى ترحيل معين

  إنشاء ترحيل جديد:
    node src/migrations/migrate.js --create NAME [DESCRIPTION]

  معلومات:
    node src/migrations/migrate.js --status           عرض حالة الترحيلات
    node src/migrations/migrate.js --help             عرض هذه المساعدة

  خيارات إضافية:
    --force, -f    الاستمرار حتى في حالة الأخطاء
    --dry-run, -d  محاكاة التشغيل (لا تغييرات فعلية)
  `);
};

/**
 * السكريبت الرئيسي
 */
const main = async () => {
  try {
    const options = parseArgs();

    if (options.command === 'help') {
      showHelp();
      process.exit(0);
    }

    // الاتصال بقاعدة البيانات
    businessLogger.info('Connecting to database...');
    await connectDB();

    // تهيئة مدير الترحيلات
    await migrationManager.initialize();

    let result;

    switch (options.command) {
      case 'create':
        if (!options.create) {
          throw new Error('اسم الترحيل مطلوب');
        }
        result = await migrationManager.createMigration(options.create, options.description);
        businessLogger.info(`✅ تم إنشاء الترحيل: ${result.filename}`);
        break;

      case 'status':
        result = await migrationManager.getStatus();
        console.log('\n📊 حالة الترحيلات:');
        console.log('═══════════════════════════════════════');
        console.log(`📦 إجمالي: ${result.total}`);
        console.log(`✅ مطبقة: ${result.applied}`);
        console.log(`⏳ معلقة: ${result.pending}`);
        
        if (result.lastMigration) {
          console.log(`\n🕐 آخر ترحيل: ${result.lastMigration.name}`);
          console.log(`   التطبيق: ${new Date(result.lastMigration.appliedAt).toLocaleString('ar-SA')}`);
        }

        console.log('\n📋 قائمة الترحيلات:');
        result.migrations.forEach(m => {
          const status = m.status === 'applied' ? '✅' : '⏳';
          console.log(`   ${status} ${m.name} - ${m.description || ''}`);
          if (m.appliedAt) {
            console.log(`      التطبيق: ${new Date(m.appliedAt).toLocaleString('ar-SA')}`);
          }
        });
        break;

      case 'rollback':
        businessLogger.info('🔄 بدء الرجوع عن الترحيلات...');
        result = await migrationManager.rollback({
          steps: options.steps,
          to: options.to,
          dryRun: options.dryRun
        });
        
        console.log('\n📊 نتائج الرجوع:');
        console.log('═══════════════════════════════════════');
        console.log(`📦 الإجمالي: ${result.total}`);
        console.log(`✅ ناجح: ${result.successful}`);
        console.log(`❌ فاشل: ${result.failed}`);
        
        result.migrations.forEach(m => {
          console.log(`   ${m.status === 'rolledback' ? '✅' : '❌'} ${m.name} - ${m.duration || ''}ms`);
          if (m.error) console.log(`      ⚠️ ${m.error}`);
        });
        break;

      default: // migrate
        businessLogger.info('🔄 بدء تشغيل الترحيلات...');
        result = await migrationManager.migrate({
          upTo: options.upTo,
          force: options.force,
          dryRun: options.dryRun
        });
        
        console.log('\n📊 نتائج الترحيل:');
        console.log('═══════════════════════════════════════');
        console.log(`📦 الإجمالي: ${result.total}`);
        console.log(`✅ ناجح: ${result.successful}`);
        console.log(`❌ فاشل: ${result.failed}`);
        console.log(`⏳ تم تخطيه: ${result.skipped}`);
        
        result.migrations.forEach(m => {
          const icon = m.status === 'success' ? '✅' : '❌';
          console.log(`   ${icon} ${m.name} - ${m.duration || 0}ms`);
          if (m.error) console.log(`      ⚠️ ${m.error}`);
        });
    }

    process.exit(0);
  } catch (error) {
    businessLogger.error('❌ فشل الترحيل:', error);
    process.exit(1);
  }
};

// تشغيل السكريبت
main();