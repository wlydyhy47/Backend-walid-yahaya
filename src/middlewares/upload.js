// src/middlewares/upload.js (محدث بالكامل مع الربط)

const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { AppError } = require("./errorHandler.middleware");
const fs = require('fs');
const path = require('path');

// ========== الربط مع file.service.js ==========
const fileService = require('../services/file.service');

// ========== 1. أنواع الملفات المسموح بها ==========
const allowedMimeTypes = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'],
  video: ['video/mp4', 'video/mov', 'video/avi', 'video/mkv', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/aac', 'audio/m4a'],
  document: [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'text/plain', 
    'application/vnd.ms-excel', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
};

// ========== 2. أنواع مخصصة ==========
const customTypes = {
  avatar: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  cover: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  item: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  restaurant: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  category: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
};

// ========== 3. حجم الملفات الأقصى ==========
const maxFileSizes = {
  image: 10 * 1024 * 1024, // 10MB
  video: 50 * 1024 * 1024, // 50MB
  audio: 20 * 1024 * 1024, // 20MB
  document: 5 * 1024 * 1024, // 5MB
  avatar: 2 * 1024 * 1024, // 2MB
  cover: 8 * 1024 * 1024, // 8MB
  default: 5 * 1024 * 1024 // 5MB
};

// ========== 4. دالة تنظيف الملفات المؤقتة ==========
const cleanupTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });
  }
};

// ========== 5. فلتر الملفات المحسن ==========
const fileFilter = (allowedTypes) => (req, file, cb) => {
  try {
    // التحقق من customTypes أولاً
    let fileType = null;
    
    // إذا كان النوع المطلوب موجود في customTypes
    const requestedCustomType = allowedTypes.find(t => customTypes[t]);
    if (requestedCustomType) {
      const isValidCustom = customTypes[requestedCustomType].includes(file.mimetype);
      if (!isValidCustom) {
        return cb(new AppError(`نوع الملف غير مسموح لهذا الحقل. الأنواع المسموحة: ${customTypes[requestedCustomType].join(', ')}`, 400), false);
      }
      fileType = requestedCustomType;
    } else {
      // التحقق من الأنواع العامة
      fileType = Object.keys(allowedMimeTypes).find(type => 
        allowedMimeTypes[type].includes(file.mimetype)
      );
    }

    if (!fileType) {
      return cb(new AppError(`نوع الملف ${file.mimetype} غير مسموح به`, 400), false);
    }

    // التحقق إذا كان النوع مسموحاً به
    const isAllowed = allowedTypes.includes(fileType) || 
                     allowedTypes.includes('all') || 
                     allowedTypes.some(t => customTypes[t]);
    
    if (!isAllowed) {
      return cb(new AppError(`نوع الملف ${fileType} غير مسموح به للرفع`, 400), false);
    }

    // التحقق من حجم الملف
    const maxSize = maxFileSizes[fileType] || maxFileSizes[allowedTypes[0]] || maxFileSizes.default;
    if (file.size > maxSize) {
      return cb(new AppError(`حجم الملف يتجاوز الحد المسموح به (${maxSize / 1024 / 1024}MB)`, 400), false);
    }

    cb(null, true);
  } catch (error) {
    cb(new AppError('خطأ في التحقق من الملف', 500), false);
  }
};

// ========== 6. دالة الرفع إلى Cloudinary (مع استخدام fileService) ==========
const uploadToCloudinary = async (file, folder) => {
  try {
    // ===== استخدام fileService للتحقق من الملف =====
    fileService.validateFile(file, folder);
    
    const fileType = file.mimetype.split('/')[0];
    
    const options = {
      folder: `food-delivery/${folder}`,
      public_id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      resource_type: fileType === 'video' ? 'video' : fileType === 'audio' ? 'video' : 'auto'
    };

    // إضافة تحويلات للصور
    if (fileType === 'image') {
      options.transformation = [
        { width: 1200, height: 1200, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" }
      ];
    }

    // للـ avatar نحجم أصغر
    if (folder === 'avatars' || folder.includes('avatar')) {
      options.transformation = [
        { width: 400, height: 400, crop: "fill" },
        { quality: "auto:best" },
        { fetch_format: "auto" }
      ];
    }

    const result = await cloudinary.uploader.upload(file.path, options);
    
    // ===== استخدام fileService للحصول على صور محسنة =====
    const thumbnail = fileService.getOptimizedUrl(result.public_id, 'thumbnail');
    const allSizes = fileService.getAllSizes(result.public_id);
    
    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      thumbnail: thumbnail || result.secure_url,
      allSizes: allSizes, // كل الأحجام المتاحة
      size: result.bytes
    };
  } catch (error) {
    throw new AppError(`Cloudinary upload failed: ${error.message}`, 500);
  }
};

// ========== 7. دالة حذف من Cloudinary (مع استخدام fileService) ==========
const deleteFromCloudinary = async (publicId) => {
  return await fileService.deleteFile(publicId);
};

// ========== 8. دالة الحصول على صورة محسنة (مع استخدام fileService) ==========
const getOptimizedImageUrl = (publicId, options = {}) => {
  return fileService.getOptimizedUrl(publicId, options.size || 'medium', options);
};

