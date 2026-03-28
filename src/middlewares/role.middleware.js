// ============================================
// ملف: src/middlewares/role.middleware.js (مصحح)
// الوصف: التحقق من صلاحيات الأدوار
// الإصدار: 3.0
// ============================================

const { businessLogger } = require("../utils/logger.util");

/**
 * قائمة الأدوار المسموح بها
 */
const ROLES = {
  CLIENT: 'client',
  DRIVER: 'driver',
  ADMIN: 'admin',
  VENDOR: 'vendor'  
};

/**
 * هرمية الأدوار (كل دور له صلاحية الأدوار الأدنى)
 */
const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.VENDOR, ROLES.DRIVER, ROLES.CLIENT],
  [ROLES.VENDOR]: [ROLES.VENDOR, ROLES.DRIVER, ROLES.CLIENT],
  [ROLES.DRIVER]: [ROLES.DRIVER, ROLES.CLIENT],
  [ROLES.CLIENT]: [ROLES.CLIENT]
};

/**
 * صلاحيات كل دور
 */
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    'manage_users',
    'manage_stores',      // ✅ تغيير من manage_stores
    'manage_orders',
    'manage_drivers',
    'view_analytics',
    'manage_system',
    'send_notifications',
    'manage_loyalty',
    'view_logs'
  ],
  [ROLES.VENDOR]: [  // ✅ تغيير من RESTAURANT_OWNER
    'manage_own_store',    // ✅ تغيير من manage_own_store
    'view_own_orders',
    'update_order_status',
    'manage_products',     // ✅ تغيير من manage_menu
    'view_own_analytics',
    'manage_staff'
  ],
  [ROLES.DRIVER]: [
    'view_assigned_orders',
    'update_order_status',
    'update_location',
    'view_earnings',
    'toggle_availability'
  ],
  [ROLES.CLIENT]: [
    'create_orders',
    'view_own_orders',
    'cancel_own_orders',
    'manage_addresses',
    'write_reviews',
    'manage_favorites',
    'view_loyalty'
  ]
};

// ========== 1. Middleware أساسي للتحقق من الدور ==========

/**
 * @desc    التحقق من أن المستخدم لديه أحد الأدوار المسموحة
 * @param  {...string} allowedRoles - الأدوار المسموح بها
 */
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          message: "غير مصرح لك - لم يتم التعرف على المستخدم",
          code: "UNAUTHORIZED"
        });
      }

      const userRole = req.user.role;

      // التحقق إذا كان الدور مسموحاً به
      if (!allowedRoles.includes(userRole)) {
        businessLogger.warn('Access denied - insufficient permissions', {
          userId: req.user.id,
          userRole,
          requiredRoles: allowedRoles,
          path: req.originalUrl
        });

        return res.status(403).json({
          success: false,
          message: "غير مصرح لك - ليس لديك الصلاحيات المطلوبة",
          code: "FORBIDDEN",
          requiredRoles: allowedRoles,
          yourRole: userRole
        });
      }

      next();
    } catch (error) {
      businessLogger.error('Role middleware error:', error);

      res.status(500).json({
        success: false,
        message: "خطأ في التحقق من الصلاحيات",
        code: "ROLE_CHECK_ERROR"
      });
    }
  };
};

// ========== 2. Middleware للتحقق من الصلاحية (Permission-based) ==========

/**
 * @desc    التحقق من أن المستخدم لديه صلاحية معينة
 * @param  {string} permission - الصلاحية المطلوبة
 */
const hasPermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          message: "غير مصرح لك",
          code: "UNAUTHORIZED"
        });
      }

      const userRole = req.user.role;
      const userPermissions = ROLE_PERMISSIONS[userRole] || [];

      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: "ليس لديك الصلاحية المطلوبة",
          code: "PERMISSION_DENIED",
          requiredPermission: permission
        });
      }

      next();
    } catch (error) {
      businessLogger.error('Permission middleware error:', error);

      res.status(500).json({
        success: false,
        message: "خطأ في التحقق من الصلاحية"
      });
    }
  };
};

