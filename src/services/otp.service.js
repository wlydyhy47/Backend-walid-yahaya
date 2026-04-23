// ============================================
// ملف: src/services/otp.service.js
// ============================================

const crypto = require('crypto');
const { businessLogger } = require('../utils/logger.util');
const smsService = require('./sms.service');

class OTPService {
  constructor() {
    this.otpStore = new Map();
    this.verifiedPhones = new Map();
    this.defaultExpiry = 10 * 60 * 1000;
  }

  generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }

  generateSecureOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  async sendOTP(phone, otp) {
    try {
      const message = `رمز التحقق الخاص بك هو: ${otp}. صالح لمدة 10 دقائق.`;
      const result = await smsService.sendSms(phone, message);
      businessLogger.info('OTP sent successfully', { phone, otp: process.env.NODE_ENV === 'development' ? otp : '***' });
      return result;
    } catch (error) {
      businessLogger.error('Failed to send OTP', { phone, error: error.message });
      throw new Error('فشل إرسال رمز التحقق');
    }
  }

  storeOTP(phone, otp, expiryMs = this.defaultExpiry) {
    this.otpStore.set(phone, {
      otp,
      expiresAt: Date.now() + expiryMs,
      attempts: 0
    });
    
    setTimeout(() => {
      if (this.otpStore.has(phone)) {
        this.otpStore.delete(phone);
      }
    }, expiryMs);
  }

  verifyOTP(phone, otp) {
    const stored = this.otpStore.get(phone);
    
    if (!stored) {
      return { valid: false, message: 'لم يتم طلب رمز تحقق أو انتهت صلاحيته' };
    }
    
    if (stored.expiresAt < Date.now()) {
      this.otpStore.delete(phone);
      return { valid: false, message: 'انتهت صلاحية رمز التحقق' };
    }
    
    stored.attempts += 1;
    
    if (stored.attempts > 5) {
      this.otpStore.delete(phone);
      return { valid: false, message: 'تم تجاوز عدد المحاولات المسموح بها' };
    }
    
    if (stored.otp !== otp) {
      return { valid: false, message: 'رمز التحقق غير صحيح' };
    }
    
    this.otpStore.delete(phone);
    return { valid: true, message: 'تم التحقق بنجاح' };
  }

  storeVerifiedPhone(phone, token, expiryMs = 5 * 60 * 1000) {
    this.verifiedPhones.set(token, {
      phone,
      expiresAt: Date.now() + expiryMs,
    });
    
    setTimeout(() => {
      if (this.verifiedPhones.has(token)) {
        this.verifiedPhones.delete(token);
      }
    }, expiryMs);
  }

  getVerifiedPhone(token) {
    const data = this.verifiedPhones.get(token);
    if (!data || data.expiresAt < Date.now()) {
      if (data) this.verifiedPhones.delete(token);
      return null;
    }
    return data.phone;
  }

  clearVerifiedToken(token) {
    return this.verifiedPhones.delete(token);
  }

  logOTPForDevelopment(phone, otp) {
    console.log(`\n📱 [DEV] OTP for ${phone}: ${otp}\n`);
  }
}

module.exports = new OTPService();