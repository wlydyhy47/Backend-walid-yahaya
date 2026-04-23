// ============================================
// ملف: src/services/sms.service.js
// ============================================

const crypto = require('crypto');
const axios = require('axios');
const { businessLogger } = require("../utils/logger.util");

class SmsService {
  constructor() {
    this.config = {
      enabled: process.env.SMS_ENABLED === 'true',
      provider: process.env.SMS_PROVIDER || 'infobip',
      apiKey: process.env.INFOBIP_API_KEY,
      baseUrl: process.env.INFOBIP_BASE_URL,
      fromNumber: process.env.INFOBIP_FROM || 'DroviaFood',
      appName: process.env.APP_NAME || 'Drovia Food Delivery'
    };

    this.client = null;
    this.smsQueue = [];
    this.maxRetries = 3;
    this.batchSize = 10;
    this.rateLimit = 20;

    if (this.config.enabled && this.config.provider === 'infobip') {
      this.initializeInfobip();
    }

    businessLogger.info('SMS service initialized', {
      enabled: this.config.enabled,
      provider: this.config.provider,
      baseUrl: this.config.baseUrl
    });
  }

  initializeInfobip() {
    try {
      if (!this.config.apiKey) {
        throw new Error('Infobip API key missing');
      }

      this.client = axios.create({
        baseURL: this.config.baseUrl,
        headers: {
          'Authorization': `App ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      businessLogger.info('Infobip client initialized');
    } catch (error) {
      businessLogger.error('Failed to initialize Infobip:', error);
      this.client = null;
    }
  }

  cleanPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('227')) {
      cleaned = cleaned;
    } else if (cleaned.startsWith('0')) {
      cleaned = '227' + cleaned.substring(1);
    } else if (cleaned.length <= 8) {
      cleaned = '227' + cleaned;
    } else if (cleaned.length === 12 && cleaned.startsWith('227')) {
      cleaned = cleaned;
    } else if (!cleaned.startsWith('227') && cleaned.length > 8) {
      if (cleaned.startsWith('00227')) {
        cleaned = cleaned.substring(3);
      } else {
        cleaned = '227' + cleaned;
      }
    }
    return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
  }

  isValidPhoneNumber(phone) {
    const phoneRegex = /^\+227[0-9]{8}$/;
    return phoneRegex.test(phone);
  }

  async sendViaInfobip(phone, message) {
    try {
      const response = await this.client.post('/sms/2/text/advanced', {
        messages: [{
          from: this.config.fromNumber,
          destinations: [{ to: phone }],
          text: message,
          language: { languageCode: 'AR' }
        }]
      });

      return {
        success: true,
        messageId: response.data.messages?.[0]?.messageId || `msg-${Date.now()}`,
        status: response.data.messages?.[0]?.status?.name || 'ACCEPTED'
      };
    } catch (error) {
      const errorMsg = error.response?.data?.requestError?.serviceException?.text ||
                       error.response?.data?.message ||
                       error.message;
      throw new Error(errorMsg);
    }
  }

  async sendSms(to, message, options = {}) {
    try {
      if (!to || !message) {
        throw new Error('Phone number and message are required');
      }

      const cleanPhone = this.cleanPhoneNumber(to);
      
      if (!this.isValidPhoneNumber(cleanPhone)) {
        businessLogger.warn(`Invalid Niger phone number: ${to} -> ${cleanPhone}`);
      }

      if (!this.config.enabled || !this.client) {
        return this.simulateSms(cleanPhone, message);
      }

      const trimmedMessage = message.length > 160 
        ? message.substring(0, 157) + '...' 
        : message;

      const result = await this.sendViaInfobip(cleanPhone, trimmedMessage);

      businessLogger.info('SMS sent successfully to Niger', {
        to: cleanPhone,
        provider: this.config.provider,
        messageId: result.messageId,
        length: trimmedMessage.length
      });

      return {
        success: true,
        messageId: result.messageId,
        to: cleanPhone,
        length: trimmedMessage.length,
        provider: this.config.provider,
        timestamp: new Date()
      };

    } catch (error) {
      businessLogger.error('SMS sending error:', error);

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
        const delay = 1000 * Math.pow(2, attempts);
        await new Promise(resolve => setTimeout(resolve, delay));
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

  async sendBulkSms(recipients, message, options = {}) {
    const results = {
      total: recipients.length,
      successful: 0,
      failed: 0,
      errors: []
    };

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

  async sendVerificationCode(phone, code) {
    const message = `🔐 ${this.config.appName}: كود التحقق الخاص بك هو ${code}. صالح لمدة 10 دقائق.`;
    return this.sendSms(phone, message);
  }

  async sendWelcomeSms(user) {
    const message = `👋 مرحباً ${user.name}! شكراً لانضمامك إلى ${this.config.appName}. يمكنك الآن طلب الطعام من أفضل المطاعم في النيجر.`;
    return this.sendSms(user.phone, message);
  }

  async sendOrderConfirmationSms(user, order) {
    const message = `✅ تم استلام طلبك #${order._id.toString().slice(-6)} في ${this.config.appName}. القيمة: ${order.totalPrice} CFA. سنرسل لك تحديثات عن حالة الطلب.`;
    return this.sendSms(user.phone, message);
  }

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

  async sendPasswordResetSms(user, resetToken) {
    const message = `🔐 رمز إعادة تعيين كلمة المرور: ${resetToken}. صالح لمدة 10 دقائق. ${this.config.appName}`;
    return this.sendSms(user.phone, message);
  }

  async sendDriverAssignedSms(user, order, driver) {
    const message = `🚚 تم تعيين مندوب ${driver.name} لتوصيل طلبك #${order._id.toString().slice(-6)}. يمكنك تتبع المندوب في التطبيق.`;
    return this.sendSms(user.phone, message);
  }

  async sendLoyaltyPointsSms(user, points, type = 'earn') {
    const message = type === 'earn'
      ? `🎉 تهانينا! لقد حصلت على ${points} نقطة ولاء جديدة في ${this.config.appName}.`
      : `🔄 تم استبدال ${points} نقطة ولاء بنجاح. شكراً لولائك!`;
    return this.sendSms(user.phone, message);
  }

  async sendPromotionalSms(phone, promotion) {
    const message = `🎁 عرض خاص من ${this.config.appName}: ${promotion.title} - ${promotion.description}. صالح حتى: ${new Date(promotion.validUntil).toLocaleDateString('ar-SA')}`;
    return this.sendSms(phone, message);
  }

  async sendReviewReminderSms(user, order) {
    const message = `⭐ كيف كانت تجربتك مع ${order.store?.name || 'المطعم'}؟ قيم طلبك الآن: ${process.env.CLIENT_URL}/orders/${order._id}/review`;
    return this.sendSms(user.phone, message);
  }

  async sendSupportSms(user, message) {
    const sms = `💬 رد من فريق الدعم: ${message}`;
    return this.sendSms(user.phone, sms);
  }

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

  async getBalance() {
    if (!this.client) {
      return { success: false, error: 'SMS client not initialized' };
    }

    try {
      const response = await this.client.get('/account/1/balance');
      return {
        success: true,
        balance: response.data.balance,
        currency: response.data.currency,
        type: response.data.type
      };
    } catch (error) {
      businessLogger.error('Get balance error:', error);
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const result = await this.getBalance();
      if (result.success) {
        businessLogger.info('Infobip connection test successful', {
          balance: result.balance,
          currency: result.currency
        });
        return { success: true, message: 'Connected successfully' };
      }
      return { success: false, message: result.error };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = new SmsService();