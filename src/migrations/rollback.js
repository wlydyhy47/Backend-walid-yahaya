// ============================================
// ملف: src/migrations/rollback.js
// الوصف: سكريبت الرجوع عن الترحيلات
// ============================================

// #!/usr/bin/env node

// هذا مجرد اختصار لتشغيل rollback
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const migratePath = path.join(__dirname, 'migrate.js');

// إضافة --rollback إلى الأوامر
const child = spawn('node', [migratePath, '--rollback', ...args], {
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  process.exit(code);
});