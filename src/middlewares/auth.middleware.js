const jwt = require("jsonwebtoken");
const cache = require("../utils/cache.util");
const User = require("../models/user.model");

/**
 * التحقق من صحة تنسيق JWT
 * @param {string} token - التوكن المراد التحقق منه
 * @returns {boolean} - هل التوكن صحيح التنسيق
 */
const isValidJwtFormat = (token) => {
  if (!token || typeof token !== 'string') return false;
  
  // JWT يتكون من 3 أجزاء مفصولة بنقاط
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // التحقق أن كل جزء هو Base64 صالح
  try {
    parts.forEach(part => {
      // إضافة padding إذا لزم
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      Buffer.from(base64 + padding, 'base64');
    });
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * استخراج التوكن من الهيدر بأشكال مختلفة
 * @param {object} headers - هيدرات الطلب
 * @returns {string|null} - التوكن أو null
 */
const extractToken = (headers) => {
  // 1. الطريقة القياسية: Bearer token
  if (headers.authorization) {
    const parts = headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
  }
  
  // 2. طرق بديلة
  if (headers['x-access-token']) {
    return headers['x-access-token'];
  }
  
  if (headers.token) {
    return headers.token;
  }
  
  return null;
};

module.exports = async (req, res, next) => {
  try {
    // استخراج التوكن
    const token = extractToken(req.headers);

    // التحقق من وجود التوكن
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
        code: "NO_TOKEN",
        details: "Authorization header is missing or invalid format"
      });
    }

    // التحقق من تنسيق التوكن
    if (!isValidJwtFormat(token)) {
      console.warn(`[Auth] Invalid JWT format detected: ${token.substring(0, 20)}...`);
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
        code: "INVALID_TOKEN_FORMAT",
        details: "Token must be a valid JWT (3 parts separated by dots)"
      });
    }

    // التحقق من blacklist
    try {
      const isBlacklisted = await cache.get(`token:blacklist:${token}`);
      if (isBlacklisted) {
        return res.status(401).json({
          success: false,
          message: "Token has been revoked",
          code: "TOKEN_REVOKED"
        });
      }
    } catch (cacheError) {
      console.error("[Auth] Cache error:", cacheError.message);
      // نكمل حتى لو فشل الكاش
    }

    // التحقق من صلاحية Token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        complete: false // نريد فقط الـ payload
      });
    } catch (jwtError) {
      console.error(`[Auth] JWT verification failed: ${jwtError.message}`);
      
      // معالجة أنواع الأخطاء المختلفة
      if (jwtError.name === "JsonWebTokenError") {
        // تحسين رسالة الخطأ بناءً على السبب
        let details = "Token is malformed or invalid";
        let code = "JWT_MALFORMED";
        
        if (jwtError.message.includes('invalid signature')) {
          details = "Token signature is invalid";
          code = "INVALID_SIGNATURE";
        } else if (jwtError.message.includes('invalid algorithm')) {
          details = "Invalid token algorithm";
          code = "INVALID_ALGORITHM";
        } else if (jwtError.message.includes('jwt malformed')) {
          details = "Token structure is corrupted";
          code = "JWT_MALFORMED";
        }
        
        return res.status(401).json({
          success: false,
          message: "Invalid token",
          code,
          details
        });
      }
      
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token has expired",
          code: "TOKEN_EXPIRED",
          expiredAt: jwtError.expiredAt
        });
      }
      
      // أخطاء غير متوقعة
      return res.status(401).json({
        success: false,
        message: "Token verification failed",
        code: "TOKEN_VERIFICATION_FAILED"
      });
    }

    // التحقق من وجود الـ id في الـ decoded token
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
        code: "INVALID_PAYLOAD",
        details: "Token missing required user ID"
      });
    }

    // حفظ معلومات المستخدم في الطلب
    req.user = decoded;

    // تحديث آخر نشاط للمستخدم (بشكل غير متزامن)
    User.findById(decoded.id)
      .then(user => {
        if (user) {
          user.lastActivity = new Date();
          user.lastIp = req.ip || req.connection.remoteAddress;
          user.lastUserAgent = req.headers['user-agent'];
          
          return user.save()
            .catch(err => console.error("[Auth] Failed to update user activity:", err.message));
        }
      })
      .catch(err => console.error("[Auth] Failed to find user for activity update:", err.message));

    // إضافة معلومات إضافية للـ request
    req.auth = {
      authenticated: true,
      method: 'jwt',
      token: token.substring(0, 20) + '...' // للـ logging فقط
    };

    next();
  } catch (error) {
    console.error("[Auth] Unexpected error in auth middleware:", error);
    
    res.status(500).json({
      success: false,
      message: "Authentication service unavailable",
      code: "AUTH_SERVICE_ERROR"
    });
  }
};

/**
 * Middleware للتحقق من صحة التوكن دون إيقاع خطأ (للاستخدام في الـ public routes)
 */
module.exports.optional = async (req, res, next) => {
  try {
    const token = extractToken(req.headers);
    
    if (token && isValidJwtFormat(token)) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        req.auth = { authenticated: true, method: 'jwt' };
      } catch (e) {
        // تجاهل أخطاء التوكن في الـ optional auth
        req.user = null;
        req.auth = { authenticated: false, method: 'none' };
      }
    } else {
      req.user = null;
      req.auth = { authenticated: false, method: 'none' };
    }
    
    next();
  } catch (error) {
    req.user = null;
    req.auth = { authenticated: false, method: 'none' };
    next();
  }
};