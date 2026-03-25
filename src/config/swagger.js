// ============================================
// ملف: src/config/swagger.js
// الوصف: إعدادات Swagger لتوثيق API بالكامل
// ============================================

const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

/**
 * تحويل Joi Validator إلى Swagger Schema
 * هذه الدالة تستخدم لقراءة الـ Validators الفعلية وتحويلها تلقائياً
 */
const convertJoiToSwagger = (joiSchema) => {
  if (!joiSchema || !joiSchema.describe) {
    return { type: 'object', properties: {} };
  }

  try {
    const describe = joiSchema.describe();
    const keys = describe.keys || {};
    const swaggerSchema = {
      type: 'object',
      properties: {},
      required: []
    };

    for (const [key, value] of Object.entries(keys)) {
      // تحديد النوع الأساسي
      let type = 'string';
      if (value.type === 'number') type = 'number';
      if (value.type === 'boolean') type = 'boolean';
      if (value.type === 'array') type = 'array';
      if (value.type === 'object') type = 'object';
      if (value.type === 'date') type = 'string';

      swaggerSchema.properties[key] = { type };

      // إضافة format للبريد الإلكتروني
      if (value.rules?.some(r => r.name === 'email')) {
        swaggerSchema.properties[key].format = 'email';
      }

      // إضافة maxLength
      const maxRule = value.rules?.find(r => r.name === 'max');
      if (maxRule) {
        swaggerSchema.properties[key].maxLength = maxRule.args.limit;
      }

      // إضافة minLength
      const minRule = value.rules?.find(r => r.name === 'min');
      if (minRule) {
        swaggerSchema.properties[key].minLength = minRule.args.limit;
      }

      // إضافة minimum/maximum للأرقام
      if (type === 'number') {
        const minNumberRule = value.rules?.find(r => r.name === 'min');
        if (minNumberRule) {
          swaggerSchema.properties[key].minimum = minNumberRule.args.limit;
        }
        const maxNumberRule = value.rules?.find(r => r.name === 'max');
        if (maxNumberRule) {
          swaggerSchema.properties[key].maximum = maxNumberRule.args.limit;
        }
      }

      // إضافة enum
      const validRule = value.rules?.find(r => r.name === 'valid');
      if (validRule && validRule.args?.value) {
        swaggerSchema.properties[key].enum = validRule.args.value;
      }

      // إضافة default
      if (value.flags?.default !== undefined) {
        swaggerSchema.properties[key].default = value.flags.default;
      }

      // إضافة required
      if (value.flags?.presence === 'required') {
        swaggerSchema.required.push(key);
      }

      // معالجة الـ array
      if (type === 'array' && value.items) {
        swaggerSchema.properties[key].items = convertJoiToSwagger({ describe: () => ({ keys: { item: value.items } }) }).properties?.item || { type: 'string' };
      }
    }

    return swaggerSchema;
  } catch (error) {
    console.error('Error converting Joi schema:', error);
    return { type: 'object', properties: {} };
  }
};

