// src/services/file.service.js

const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middlewares/errorHandler.middleware');

/**
 * 🗄️ خدمة مركزية لإدارة الملفات والصور
 */
class FileService {
  constructor() {
    // ========== 1. أنواع الملفات المسموح بها ==========
    this.allowedTypes = {
      // الصور
      image: [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp', 
        'image/gif', 
        'image/svg+xml',
        'image/avif'
      ],
      
      // المستندات
      document: [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      
      // الصور الشخصية (أحجام صغيرة)
      avatar: [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp'
      ],
      
      // صور الغلاف
      cover: [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp'
      ],
      
      // صور العناصر
      item: [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp'
      ],
      
      // صور المطاعم
      restaurant: [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp'
      ]
    };

    // ========== 2. الحد الأقصى للأحجام ==========
    this.maxSizes = {
      image: 10 * 1024 * 1024,      // 10MB
      document: 5 * 1024 * 1024,     // 5MB
      avatar: 2 * 1024 * 1024,       // 2MB
      cover: 8 * 1024 * 1024,        // 8MB
      item: 5 * 1024 * 1024,         // 5MB
      restaurant: 10 * 1024 * 1024,  // 10MB
      default: 5 * 1024 * 1024       // 5MB
    };

    // ========== 3. أحجام الصور المحسنة ==========
    this.imageSizes = {
      thumbnail: { width: 150, height: 150, crop: 'fill' },
      small: { width: 300, height: 300, crop: 'fill' },
      medium: { width: 600, height: 400, crop: 'fill' },
      large: { width: 1200, height: 800, crop: 'limit' },
      avatar: { width: 200, height: 200, crop: 'fill' },
      cover: { width: 1200, height: 400, crop: 'fill' },
      item: { width: 500, height: 500, crop: 'fill' }
    };
  }

  // ========== 4. التحقق من صحة الملف ==========
  validateFile(file, type = 'image') {
    // التحقق من وجود الملف
    if (!file) {
      throw new AppError('لم يتم رفع أي ملف', 400);
    }

    // التحقق من نوع الملف
    const allowedForType = this.allowedTypes[type] || this.allowedTypes.image;
    if (!allowedForType.includes(file.mimetype)) {
      throw new AppError(
        `نوع الملف غير مسموح. الأنواع المسموحة: ${allowedForType.join(', ')}`, 
        400
      );
    }

    // التحقق من حجم الملف
    const maxSize = this.maxSizes[type] || this.maxSizes.default;
    if (file.size > maxSize) {
      const sizeInMB = maxSize / 1024 / 1024;
      throw new AppError(
        `حجم الملف كبير جداً. الحد الأقصى: ${sizeInMB}MB`, 
        400
      );
    }

    return true;
  }

  // ========== 5. الحصول على رابط صورة محسنة ==========
  getOptimizedUrl(publicId, size = 'medium', options = {}) {
    if (!publicId) return null;

    // الحصول على أبعاد الحجم المطلوب
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
            quality: options.quality || 'auto:best',
            fetch_format: options.format || 'auto'
          }
        ],
        secure: true
      });
      
      return url;
    } catch (error) {
      console.error('Error generating optimized URL:', error);
      return null;
    }
  }

  // ========== 6. الحصول على عدة أحجام لصورة واحدة ==========
  getAllSizes(publicId) {
    if (!publicId) return null;

    const sizes = {};
    
    for (const [sizeName, dimensions] of Object.entries(this.imageSizes)) {
      sizes[sizeName] = this.getOptimizedUrl(publicId, sizeName);
    }
    
    return sizes;
  }

  // ========== 7. حذف ملف من Cloudinary ==========
  async deleteFile(publicId) {
    if (!publicId) return false;

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        console.log(`✅ File deleted: ${publicId}`);
        return true;
      } else {
        console.warn(`⚠️ File not found or already deleted: ${publicId}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error deleting file from Cloudinary:', error);
      return false;
    }
  }

  // ========== 8. حذف عدة ملفات دفعة واحدة ==========
  async deleteMultipleFiles(publicIds) {
    if (!publicIds || publicIds.length === 0) return { success: 0, failed: 0 };

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const publicId of publicIds) {
      const deleted = await this.deleteFile(publicId);
      if (deleted) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(publicId);
      }
    }

    return results;
  }

  // ========== 9. استخراج publicId من رابط Cloudinary ==========
  extractPublicIdFromUrl(url) {
    if (!url) return null;

    try {
      // مثال: https://res.cloudinary.com/demo/image/upload/v1234/folder/publicId.jpg
      const regex = /\/upload\/(?:v\d+\/)?(.+?)\./;
      const matches = url.match(regex);
      
      if (matches && matches[1]) {
        return matches[1];
      }
      
      // محاولة ثانية: استخراج آخر جزء قبل الامتداد
      const parts = url.split('/');
      const lastPart = parts[parts.length - 1];
      const publicIdWithExt = lastPart.split('.')[0];
      
      return publicIdWithExt || null;
    } catch (error) {
      console.error('Error extracting publicId:', error);
      return null;
    }
  }

  // ========== 10. التحقق من صحة رابط Cloudinary ==========
  isValidCloudinaryUrl(url) {
    if (!url) return false;
    return url.includes('cloudinary.com') && url.includes('/upload/');
  }

  // ========== 11. الحصول على إحصائيات الملف ==========
  async getFileInfo(publicId) {
    if (!publicId) return null;

    try {
      const result = await cloudinary.api.resource(publicId, {
        colors: true,
        faces: true,
        image_metadata: true
      });

      return {
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes,
        createdAt: result.created_at,
        tags: result.tags,
        colors: result.colors?.slice(0, 5), // أول 5 ألوان
        faces: result.faces?.length || 0
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      return null;
    }
  }

  // ========== 12. رفع ملف مباشرة (للاستخدام مع Base64) ==========
  async uploadBase64(base64String, folder, options = {}) {
    try {
      const result = await cloudinary.uploader.upload(base64String, {
        folder: `food-delivery/${folder}`,
        ...options
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height
      };
    } catch (error) {
      throw new AppError(`فشل رفع الصورة: ${error.message}`, 500);
    }
  }

  // ========== 13. الحصول على رابط افتراضي حسب النوع ==========
  getDefaultImage(type = 'restaurant') {
    const defaults = {
      restaurant: '/images/default-restaurant.jpg',
      item: '/images/default-item.jpg',
      avatar: '/images/default-avatar.png',
      user: '/images/default-avatar.png',
      cover: '/images/default-cover.jpg',
      logo: '/images/logo.png'
    };

    return defaults[type] || defaults.restaurant;
  }
}

module.exports = new FileService();