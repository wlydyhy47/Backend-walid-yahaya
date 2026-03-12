// ============================================
// ملف: src/middlewares/auth.middleware.js (محدث)
// الوصف: التحقق من صحة التوكن والمصادقة
// ============================================

const jwt = require("jsonwebtoken");
const cache = require("../utils/cache.util");
const User = require("../models/user.model");
const { businessLogger } = require("../utils/logger.util");

/**
 * التحقق من صحة تنسيق JWT
 */
const isValidJwtFormat = (token) => {
  if (!token || typeof token !== 'string') return false;
  
  // JWT يتكون من 3 أجزاء مفصولة بنقاط
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // التحقق أن كل جزء هو Base64 صالح
  try {
    parts.forEach(part => {
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
  
  // 3. من الكوكيز (إذا كان مستخدماً)
  if (headers.cookie) {
    const cookies = headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    
    if (cookies.token || cookies.access_token) {
      return cookies.token || cookies.access_token;
    }
  }
  
  return null;
};

/**
 * التحقق من صلاحية التوكن
 */
const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      complete: false
    });

    // التحقق من وجود الـ id
    if (!decoded || !decoded.id) {
      return { valid: false, reason: 'INVALID_PAYLOAD' };
    }

    // التحقق من انتهاء الصلاحية
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'EXPIRED' };
    }

    return { valid: true, decoded };
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      if (error.message.includes('invalid signature')) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }
      if (error.message.includes('invalid algorithm')) {
        return { valid: false, reason: 'INVALID_ALGORITHM' };
      }
      if (error.message.includes('malformed')) {
        return { valid: false, reason: 'MALFORMED' };
      }
      return { valid: false, reason: 'INVALID_TOKEN' };
    }
    
    if (error.name === 'TokenExpiredError') {
      return { 
        valid: false, 
        reason: 'EXPIRED',
        expiredAt: error.expiredAt 
      };
    }

    return { valid: false, reason: 'VERIFICATION_FAILED' };
  }
};

/**
 * التحقق من blacklist
 */
const isTokenBlacklisted = async (token) => {
  try {
    const blacklisted = await cache.get(`token:blacklist:${token}`);
    return !!blacklisted;
  } catch (error) {
    businessLogger.error('Cache error checking blacklist:', error);
    return false;
  }
};

/**
 * إضافة token إلى blacklist
 */
const blacklistToken = async (token, expiresIn = 3600) => {
  try {
    await cache.set(`token:blacklist:${token}`, true, expiresIn);
    return true;
  } catch (error) {
    businessLogger.error('Error blacklisting token:', error);
    return false;
  }
};

// ========== Middleware الرئيسي ==========

/**
 * @desc    التحقق من صحة التوكن
 * @access  يستخدم في المسارات المحمية
 */
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
      businessLogger.warn(`Invalid JWT format detected`, {
        ip: req.ip,
        tokenPreview: token.substring(0, 20) + '...'
      });

      return res.status(401).json({
        success: false,
        message: "Invalid token format",
        code: "INVALID_TOKEN_FORMAT",
        details: "Token must be a valid JWT (3 parts separated by dots)"
      });
    }

    // التحقق من blacklist
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: "Token has been revoked",
        code: "TOKEN_REVOKED"
      });
    }

    // التحقق من صلاحية Token
    const verification = await verifyToken(token);
    
    if (!verification.valid) {
      const errorMessages = {
        'EXPIRED': 'Token has expired',
        'INVALID_SIGNATURE': 'Token signature is invalid',
        'INVALID_ALGORITHM': 'Invalid token algorithm',
        'MALFORMED': 'Token structure is corrupted',
        'INVALID_PAYLOAD': 'Token missing required user ID',
        'INVALID_TOKEN': 'Token is malformed or invalid',
        'VERIFICATION_FAILED': 'Token verification failed'
      };

      const message = errorMessages[verification.reason] || 'Invalid token';
      const code = verification.reason || 'TOKEN_INVALID';

      const response = {
        success: false,
        message,
        code
      };

      if (verification.reason === 'EXPIRED' && verification.expiredAt) {
        response.expiredAt = verification.expiredAt;
      }

      return res.status(401).json(response);
    }

    const decoded = verification.decoded;

    // التحقق من وجود المستخدم في قاعدة البيانات
    const user = await User.findById(decoded.id)
      .select('isActive isVerified role name')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND"
      });
    }

    // التحقق من أن الحساب نشط
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
        code: "ACCOUNT_DEACTIVATED"
      });
    }

    // حفظ معلومات المستخدم في الطلب
    req.user = {
      id: decoded.id,
      role: user.role,
      name: user.name,
      isVerified: user.isVerified
    };

    // إضافة معلومات إضافية
    req.auth = {
      authenticated: true,
      method: 'jwt',
      tokenPreview: token.substring(0, 20) + '...'
    };

    // تحديث آخر نشاط للمستخدم (بشكل غير متزامن)
    User.findByIdAndUpdate(decoded.id, {
      lastActivity: new Date(),
      lastIp: req.ip || req.connection.remoteAddress,
      lastUserAgent: req.headers['user-agent']
    }).catch(err => businessLogger.error('Failed to update user activity:', err));

    businessLogger.debug('Authentication successful', {
      userId: decoded.id,
      role: user.role,
      path: req.originalUrl
    });

    next();
  } catch (error) {
    businessLogger.error("Unexpected error in auth middleware:", error);
    
    res.status(500).json({
      success: false,
      message: "Authentication service unavailable",
      code: "AUTH_SERVICE_ERROR"
    });
  }
};

/**
 * @desc    التحقق الاختياري (لا يمنع الوصول)
 * @access  يستخدم في المسارات العامة التي قد تحتوي بيانات مخصصة
 */
module.exports.optional = async (req, res, next) => {
  try {
    const token = extractToken(req.headers);
    
    if (token && isValidJwtFormat(token)) {
      try {
        const verification = await verifyToken(token);
        
        if (verification.valid) {
          const decoded = verification.decoded;
          
          // التحقق من وجود المستخدم
          const user = await User.findById(decoded.id)
            .select('isActive role name')
            .lean();

          if (user && user.isActive) {
            req.user = {
              id: decoded.id,
              role: user.role,
              name: user.name
            };
            req.auth = { authenticated: true, method: 'jwt' };
          } else {
            req.user = null;
            req.auth = { authenticated: false, method: 'none' };
          }
        } else {
          req.user = null;
          req.auth = { authenticated: false, method: 'none' };
        }
      } catch (e) {
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

/**
 * @desc    وظائف مساعدة
 */
module.exports.blacklistToken = blacklistToken;
module.exports.verifyToken = verifyToken;
module.exports.extractToken = extractToken;