// ========== 9. إنشاء مجلد temp إذا لم يكن موجوداً ==========
const tempDir = path.join(__dirname, '../../temp-uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ========== 10. دالة upload الرئيسية (محسنة) ==========
const upload = (folder, allowedTypes = ['image']) => {
  // تخزين مؤقت على القرص
  const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }
  });

  const uploadMiddleware = multer({
    storage: multerStorage,
    fileFilter: fileFilter(allowedTypes),
    limits: {
      fileSize: Math.max(
        ...allowedTypes.map(type => maxFileSizes[type] || maxFileSizes.default).filter(s => s > 0)
      ),
      files: 10
    }
  });

  return {
    // رفع ملف واحد
    single: (fieldName) => {
      return (req, res, next) => {
        uploadMiddleware.single(fieldName)(req, res, async (err) => {
          if (err) {
            if (err instanceof multer.MulterError) {
              if (err.code === 'LIMIT_FILE_SIZE') {
                return next(new AppError('حجم الملف كبير جداً', 400));
              }
              return next(new AppError(`خطأ في الرفع: ${err.message}`, 400));
            }
            return next(err);
          }
          
          if (!req.file) return next();
          
          try {
            // ===== رفع إلى Cloudinary مع استخدام fileService =====
            const result = await uploadToCloudinary(req.file, folder);
            
            // حذف الملف المؤقت
            cleanupTempFile(req.file.path);
            
            // إضافة معلومات Cloudinary مع الصور المحسنة
            req.file.cloudinary = result;
            req.file.path = result.secureUrl;
            req.file.publicId = result.publicId;
            req.file.thumbnail = result.thumbnail;
            req.file.allSizes = result.allSizes;
            
            next();
          } catch (error) {
            cleanupTempFile(req.file.path);
            next(error);
          }
        });
      };
    },
    
    // رفع عدة ملفات (مصفوفة)
    array: (fieldName, maxCount = 5) => {
      return (req, res, next) => {
        uploadMiddleware.array(fieldName, maxCount)(req, res, async (err) => {
          if (err) {
            if (err instanceof multer.MulterError) {
              if (err.code === 'LIMIT_FILE_SIZE') {
                return next(new AppError('حجم الملف كبير جداً', 400));
              }
              if (err.code === 'LIMIT_FILE_COUNT') {
                return next(new AppError(`لا يمكن رفع أكثر من ${maxCount} ملفات`, 400));
              }
              return next(new AppError(`خطأ في الرفع: ${err.message}`, 400));
            }
            return next(err);
          }
          
          if (!req.files || req.files.length === 0) return next();
          
          try {
            const uploadPromises = req.files.map(async (file) => {
              const result = await uploadToCloudinary(file, folder);
              cleanupTempFile(file.path);
              return {
                ...result,
                originalname: file.originalname,
                fieldname: file.fieldname,
                size: file.size
              };
            });
            
            req.files = await Promise.all(uploadPromises);
            
            next();
          } catch (error) {
            req.files.forEach(file => cleanupTempFile(file.path));
            next(error);
          }
        });
      };
    },
    
    // رفع عدة ملفات (حقول متعددة)
    fields: (fields) => {
      return (req, res, next) => {
        uploadMiddleware.fields(fields)(req, res, async (err) => {
          if (err) {
            if (err instanceof multer.MulterError) {
              return next(new AppError(`خطأ في الرفع: ${err.message}`, 400));
            }
            return next(err);
          }
          
          if (!req.files) return next();
          
          try {
            const filesObj = {};
            
            for (const [fieldName, fileArray] of Object.entries(req.files)) {
              const uploadPromises = fileArray.map(async (file) => {
                const result = await uploadToCloudinary(file, folder);
                cleanupTempFile(file.path);
                return {
                  ...result,
                  originalname: file.originalname,
                  fieldname: file.fieldname,
                  size: file.size
                };
              });
              
              filesObj[fieldName] = await Promise.all(uploadPromises);
            }
            
            req.files = filesObj;
            next();
          } catch (error) {
            // تنظيف كل الملفات
            Object.values(req.files).flat().forEach(file => cleanupTempFile(file.path));
            next(error);
          }
        });
      };
    }
  };
};

// ========== 11. دوال مساعدة للتوافق مع الكود القديم ==========
const uploadMultiple = (folder, fields, allowedTypes = ['image']) => {
  const uploader = upload(folder, allowedTypes);
  return uploader.fields(fields);
};

const uploadSingle = (folder, fieldName = 'file', allowedTypes = ['image']) => {
  const uploader = upload(folder, allowedTypes);
  return uploader.single(fieldName);
};

const validateUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return next(new AppError('لم يتم رفع أي ملف', 400));
  }
  
  // التحقق من أن الملفات قد تم رفعها بنجاح إلى Cloudinary
  if (req.file && !req.file.path) {
    return next(new AppError('فشل رفع الملف إلى السحابة', 500));
  }
  
  if (req.files) {
    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    for (const file of files) {
      if (!file.path) {
        return next(new AppError(`فشل رفع ملف ${file.originalname}`, 500));
      }
    }
  }
  
  next();
};

// ========== 12. تصدير كل شيء ==========
module.exports = upload;
module.exports.uploadMultiple = uploadMultiple;
module.exports.uploadSingle = uploadSingle;
module.exports.validateUpload = validateUpload;
module.exports.allowedMimeTypes = allowedMimeTypes;
module.exports.maxFileSizes = maxFileSizes;
module.exports.deleteFromCloudinary = deleteFromCloudinary;
module.exports.getOptimizedImageUrl = getOptimizedImageUrl;
module.exports.uploadToCloudinary = uploadToCloudinary;