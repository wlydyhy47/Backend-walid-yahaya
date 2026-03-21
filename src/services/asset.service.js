// ============================================
// ملف: src/services/asset.service.js (محدث)
// الوصف: خدمة إدارة الملفات الثابتة والأصول
// ============================================

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { businessLogger } = require("../utils/logger.util");
const cache = require("../utils/cache.util");
const fileService = require('./file.service');

class AssetService {
  constructor() {
    this.baseDir = path.join(__dirname, '../public');
    this.cache = new Map();
    this.supportedFormats = {
      images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif'],
      documents: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'],
      fonts: ['woff', 'woff2', 'ttf', 'eot']
    };

    this.ensureDirectories();
  }

  /**
   * التأكد من وجود المجلدات المطلوبة
   */
  async ensureDirectories() {
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, 'images'),
      path.join(this.baseDir, 'icons'),
      path.join(this.baseDir, 'uploads'),
      path.join(this.baseDir, 'fonts')
    ];

    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        businessLogger.info(`Created directory: ${dir}`);
      }
    }
  }

  // ========== 1. دوال الصور ==========

  /**
   * الحصول على صورة
   */
  async getImage(filename, type = 'images') {
    try {
      const imagePath = path.join(this.baseDir, type, filename);
      const cacheKey = `asset:image:${type}:${filename}`;

      // التحقق من الكاش
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 دقائق
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }

      // التحقق من وجود الملف
      await fs.access(imagePath);
      const stats = await fs.stat(imagePath);

      const result = {
        exists: true,
        path: `/${type}/${filename}`,
        url: `${process.env.API_URL || 'http://localhost:3000'}/${type}/${filename}`,
        size: stats.size,
        modifiedAt: stats.mtime,
        type: path.extname(filename).slice(1).toLowerCase()
      };

      // تخزين في الكاش
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      // إذا كان الملف غير موجود، أرجع الصورة الافتراضية
      if (error.code === 'ENOENT') {
        return {
          exists: false,
          default: `/images/default-${type === 'images' ? 'image' : 'icon'}.png`
        };
      }

      businessLogger.error('Error getting image:', error);
      throw error;
    }
  }

  /**
   * الحصول على جميع الصور
   */
  async getAllImages(type = 'images') {
    try {
      const cacheKey = `asset:all:${type}`;

      // التحقق من الكاش
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const dir = path.join(this.baseDir, type);
      const files = await fs.readdir(dir);

      const images = await Promise.all(
        files
          .filter(file => {
            const ext = path.extname(file).slice(1).toLowerCase();
            return this.supportedFormats.images.includes(ext);
          })
          .map(async (file) => {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);

            return {
              filename: file,
              url: `/${type}/${file}`,
              fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/${type}/${file}`,
              type: path.extname(file).slice(1).toLowerCase(),
              size: stats.size,
              sizeFormatted: this.formatFileSize(stats.size),
              modifiedAt: stats.mtime,
              category: this.getImageCategory(file)
            };
          })
      );

      // تجميع حسب الفئة
      const grouped = images.reduce((acc, img) => {
        if (!acc[img.category]) acc[img.category] = [];
        acc[img.category].push(img);
        return acc;
      }, {});

      const result = {
        total: images.length,
        categories: Object.keys(grouped),
        grouped,
        images
      };

      cache.set(cacheKey, result, 300); // 5 دقائق
      return result;
    } catch (error) {
      businessLogger.error('Error getting all images:', error);
      throw error;
    }
  }

  /**
   * الحصول على صور حسب الفئة
   */
  async getImagesByCategory(category) {
    try {
      const cacheKey = `asset:category:${category}`;

      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const allImages = await this.getAllImages();
      const categoryImages = allImages.grouped[category] || [];

      const result = {
        category,
        count: categoryImages.length,
        images: categoryImages
      };

      cache.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      businessLogger.error('Error getting images by category:', error);
      throw error;
    }
  }

  // ========== 2. دوال الأيقونات ==========

  /**
   * الحصول على جميع الأيقونات
   */
  async getIcons() {
    try {
      const cacheKey = 'asset:icons:all';

      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const iconsDir = path.join(this.baseDir, 'icons');
      const files = await fs.readdir(iconsDir);

      const icons = await Promise.all(
        files
          .filter(file => {
            const ext = path.extname(file).slice(1).toLowerCase();
            return ['png', 'ico', 'svg'].includes(ext);
          })
          .map(async (file) => {
            const filePath = path.join(iconsDir, file);
            const stats = await fs.stat(filePath);

            return {
              filename: file,
              url: `/icons/${file}`,
              fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/icons/${file}`,
              type: path.extname(file).slice(1).toLowerCase(),
              size: stats.size,
              sizeFormatted: this.formatFileSize(stats.size),
              purpose: this.getIconPurpose(file)
            };
          })
      );

      const result = {
        total: icons.length,
        icons,
        favicon: icons.find(i => i.filename === 'favicon.ico') || null,
        appleTouch: icons.find(i => i.filename.includes('apple')) || null,
        android: icons.filter(i => i.filename.includes('android') || i.filename.includes('icon-'))
      };

      cache.set(cacheKey, result, 600); // 10 دقائق
      return result;
    } catch (error) {
      businessLogger.error('Error getting icons:', error);
      throw error;
    }
  }

  /**
   * الحصول على أيقونة محددة
   */
  async getIcon(filename) {
    return this.getImage(filename, 'icons');
  }

  // ========== 3. الصور الافتراضية ==========

  /**
   * الحصول على الصور الافتراضية
   */
  async getDefaultImages() {
    try {
      const cacheKey = 'asset:defaults';

      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const defaults = {
        avatar: {
          url: '/images/default-avatar.png',
          fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-avatar.png`,
          type: 'png',
          description: 'الصورة الافتراضية للمستخدم'
        },
        store: {
          url: '/images/default-store.jpg',
          fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-store.jpg`,
          type: 'jpg',
          description: 'الصورة الافتراضية للمطعم'
        },
        item: {
          url: '/images/default-item.jpg',
          fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-item.jpg`,
          type: 'jpg',
          description: 'الصورة الافتراضية للعنصر'
        },
        cover: {
          url: '/images/default-cover.jpg',
          fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-cover.jpg`,
          type: 'jpg',
          description: 'الصورة الافتراضية للغلاف'
        },
        category: {
          url: '/images/default-category.jpg',
          fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-category.jpg`,
          type: 'jpg',
          description: 'الصورة الافتراضية للفئة'
        },
        logo: {
          light: {
            url: '/images/logo-white.png',
            fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/logo-white.png`,
            type: 'png'
          },
          dark: {
            url: '/images/logo-dark.png',
            fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/logo-dark.png`,
            type: 'png'
          },
          default: {
            url: '/images/logo.png',
            fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/logo.png`,
            type: 'png'
          }
        },
        favicon: {
          url: '/icons/favicon.ico',
          fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/icons/favicon.ico`,
          type: 'ico'
        }
      };

      // التحقق من وجود الملفات
      for (const [key, value] of Object.entries(defaults)) {
        if (key === 'logo') {
          for (const [subKey, subValue] of Object.entries(value)) {
            const filePath = path.join(this.baseDir, subValue.url);
            try {
              await fs.access(filePath);
              subValue.exists = true;
              const stats = await fs.stat(filePath);
              subValue.size = stats.size;
              subValue.sizeFormatted = this.formatFileSize(stats.size);
            } catch {
              subValue.exists = false;
            }
          }
        } else {
          const filePath = path.join(this.baseDir, value.url);
          try {
            await fs.access(filePath);
            value.exists = true;
            const stats = await fs.stat(filePath);
            value.size = stats.size;
            value.sizeFormatted = this.formatFileSize(stats.size);
          } catch {
            value.exists = false;
          }
        }
      }

      cache.set(cacheKey, defaults, 3600); // ساعة واحدة
      return defaults;
    } catch (error) {
      businessLogger.error('Error getting default images:', error);
      throw error;
    }
  }

  /**
   * الحصول على صورة افتراضية حسب النوع
   */
  async getDefaultImageByType(type) {
    const defaults = await this.getDefaultImages();
    return defaults[type] || defaults.store;
  }

  // ========== 4. رفع الملفات ==========

  /**
   * رفع ملف
   */
  async uploadFile(file, type = 'uploads', options = {}) {
    try {
      // التحقق من صحة الملف
      fileService.validateFile(file, type);

      // إنشاء اسم فريد
      const ext = path.extname(file.originalname);
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

      // المسار الكامل
      const uploadDir = path.join(this.baseDir, type);
      await fs.mkdir(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, filename);

      // نسخ الملف
      await fs.copyFile(file.path, filePath);

      // الحصول على معلومات الملف
      const stats = await fs.stat(filePath);

      // تنظيف الملف المؤقت
      await fs.unlink(file.path).catch(() => { });

      const result = {
        filename,
        originalname: file.originalname,
        url: `/${type}/${filename}`,
        fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/${type}/${filename}`,
        type: ext.slice(1).toLowerCase(),
        mimeType: file.mimetype,
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        uploadedAt: new Date()
      };

      // إنشاء نسخة مصغرة للصور
      if (type === 'images' && this.supportedFormats.images.includes(ext.slice(1))) {
        result.thumbnail = await this.createThumbnail(filePath, filename);
      }

      businessLogger.info('File uploaded successfully', {
        filename,
        type,
        size: stats.size
      });

      return result;
    } catch (error) {
      businessLogger.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * إنشاء نسخة مصغرة
   */
  async createThumbnail(filePath, filename) {
    try {
      // استخدام file service لإنشاء نسخة مصغرة
      const publicId = `temp-${Date.now()}`;
      const thumbnailUrl = fileService.getOptimizedUrl(publicId, 'thumbnail');

      return thumbnailUrl;
    } catch (error) {
      businessLogger.error('Error creating thumbnail:', error);
      return null;
    }
  }

  /**
   * رفع عدة ملفات
   */
  async uploadMultipleFiles(files, type = 'uploads') {
    const results = {
      successful: [],
      failed: []
    };

    for (const file of files) {
      try {
        const result = await this.uploadFile(file, type);
        results.successful.push(result);
      } catch (error) {
        results.failed.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    businessLogger.info('Multiple files uploaded', {
      total: files.length,
      successful: results.successful.length,
      failed: results.failed.length
    });

    return results;
  }

  // ========== 5. حذف الملفات ==========

  /**
   * حذف ملف
   */
  async deleteFile(filename, type = 'uploads') {
    try {
      const filePath = path.join(this.baseDir, type, filename);

      // التحقق من وجود الملف
      await fs.access(filePath);

      // حذف الملف
      await fs.unlink(filePath);

      // مسح من الكاش
      const cacheKey = `asset:image:${type}:${filename}`;
      this.cache.delete(cacheKey);
      cache.invalidatePattern(`asset:*`);

      businessLogger.info('File deleted successfully', { filename, type });

      return { success: true, filename };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'File not found' };
      }

      businessLogger.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * حذف عدة ملفات
   */
  async deleteMultipleFiles(files, type = 'uploads') {
    const results = {
      successful: [],
      failed: []
    };

    for (const filename of files) {
      try {
        await this.deleteFile(filename, type);
        results.successful.push(filename);
      } catch (error) {
        results.failed.push({
          filename,
          error: error.message
        });
      }
    }

    return results;
  }

  // ========== 6. معلومات الملفات ==========

  /**
   * الحصول على معلومات ملف
   */
  async getFileInfo(filename, type = 'uploads') {
    try {
      const filePath = path.join(this.baseDir, type, filename);
      const stats = await fs.stat(filePath);

      return {
        filename,
        path: `/${type}/${filename}`,
        url: `${process.env.API_URL || 'http://localhost:3000'}/${type}/${filename}`,
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        type: path.extname(filename).slice(1).toLowerCase()
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * الحصول على إحصائيات الأصول
   */
  async getStats() {
    try {
      const stats = {
        images: {
          count: 0,
          totalSize: 0
        },
        icons: {
          count: 0,
          totalSize: 0
        },
        uploads: {
          count: 0,
          totalSize: 0
        },
        byType: {}
      };

      const dirs = ['images', 'icons', 'uploads'];

      for (const dir of dirs) {
        const dirPath = path.join(this.baseDir, dir);
        try {
          const files = await fs.readdir(dirPath);

          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const fileStats = await fs.stat(filePath);

            stats[dir].count++;
            stats[dir].totalSize += fileStats.size;

            const ext = path.extname(file).slice(1).toLowerCase();
            stats.byType[ext] = (stats.byType[ext] || 0) + 1;
          }
        } catch (error) {
          // المجلد غير موجود
        }
      }

      return stats;
    } catch (error) {
      businessLogger.error('Error getting asset stats:', error);
      throw error;
    }
  }

  // ========== 7. دوال مساعدة ==========

  /**
   * تحديد فئة الصورة
   */
  getImageCategory(filename) {
    const name = filename.toLowerCase();

    if (name.includes('store') || name.includes('resto')) return 'stores';
    if (name.includes('item') || name.includes('food') || name.includes('meal')) return 'items';
    if (name.includes('user') || name.includes('avatar') || name.includes('profile')) return 'users';
    if (name.includes('cover') || name.includes('banner')) return 'covers';
    if (name.includes('icon') || name.includes('logo')) return 'icons';
    if (name.includes('default')) return 'defaults';
    if (name.includes('category')) return 'categories';

    return 'other';
  }

  /**
   * تحديد غرض الأيقونة
   */
  getIconPurpose(filename) {
    const name = filename.toLowerCase();

    if (name === 'favicon.ico') return 'favicon';
    if (name.includes('apple-touch-icon')) return 'apple-touch';
    if (name.includes('icon-192')) return 'android-192';
    if (name.includes('icon-512')) return 'android-512';
    if (name.includes('manifest')) return 'manifest';
    if (name.includes('og-image')) return 'og-image';
    if (name.includes('twitter-image')) return 'twitter-image';

    return 'general';
  }

  /**
   * تنسيق حجم الملف
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * تنظيف الملفات القديمة
   */
  async cleanupOldFiles(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 أيام
    try {
      const dirs = ['uploads'];
      let deleted = 0;

      for (const dir of dirs) {
        const dirPath = path.join(this.baseDir, dir);

        try {
          const files = await fs.readdir(dirPath);
          const now = Date.now();

          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);

            if (now - stats.mtimeMs > maxAge) {
              await fs.unlink(filePath);
              deleted++;
            }
          }
        } catch (error) {
          // تجاهل أخطاء المجلدات غير الموجودة
        }
      }

      businessLogger.info(`Cleaned up ${deleted} old files`);
      return deleted;
    } catch (error) {
      businessLogger.error('Error cleaning up old files:', error);
      return 0;
    }
  }

  /**
   * مسح الكاش
   */
  clearCache() {
    this.cache.clear();
    cache.invalidatePattern('asset:*');
    businessLogger.info('Asset cache cleared');
  }
}

module.exports = new AssetService();