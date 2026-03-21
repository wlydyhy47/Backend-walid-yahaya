// ============================================
// ملف: src/controllers/assets.controller.js
// الوصف: إدارة الملفات الثابتة والصور
// الإصدار: 1.0 (جديد)
// ============================================

const path = require('path');
const fs = require('fs').promises;
const cache = require("../utils/cache.util");
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * المسار الأساسي للملفات العامة
 */
const PUBLIC_DIR = path.join(__dirname, '../public');

/**
 * الحصول على قائمة الملفات في مجلد
 */
const getFilesInDirectory = async (dir, extensions = []) => {
  try {
    const fullPath = path.join(PUBLIC_DIR, dir);
    const files = await fs.readdir(fullPath);

    return files
      .filter(file => {
        if (extensions.length === 0) return true;
        const ext = path.extname(file).toLowerCase().slice(1);
        return extensions.includes(ext);
      })
      .map(file => ({
        filename: file,
        path: `/${dir}/${file}`,
        fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/${dir}/${file}`,
        extension: path.extname(file).toLowerCase().slice(1),
        size: null // سنضيف الحجم لاحقاً
      }));
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
    return [];
  }
};

/**
 * الحصول على حجم الملف
 */
const getFileSize = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return null;
  }
};

// ========== 2. الصور ==========

/**
 * @desc    الحصول على جميع الصور
 * @route   GET /api/assets/images
 * @access  Public
 */
exports.getImages = async (req, res) => {
  try {
    const cacheKey = 'assets:images:all';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const imagesDir = path.join(PUBLIC_DIR, 'images');
    const files = await fs.readdir(imagesDir);

    const images = await Promise.all(
      files
        .filter(file => /\.(png|jpg|jpeg|gif|svg|webp|avif)$/i.test(file))
        .map(async (file) => {
          const filePath = path.join(imagesDir, file);
          const size = await getFileSize(filePath);

          return {
            id: file,
            filename: file,
            url: `/images/${file}`,
            thumbnail: `/images/${file}`,
            fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/${file}`,
            type: file.split('.').pop().toLowerCase(),
            size,
            category: getImageCategory(file)
          };
        })
    );

    // تجميع حسب الفئة
    const grouped = images.reduce((acc, img) => {
      if (!acc[img.category]) acc[img.category] = [];
      acc[img.category].push(img);
      return acc;
    }, {});

    const responseData = {
      total: images.length,
      categories: Object.keys(grouped),
      images: grouped,
      all: images
    };

    cache.set(cacheKey, responseData, 600); // 10 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get images"
    });
  }
};

/**
 * @desc    الحصول على صور محددة حسب الفئة
 * @route   GET /api/assets/images/:category
 * @access  Public
 */
exports.getImagesByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const validCategories = ['stores', 'items', 'users', 'covers', 'icons', 'defaults'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    const cacheKey = `assets:images:${category}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    // البحث عن الصور التي تطابق الفئة
    const imagesDir = path.join(PUBLIC_DIR, 'images');
    const files = await fs.readdir(imagesDir);

    const images = await Promise.all(
      files
        .filter(file => {
          const matches = file.toLowerCase().includes(category) ||
            file.toLowerCase().includes(category.slice(0, -1));
          return matches && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file);
        })
        .map(async (file) => {
          const filePath = path.join(imagesDir, file);
          const size = await getFileSize(filePath);

          return {
            filename: file,
            url: `/images/${file}`,
            thumbnail: `/images/${file}`,
            fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/${file}`,
            type: file.split('.').pop().toLowerCase(),
            size
          };
        })
    );

    cache.set(cacheKey, images, 300); // 5 دقائق

    res.json({
      success: true,
      data: {
        category,
        count: images.length,
        images
      }
    });
  } catch (error) {
    console.error("❌ Get images by category error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get images by category"
    });
  }
};

// ========== 3. الأيقونات ==========

/**
 * @desc    الحصول على جميع الأيقونات
 * @route   GET /api/assets/icons
 * @access  Public
 */