// ========== 3. Middleware خاص لصاحب المتجر ==========

/**
 * @desc    التحقق من أن المستخدم يملك المتجر المطلوب
 */
const storeOwnerMiddleware = async (req, res, next) => {
  try {
    const Store = require("../models/store.model");

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح لك - يجب تسجيل الدخول",
        code: "UNAUTHORIZED"
      });
    }

    // الأدمن يتجاوز التحقق من الملكية
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    if (req.user.role !== ROLES.VENDOR) {
      return res.status(403).json({
        success: false,
        message: "هذا المسار مخصص لأصحاب المتاجر فقط",
        code: "FORBIDDEN"
      });
    }

    // التحقق من أن المستخدم يملك متجراً
    const user = await require("../models/user.model").findById(req.user.id)
      .select('storeOwnerInfo');

    if (!user?.storeOwnerInfo?.store) {
      return res.status(400).json({
        success: false,
        message: "لم يتم ربطك بأي متجر بعد",
        code: "NO_STORE"
      });
    }

    // إذا كان هناك storeId في params، تحقق من الملكية
    const requestedStoreId = req.params.storeId ||
      req.params.id ||
      req.body.storeId;

    if (requestedStoreId) {
      const ownsStore = user.storeOwnerInfo.store.toString() === requestedStoreId;

      if (!ownsStore) {
        return res.status(403).json({
          success: false,
          message: "هذا المتجر لا ينتمي إليك",
          code: "NOT_OWNER"
        });
      }
    }

    // إضافة معلومات المتجر للـ req
    req.storeId = user.storeOwnerInfo.store;
    req.storeOwner = user.storeOwnerInfo;

    next();
  } catch (error) {
    businessLogger.error("Store owner middleware error:", error);

    res.status(500).json({
      success: false,
      message: "خطأ في التحقق من الصلاحيات",
      code: "MIDDLEWARE_ERROR"
    });
  }
};

// ========== 4. Middleware خاص للمندوب ==========

/**
 * @desc    التحقق من أن المستخدم مندوب وأنه متاح
 */
const driverMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح لك",
        code: "UNAUTHORIZED"
      });
    }

    if (req.user.role !== ROLES.DRIVER && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: "هذا المسار مخصص للمندوبين فقط",
        code: "FORBIDDEN"
      });
    }

    // إذا كان أدمن، يتجاوز التحقق
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    // التحقق من حالة المندوب
    const user = await require("../models/user.model").findById(req.user.id)
      .select('driverInfo.isAvailable isOnline');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
        code: "USER_NOT_FOUND"
      });
    }

    // إضافة معلومات المندوب للـ req
    req.driverInfo = {
      isAvailable: user.driverInfo?.isAvailable || false,
      isOnline: user.isOnline
    };

    next();
  } catch (error) {
    businessLogger.error("Driver middleware error:", error);

    res.status(500).json({
      success: false,
      message: "خطأ في التحقق من صلاحيات المندوب"
    });
  }
};

// ========== 5. دوال مساعدة ==========

/**
 * @desc    الحصول على قائمة الأدوار
 */
const getRoles = () => ROLES;

/**
 * @desc    الحصول على صلاحيات دور معين
 */
const getPermissionsForRole = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

/**
 * @desc    التحقق من أن لديه صلاحية الدور
 */
const hasRoleHierarchy = (userRole, requiredRole) => {
  const allowedRoles = ROLE_HIERARCHY[userRole] || [userRole];
  return allowedRoles.includes(requiredRole);
};

module.exports = roleMiddleware;
module.exports.roleMiddleware = roleMiddleware;
module.exports.storeOwnerMiddleware = storeOwnerMiddleware;  // ✅ تغيير من storeOwnerMiddleware
module.exports.driverMiddleware = driverMiddleware;
module.exports.hasPermission = hasPermission;
module.exports.getRoles = getRoles;
module.exports.getPermissionsForRole = getPermissionsForRole;
module.exports.hasRoleHierarchy = hasRoleHierarchy;
module.exports.ROLES = ROLES;