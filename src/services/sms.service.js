// ============================================
// ملف: src/services/sms.service.js (محدث)
// الوصف: خدمة إرسال الرسائل النصية المتقدمة
// ============================================

const twilio = require('twilio');
const crypto = require('crypto');
const { businessLogger } = require("../utils/logger.util");

class SmsService {
  constructor() {
    this.config = {
      enabled: process.env.SMS_ENABLED === 'true',
      provider: process.env.SMS_PROVIDER || 'twilio',
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_PHONE_NUMBER || process.env.SMS_FROM,
      appName: process.env.APP_NAME || 'Food Delivery'
    };

    this.client = null;
    this.smsQueue = [];
    this.maxRetries = 3;
    this.batchSize = 10;
    this.rateLimit = 20; // رسالة في الثانية

    if (this.config.enabled && this.config.provider === 'twilio') {
      this.initializeTwilio();
    }

    businessLogger.info('SMS service initialized', { 
      enabled: this.config.enabled,
      provider: this.config.provider 
    });
  }

  /**
   * تهيئة Twilio
   */
  initializeTwilio() {
    try {
      if (!this.config.accountSid || !this.config.authToken) {
        throw new Error('Twilio credentials missing');
      }

      this.client = twilio(this.config.accountSid, this.config.authToken);
      
      businessLogger.info('Twilio client initialized');
    } catch (error) {
      businessLogger.error('Failed to initialize Twilio:', error);
      this.client = null;
    }
  }

  // ========== 1. دوال أساسية ==========

  /**
   * إرسال رسالة نصية
   */
  async sendSms(to, message, options = {}) {
    try {
      if (!to || !message) {
        throw new Error('Phone number and message are required');
      }

      // تنظيف رقم الهاتف
      const cleanPhone = this.cleanPhoneNumber(to);

      if (!this.isValidPhoneNumber(cleanPhone)) {
        throw new Error(`Invalid phone number: ${to}`);
      }

      if (!this.config.enabled || !this.client) {
        return this.simulateSms(cleanPhone, message);
      }

      // تقليم الرسالة إذا كانت طويلة
      const trimmedMessage = message.length > 160 
        ? message.substring(0, 157) + '...' 
        : message;

      const result = await this.client.messages.create({
        body: trimmedMessage,
        from: this.config.fromNumber,
        to: cleanPhone,
        ...options
      });

      businessLogger.info('SMS sent successfully', {
        to: cleanPhone,
        sid: result.sid,
        length: trimmedMessage.length
      });

      return {
        success: true,
        messageId: result.sid,
        to: cleanPhone,
        length: trimmedMessage.length,
        timestamp: new Date()
      };
    } catch (error) {
      businessLogger.error('SMS sending error:', error);

      // إضافة إلى قائمة إعادة المحاولة
      this.smsQueue.push({
        to,
        message,
        options,
        attempts: 1,
        lastError: error.message
      });

      return {
        success: false,
        error: error.message,
        to,
        queued: true
      };
    }
  }

  /**
   * إرسال مع إعادة محاولة
   */
  async sendWithRetry(to, message, options = {}) {
    let attempts = 0;
    let lastError;

    while (attempts < this.maxRetries) {
      try {
        const result = await this.sendSms(to, message, options);
        if (result.success) {
          return result;
        }
        lastError = result.error;
      } catch (error) {
        lastError = error.message;
      }

      attempts++;
      if (attempts < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
      }
    }

    businessLogger.error('SMS failed after retries', {
      to,
      attempts,
      lastError
    });

    return {
      success: false,
      error: lastError,
      to,
      attempts
    };
  }

