const crypto = require('crypto');

class EmailService {
  constructor() {
    this.config = {
      enabled: process.env.EMAIL_ENABLED === 'true',
      service: process.env.EMAIL_SERVICE || 'gmail',
      from: process.env.EMAIL_FROM || 'noreply@fooddelivery.com',
      appName: process.env.APP_NAME || 'Food Delivery'
    };
    
    console.log(`📧 Email service initialized - Enabled: ${this.config.enabled}`);
  }

  async sendEmail(to, subject, html, text = '') {
    try {
      if (!to || !subject) {
        throw new Error('Email and subject are required');
      }

      if (!this.config.enabled) {
        console.log(`📧 [SIMULATED] Email to ${to}: ${subject}`);
        return {
          success: true,
          simulated: true,
          messageId: `simulated-${crypto.randomBytes(8).toString('hex')}`,
          to,
          subject
        };
      }

      // TODO: إضافة تكامل مع خدمة بريد حقيقية
      // مثال مع Nodemailer (يحتاج تثبيت nodemailer):
      /*
      const transporter = nodemailer.createTransport({
        service: this.config.service,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      
      const mailOptions = {
        from: this.config.from,
        to,
        subject,
        html,
        text: text || this.htmlToText(html)
      };
      
      const info = await transporter.sendMail(mailOptions);
      */
      
      // Simulation للتنمية
      console.log(`📧 Email sent to ${to}: ${subject}`);
      console.log(`📧 HTML Preview (first 100 chars): ${html.substring(0, 100)}...`);
      
      return {
        success: true,
        messageId: `sent-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        to,
        subject,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Email sending error:', error.message);
      return {
        success: false,
        error: error.message,
        to,
        subject,
        timestamp: new Date()
      };
    }
  }

  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async sendWelcomeEmail(user) {
    const subject = `مرحباً بك في ${this.config.appName}, ${user.name}!`;
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .welcome-text { font-size: 18px; margin-bottom: 20px; }
          .features { margin: 20px 0; }
          .feature-item { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-right: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>مرحباً ${user.name}! 👋</h1>
            <p>نحن سعداء بانضمامك إلى ${this.config.appName}</p>
          </div>
          <div class="content">
            <div class="welcome-text">
              <p>شكراً لثقتك بنا. أنت الآن جزء من مجتمع ${this.config.appName}!</p>
            </div>
            
            <div class="features">
              <h3>🎉 يمكنك الآن:</h3>
              <div class="feature-item">
                <strong>🍽️ استعراض المطاعم</strong>
                <p>اكتشف أفضل المطاعم في مدينتك</p>
              </div>
              <div class="feature-item">
                <strong>🚀 طلب سريع</strong>
                <p>اطلب وجبتك المفضلة في دقائق</p>
              </div>
              <div class="feature-item">
                <strong>📍 تتبع حي</strong>
                <p>تتبع طلباتك في الوقت الحقيقي</p>
              </div>
              <div class="feature-item">
                <strong>⭐ تقييمات</strong>
                <p>شارك تجربتك مع الآخرين</p>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.CLIENT_URL || 'https://fooddelivery.com'}/dashboard" class="btn">
                ابدأ التسوق الآن 🛒
              </a>
            </div>
            
            <div class="footer">
              <p>إذا كان لديك أي استفسار، لا تتردد في التواصل معنا عبر:</p>
              <p>📧 support@fooddelivery.com | 📞 1234567890</p>
              <p style="margin-top: 20px; font-size: 14px;">
                مع تحيات،<br>
                فريق <strong>${this.config.appName}</strong>
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, html);
  }

  async sendVerificationEmail(user, verificationCode) {
    const subject = `كود التحقق - ${this.config.appName}`;
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .code-container { background: white; padding: 30px; margin: 20px 0; text-align: center; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .verification-code { font-size: 42px; font-weight: bold; letter-spacing: 10px; color: #2E7D32; margin: 20px 0; }
          .instructions { margin: 20px 0; padding: 15px; background: #E8F5E9; border-radius: 5px; border-right: 4px solid #4CAF50; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
          .warning { color: #D32F2F; background: #FFEBEE; padding: 10px; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔐 كود التحقق</h2>
          </div>
          <div class="content">
            <p>مرحباً ${user.name},</p>
            <p>استخدم الكود التالي لتفعيل حسابك في ${this.config.appName}:</p>
            
            <div class="code-container">
              <p style="color: #666; margin-bottom: 10px;">الكود الصالح لمدة 24 ساعة:</p>
              <div class="verification-code">${verificationCode}</div>
              <p style="color: #999; font-size: 14px; margin-top: 10px;">أدخل هذا الكود في صفحة تفعيل الحساب</p>
            </div>
            
            <div class="instructions">
              <h4>📝 تعليمات:</h4>
              <ol style="padding-right: 20px;">
                <li>انتقل إلى صفحة تفعيل الحساب</li>
                <li>أدخل كود التحقق أعلاه</li>
                <li>انقر على زر "تفعيل الحساب"</li>
                <li>ستتم إعادة توجيهك إلى لوحة التحكم</li>
              </ol>
            </div>
            
            <div class="warning">
              ⚠️ <strong>هام:</strong> لا تشارك هذا الكود مع أي شخص. فريق ${this.config.appName} لن يطلب منك كود التحقق أبداً.
            </div>
            
            <div class="footer">
              <p>إذا لم تطلب هذا الكود، يمكنك تجاهل هذا البريد.</p>
              <p style="margin-top: 20px; font-size: 14px;">
                مع تحيات،<br>
                فريق الأمن في <strong>${this.config.appName}</strong>
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, html);
  }

async sendNotificationEmail(user, notification) {
  try {
    const icon = notification.icon || '🔔';
    const subject = `${icon} ${notification.title}`;
    
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .notification-header { background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .notification-icon { font-size: 48px; margin-bottom: 15px; }
          .notification-content { background: white; padding: 25px; margin: 20px 0; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .btn-container { text-align: center; margin: 30px 0; }
          .btn { display: inline-block; background: #FF9800; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
          .metadata { background: #F5F5F5; padding: 15px; border-radius: 5px; margin: 15px 0; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="notification-header">
            <div class="notification-icon">${icon}</div>
            <h2>${notification.title}</h2>
          </div>
          <div class="content">
            <div class="notification-content">
              <p style="font-size: 16px; line-height: 1.8;">${notification.content}</p>
            </div>
            
            ${notification.data ? `
            <div class="metadata">
              <h4>📋 تفاصيل إضافية:</h4>
              <pre style="background: white; padding: 15px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(notification.data, null, 2)}</pre>
            </div>
            ` : ''}
            
            ${notification.link ? `
            <div class="btn-container">
              <a href="${notification.link}" class="btn">
                عرض التفاصيل →
              </a>
            </div>
            ` : ''}
            
            <div class="footer">
              <p>هذا إشعار تلقائي من ${this.config.appName}</p>
              <p style="margin-top: 10px; font-size: 14px;">
                لتعديل تفضيلات الإشعارات، قم بزيارة <a href="${process.env.CLIENT_URL || 'https://fooddelivery.com'}/settings/notifications">إعدادات الإشعارات</a>
              </p>
              <p style="margin-top: 20px; font-size: 12px; color: #999;">
                ${new Date().toLocaleString('ar-SA')}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = this.htmlToText(html);
    
    // إرسال البريد الإلكتروني
    const result = await this.sendEmail(user.email, subject, html, text);
    
    return result;
  } catch (error) {
    console.error('❌ Send notification email error:', error.message);
    throw error;
  }
}
  async sendPasswordResetEmail(user, resetToken) {
    const resetLink = `${process.env.CLIENT_URL || 'https://fooddelivery.com'}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
    const subject = `إعادة تعيين كلمة المرور - ${this.config.appName}`;
    
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .warning-box { background: #FFF3E0; border-right: 4px solid #FF9800; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .btn-container { text-align: center; margin: 30px 0; }
          .btn { display: inline-block; background: #D32F2F; color: white; padding: 14px 35px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; }
          .token-info { background: white; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: center; border: 2px dashed #D32F2F; }
          .token { font-family: monospace; font-size: 18px; color: #D32F2F; padding: 10px; background: #FFEBEE; border-radius: 5px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
          .urgent { color: #D32F2F; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔐 إعادة تعيين كلمة المرور</h2>
            <p>طلب إعادة تعيين كلمة مرور حسابك</p>
          </div>
          <div class="content">
            <p>مرحباً ${user.name},</p>
            <p>تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في ${this.config.appName}.</p>
            
            <div class="warning-box">
              <h4>⚠️ إذا لم تطلب إعادة تعيين كلمة المرور:</h4>
              <p>يمكنك تجاهل هذا البريد بأمان. كلمة مرورك لن تتغير ما لم تنقر على الرابط أدناه وتقوم بتعيين كلمة مرور جديدة.</p>
            </div>
            
            <div class="btn-container">
              <a href="${resetLink}" class="btn">
                إعادة تعيين كلمة المرور الآن
              </a>
            </div>
            
            <p style="text-align: center; color: #666; margin: 20px 0;">
              أو انسخ الرابط التالي:<br>
              <small>${resetLink}</small>
            </p>
            
            <div class="token-info">
              <p><strong>الرقم السري (Token):</strong></p>
              <div class="token">${resetToken}</div>
              <p style="margin-top: 10px; font-size: 14px; color: #666;">
                صالح لمدة: <span class="urgent">10 دقائق فقط</span>
              </p>
            </div>
            
            <div class="footer">
              <p class="urgent">🔒 لأسباب أمنية، هذا الرابط سينتهي خلال 10 دقائق.</p>
              <p style="margin-top: 20px; font-size: 14px;">
                مع تحيات،<br>
                فريق الأمن في <strong>${this.config.appName}</strong>
              </p>
              <p style="font-size: 12px; color: #999; margin-top: 10px;">
                ${new Date().toLocaleString('ar-SA')}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, html);
  }

  async sendOrderStatusEmail(user, order, status) {
    const statusIcons = {
      pending: '⏳',
      accepted: '✅',
      picked: '📦',
      delivered: '🚚',
      cancelled: '❌'
    };
    
    const statusTitles = {
      pending: 'طلب قيد الانتظار',
      accepted: 'تم قبول الطلب',
      picked: 'تم استلام الطلب',
      delivered: 'تم التوصيل',
      cancelled: 'تم إلغاء الطلب'
    };
    
    const icon = statusIcons[status] || '🔔';
    const title = statusTitles[status] || 'تحديث على طلبك';
    const subject = `${icon} ${title} - الطلب #${order._id.toString().slice(-6)}`;
    
    const orderLink = `${process.env.CLIENT_URL || 'https://fooddelivery.com'}/orders/${order._id}`;
    
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2196F3 0%, #0D47A1 100%); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }
          .order-status { font-size: 48px; margin-bottom: 10px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .order-info { background: white; padding: 25px; margin: 20px 0; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .info-label { color: #666; }
          .info-value { font-weight: bold; }
          .items-list { margin: 20px 0; }
          .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .btn-container { text-align: center; margin: 30px 0; }
          .btn { display: inline-block; background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
          .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
          .status-pending { background: #FFF3E0; color: #FF9800; }
          .status-accepted { background: #E8F5E9; color: #4CAF50; }
          .status-picked { background: #E3F2FD; color: #2196F3; }
          .status-delivered { background: #E8F5E9; color: #2E7D32; }
          .status-cancelled { background: #FFEBEE; color: #D32F2F; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="order-status">${icon}</div>
            <h2>${title}</h2>
            <p>تحديث على طلبك #${order._id.toString().slice(-6)}</p>
          </div>
          <div class="content">
            <div class="order-info">
              <div class="info-row">
                <span class="info-label">رقم الطلب:</span>
                <span class="info-value">#${order._id.toString().slice(-6)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">الحالة:</span>
                <span class="info-value">
                  <span class="status-badge status-${status}">${title}</span>
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">تاريخ الطلب:</span>
                <span class="info-value">${new Date(order.createdAt).toLocaleString('ar-SA')}</span>
              </div>
              <div class="info-row">
                <span class="info-label">المجموع:</span>
                <span class="info-value">${order.totalPrice.toFixed(2)} د.م</span>
              </div>
              
              ${order.items && order.items.length > 0 ? `
              <div class="items-list">
                <h4>🛒 العناصر:</h4>
                ${order.items.map(item => `
                <div class="item">
                  <span>${item.name} × ${item.qty}</span>
                  <span>${(item.price * item.qty).toFixed(2)} د.م</span>
                </div>
                `).join('')}
              </div>
              ` : ''}
            </div>
            
            <div class="btn-container">
              <a href="${orderLink}" class="btn">
                عرض تفاصيل الطلب →
              </a>
            </div>
            
            <div class="footer">
              <p>شكراً لاختيارك ${this.config.appName}</p>
              <p style="margin-top: 10px; font-size: 14px;">
                للاستفسارات: support@fooddelivery.com | 1234567890
              </p>
              <p style="margin-top: 20px; font-size: 12px; color: #999;">
                ${new Date().toLocaleString('ar-SA')}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, html);
  }
}

module.exports = new EmailService();