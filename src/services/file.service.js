// ============================================
// ملف: src/services/file.service.js (محدث)
// الوصف: خدمة متقدمة لإدارة الملفات والصور
// ============================================

const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middlewares/errorHandler.middleware');
const { businessLogger } = require("../utils/logger.util");
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp'); // للتلاعب بالصور محلياً

class FileService {
  constructor() {
    // ========== 1. أنواع الملفات المسموح بها ==========
    this.allowedTypes = {
      image: [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 
        'image/gif', 'image/svg+xml', 'image/avif', 'image/bmp'
      ],
      document: [
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ],
      video: [
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm',
        'video/x-msvideo', 'video/x-ms-wmv'
      ],
      audio: [
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3',
        'audio/aac', 'audio/m4a', 'audio/flac'
      ]
    };

    // ========== 2. أنواع مخصصة ==========
    this.customTypes = {
      avatar: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      cover: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      item: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      restaurant: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      category: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      chat: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf'],
      document: ['application/pdf', 'text/plain', 'application/msword']
    };

    // ========== 3. الحد الأقصى للأحجام ==========
    this.maxSizes = {
      image: 10 * 1024 * 1024,      // 10MB
      video: 50 * 1024 * 1024,      // 50MB
      audio: 20 * 1024 * 1024,      // 20MB
      document: 5 * 1024 * 1024,    // 5MB
      avatar: 2 * 1024 * 1024,      // 2MB
      cover: 8 * 1024 * 1024,       // 8MB
      item: 5 * 1024 * 1024,        // 5MB
      restaurant: 10 * 1024 * 1024,  // 10MB
      chat: 25 * 1024 * 1024,       // 25MB
      default: 5 * 1024 * 1024      // 5MB
    };

    // ========== 4. أحجام الصور المحسنة ==========
    this.imageSizes = {
      thumbnail: { width: 150, height: 150, crop: 'fill', quality: 80 },
      small: { width: 300, height: 300, crop: 'fill', quality: 85 },
      medium: { width: 600, height: 400, crop: 'fill', quality: 90 },
      large: { width: 1200, height: 800, crop: 'limit', quality: 95 },
      avatar: { width: 200, height: 200, crop: 'fill', quality: 90 },
      cover: { width: 1200, height: 400, crop: 'fill', quality: 90 },
      item: { width: 500, height: 500, crop: 'fill', quality: 90 }
    };

    // ========== 5. إحصائيات ==========
    this.stats = {
      totalUploads: 0,
      totalSize: 0,
      byType: {},
      errors: 0
    };

    this.tempDir = path.join(__dirname, '../../temp-uploads');
    this.ensureTempDir();
  }

