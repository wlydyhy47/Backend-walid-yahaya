// src/utils/securityCheck.util.js

class SecurityCheck {
  /**
   * فحص كلمة المرور من القوة
   */
  static isPasswordStrong(password) {
    const checks = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const score = Object.values(checks).filter(Boolean).length;
    
    return {
      isValid: score >= 4, // على الأقل 4 من 5
      score,
      checks,
      message: score >= 4 ? 'قوية' : 'ضعيفة'
    };
  }

  /**
   * فحص البريد الإلكتروني
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const disposableDomains = ['tempmail.com', 'throwaway.com']; // قائمة domains المؤقتة
    
    if (!emailRegex.test(email)) return false;
    
    const domain = email.split('@')[1];
    return !disposableDomains.includes(domain);
  }

  /**
   * فحص SQL Injection في النص
   */
  static hasSqlInjection(text) {
    const sqlPatterns = [
      /(\bSELECT\b.*\bFROM\b)/i,
      /(\bINSERT\b.*\bINTO\b)/i,
      /(\bUPDATE\b.*\bSET\b)/i,
      /(\bDELETE\b.*\bFROM\b)/i,
      /(\bDROP\b.*\bTABLE\b)/i,
      /(\bUNION\b.*\bSELECT\b)/i,
      /(--)/,
      /(;\s*$)/,
      /(\bOR\b.*=)/i,
      /(\bAND\b.*=)/i
    ];

    return sqlPatterns.some(pattern => pattern.test(text));
  }
}

module.exports = SecurityCheck;