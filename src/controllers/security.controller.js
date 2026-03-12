// ============================================
// ملف: src/controllers/security.controller.js
// الوصف: فحوصات الأمان والتحقق
// الإصدار: 1.0 (جديد)
// ============================================

const SecurityCheck = require('../utils/securityCheck.util');
const User = require("../models/user.model");
const cache = require("../utils/cache.util");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. فحوصات عامة ==========

/**
 * @desc    فحص قوة كلمة المرور
 * @route   POST /api/security/check-password
 * @access  Public
 */
exports.checkPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const result = SecurityCheck.isPasswordStrong(password);

    // إضافة توصيات
    const recommendations = [];
    if (!result.checks.minLength) recommendations.push('Use at least 8 characters');
    if (!result.checks.hasUpperCase) recommendations.push('Add uppercase letters');
    if (!result.checks.hasLowerCase) recommendations.push('Add lowercase letters');
    if (!result.checks.hasNumbers) recommendations.push('Add numbers');
    if (!result.checks.hasSpecialChar) recommendations.push('Add special characters');

    res.json({
      success: true,
      data: {
        ...result,
        recommendations,
        strength: result.score >= 4 ? 'strong' : result.score >= 3 ? 'medium' : 'weak'
      }
    });
  } catch (error) {
    console.error("❌ Check password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check password"
    });
  }
};

/**
 * @desc    فحص صحة البريد الإلكتروني
 * @route   POST /api/security/check-email
 * @access  Public
 */
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const isValid = SecurityCheck.isValidEmail(email);
    
    // فحص إضافي: هل البريد مستخدم بالفعل؟
    const existingUser = await User.findOne({ email });
    const isAvailable = !existingUser;

    res.json({
      success: true,
      data: {
        email,
        isValid,
        isAvailable,
        message: isValid 
          ? (isAvailable ? 'Valid and available email' : 'Valid but already in use')
          : 'Invalid email format',
        domain: email.split('@')[1],
        suggestions: !isValid ? getEmailSuggestions(email) : []
      }
    });
  } catch (error) {
    console.error("❌ Check email error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check email"
    });
  }
};

/**
 * @desc    فحص نص من SQL Injection
 * @route   POST /api/security/check-sql-injection
 * @access  Public
 */
exports.checkSqlInjection = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }

    const hasInjection = SecurityCheck.hasSqlInjection(text);
    
    const patterns = [
      { pattern: 'SELECT.*FROM', name: 'SELECT FROM', detected: /SELECT.*FROM/i.test(text) },
      { pattern: 'INSERT.*INTO', name: 'INSERT INTO', detected: /INSERT.*INTO/i.test(text) },
      { pattern: 'UPDATE.*SET', name: 'UPDATE SET', detected: /UPDATE.*SET/i.test(text) },
      { pattern: 'DELETE.*FROM', name: 'DELETE FROM', detected: /DELETE.*FROM/i.test(text) },
      { pattern: 'DROP.*TABLE', name: 'DROP TABLE', detected: /DROP.*TABLE/i.test(text) },
      { pattern: 'UNION.*SELECT', name: 'UNION SELECT', detected: /UNION.*SELECT/i.test(text) },
      { pattern: '--', name: 'Comment (--)', detected: /--/.test(text) },
      { pattern: ';', name: 'Multiple statements', detected: /;/.test(text) }
    ];

    const detectedPatterns = patterns.filter(p => p.detected);

    res.json({
      success: true,
      data: {
        safe: !hasInjection,
        hasInjection,
        detectedPatterns: detectedPatterns.map(p => p.name),
        riskLevel: detectedPatterns.length === 0 ? 'none' :
                  detectedPatterns.length <= 2 ? 'low' :
                  detectedPatterns.length <= 4 ? 'medium' : 'high'
      }
    });
  } catch (error) {
    console.error("❌ Check SQL injection error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check SQL injection"
    });
  }
};

// ========== 2. معلومات الأمان (للأدمن) ==========

/**
 * @desc    الحصول على معلومات رؤوس الأمان
 * @route   GET /api/security/headers
 * @access  Admin
 */
exports.getSecurityHeaders = async (req, res) => {
  try {
    const headers = {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(self), microphone=()',
      'Cache-Control': 'no-store, max-age=0'
    };

    res.json({
      success: true,
      data: {
        current: headers,
        status: 'active',
        recommendations: [
          'Enable rate limiting for all endpoints',
          'Use HTTPS only',
          'Implement proper CORS policy',
          'Regular security audits',
          'Keep dependencies updated'
        ]
      }
    });
  } catch (error) {
    console.error("❌ Get security headers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get security headers"
    });
  }
};

/**
 * @desc    فحص أمان المستخدم
 * @route   GET /api/security/user/:userId/audit
 * @access  Admin
 */
exports.getUserSecurityAudit = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('passwordChangedAt lastLogin loginAttempts isVerified isActive')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const audit = {
      userId,
      accountAge: user.createdAt ? Math.floor((Date.now() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)) : 0,
      lastPasswordChange: user.passwordChangedAt,
      lastLogin: user.lastLogin,
      isVerified: user.isVerified,
      isActive: user.isActive,
      loginAttempts: user.loginAttempts || 0,
      securityScore: calculateSecurityScore(user),
      recommendations: []
    };

    // إضافة توصيات
    if (!user.isVerified) {
      audit.recommendations.push('Verify email address');
    }
    
    if (!user.passwordChangedAt || (Date.now() - new Date(user.passwordChangedAt)) > 90 * 24 * 60 * 60 * 1000) {
      audit.recommendations.push('Password is older than 90 days, consider changing');
    }
    
    if ((user.loginAttempts || 0) > 5) {
      audit.recommendations.push('Multiple failed login attempts detected');
    }

    res.json({
      success: true,
      data: audit
    });
  } catch (error) {
    console.error("❌ Get user security audit error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user security audit"
    });
  }
};

// ========== 3. دوال مساعدة ==========

/**
 * حساب درجة الأمان للمستخدم
 */
const calculateSecurityScore = (user) => {
  let score = 0;

  // عوامل إيجابية
  if (user.isVerified) score += 30;
  if (user.passwordChangedAt) {
    const daysSinceChange = Math.floor((Date.now() - new Date(user.passwordChangedAt)) / (1000 * 60 * 60 * 24));
    if (daysSinceChange < 30) score += 30;
    else if (daysSinceChange < 90) score += 20;
    else score += 10;
  }
  if (user.isActive) score += 20;
  if (!user.loginAttempts || user.loginAttempts < 3) score += 20;

  return score;
};

/**
 * اقتراحات للبريد الإلكتروني غير الصحيح
 */
const getEmailSuggestions = (email) => {
  const suggestions = [];
  
  // أخطاء شائعة
  if (email.includes('gmial.com')) suggestions.push(email.replace('gmial.com', 'gmail.com'));
  if (email.includes('gmail.con')) suggestions.push(email.replace('gmail.con', 'gmail.com'));
  if (email.includes('yahooo.com')) suggestions.push(email.replace('yahooo.com', 'yahoo.com'));
  if (email.includes('hotmial.com')) suggestions.push(email.replace('hotmial.com', 'hotmail.com'));
  
  // بدون @
  if (!email.includes('@') && email.includes('.')) {
    const parts = email.split('.');
    if (parts.length >= 2) {
      suggestions.push(`${parts[0]}@${parts.slice(1).join('.')}`);
    }
  }

  return suggestions;
};

module.exports = exports;