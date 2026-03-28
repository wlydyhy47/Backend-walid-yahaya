// ============================================
// ملف: src/config/api.config.js
// الوصف: إعدادات API المركزية
// ============================================

module.exports = {
  // إعدادات API الأساسية
  api: {
    prefix: 'api',
    versions: ['v1', 'v2'],
    defaultVersion: 'v1',

    // إعدادات Rate Limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 دقيقة
      max: 100, // الحد الأقصى للطلبات
      message: 'محاولات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة'
    },

    // إعدادات Pagination
    pagination: {
      defaultLimit: 20,
      maxLimit: 100,
      defaultPage: 1
    },

    // إعدادات Cache
    cache: {
      defaultTTL: 300, // 5 دقائق
      dashboardTTL: 180, // 3 دقائق
      homeTTL: 600 // 10 دقائق
    }
  },

  // المسارات العامة (لا تحتاج توثيق)
  publicRoutes: [
    '/auth/login',
    '/auth/register',
    '/auth/register/complete',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify',
    '/auth/resend-verification',
    '/health',
    '/public',
    '/images',
    '/icons'
  ],

  // أدوار المستخدمين
  roles: {
    CLIENT: 'client',
    DRIVER: 'driver',
    ADMIN: 'admin',
    VENDOR: 'vendor'
  },

  // حالات الطلب
  orderStatus: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    READY: 'ready',
    PICKED: 'picked',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled'
  },

  // أنواع الإشعارات
  notificationTypes: {
    SYSTEM: 'system',
    ORDER_CREATED: 'order_created',
    ORDER_ACCEPTED: 'order_accepted',
    ORDER_PICKED: 'order_picked',
    ORDER_READY: 'order_ready',
    ORDER_DELIVERED: 'order_delivered',
    ORDER_CANCELLED: 'order_cancelled',
    DRIVER_ASSIGNED: 'driver_assigned',
    DRIVER_ARRIVED: 'driver_arrived',
    PAYMENT_SUCCESS: 'payment_success',
    PAYMENT_FAILED: 'payment_failed',
    REVIEW_REMINDER: 'review_reminder',
    PROMOTION: 'promotion',
    ANNOUNCEMENT: 'announcement',
    SECURITY: 'security',
    SUPPORT: 'support'
  },

  // أولويات الإشعارات
  notificationPriorities: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  },

  // أنواع الدردشة
  chatTypes: {
    DIRECT: 'direct',
    SUPPORT: 'support',
    ORDER: 'order',
    GROUP: 'group',
    BROADCAST: 'broadcast'
  },

  // أنواع الرسائل
  messageTypes: {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    FILE: 'file',
    LOCATION: 'location',
    CONTACT: 'contact',
    STICKER: 'sticker',
    SYSTEM: 'system',
    ORDER_UPDATE: 'order_update',
    DELIVERY: 'delivery'
  },

  // إعدادات الملفات
  fileUpload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    avatarMaxSize: 2 * 1024 * 1024, // 2MB
    coverMaxSize: 8 * 1024 * 1024, // 8MB
    itemMaxSize: 5 * 1024 * 1024 // 5MB
  },

  // رسائل الخطأ الموحدة
  errorMessages: {
    UNAUTHORIZED: 'غير مصرح لك بالوصول',
    FORBIDDEN: 'ليس لديك الصلاحيات الكافية',
    NOT_FOUND: 'المورد غير موجود',
    VALIDATION_ERROR: 'بيانات غير صالحة',
    SERVER_ERROR: 'حدث خطأ في الخادم',
    DUPLICATE: 'البيانات موجودة مسبقاً',
    RATE_LIMIT: 'محاولات كثيرة جداً، الرجاء المحاولة لاحقاً'
  },

  // رسائل النجاح الموحدة
  successMessages: {
    CREATED: 'تم الإنشاء بنجاح',
    UPDATED: 'تم التحديث بنجاح',
    DELETED: 'تم الحذف بنجاح',
    LOGIN_SUCCESS: 'تم تسجيل الدخول بنجاح',
    LOGOUT_SUCCESS: 'تم تسجيل الخروج بنجاح',
    REGISTER_SUCCESS: 'تم التسجيل بنجاح'
  }
};