exports.getIcons = async (req, res) => {
  try {
    const cacheKey = 'assets:icons:all';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const iconsDir = path.join(PUBLIC_DIR, 'icons');
    const files = await fs.readdir(iconsDir);

    const icons = await Promise.all(
      files
        .filter(file => /\.(png|ico|svg)$/i.test(file))
        .map(async (file) => {
          const filePath = path.join(iconsDir, file);
          const size = await getFileSize(filePath);

          return {
            filename: file,
            url: `/icons/${file}`,
            fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/icons/${file}`,
            type: file.split('.').pop().toLowerCase(),
            size,
            purpose: getIconPurpose(file)
          };
        })
    );

    const responseData = {
      total: icons.length,
      icons,
      favicon: icons.find(i => i.filename === 'favicon.ico') || null,
      appleTouch: icons.find(i => i.filename.includes('apple')) || null
    };

    cache.set(cacheKey, responseData, 600); // 10 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get icons error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get icons"
    });
  }
};

// ========== 4. الصور الافتراضية ==========

/**
 * @desc    الحصول على الصور الافتراضية
 * @route   GET /api/assets/defaults
 * @access  Public
 */
exports.getDefaultImages = async (req, res) => {
  try {
    const cacheKey = 'assets:defaults';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const defaults = {
      avatar: {
        url: '/images/default-avatar.png',
        fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-avatar.png`,
        type: 'png',
        description: 'Default user avatar'
      },
      restaurant: {
        url: '/images/default-restaurant.jpg',
        fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-restaurant.jpg`,
        type: 'jpg',
        description: 'Default restaurant image'
      },
      item: {
        url: '/images/default-item.jpg',
        fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-item.jpg`,
        type: 'jpg',
        description: 'Default menu item image'
      },
      cover: {
        url: '/images/default-cover.jpg',
        fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/images/default-cover.jpg`,
        type: 'jpg',
        description: 'Default cover image'
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
          const filePath = path.join(PUBLIC_DIR, subValue.url);
          try {
            await fs.access(filePath);
            subValue.exists = true;
          } catch {
            subValue.exists = false;
          }
        }
      } else {
        const filePath = path.join(PUBLIC_DIR, value.url);
        try {
          await fs.access(filePath);
          value.exists = true;
        } catch {
          value.exists = false;
        }
      }
    }

    cache.set(cacheKey, defaults, 3600); // ساعة واحدة

    res.json({
      success: true,
      data: defaults
    });
  } catch (error) {
    console.error("❌ Get default images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get default images"
    });
  }
};

/**
 * @desc    الحصول على صورة افتراضية محددة
 * @route   GET /api/assets/defaults/:type
 * @access  Public
 */
exports.getDefaultImageByType = async (req, res) => {
  try {
    const { type } = req.params;

    const validTypes = ['avatar', 'restaurant', 'item', 'cover', 'logo', 'favicon'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const defaults = await exports.getDefaultImages();

    if (type === 'logo') {
      return res.json({
        success: true,
        data: defaults.data.logo
      });
    }

    res.json({
      success: true,
      data: defaults.data[type]
    });
  } catch (error) {
    console.error("❌ Get default image by type error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get default image"
    });
  }
};

// ========== 5. تحميل الملفات ==========

/**
 * @desc    رفع صورة (للمستخدمين)
 * @route   POST /api/assets/upload
 * @access  Authenticated
 */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    // التحقق من نوع الملف
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`
      });
    }

    // التحقق من الحجم (5MB كحد أقصى)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File too large. Max 5MB"
      });
    }

    // إنشاء روابط للصور المحسنة
    const optimizedUrls = {};
    if (req.file.publicId) {
      optimizedUrls.thumbnail = fileService.getOptimizedUrl(req.file.publicId, 'thumbnail');
      optimizedUrls.small = fileService.getOptimizedUrl(req.file.publicId, 'small');
      optimizedUrls.medium = fileService.getOptimizedUrl(req.file.publicId, 'medium');
      optimizedUrls.large = fileService.getOptimizedUrl(req.file.publicId, 'large');
    }

    res.json({
      success: true,
      message: "File uploaded successfully",
      data: {
        url: req.file.path,
        publicId: req.file.publicId,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        optimized: optimizedUrls
      }
    });
  } catch (error) {
    console.error("❌ Upload image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload image"
    });
  }
};

/**
 * @desc    حذف صورة (للمستخدمين)
 * @route   DELETE /api/assets/:publicId
 * @access  Authenticated
 */
exports.deleteImage = async (req, res) => {
  try {
    const { publicId } = req.params;

    const result = await fileService.deleteFile(publicId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Image not found"
      });
    }

    res.json({
      success: true,
      message: "Image deleted successfully"
    });
  } catch (error) {
    console.error("❌ Delete image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete image"
    });
  }
};

// ========== 6. معلومات الملفات ==========

/**
 * @desc    الحصول على معلومات ملف
 * @route   GET /api/assets/info/:publicId
 * @access  Admin
 */
exports.getFileInfo = async (req, res) => {
  try {
    const { publicId } = req.params;

    const info = await fileService.getFileInfo(publicId);

    if (!info) {
      return res.status(404).json({
        success: false,
        message: "File not found"
      });
    }

    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    console.error("❌ Get file info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get file info"
    });
  }
};

// ========== 7. دوال مساعدة ==========

/**
 * تحديد فئة الصورة من اسمها
 */
const getImageCategory = (filename) => {
  const name = filename.toLowerCase();

  if (name.includes('restaurant') || name.includes('resto')) return 'stores';
  if (name.includes('item') || name.includes('food') || name.includes('meal')) return 'items';
  if (name.includes('user') || name.includes('avatar') || name.includes('profile')) return 'users';
  if (name.includes('cover') || name.includes('banner')) return 'covers';
  if (name.includes('icon') || name.includes('logo')) return 'icons';
  if (name.includes('default')) return 'defaults';

  return 'other';
};

/**
 * تحديد غرض الأيقونة
 */
const getIconPurpose = (filename) => {
  const name = filename.toLowerCase();

  if (name === 'favicon.ico') return 'favicon';
  if (name.includes('apple-touch-icon')) return 'apple-touch';
  if (name.includes('icon-192')) return 'android-192';
  if (name.includes('icon-512')) return 'android-512';
  if (name.includes('manifest')) return 'manifest';

  return 'general';
};

module.exports = exports;