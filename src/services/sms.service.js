const crypto = require('crypto');

class SmsService {
  constructor() {
    this.config = {
      enabled: process.env.SMS_ENABLED === 'true',
      provider: process.env.SMS_PROVIDER || 'twilio',
      from: process.env.SMS_FROM || 'FoodDelivery',
      appName: process.env.APP_NAME || 'Food Delivery'
    };
    
    console.log(`📱 SMS service initialized - Enabled: ${this.config.enabled}`);
  }

  async sendSms(to, message) {
    try {
      if (!to || !message) {
        throw new Error('Phone number and message are required');
      }

      // تنظيف رقم الهاتف
      const cleanPhone = this.cleanPhoneNumber(to);
      
      if (!this.isValidPhoneNumber(cleanPhone)) {
        throw new Error(`Invalid phone number: ${to}`);
      }

      if (!this.config.enabled) {
        console.log(`📱 [SIMULATED] SMS to ${cleanPhone}: ${message.substring(0, 50)}...`);
        return {
          success: true,
          simulated: true,
          messageId: `simulated-${crypto.randomBytes(8).toString('hex')}`,
          to: cleanPhone,
          length: message.length,
          timestamp: new Date()
        };
      }

      // TODO: إضافة تكامل مع خدمة SMS حقيقية
      // مثال مع Twilio (يحتاج تثبيت twilio):
      /*
      const client = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      
      const result = await client.messages.create({
        body: message,
        from: this.config.from,
        to: cleanPhone
      });
      */
      
      // Simulation للتنمية
      console.log(`📱 SMS sent to ${cleanPhone}: ${message.substring(0, 100)}...`);
      
      return {
        success: true,
        messageId: `sms-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        to: cleanPhone,
        length: message.length,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ SMS sending error:', error.message);
      return {
        success: false,
        error: error.message,
        to,
        timestamp: new Date()
      };
    }
  }

  cleanPhoneNumber(phone) {
    // إزالة جميع الأحرف غير الرقمية
    let cleaned = phone.replace(/\D/g, '');
    
    // إضافة رمز الدولة إذا لم يكن موجوداً
    if (cleaned.startsWith('0')) {
      cleaned = '212' + cleaned.substring(1); // مثال للمغرب
    } else if (!cleaned.startsWith('+') && cleaned.length <= 10) {
      cleaned = '212' + cleaned; // إضافة رمز الدولة افتراضياً
    }
    
    return '+' + cleaned;
  }

  isValidPhoneNumber(phone) {
    const phoneRegex = /^\+[1-9]\d{1,14}$/; // E.164 format
    return phoneRegex.test(phone);
  }

  async sendVerificationCode(phone, verificationCode) {
    const message = `رمز التحقق الخاص بك في ${this.config.appName} هو: ${verificationCode}. صالح لمدة 10 دقائق.`;
    
    return this.sendSms(phone, message);
  }

  async sendWelcomeSms(user) {
    const message = `مرحباً ${user.name}! شكراً لانضمامك إلى ${this.config.appName}. يمكنك الآن طلب الطعام من أفضل المطاعم.`;
    
    return this.sendSms(user.phone, message);
  }

  async sendOrderStatusSms(user, order, status) {
    const statusMessages = {
      pending: 'تم استلام طلبك بنجاح وجاري المعالجة.',
      accepted: 'تم قبول طلبك وجاري تجهيزه.',
      picked: 'تم استلام طلبك من المطعم وجاري التوصيل.',
      delivered: 'تم توصيل طلبك بنجاح. نتمنى لك وجبة شهية!',
      cancelled: 'تم إلغاء طلبك.'
    };
    
    const message = `${statusMessages[status] || 'تحديث على طلبك.'} رقم الطلب: ${order._id.toString().slice(-6)}. المجموع: ${order.totalPrice.toFixed(2)} د.م`;
    
    return this.sendSms(user.phone, message);
  }

  async sendDriverAssignedSms(user, order, driver) {
    const message = `تم تعيين مندوب ${driver.name} لتوصيل طلبك رقم ${order._id.toString().slice(-6)}. يمكنك تتبع المندوب في التطبيق.`;
    
    return this.sendSms(user.phone, message);
  }

  async sendPasswordResetSms(user, resetToken) {
    const message = `رمز إعادة تعيين كلمة المرور: ${resetToken}. صالح لمدة 10 دقائق. ${this.config.appName}`;
    
    return this.sendSms(user.phone, message);
  }

  async sendPromotionalSms(phone, promotion) {
    const message = `عرض خاص من ${this.config.appName}: ${promotion.title} - ${promotion.description}. صالح حتى: ${new Date(promotion.validUntil).toLocaleDateString('ar-SA')}`;
    
    return this.sendSms(phone, message);
  }

  async sendBulkSms(phones, message, options = {}) {
    const results = {
      total: phones.length,
      successful: 0,
      failed: 0,
      details: []
    };
    
    // إرسال الرسائل بشكل متوازي مع rate limiting
    const batchSize = options.batchSize || 10;
    const delayBetweenBatches = options.delayBetweenBatches || 1000; // 1 second
    
    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);
      const batchPromises = batch.map(phone => this.sendSms(phone, message));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          const phone = batch[index];
          if (result.status === 'fulfilled' && result.value.success) {
            results.successful++;
            results.details.push({
              phone,
              success: true,
              messageId: result.value.messageId
            });
          } else {
            results.failed++;
            results.details.push({
              phone,
              success: false,
              error: result.reason?.message || result.value?.error || 'Unknown error'
            });
          }
        });
        
        console.log(`📱 Batch ${Math.floor(i/batchSize) + 1} completed: ${results.successful}/${results.total} successful`);
        
        // تأخير بين الدفعات لتجنب rate limiting
        if (i + batchSize < phones.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      } catch (error) {
        console.error('❌ Batch SMS error:', error.message);
        batch.forEach(phone => {
          results.failed++;
          results.details.push({
            phone,
            success: false,
            error: error.message
          });
        });
      }
    }
    
    return results;
  }
}

module.exports = new SmsService();