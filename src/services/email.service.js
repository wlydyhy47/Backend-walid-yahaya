// ============================================
// ملف: src/services/email.service.js (محدث)
// الوصف: خدمة إرسال البريد الإلكتروني المتقدمة
// ============================================

const crypto = require('crypto');
const { businessLogger } = require("../utils/logger.util");
// استخدام require مشروط لـ nodemailer
let nodemailer;
if (process.env.NODE_ENV === 'test') {
  // في بيئة الاختبار، نستخدم mock
  nodemailer = {
    createTransport: () => ({
      verify: (cb) => cb(null, true),
      sendMail: (options, cb) => cb(null, { messageId: 'test-mock' })
    })
  };
} else {
  // في بيئة الإنتاج، نستخدم الحزمة الحقيقية
  nodemailer = require('nodemailer');
};


class EmailService {
  constructor() {
    this.config = {
      enabled: process.env.EMAIL_ENABLED === 'true',
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM || 'noreply@fooddelivery.com',
      appName: process.env.APP_NAME || 'Food Delivery',
      logo: process.env.APP_LOGO || 'https://fooddelivery.com/logo.png'
    };

    this.transporter = null;
    this.emailQueue = [];
    this.maxRetries = 3;
    this.batchSize = 20;

    if (this.config.enabled && process.env.NODE_ENV !== 'test') {
      this.initializeTransporter();
    }

    businessLogger.info('Email service initialized', {
      enabled: this.config.enabled,
      host: this.config.host,
      environment: process.env.NODE_ENV
    });
  }
  /**
   * تهيئة ناقل البريد
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.pass,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // التحقق من الاتصال
      this.transporter.verify((error, success) => {
        if (error) {
          businessLogger.error('Email transporter verification failed:', error);
        } else {
          businessLogger.info('Email transporter ready');
        }
      });
    } catch (error) {
      businessLogger.error('Failed to initialize email transporter:', error);
      this.transporter = null;
    }
  }

  // ========== 1. دوال أساسية ==========

  /**
   * إرسال بريد إلكتروني
   */
  async sendEmail(to, subject, html, text = '', options = {}) {
    try {
      if (!to || !subject) {
        throw new Error('Email and subject are required');
      }

      if (!this.config.enabled || !this.transporter) {
        return this.simulateEmail(to, subject, html, text);
      }

      const mailOptions = {
        from: `"${this.config.appName}" <${this.config.from}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text: text || this.htmlToText(html),
        headers: {
          'X-Priority': options.priority || '3',
          'X-MC-Tags': options.tags ? options.tags.join(',') : '',
        }
      };

      // إضافة مرفقات إذا وجدت
      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments;
      }

      const info = await this.transporter.sendMail(mailOptions);

      businessLogger.info('Email sent successfully', {
        to,
        subject,
        messageId: info.messageId
      });

      return {
        success: true,
        messageId: info.messageId,
        to,
        subject,
        timestamp: new Date()
      };
    } catch (error) {
      businessLogger.error('Email sending error:', error);

      // إضافة إلى قائمة إعادة المحاولة
      this.emailQueue.push({
        to,
        subject,
        html,
        text,
        options,
        attempts: 1,
        lastError: error.message
      });

      return {
        success: false,
        error: error.message,
        to,
        subject,
        queued: true
      };
    }
  }

  /**
   * إرسال بريد مع إعادة محاولة
   */
  async sendWithRetry(to, subject, html, text = '', options = {}) {
    let attempts = 0;
    let lastError;

    while (attempts < this.maxRetries) {
      try {
        const result = await this.sendEmail(to, subject, html, text, options);
        if (result.success) {
          return result;
        }
        lastError = result.error;
      } catch (error) {
        lastError = error.message;
      }

      attempts++;
      if (attempts < this.maxRetries) {
        // تأخير متزايد
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
      }
    }

    businessLogger.error('Email failed after retries', {
      to,
      subject,
      attempts,
      lastError
    });

    return {
      success: false,
      error: lastError,
      to,
      subject,
      attempts
    };
  }

  /**
   * إرسال بريد إلى عدة مستلمين
   */
  async sendBulkEmails(recipients, subject, htmlTemplate, textTemplate = '') {
    const results = {
      total: recipients.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // تجميع المستلمين في دفعات
    for (let i = 0; i < recipients.length; i += this.batchSize) {
      const batch = recipients.slice(i, i + this.batchSize);

      const batchPromises = batch.map(async recipient => {
        const html = typeof htmlTemplate === 'function'
          ? htmlTemplate(recipient)
          : htmlTemplate;

        const text = typeof textTemplate === 'function'
          ? textTemplate(recipient)
          : textTemplate;

        const result = await this.sendEmail(
          recipient.email,
          recipient.subject || subject,
          html,
          text,
          recipient.options || {}
        );

        return { recipient, result };
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach(item => {
        if (item.status === 'fulfilled') {
          if (item.value.result.success) {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push({
              email: item.value.recipient.email,
              error: item.value.result.error
            });
          }
        } else {
          results.failed++;
        }
      });

      // تأخير بين الدفعات
      if (i + this.batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    businessLogger.info('Bulk emails completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed
    });

    return results;
  }

  // ========== 2. قوالب البريد ==========

  /**
   * قالب البريد الأساسي
   */
  getBaseTemplate(content, title = '') {
    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title || this.config.appName}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          }
          body {
            background-color: #f4f4f7;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            text-align: center;
          }
          .header img {
            max-width: 150px;
            margin-bottom: 15px;
          }
          .header h1 {
            color: white;
            font-size: 24px;
            margin: 0;
          }
          .content {
            padding: 40px 30px;
            background: white;
          }
          .footer {
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #e9ecef;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: bold;
          }
          .button:hover {
            opacity: 0.9;
          }
          .info-box {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border-right: 4px solid #667eea;
          }
          .warning-box {
            background: #fff3e0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border-right: 4px solid #ff9800;
          }
          .success-box {
            background: #e8f5e9;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border-right: 4px solid #4caf50;
          }
          .code {
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            letter-spacing: 5px;
            color: #667eea;
          }
          @media (max-width: 600px) {
            .content {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${this.config.logo}" alt="${this.config.appName}">
            <h1>${title || this.config.appName}</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${this.config.appName}. جميع الحقوق محفوظة</p>
            <p style="margin-top: 10px;">
              <a href="${process.env.CLIENT_URL}/privacy" style="color: #667eea;">الخصوصية</a> |
              <a href="${process.env.CLIENT_URL}/terms" style="color: #667eea;">الشروط</a> |
              <a href="${process.env.CLIENT_URL}/contact" style="color: #667eea;">اتصل بنا</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * بريد الترحيب
   */
  async sendWelcomeEmail(user) {
    const subject = `مرحباً بك في ${this.config.appName}! 🎉`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <div class="success-box">
        <p style="font-size: 18px; margin-bottom: 10px;">🎉 تم إنشاء حسابك بنجاح</p>
        <p>نحن سعداء بانضمامك إلى مجتمع ${this.config.appName}</p>
      </div>

      <div style="margin: 30px 0;">
        <h3>✨ مميزات التطبيق:</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <strong>🍽️ تشكيلة واسعة</strong> - اختر من أفضل المطاعم
          </li>
          <li style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <strong>🚚 توصيل سريع</strong> - تتبع طلبك في الوقت الحقيقي
          </li>
          <li style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <strong>💰 عروض حصرية</strong> - خصومات وتخفيضات مستمرة
          </li>
          <li style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <strong>⭐ نظام الولاء</strong> - اجمع النقاط واستبدلها بمكافآت
          </li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_URL}/stores" class="button">
          ابدأ الطلب الآن 🛒
        </a>
      </div>

      <div class="info-box">
        <p style="margin-bottom: 10px;"><strong>💡 نصيحة:</strong></p>
        <p>أكمل بيانات ملفك الشخصي لتحصل على تجربة مخصصة وعروض حصرية!</p>
      </div>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد التحقق من الحساب
   */
  async sendVerificationEmail(user, verificationCode) {
    const subject = `🔐 كود التحقق - ${this.config.appName}`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <p>شكراً لتسجيلك في ${this.config.appName}. يرجى استخدام الكود التالي لتفعيل حسابك:</p>

      <div class="code">${verificationCode}</div>

      <div class="info-box">
        <p><strong>⏰ صلاحية الكود:</strong> 24 ساعة</p>
        <p><strong>📝 تعليمات:</strong></p>
        <ol style="padding-right: 20px;">
          <li>أدخل الكود في صفحة تفعيل الحساب</li>
          <li>انقر على زر "تفعيل"</li>
          <li>سيتم توجيهك إلى لوحة التحكم</li>
        </ol>
      </div>

      <div class="warning-box">
        <p><strong>⚠️ تنبيه أمني:</strong> لا تشارك هذا الكود مع أي شخص. فريقنا لن يطلبه أبداً.</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_URL}/verify" class="button">
          تفعيل الحساب 🔓
        </a>
      </div>

      <p style="color: #666; font-size: 14px; text-align: center;">
        إذا لم تطلب هذا الكود، يرجى تجاهل هذا البريد.
      </p>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد إعادة تعيين كلمة المرور
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    const subject = `🔄 إعادة تعيين كلمة المرور - ${this.config.appName}`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <p>تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في ${this.config.appName}.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" class="button">
          إعادة تعيين كلمة المرور 🔑
        </a>
      </div>

      <p style="text-align: center; color: #666;">
        أو انسخ الرابط التالي:<br>
        <small style="color: #667eea;">${resetLink}</small>
      </p>

      <div class="warning-box">
        <p><strong>⏰ صلاحية الرابط:</strong> 10 دقائق فقط</p>
        <p><strong>⚠️ ملاحظة:</strong> إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد. لن تتغير كلمة مرورك ما لم تضغط على الرابط أعلاه.</p>
      </div>

      <div class="info-box">
        <p><strong>🔒 نصيحة أمنية:</strong></p>
        <ul>
          <li>استخدم كلمة مرور قوية (حروف كبيرة وصغيرة + أرقام + رموز)</li>
          <li>لا تستخدم نفس كلمة المرور في مواقع أخرى</li>
          <li>غير كلمة مرورك بشكل دوري</li>
        </ul>
      </div>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد تغيير كلمة المرور
   */
  async sendPasswordChangedEmail(user) {
    const subject = `🔐 تم تغيير كلمة المرور - ${this.config.appName}`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <div class="success-box">
        <p style="font-size: 18px;">✅ تم تغيير كلمة مرور حسابك بنجاح</p>
      </div>

      <div class="warning-box">
        <p><strong>⚠️ إذا لم تكن أنت من قام بهذا التغيير:</strong></p>
        <p>يرجى التواصل مع فريق الدعم فوراً على:</p>
        <p>
          📧 <a href="mailto:support@${this.config.appName}.com">support@${this.config.appName}.com</a><br>
          📞 ${process.env.SUPPORT_PHONE || '+1234567890'}
        </p>
      </div>

      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        تم هذا التغيير في ${new Date().toLocaleString('ar-SA')}
      </p>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد تأكيد الطلب
   */
  async sendOrderConfirmationEmail(user, order) {
    const subject = `🛒 تأكيد الطلب #${order._id.toString().slice(-6)} - ${this.config.appName}`;

    const itemsList = order.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">${item.price} د.م</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">${item.price * item.qty} د.م</td>
      </tr>
    `).join('');

    const content = `
      <h2>شكراً لطلبك ${user.name}! 🎉</h2>
      
      <div class="success-box">
        <p style="font-size: 18px;">✅ تم استلام طلبك بنجاح</p>
        <p>رقم الطلب: <strong>#${order._id.toString().slice(-6)}</strong></p>
      </div>

      <div style="margin: 30px 0;">
        <h3>📋 تفاصيل الطلب:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="padding: 10px; text-align: right;">العنصر</th>
              <th style="padding: 10px; text-align: center;">الكمية</th>
              <th style="padding: 10px; text-align: left;">السعر</th>
              <th style="padding: 10px; text-align: left;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsList}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 10px; text-align: left; font-weight: bold;">المجموع</td>
              <td style="padding: 10px; text-align: left; font-weight: bold;">${order.totalPrice} د.م</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="info-box">
        <p><strong>🚚 معلومات التوصيل:</strong></p>
        <p>📍 العنوان: ${order.deliveryAddress?.addressLine || 'غير محدد'}</p>
        <p>⏱️ الوقت المتوقع: ${order.estimatedDeliveryTime || 30} دقيقة</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_URL}/orders/${order._id}" class="button">
          تتبع الطلب 🔍
        </a>
      </div>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد تحديث حالة الطلب
   */
  async sendOrderStatusEmail(user, order, status) {
    const statusConfig = {
      accepted: {
        title: '✅ تم قبول طلبك',
        icon: '✅',
        message: 'تم قبول طلبك وجاري تجهيزه',
        color: '#4caf50'
      },
      picked: {
        title: '📦 تم استلام الطلب',
        icon: '📦',
        message: 'تم استلام طلبك من المطعم وجاري التوصيل',
        color: '#2196f3'
      },
      delivered: {
        title: '🚚 تم التوصيل',
        icon: '🚚',
        message: 'تم توصيل طلبك بنجاح',
        color: '#4caf50'
      },
      cancelled: {
        title: '❌ تم إلغاء الطلب',
        icon: '❌',
        message: order.cancellationReason || 'تم إلغاء طلبك',
        color: '#f44336'
      }
    };

    const config = statusConfig[status] || {
      title: 'تحديث على طلبك',
      icon: '🔄',
      message: 'هناك تحديث على طلبك',
      color: '#ff9800'
    };

    const subject = `${config.icon} ${config.title} #${order._id.toString().slice(-6)}`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <div style="background: ${config.color}10; border-radius: 8px; padding: 20px; margin: 20px 0; border-right: 4px solid ${config.color};">
        <p style="font-size: 18px; margin-bottom: 10px;">${config.icon} ${config.title}</p>
        <p>${config.message}</p>
      </div>

      <div style="margin: 30px 0;">
        <p><strong>رقم الطلب:</strong> #${order._id.toString().slice(-6)}</p>
        <p><strong>الحالة:</strong> ${status}</p>
        <p><strong>المجموع:</strong> ${order.totalPrice} د.م</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_URL}/orders/${order._id}" class="button">
          عرض التفاصيل 🔍
        </a>
      </div>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد الإشعارات
   */
  async sendNotificationEmail(data) {
    const { user, notification } = data;

    const subject = `${notification.icon || '🔔'} ${notification.title}`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <div class="info-box">
        <p style="font-size: 18px; margin-bottom: 10px;">${notification.icon || '🔔'} ${notification.title}</p>
        <p>${notification.content}</p>
      </div>

      ${notification.data ? `
        <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p><strong>📋 تفاصيل إضافية:</strong></p>
          <pre style="background: white; padding: 10px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(notification.data, null, 2)}</pre>
        </div>
      ` : ''}

      ${notification.link ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${notification.link}" class="button">
            عرض التفاصيل →
          </a>
        </div>
      ` : ''}

      <p style="color: #666; font-size: 14px; text-align: center;">
        يمكنك تعديل إعدادات الإشعارات من <a href="${process.env.CLIENT_URL}/settings/notifications">صفحة الإعدادات</a>
      </p>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد نقاط الولاء
   */
  async sendLoyaltyPointsEmail(user, points, reason, type = 'earn') {
    const isEarn = type === 'earn';

    const subject = isEarn
      ? `🎉 حصلت على ${points} نقطة ولاء!`
      : `🔄 تم استبدال ${points} نقطة ولاء`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <div class="${isEarn ? 'success-box' : 'info-box'}">
        <p style="font-size: 18px; margin-bottom: 10px;">
          ${isEarn ? '🎉 تهانينا!' : '🔄 تمت العملية بنجاح'}
        </p>
        <p>
          ${isEarn
        ? `لقد حصلت على <strong>${points} نقطة ولاء</strong> جديدة ${reason ? `بسبب ${reason}` : ''}.`
        : `لقد استبدلت <strong>${points} نقطة ولاء</strong> ${reason ? `مقابل ${reason}` : ''}.`}
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_URL}/loyalty" class="button">
          عرض برنامج الولاء ⭐
        </a>
      </div>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  /**
   * بريد تذكير التقييم
   */
  async sendReviewReminderEmail(user, order) {
    const subject = `⭐ كيف كانت تجربتك مع ${order.store?.name || 'المطعم'}؟`;

    const content = `
      <h2>مرحباً ${user.name}!</h2>
      
      <div class="info-box">
        <p>نأمل أن تكون قد استمتعت بوجبتك من <strong>${order.store?.name || 'المطعم'}</strong>.</p>
        <p style="margin-top: 10px;">ساعد الآخرين بمشاركة تجربتك!</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_URL}/orders/${order._id}/review" class="button">
          تقييم الطلب ⭐
        </a>
      </div>

      <p style="color: #666; font-size: 14px; text-align: center;">
        تقييمك يساعدنا في تحسين الخدمة ويساعد الآخرين في اختيار أفضل المطاعم.
      </p>
    `;

    const html = this.getBaseTemplate(content, subject);
    return this.sendEmail(user.email, subject, html);
  }

  // ========== 3. دوال مساعدة ==========

  /**
   * تحويل HTML إلى نص عادي
   */
  htmlToText(html) {
    return html
      .replace(/<style[^>]*>.*<\/style>/gs, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * محاكاة إرسال البريد (للتطوير)
   */
  simulateEmail(to, subject, html, text = '') {
    const messageId = `simulated-${crypto.randomBytes(8).toString('hex')}`;

    businessLogger.info(`[SIMULATED] Email to ${to}: ${subject}`, {
      messageId,
      htmlLength: html.length,
      textLength: text.length
    });

    return {
      success: true,
      simulated: true,
      messageId,
      to,
      subject,
      timestamp: new Date()
    };
  }

  /**
   * إعادة محاولة البريد الفاشل
   */
  async retryFailedEmails() {
    if (this.emailQueue.length === 0) {
      return { success: true, message: 'No failed emails to retry' };
    }

    const results = {
      total: this.emailQueue.length,
      successful: 0,
      failed: 0
    };

    const newQueue = [];

    for (const email of this.emailQueue) {
      if (email.attempts < this.maxRetries) {
        const result = await this.sendEmail(
          email.to,
          email.subject,
          email.html,
          email.text,
          email.options
        );

        if (result.success) {
          results.successful++;
        } else {
          email.attempts++;
          email.lastError = result.error;
          newQueue.push(email);
          results.failed++;
        }
      } else {
        results.failed++;
      }
    }

    this.emailQueue = newQueue;

    businessLogger.info('Retry failed emails completed', results);

    return {
      success: true,
      ...results,
      remaining: this.emailQueue.length
    };
  }

  /**
   * التحقق من صحة البريد الإلكتروني
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = new EmailService();