  /**
   * التأكد من وجود المجلد المؤقت
   */
  async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
      businessLogger.info('Temp directory created', { path: this.tempDir });
    }
  }

  // ========== 6. التحقق من الملفات ==========

  /**
   * التحقق من صحة الملف
   */
  validateFile(file, type = 'image') {
    const errors = [];

    // التحقق من وجود الملف
    if (!file) {
      throw new AppError('لم يتم رفع أي ملف', 400);
    }

    // التحقق من نوع الملف
    const allowedForType = this.customTypes[type] || this.allowedTypes[type] || this.allowedTypes.image;
    
    if (!allowedForType.includes(file.mimetype)) {
      errors.push(`نوع الملف غير مسموح. الأنواع المسموحة: ${allowedForType.join(', ')}`);
    }

    // التحقق من حجم الملف
    const maxSize = this.maxSizes[type] || this.maxSizes.default;
    if (file.size > maxSize) {
      const sizeInMB = maxSize / 1024 / 1024;
      errors.push(`حجم الملف كبير جداً. الحد الأقصى: ${sizeInMB}MB`);
    }

    // التحقق من اسم الملف
    if (file.originalname && file.originalname.length > 255) {
      errors.push('اسم الملف طويل جداً (الحد الأقصى 255 حرف)');
    }

    // التحقق من الأحرف الخطرة في اسم الملف
    if (file.originalname && /[<>:"/\\|?*]/.test(file.originalname)) {
      errors.push('اسم الملف يحتوي على أحرف غير مسموحة');
    }

    if (errors.length > 0) {
      businessLogger.warn('File validation failed', { errors, type, filename: file.originalname });
      throw new AppError(errors.join(' | '), 400);
    }

    // تحديث الإحصائيات
    this.stats.totalUploads++;
    this.stats.totalSize += file.size;
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;

    return true;
  }

  /**
   * التحقق من صورة
   */
  async validateImage(file, options = {}) {
    const {
      minWidth = 0,
      minHeight = 0,
      maxWidth = 5000,
      maxHeight = 5000,
      aspectRatio = null
    } = options;

    try {
      const metadata = await sharp(file.path).metadata();

      if (metadata.width < minWidth || metadata.width > maxWidth) {
        throw new AppError(`عرض الصورة يجب أن يكون بين ${minWidth} و ${maxWidth} بكسل`, 400);
      }

      if (metadata.height < minHeight || metadata.height > maxHeight) {
        throw new AppError(`ارتفاع الصورة يجب أن يكون بين ${minHeight} و ${maxHeight} بكسل`, 400);
      }

      if (aspectRatio) {
        const ratio = metadata.width / metadata.height;
        const [targetWidth, targetHeight] = aspectRatio.split(':').map(Number);
        const targetRatio = targetWidth / targetHeight;
        
        if (Math.abs(ratio - targetRatio) > 0.01) {
          throw new AppError(`نسبة العرض إلى الارتفاع يجب أن تكون ${aspectRatio}`, 400);
        }
      }

      return metadata;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`فشل التحقق من الصورة: ${error.message}`, 400);
    }
  }

  // ========== 7. رفع الملفات ==========

  /**
   * رفع ملف إلى Cloudinary
   */
  async uploadToCloudinary(file, folder, options = {}) {
    try {
      this.validateFile(file, folder);

      const fileType = file.mimetype.split('/')[0];
      
      const uploadOptions = {
        folder: `food-delivery/${folder}`,
        public_id: `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`,
        resource_type: fileType === 'video' ? 'video' : fileType === 'audio' ? 'video' : 'auto',
        ...options
      };

      // إضافة تحويلات للصور
      if (fileType === 'image') {
        uploadOptions.transformation = [
          { width: 1200, height: 1200, crop: "limit" },
          { quality: options.quality || "auto:good" },
          { fetch_format: options.format || "auto" }
        ];

        // للـ avatar نحجم أصغر
        if (folder === 'avatars' || folder.includes('avatar')) {
          uploadOptions.transformation = [
            { width: 400, height: 400, crop: "fill" },
            { quality: "auto:best" },
            { fetch_format: "auto" }
          ];
        }
      }

      const result = await cloudinary.uploader.upload(file.path, uploadOptions);

      // إنشاء الصور المحسنة
      const optimized = await this.generateOptimizedVersions(result.public_id, folder);

      // تنظيف الملف المؤقت
      await this.cleanupTempFile(file.path);

      businessLogger.info('File uploaded to Cloudinary', {
        publicId: result.public_id,
        folder,
        size: result.bytes,
        format: result.format
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes,
        thumbnail: optimized.thumbnail,
        allSizes: optimized
      };
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Cloudinary upload failed:', error);
      
      // تنظيف الملف المؤقت حتى في حالة الخطأ
      if (file.path) {
        await this.cleanupTempFile(file.path);
      }
      
      throw new AppError(`فشل رفع الملف: ${error.message}`, 500);
    }
  }

  /**
   * رفع عدة ملفات
   */
  async uploadMultipleFiles(files, folder, options = {}) {
    const results = {
      successful: [],
      failed: []
    };

    for (const file of files) {
      try {
        const result = await this.uploadToCloudinary(file, folder, options);
        results.successful.push({
          ...result,
          originalname: file.originalname
        });
      } catch (error) {
        results.failed.push({
          originalname: file.originalname,
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

  /**
   * رفع ملف Base64
   */
  async uploadBase64(base64String, folder, options = {}) {
    try {
      // التحقق من صحة Base64
      const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        throw new AppError('تنسيق Base64 غير صالح', 400);
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      // إنشاء ملف مؤقت
      const tempFile = path.join(this.tempDir, `base64-${Date.now()}.tmp`);
      await fs.writeFile(tempFile, buffer);

      const file = {
        path: tempFile,
        size: buffer.length,
        mimetype: mimeType,
        originalname: `base64-${Date.now()}.${mimeType.split('/')[1]}`
      };

      const result = await this.uploadToCloudinary(file, folder, options);
      await this.cleanupTempFile(tempFile);

      return result;
    } catch (error) {
      throw new AppError(`فشل رفع Base64: ${error.message}`, 500);
    }
  }

  // ========== 8. إنشاء صور محسنة ==========

  /**
   * إنشاء نسخ محسنة من الصورة
   */
  async generateOptimizedVersions(publicId, folder) {
    try {
      const sizes = {};

      for (const [sizeName, dimensions] of Object.entries(this.imageSizes)) {
        // تخطي بعض الأحجام حسب المجلد
        if (folder === 'avatars' && !['thumbnail', 'small', 'avatar'].includes(sizeName)) {
          continue;
        }

        if (folder === 'items' && !['thumbnail', 'small', 'item'].includes(sizeName)) {
          continue;
        }

        try {
          const url = cloudinary.url(publicId, {
            transformation: [
              {
                width: dimensions.width,
                height: dimensions.height,
                crop: dimensions.crop,
                gravity: 'auto'
              },
              {
                quality: dimensions.quality,
                fetch_format: 'auto'
              }
            ],
            secure: true
          });

          sizes[sizeName] = url;
        } catch (error) {
          businessLogger.warn(`Failed to generate ${sizeName} for ${publicId}`, error);
        }
      }

      return sizes;
    } catch (error) {
      businessLogger.error('Generate optimized versions error:', error);
      return {};
    }
  }

  /**
   * الحصول على رابط صورة محسنة
   */
  getOptimizedUrl(publicId, size = 'medium', options = {}) {
    if (!publicId) return null;

    const dimensions = this.imageSizes[size] || this.imageSizes.medium;
    
    try {
      const url = cloudinary.url(publicId, {
        transformation: [
          {
            width: options.width || dimensions.width,
            height: options.height || dimensions.height,
            crop: options.crop || dimensions.crop || 'fill',
            gravity: options.gravity || 'auto'
          },
          {
            quality: options.quality || dimensions.quality || 'auto:best',
            fetch_format: options.format || 'auto'
          }
        ],
        secure: true
      });
      
      return url;
    } catch (error) {
      businessLogger.error('Error generating optimized URL:', error);
      return null;
    }
  }

  /**
   * الحصول على جميع أحجام الصورة
   */
  getAllSizes(publicId) {
    if (!publicId) return null;

    const sizes = {};
    
    for (const [sizeName, dimensions] of Object.entries(this.imageSizes)) {
      sizes[sizeName] = this.getOptimizedUrl(publicId, sizeName);
    }
    
    return sizes;
  }

  // ========== 9. حذف الملفات ==========

  /**
   * حذف ملف من Cloudinary
   */
  async deleteFile(publicId) {
    if (!publicId) return false;

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        businessLogger.info(`File deleted: ${publicId}`);
        
        // تحديث الإحصائيات
        this.stats.totalSize -= result.bytes || 0;
        
        return true;
      } else {
        businessLogger.warn(`File not found: ${publicId}`);
        return false;
      }
    } catch (error) {
      this.stats.errors++;
      businessLogger.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * حذف عدة ملفات
   */
  async deleteMultipleFiles(publicIds) {
    if (!publicIds || publicIds.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const publicId of publicIds) {
      try {
        const deleted = await this.deleteFile(publicId);
        if (deleted) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(publicId);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ publicId, error: error.message });
      }
    }

    businessLogger.info('Multiple files deleted', {
      total: publicIds.length,
      success: results.success,
      failed: results.failed
    });

    return results;
  }

  /**
   * تنظيف الملف المؤقت
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      businessLogger.debug(`Temp file deleted: ${filePath}`);
    } catch (error) {
      businessLogger.warn(`Failed to delete temp file: ${filePath}`, error);
    }
  }

  /**
   * تنظيف الملفات المؤقتة القديمة
   */
  async cleanupOldTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 ساعة افتراضياً
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = await fs.stat(filePath);
        
        if (now - stat.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deleted++;
        }
      }

      businessLogger.info(`Cleaned up ${deleted} old temp files`);
      return deleted;
    } catch (error) {
      businessLogger.error('Cleanup old temp files error:', error);
      return 0;
    }
  }

  // ========== 10. معلومات الملفات ==========

  /**
   * استخراج publicId من رابط Cloudinary
   */
  extractPublicIdFromUrl(url) {
    if (!url) return null;

    try {
      // أنماط مختلفة لروابط Cloudinary
      const patterns = [
        /\/upload\/(?:v\d+\/)?(.+?)\./,
        /\/upload\/(?:v\d+\/)?(.+?)(?:\?|$)/,
        /\/image\/upload\/(?:v\d+\/)?(.+?)\./,
        /\/video\/upload\/(?:v\d+\/)?(.+?)\./
      ];

      for (const pattern of patterns) {
        const matches = url.match(pattern);
        if (matches && matches[1]) {
          return matches[1];
        }
      }

      // محاولة استخراج من نهاية الرابط
      const parts = url.split('/');
      const lastPart = parts[parts.length - 1];
      const publicIdWithExt = lastPart.split('.')[0];
      
      return publicIdWithExt || null;
    } catch (error) {
      businessLogger.error('Error extracting publicId:', error);
      return null;
    }
  }

  /**
   * التحقق من صحة رابط Cloudinary
   */
  isValidCloudinaryUrl(url) {
    if (!url) return false;
    return url.includes('cloudinary.com') && url.includes('/upload/');
  }

  /**
   * الحصول على معلومات الملف
   */
  async getFileInfo(publicId) {
    if (!publicId) return null;

    try {
      const result = await cloudinary.api.resource(publicId, {
        colors: true,
        faces: true,
        image_metadata: true,
        exif: true
      });

      return {
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes,
        createdAt: result.created_at,
        tags: result.tags,
        colors: result.colors?.slice(0, 5),
        faces: result.faces?.length || 0,
        metadata: result.image_metadata || {},
        exif: result.exif || {}
      };
    } catch (error) {
      businessLogger.error('Error getting file info:', error);
      return null;
    }
  }

  /**
   * الحصول على إحصائيات الخدمة
   */
  getStats() {
    return {
      ...this.stats,
      tempFiles: this.tempDir ? fs.readdir(this.tempDir).length : 0,
      timestamp: new Date()
    };
  }

  // ========== 11. الصور الافتراضية ==========

  /**
   * الحصول على رابط افتراضي حسب النوع
   */
  getDefaultImage(type = 'restaurant') {
    const defaults = {
      restaurant: '/images/default-restaurant.jpg',
      item: '/images/default-item.jpg',
      avatar: '/images/default-avatar.png',
      user: '/images/default-avatar.png',
      cover: '/images/default-cover.jpg',
      logo: '/images/logo.png',
      category: '/images/default-category.jpg'
    };

    return defaults[type] || defaults.restaurant;
  }

  /**
   * الحصول على جميع الصور الافتراضية
   */
  getAllDefaultImages() {
    return {
      restaurant: this.getDefaultImage('restaurant'),
      item: this.getDefaultImage('item'),
      avatar: this.getDefaultImage('avatar'),
      cover: this.getDefaultImage('cover'),
      logo: this.getDefaultImage('logo'),
      category: this.getDefaultImage('category')
    };
  }
}

module.exports = new FileService();