  /**
   * إرسال رسائل متعددة
   */
  async sendBulkSms(recipients, message, options = {}) {
    const results = {
      total: recipients.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // تطبيق Rate Limiting
    for (let i = 0; i < recipients.length; i += this.batchSize) {
      const batch = recipients.slice(i, i + this.batchSize);
      
      const batchPromises = batch.map(async recipient => {
        const phone = typeof recipient === 'string' ? recipient : recipient.phone;
        const customMessage = typeof recipient === 'object' && recipient.message 
          ? recipient.message 
          : message;

        const result = await this.sendSms(phone, customMessage, options);
        return { phone, result };
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach(item => {
        if (item.status === 'fulfilled') {
          if (item.value.result.success) {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push({
              phone: item.value.phone,
              error: item.value.result.error
            });
          }
        } else {
          results.failed++;
        }
      });

      // تأخير بين الدفعات لتجنب rate limiting
      if (i + this.batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    businessLogger.info('Bulk SMS completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed
    });

    return results;
  }

  // ========== 2. رسائل مخصصة ==========

  /**
   * إرسال كود التحقق
   */
  async sendVerificationCode(phone, code) {
    const message = `${this.config.appName}: كود التحقق الخاص بك هو ${code}. صالح لمدة 10 دقائق.`;
    return this.sendSms(phone, message);
  }

  /**
   * إرسال رسالة ترحيب
   */
  async sendWelcomeSms(user) {
    const message = `مرحباً ${user.name}! 👋 شكراً لانضمامك إلى ${this.config.appName}. يمكنك الآن طلب الطعام من أفضل المطاعم.`;
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال تأكيد الطلب
   */
  async sendOrderConfirmationSms(user, order) {
    const message = `✅ تم استلام طلبك #${order._id.toString().slice(-6)} في ${this.config.appName}. القيمة: ${order.totalPrice} د.م. سنرسل لك تحديثات عن حالة الطلب.`;
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال تحديث حالة الطلب
   */
  async sendOrderStatusSms(user, order, status) {
    const statusMessages = {
      accepted: `✅ تم قبول طلبك #${order._id.toString().slice(-6)} وجاري تجهيزه.`,
      picked: `📦 تم استلام طلبك #${order._id.toString().slice(-6)} من المطعم وجاري التوصيل.`,
      delivered: `🚚 تم توصيل طلبك #${order._id.toString().slice(-6)} بنجاح. نتمنى لك وجبة شهية!`,
      cancelled: `❌ تم إلغاء طلبك #${order._id.toString().slice(-6)}.`
    };

    const message = statusMessages[status] || `تحديث على طلبك #${order._id.toString().slice(-6)}: ${status}`;
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال رمز إعادة تعيين كلمة المرور
   */
  async sendPasswordResetSms(user, resetToken) {
    const message = `🔐 رمز إعادة تعيين كلمة المرور: ${resetToken}. صالح لمدة 10 دقائق. ${this.config.appName}`;
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال إشعار تعيين مندوب
   */
  async sendDriverAssignedSms(user, order, driver) {
    const message = `🚚 تم تعيين مندوب ${driver.name} لتوصيل طلبك #${order._id.toString().slice(-6)}. يمكنك تتبع المندوب في التطبيق.`;
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال إشعار نقاط الولاء
   */
  async sendLoyaltyPointsSms(user, points, type = 'earn') {
    const message = type === 'earn'
      ? `🎉 تهانينا! لقد حصلت على ${points} نقطة ولاء جديدة في ${this.config.appName}.`
      : `🔄 تم استبدال ${points} نقطة ولاء بنجاح. شكراً لولائك!`;
    
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال إشعار ترويجي
   */
  async sendPromotionalSms(phone, promotion) {
    const message = `🎁 عرض خاص من ${this.config.appName}: ${promotion.title} - ${promotion.description}. صالح حتى: ${new Date(promotion.validUntil).toLocaleDateString('ar-SA')}`;
    return this.sendSms(phone, message);
  }

  /**
   * إرسال تذكير بالتقييم
   */
  async sendReviewReminderSms(user, order) {
    const message = `⭐ كيف كانت تجربتك مع ${order.restaurant?.name || 'المطعم'}؟ قيم طلبك الآن: ${process.env.CLIENT_URL}/orders/${order._id}/review`;
    return this.sendSms(user.phone, message);
  }

  /**
   * إرسال إشعار دعم
   */
  async sendSupportSms(user, message) {
    const sms = `💬 رد من فريق الدعم: ${message}`;
    return this.sendSms(user.phone, sms);
  }

  // ========== 3. دوال مساعدة ==========

  /**
   * تنظيف رقم الهاتف
   */
  cleanPhoneNumber(phone) {
    if (!phone) return '';

    // إزالة جميع الأحرف غير الرقمية
    let cleaned = phone.replace(/\D/g, '');

    // إضافة رمز الدولة إذا لم يكن موجوداً
    if (cleaned.startsWith('0')) {
      cleaned = '212' + cleaned.substring(1); // رمز المغرب
    } else if (cleaned.length <= 9) {
      cleaned = '212' + cleaned;
    }

    // إضافة + في البداية
    return '+' + cleaned;
  }

  /**
   * التحقق من صحة رقم الهاتف
   */
  isValidPhoneNumber(phone) {
    const phoneRegex = /^\+[1-9]\d{1,14}$/; // تنسيق E.164
    return phoneRegex.test(phone);
  }

  /**
   * محاكاة إرسال رسالة (للتطوير)
   */
  simulateSms(phone, message) {
    const messageId = `simulated-${crypto.randomBytes(8).toString('hex')}`;
    
    businessLogger.info(`[SIMULATED] SMS to ${phone}: ${message.substring(0, 50)}...`, {
      messageId,
      length: message.length
    });

    return {
      success: true,
      simulated: true,
      messageId,
      to: phone,
      length: message.length,
      timestamp: new Date()
    };
  }

  /**
   * إعادة محاولة الرسائل الفاشلة
   */
  async retryFailedSms() {
    if (this.smsQueue.length === 0) {
      return { success: true, message: 'No failed SMS to retry' };
    }

    const results = {
      total: this.smsQueue.length,
      successful: 0,
      failed: 0
    };

    const newQueue = [];

    for (const sms of this.smsQueue) {
      if (sms.attempts < this.maxRetries) {
        const result = await this.sendSms(sms.to, sms.message, sms.options);

        if (result.success) {
          results.successful++;
        } else {
          sms.attempts++;
          sms.lastError = result.error;
          newQueue.push(sms);
          results.failed++;
        }
      } else {
        results.failed++;
      }
    }

    this.smsQueue = newQueue;

    businessLogger.info('Retry failed SMS completed', results);

    return {
      success: true,
      ...results,
      remaining: this.smsQueue.length
    };
  }

  /**
   * الحصول على معلومات الرصيد
   */
  async getBalance() {
    if (!this.client) {
      return { success: false, error: 'SMS client not initialized' };
    }

    try {
      // هذا خاص بـ Twilio
      const balance = await this.client.api.v2010.balance.fetch();
      
      return {
        success: true,
        balance: balance.balance,
        currency: balance.currency
      };
    } catch (error) {
      businessLogger.error('Get balance error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SmsService();