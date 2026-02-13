const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const { AppError } = require("./errorHandler.middleware");

// التحقق من أنواع الملفات المسموح بها
const allowedMimeTypes = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  video: ['video/mp4', 'video/mov', 'video/avi', 'video/mkv', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
  document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
};

// حجم الملفات الأقصى (10MB للصور، 50MB للفيديو، 5MB للمستندات)
const maxFileSizes = {
  image: 10 * 1024 * 1024, // 10MB
  video: 50 * 1024 * 1024, // 50MB
  audio: 20 * 1024 * 1024, // 20MB
  document: 5 * 1024 * 1024, // 5MB
  default: 5 * 1024 * 1024 // 5MB
};

const fileFilter = (allowedTypes) => (req, file, cb) => {
  try {
    // التحقق من نوع الملف
    const fileType = Object.keys(allowedMimeTypes).find(type => 
      allowedMimeTypes[type].includes(file.mimetype)
    );

    if (!fileType) {
      return cb(new AppError(`نوع الملف ${file.mimetype} غير مسموح به`, 400), false);
    }

    // التحقق إذا كان النوع مسموحاً به
    if (!allowedTypes.includes(fileType) && !allowedTypes.includes('all')) {
      return cb(new AppError(`نوع الملف ${fileType} غير مسموح به للرفع`, 400), false);
    }

    // التحقق من حجم الملف
    const maxSize = maxFileSizes[fileType] || maxFileSizes.default;
    if (file.size > maxSize) {
      return cb(new AppError(`حجم الملف يتجاوز الحد المسموح به (${maxSize / 1024 / 1024}MB)`, 400), false);
    }

    // التحقق من اسم الملف
    if (!file.originalname || file.originalname.length > 255) {
      return cb(new AppError('اسم الملف غير صالح', 400), false);
    }

    cb(null, true);
  } catch (error) {
    cb(new AppError('خطأ في التحقق من الملف', 500), false);
  }
};

const upload = (folder, allowedTypes = ['image']) => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      try {
        // تحديد مجلد فرعي بناءً على نوع الملف
        const fileType = Object.keys(allowedMimeTypes).find(type => 
          allowedMimeTypes[type].includes(file.mimetype)
        ) || 'other';

        const subfolder = `${folder}/${fileType}s`;
        
        // إنشاء اسم ملف فريد
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const originalName = file.originalname.replace(/\.[^/.]+$/, ""); // إزالة الامتداد
        const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const publicId = `${safeName}-${timestamp}-${random}`;
        
        return {
          folder: subfolder,
          format: () => {
            if (file.mimetype.startsWith('image')) return 'webp'; // تحويل الصور إلى webp
            if (file.mimetype.startsWith('video')) return 'mp4'; // تحويل الفيديو إلى mp4
            return file.originalname.split('.').pop();
          },
          public_id: publicId,
          transformation: file.mimetype.startsWith('image') ? [
            { width: 1200, height: 1200, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "auto" }
          ] : [],
          resource_type: "auto"
        };
      } catch (error) {
        console.error('Cloudinary storage params error:', error);
        throw error;
      }
    },
  });

  return multer({
    storage,
    fileFilter: fileFilter(allowedTypes),
    limits: {
      fileSize: Math.max(...allowedTypes.map(type => maxFileSizes[type] || maxFileSizes.default)),
      files: 10 // الحد الأقصى لعدد الملفات
    }
  });
};

// دالة مساعدة لرفع ملفات متعددة
const uploadMultiple = (folder, fields, allowedTypes = ['image']) => {
  const uploader = upload(folder, allowedTypes);
  
  return (req, res, next) => {
    uploader.fields(fields)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('حجم الملف يتجاوز الحد المسموح به', 400));
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(new AppError('تم رفع عدد كبير جداً من الملفات', 400));
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new AppError('حقل ملف غير متوقع', 400));
          }
          if (err.code === 'LIMIT_PART_COUNT') {
            return next(new AppError('عدد الأجزاء كبير جداً', 400));
          }
        }
        return next(new AppError(err.message || 'خطأ في رفع الملف', 400));
      }
      
      // التحقق من وجود الملفات المطلوبة
      if (fields.some(field => field.required && !req.files?.[field.name])) {
        return next(new AppError(`حقل ${field.name} مطلوب`, 400));
      }
      
      next();
    });
  };
};

// دالة مساعدة للتحقق من الملفات المرفوعة
const validateUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return next(new AppError('لم يتم رفع أي ملف', 400));
  }
  
  // التحقق من أن الملفات قد تم رفعها بنجاح إلى Cloudinary
  if (req.file && !req.file.path) {
    return next(new AppError('فشل رفع الملف إلى السحابة', 500));
  }
  
  if (req.files) {
    for (const fieldName in req.files) {
      for (const file of req.files[fieldName]) {
        if (!file.path) {
          return next(new AppError(`فشل رفع ملف ${file.originalname}`, 500));
        }
      }
    }
  }
  
  next();
};

module.exports = upload;
module.exports.uploadMultiple = uploadMultiple;
module.exports.validateUpload = validateUpload;
module.exports.allowedMimeTypes = allowedMimeTypes;
module.exports.maxFileSizes = maxFileSizes;