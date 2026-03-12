// ============================================
// ملف: src/config/cloudinary.js (محدث)
// الوصف: إعدادات Cloudinary لإدارة الصور
// ============================================

const cloudinary = require("cloudinary").v2;
const { businessLogger } = require("../utils/logger.util");
require("dotenv").config();

/**
 * تكوين Cloudinary
 */
const configureCloudinary = () => {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // استخدام HTTPS
  };

  // التحقق من وجود الإعدادات
  const missingVars = [];
  if (!config.cloud_name) missingVars.push('CLOUDINARY_CLOUD_NAME');
  if (!config.api_key) missingVars.push('CLOUDINARY_API_KEY');
  if (!config.api_secret) missingVars.push('CLOUDINARY_API_SECRET');

  if (missingVars.length > 0) {
    businessLogger.warn(`Cloudinary config missing: ${missingVars.join(', ')}`);
    return null;
  }

  cloudinary.config(config);

  // اختبار الاتصال
  cloudinary.api.ping()
    .then(() => {
      businessLogger.info('Cloudinary connected successfully ✅');
    })
    .catch((error) => {
      businessLogger.error('Cloudinary connection failed ❌', error);
    });

  return cloudinary;
};

const cloudinaryInstance = configureCloudinary();

/**
 * الحصول على إعدادات التحويل للصور
 */
const getTransformationOptions = (type = 'default') => {
  const transformations = {
    thumbnail: { width: 150, height: 150, crop: "fill", quality: "auto:good" },
    small: { width: 300, height: 300, crop: "fill", quality: "auto:good" },
    medium: { width: 600, height: 400, crop: "fill", quality: "auto:good" },
    large: { width: 1200, height: 800, crop: "limit", quality: "auto:best" },
    avatar: { width: 200, height: 200, crop: "fill", quality: "auto:best" },
    cover: { width: 1200, height: 400, crop: "fill", quality: "auto:good" },
    item: { width: 500, height: 500, crop: "fill", quality: "auto:good" },
    default: { quality: "auto:good", fetch_format: "auto" }
  };

  return transformations[type] || transformations.default;
};

/**
 * رفع صورة إلى Cloudinary
 */
const uploadImage = async (filePath, options = {}) => {
  try {
    if (!cloudinaryInstance) {
      throw new Error('Cloudinary not configured');
    }

    const {
      folder = 'general',
      publicId = null,
      transformation = getTransformationOptions('default'),
      tags = []
    } = options;

    const uploadOptions = {
      folder: `food-delivery/${folder}`,
      public_id: publicId || undefined,
      tags,
      ...transformation
    };

    const result = await cloudinaryInstance.uploader.upload(filePath, uploadOptions);

    businessLogger.info('Image uploaded to Cloudinary', {
      publicId: result.public_id,
      folder,
      size: result.bytes
    });

    return result;
  } catch (error) {
    businessLogger.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * حذف صورة من Cloudinary
 */
const deleteImage = async (publicId) => {
  try {
    if (!cloudinaryInstance) {
      throw new Error('Cloudinary not configured');
    }

    const result = await cloudinaryInstance.uploader.destroy(publicId);

    if (result.result === 'ok') {
      businessLogger.info('Image deleted from Cloudinary', { publicId });
    } else {
      businessLogger.warn('Failed to delete image from Cloudinary', { publicId, result });
    }

    return result.result === 'ok';
  } catch (error) {
    businessLogger.error('Cloudinary delete error:', error);
    return false;
  }
};

/**
 * الحصول على رابط صورة محسنة
 */
const getOptimizedUrl = (publicId, options = {}) => {
  if (!cloudinaryInstance || !publicId) return null;

  const {
    width,
    height,
    crop = 'fill',
    quality = 'auto:good',
    format = 'auto'
  } = options;

  try {
    return cloudinaryInstance.url(publicId, {
      transformation: [
        { width, height, crop },
        { quality, fetch_format: format }
      ],
      secure: true
    });
  } catch (error) {
    businessLogger.error('Error generating optimized URL:', error);
    return null;
  }
};

module.exports = cloudinaryInstance || {
  uploader: { upload: uploadImage, destroy: deleteImage },
  url: getOptimizedUrl,
  getTransformationOptions,
  uploadImage,
  deleteImage,
  getOptimizedUrl
};