/**
 * إعدادات Swagger
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Food Delivery API',
      version: '2.1.0',
      description: `
        🚀 **منصة توصيل الطعام المتكاملة**
        
        ## المميزات الرئيسية:
        - 🔐 **نظام مصادقة متكامل** (JWT, Refresh Tokens)
        - 👤 **إدارة المستخدمين** (عملاء، مندوبين، تجار، مشرفين)
        - 🏪 **إدارة المتاجر والمنتجات**
        - 📦 **نظام الطلبات المتقدم** (تتبع، تقييم، إشعارات)
        - 🗺️ **خدمات الخرائط والتتبع** (حساب المسافات، تتبع المندوبين)
        - 💬 **نظام دردشة متكامل** (محادثات فردية، جماعية، دعم فني)
        - 🎁 **نظام ولاء ونقاط** (مكافآت، خصومات)
        - 📊 **تحليلات متقدمة** (تقارير، إحصائيات)
        - 🔔 **إشعارات فورية** (Push, Email, SMS)
        
        ## كيفية الاستخدام:
        1. قم بتسجيل حساب جديد عبر \`/auth/register\`
        2. فعّل حسابك عبر \`/auth/verify\`
        3. سجل الدخول عبر \`/auth/login\` للحصول على التوكن
        4. استخدم التوكن في Header: \`Authorization: Bearer <token>\`
        
        ## الأدوار المدعومة:
        - **client** 👤 عميل عادي
        - **vendor** 🏪 صاحب متجر
        - **driver** 🚗 مندوب توصيل
        - **admin** 👑 مشرف كامل الصلاحيات
      `,
      contact: {
        name: 'الدعم الفني',
        email: 'support@fooddelivery.com',
        url: 'https://fooddelivery.com/support'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'الخادم المحلي (Development)'
      },
      {
        url: 'https://staging-api.fooddelivery.com/api/v1',
        description: 'خادم الاختبار (Staging)'
      },
      {
        url: 'https://api.fooddelivery.com/api/v1',
        description: 'خادم الإنتاج (Production)'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'أدخل التوكن بصيغة: Bearer <token>'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'مفتاح API للخدمات الخارجية'
        }
      },
      schemas: {
        // ========== Schemas من الـ Validators الفعلية ==========
        
        // Auth Schemas
        RegisterInput: convertJoiToSwagger(require('../validators/auth.validator').registerSchema),
        LoginInput: convertJoiToSwagger(require('../validators/auth.validator').loginSchema),
        ChangePasswordInput: convertJoiToSwagger(require('../validators/auth.validator').changePasswordSchema),
        ResetPasswordInput: convertJoiToSwagger(require('../validators/auth.validator').resetPasswordSchema),
        ForgotPasswordInput: convertJoiToSwagger(require('../validators/auth.validator').forgotPasswordSchema),
        VerifyAccountInput: convertJoiToSwagger(require('../validators/auth.validator').verifyAccountSchema),
        
        // Address Schemas
        CreateAddressInput: convertJoiToSwagger(require('../validators/address.validator').createAddressSchema),
        UpdateAddressInput: convertJoiToSwagger(require('../validators/address.validator').updateAddressSchema),
        
        // User Schemas
        UpdateProfileInput: convertJoiToSwagger(require('../validators/user.validator').updateProfileSchema),
        
        // Store Schemas
        CreateStoreInput: convertJoiToSwagger(require('../validators/store.validator').createStoreSchema),
        UpdateStoreInput: convertJoiToSwagger(require('../validators/store.validator').updateStoreSchema),
        
        // Product Schemas
        CreateProductInput: convertJoiToSwagger(require('../validators/product.validator').createProductSchema),
        UpdateProductInput: convertJoiToSwagger(require('../validators/product.validator').updateProductSchema),
        UpdateInventoryInput: convertJoiToSwagger(require('../validators/product.validator').updateInventorySchema),
        
        // Order Schemas
        CreateOrderInput: convertJoiToSwagger(require('../validators/order.validator').createOrderSchema),
        UpdateStatusInput: convertJoiToSwagger(require('../validators/order.validator').updateStatusSchema),
        CancelOrderInput: convertJoiToSwagger(require('../validators/order.validator').cancelOrderSchema),
        RateOrderInput: convertJoiToSwagger(require('../validators/order.validator').rateOrderSchema),
        ReportIssueInput: convertJoiToSwagger(require('../validators/order.validator').reportIssueSchema),
        AssignDriverInput: convertJoiToSwagger(require('../validators/order.validator').assignDriverSchema),
        
        // ========== نماذج إضافية ==========
        
        // نموذج المستخدم الكامل
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c89' },
            name: { type: 'string', example: 'أحمد محمد' },
            email: { type: 'string', format: 'email', example: 'ahmed@example.com' },
            phone: { type: 'string', example: '+966501234567' },
            role: { type: 'string', enum: ['client', 'vendor', 'driver', 'admin'], example: 'client' },
            avatar: { type: 'string', example: 'https://api.fooddelivery.com/uploads/avatar-123.jpg' },
            coverImage: { type: 'string', example: 'https://api.fooddelivery.com/uploads/cover-123.jpg' },
            isVerified: { type: 'boolean', example: true },
            isActive: { type: 'boolean', example: true },
            isOnline: { type: 'boolean', example: false },
            rating: { type: 'number', format: 'float', minimum: 0, maximum: 5, example: 4.5 },
            loyaltyPoints: { type: 'integer', example: 1250 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج العنوان الكامل
        Address: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c90' },
            userId: { type: 'string', example: '60d21b4667d0d8992e610c89' },
            title: { type: 'string', example: 'المنزل' },
            address: { type: 'string', example: 'شارع الملك فهد، الرياض' },
            latitude: { type: 'number', example: 24.7136 },
            longitude: { type: 'number', example: 46.6753 },
            isDefault: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج المتجر الكامل
        Store: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            vendorId: { type: 'string', example: '60d21b4667d0d8992e610c86' },
            name: { type: 'string', example: 'مطعم الأندلس' },
            description: { type: 'string', example: 'أشهى المأكولات العربية' },
            logo: { type: 'string', example: 'https://api.fooddelivery.com/uploads/logo-123.jpg' },
            coverImage: { type: 'string', example: 'https://api.fooddelivery.com/uploads/cover-123.jpg' },
            status: { type: 'string', enum: ['pending', 'active', 'closed', 'suspended'], example: 'active' },
            isOpen: { type: 'boolean', example: true },
            rating: { type: 'number', format: 'float', minimum: 0, maximum: 5, example: 4.7 },
            deliveryRadius: { type: 'integer', example: 5000 },
            minimumOrder: { type: 'number', example: 50 },
            deliveryFee: { type: 'number', example: 15 },
            openingTime: { type: 'string', example: '09:00' },
            closingTime: { type: 'string', example: '23:00' },
            categories: { type: 'array', items: { type: 'string' }, example: ['وجبات سريعة', 'مشروبات'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج المنتج الكامل
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c87' },
            storeId: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            name: { type: 'string', example: 'شاورما دجاج' },
            description: { type: 'string', example: 'شاورما دجاج مع صلصة الثوم' },
            price: { type: 'number', example: 25 },
            discountPrice: { type: 'number', example: 20 },
            images: { type: 'array', items: { type: 'string' }, example: ['image1.jpg'] },
            category: { type: 'string', example: 'وجبات رئيسية' },
            isAvailable: { type: 'boolean', example: true },
            featured: { type: 'boolean', example: false },
            inventory: { type: 'integer', example: 100 },
            calories: { type: 'integer', example: 450 },
            preparationTime: { type: 'integer', example: 15 },
            rating: { type: 'number', format: 'float', example: 4.8 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج الطلب الكامل
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c88' },
            clientId: { type: 'string', example: '60d21b4667d0d8992e610c89' },
            storeId: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            driverId: { type: 'string', example: '60d21b4667d0d8992e610c8a' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  name: { type: 'string' },
                  quantity: { type: 'integer' },
                  price: { type: 'number' },
                  notes: { type: 'string' }
                }
              }
            },
            subtotal: { type: 'number', example: 100 },
            deliveryFee: { type: 'number', example: 15 },
            discount: { type: 'number', example: 10 },
            total: { type: 'number', example: 105 },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'preparing', 'ready', 'picked', 'delivered', 'cancelled'],
              example: 'pending'
            },
            paymentMethod: { type: 'string', enum: ['cash', 'card', 'wallet'], example: 'cash' },
            address: { $ref: '#/components/schemas/Address' },
            createdAt: { type: 'string', format: 'date-time' },
            deliveredAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج الموقع الجغرافي
        Location: {
          type: 'object',
          properties: {
            latitude: { type: 'number', example: 24.7136 },
            longitude: { type: 'number', example: 46.6753 },
            address: { type: 'string', example: 'شارع الملك فهد، الرياض' }
          }
        },
        
        // نموذج المسار
        Route: {
          type: 'object',
          properties: {
            distance: { type: 'number', description: 'المسافة بالمتر', example: 1250 },
            distanceKm: { type: 'number', description: 'المسافة بالكيلومتر', example: 1.25 },
            duration: { type: 'number', description: 'المدة بالثواني', example: 540 },
            durationMinutes: { type: 'number', description: 'المدة بالدقائق', example: 9 },
            geometry: { type: 'object', description: 'مسار الخط على الخريطة' },
            steps: { type: 'array', description: 'خطوات التوجيه' }
          }
        },
        
        // نموذج الرسالة
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            conversationId: { type: 'string' },
            sender: { $ref: '#/components/schemas/User' },
            type: { type: 'string', enum: ['text', 'image', 'video', 'audio', 'location', 'contact', 'file'] },
            content: { type: 'string' },
            mediaUrl: { type: 'string' },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج المحادثة
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['direct', 'group', 'support', 'order'] },
            name: { type: 'string' },
            participants: { type: 'array', items: { $ref: '#/components/schemas/User' } },
            lastMessage: { $ref: '#/components/schemas/Message' },
            unreadCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج الإشعار
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            type: { type: 'string', enum: ['order', 'promotion', 'system', 'chat', 'loyalty'] },
            title: { type: 'string' },
            message: { type: 'string' },
            data: { type: 'object' },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // نموذج نقاط الولاء
        LoyaltyPoints: {
          type: 'object',
          properties: {
            current: { type: 'integer', example: 1250 },
            tier: { type: 'string', enum: ['bronze', 'silver', 'gold', 'platinum'], example: 'silver' },
            nextTier: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'gold' },
                pointsNeeded: { type: 'integer', example: 750 },
                progress: { type: 'number', example: 62.5 }
              }
            },
            lifetimePoints: { type: 'integer', example: 2500 }
          }
        },
        
        // نموذج الخطأ
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'حدث خطأ أثناء المعالجة' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        },
        
        // نموذج النجاح
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'تمت العملية بنجاح' },
            data: { type: 'object' }
          }
        },
        
        // نموذج الترحيل (Pagination)
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            pages: { type: 'integer', example: 5 },
            hasNext: { type: 'boolean', example: true },
            hasPrev: { type: 'boolean', example: false }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'غير مصرح - يجب تسجيل الدخول',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'يرجى تسجيل الدخول أولاً',
                code: 'UNAUTHORIZED'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'ممنوع - ليس لديك صلاحية كافية',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
                code: 'FORBIDDEN'
              }
            }
          }
        },
        NotFoundError: {
          description: 'المورد غير موجود',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'المورد المطلوب غير موجود',
                code: 'NOT_FOUND'
              }
            }
          }
        },
        ValidationError: {
          description: 'بيانات غير صحيحة',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'بيانات غير صحيحة',
                code: 'VALIDATION_ERROR',
                errors: [
                  { field: 'email', message: 'البريد الإلكتروني مطلوب' }
                ]
              }
            }
          }
        }
      }
    },
    tags: [
      { name: '🚀 API', description: 'المسارات الرئيسية للتطبيق' },
      { name: '🔐 Authentication', description: 'مسارات المصادقة وإدارة الحسابات' },
      { name: '👤 Client', description: 'مسارات العملاء (المستخدمين العاديين)' },
      { name: '🏪 Vendor', description: 'مسارات أصحاب المتاجر' },
      { name: '🚗 Driver', description: 'مسارات المندوبين' },
      { name: '👑 Admin', description: 'مسارات المشرف (صلاحيات كاملة)' },
      { name: '📦 Orders', description: 'إدارة الطلبات لجميع الأدوار' },
      { name: '🗺️ Map', description: 'خدمات الخرائط والتتبع والملاحة' },
      { name: '💬 Chat', description: 'نظام الدردشة والمراسلة' },
      { name: '📍 Addresses', description: 'إدارة عناوين المستخدمين' },
      { name: '📊 Aggregates', description: 'البيانات المجمعة والتقارير' },
      { name: '📊 Analytics', description: 'التحليلات وإحصائيات الأداء' },
      { name: '🔔 Notifications', description: 'إدارة الإشعارات' },
      { name: '🎁 Loyalty', description: 'نظام الولاء والمكافآت' },
      { name: '👥 Users', description: 'إدارة المستخدمين (للمشرف فقط)' },
      { name: '🔒 Security', description: 'مسارات الأمان والفحوصات' },
      { name: '🏥 Health', description: 'فحص صحة النظام وحالته' },
      { name: '📁 Assets', description: 'الملفات الثابتة والصور' }
    ]
  },
  apis: [
    // مسارات التوثيق
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../routes/**/*.js'),
    // نماذج إضافية
    path.join(__dirname, '../models/*.js')
  ]
};

/**
 * إنشاء مواصفات Swagger
 */ 
const swaggerSpecs = swaggerJsdoc(swaggerOptions);

// إضافة بعض التحسينات للمواصفات
swaggerSpecs.components = {
  ...swaggerSpecs.components,
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'أدخل التوكن بصيغة: Bearer <token>'
    }
  }
};

// تصدير المواصفات
module.exports = swaggerSpecs;

// تصدير الدالة المساعدة للتحويل
module.exports.convertJoiToSwagger = convertJoiToSwagger;