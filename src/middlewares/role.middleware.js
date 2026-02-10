// middlewares/role.middleware.js

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح لك - لم يتم التعرف على المستخدم",
      });
    }

    // ✅ التحقق من الصلاحيات المتعددة
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك - ليس لديك الصلاحيات المطلوبة",
        requiredRoles: allowedRoles,
        yourRole: req.user.role,
      });
    }

    next();
  };
};

// ✅ middleware خاص لصاحب المطعم - يتحقق من ملكية المطعم
const restaurantOwnerMiddleware = async (req, res, next) => {
  try {
    const Restaurant = require("../models/restaurant.model");
    
    if (req.user.role !== "restaurant_owner" && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "هذا المسار مخصص لأصحاب المطاعم فقط",
      });
    }

    // الأدمن يتجاوز التحقق من الملكية
    if (req.user.role === "admin") {
      return next();
    }

    // التحقق من أن المستخدم يملك مطعماً
    if (!req.user.restaurantOwnerInfo?.restaurant) {
      return res.status(400).json({
        success: false,
        message: "لم يتم ربطك بأي مطعم بعد",
      });
    }

    // إذا كان هناك restaurantId في params، تحقق من الملكية
    const requestedRestaurantId = req.params.restaurantId || req.body.restaurantId;
    
    if (requestedRestaurantId) {
      const ownsRestaurant = req.user.restaurantOwnerInfo.restaurant.toString() === requestedRestaurantId;
      
      if (!ownsRestaurant) {
        return res.status(403).json({
          success: false,
          message: "هذا المطعم لا ينتمي إليك",
        });
      }
    }

    // إضافة معلومات المطعم للـ req
    req.restaurantId = req.user.restaurantOwnerInfo.restaurant;
    
    next();
  } catch (error) {
    console.error("Restaurant owner middleware error:", error);
    res.status(500).json({
      success: false,
      message: "خطأ في التحقق من الصلاحيات",
    });
  }
};

module.exports = roleMiddleware;
module.exports.restaurantOwnerMiddleware = restaurantOwnerMiddleware;