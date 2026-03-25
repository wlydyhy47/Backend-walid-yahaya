// ============================================
// ملف: src/config/swagger.js
// الوصف: إعدادات Swagger لتوثيق API بالكامل
// الإصدار: 3.0
// ============================================

const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

/**
 * تحويل Joi Validator إلى Swagger Schema
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
      let type = 'string';
      if (value.type === 'number') type = 'number';
      if (value.type === 'boolean') type = 'boolean';
      if (value.type === 'array') type = 'array';
      if (value.type === 'object') type = 'object';
      if (value.type === 'date') type = 'string';

      swaggerSchema.properties[key] = { type };

      if (value.rules?.some(r => r.name === 'email')) {
        swaggerSchema.properties[key].format = 'email';
      }

      const maxRule = value.rules?.find(r => r.name === 'max');
      if (maxRule) {
        swaggerSchema.properties[key].maxLength = maxRule.args.limit;
      }

      const minRule = value.rules?.find(r => r.name === 'min');
      if (minRule) {
        swaggerSchema.properties[key].minLength = minRule.args.limit;
      }

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

      const validRule = value.rules?.find(r => r.name === 'valid');
      if (validRule && validRule.args?.value) {
        swaggerSchema.properties[key].enum = validRule.args.value;
      }

      if (value.flags?.default !== undefined) {
        swaggerSchema.properties[key].default = value.flags.default;
      }

      if (value.flags?.presence === 'required') {
        swaggerSchema.required.push(key);
      }

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
      version: '3.0.0',
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
        // ========== Schemas من الـ Validators ==========
        RegisterInput: convertJoiToSwagger(require('../validators/auth.validator').registerSchema),
        LoginInput: {
          type: 'object',
          required: ['password'],
          properties: {
            phone: {
              type: 'string',
              description: 'رقم الهاتف (مطلوب إذا لم يكن البريد موجوداً)',
              example: '+966501234567',
              pattern: '^[\\+]?[(]?[0-9]{3}[)]?[-\\s\\.]?[(]?[0-9]{3}[)]?[-\\s\\.]?[0-9]{4,6}$'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'البريد الإلكتروني (اختياري، بديل عن الهاتف)',
              example: 'user@example.com'
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'كلمة المرور (مطلوبة)',
              minLength: 6,
              example: 'Pass@123'
            },
            deviceId: {
              type: 'string',
              description: 'معرف الجهاز للإشعارات (اختياري)',
              example: 'device_12345'
            }
          }
        },
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
        
        Address: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c90' },
            userId: { type: 'string', example: '60d21b4667d0d8992e610c89' },
            label: { type: 'string', enum: ['home', 'work', 'other'], example: 'home' },
            addressLine: { type: 'string', example: 'شارع الملك فهد، الرياض' },
            city: { type: 'string', example: 'الرياض' },
            latitude: { type: 'number', example: 24.7136 },
            longitude: { type: 'number', example: 46.6753 },
            isDefault: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        Store: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            owner: { type: 'string', example: '60d21b4667d0d8992e610c86' },
            name: { type: 'string', example: 'مطعم الأندلس' },
            description: { type: 'string', example: 'أشهى المأكولات العربية' },
            logo: { type: 'string', example: 'https://api.fooddelivery.com/uploads/logo-123.jpg' },
            coverImage: { type: 'string', example: 'https://api.fooddelivery.com/uploads/cover-123.jpg' },
            category: { type: 'string', enum: ['restaurant', 'cafe', 'fast_food', 'bakery', 'grocery', 'pharmacy', 'other'], example: 'restaurant' },
            isOpen: { type: 'boolean', example: true },
            isVerified: { type: 'boolean', example: true },
            rating: { type: 'number', format: 'float', minimum: 0, maximum: 5, example: 4.7 },
            deliveryInfo: {
              type: 'object',
              properties: {
                hasDelivery: { type: 'boolean', example: true },
                deliveryFee: { type: 'number', example: 15 },
                minOrderAmount: { type: 'number', example: 50 },
                estimatedDeliveryTime: { type: 'integer', example: 30 },
                deliveryRadius: { type: 'integer', example: 10 }
              }
            },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                country: { type: 'string' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c87' },
            store: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            name: { type: 'string', example: 'شاورما دجاج' },
            description: { type: 'string', example: 'شاورما دجاج مع صلصة الثوم' },
            price: { type: 'number', example: 25 },
            discountedPrice: { type: 'number', example: 20 },
            image: { type: 'string', example: 'image.jpg' },
            category: { type: 'string', example: 'وجبات رئيسية' },
            isAvailable: { type: 'boolean', example: true },
            inventory: {
              type: 'object',
              properties: {
                quantity: { type: 'integer', example: 100 },
                unit: { type: 'string', example: 'piece' },
                lowStockThreshold: { type: 'integer', example: 5 },
                trackInventory: { type: 'boolean', example: false }
              }
            },
            attributes: {
              type: 'object',
              properties: {
                spicyLevel: { type: 'integer', minimum: 0, maximum: 3, example: 1 },
                isVegetarian: { type: 'boolean', example: false },
                isVegan: { type: 'boolean', example: false },
                isGlutenFree: { type: 'boolean', example: false }
              }
            },
            preparationTime: { type: 'integer', example: 15 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c88' },
            user: { type: 'string', example: '60d21b4667d0d8992e610c89' },
            store: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            driver: { type: 'string', example: '60d21b4667d0d8992e610c8a' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'integer' },
                  price: { type: 'number' },
                  notes: { type: 'string' }
                }
              }
            },
            totalPrice: { type: 'number', example: 105 },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'ready', 'picked', 'delivered', 'cancelled'],
              example: 'pending'
            },
            paymentMethod: { type: 'string', enum: ['cash', 'card', 'wallet'], example: 'cash' },
            deliveryAddress: { $ref: '#/components/schemas/Address' },
            createdAt: { type: 'string', format: 'date-time' },
            deliveredAt: { type: 'string', format: 'date-time' }
          }
        },
        
        Location: {
          type: 'object',
          properties: {
            latitude: { type: 'number', example: 24.7136 },
            longitude: { type: 'number', example: 46.6753 },
            address: { type: 'string', example: 'شارع الملك فهد، الرياض' }
          }
        },
        
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
        
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            conversation: { type: 'string' },
            sender: { $ref: '#/components/schemas/User' },
            type: { type: 'string', enum: ['text', 'image', 'video', 'audio', 'location', 'contact', 'file'] },
            content: { type: 'object' },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user: { type: 'string' },
            type: { type: 'string', enum: ['order', 'promotion', 'system', 'chat', 'loyalty'] },
            title: { type: 'string' },
            content: { type: 'string' },
            data: { type: 'object' },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        
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
        
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'حدث خطأ أثناء المعالجة' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        },
        
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'تمت العملية بنجاح' },
            data: { type: 'object' }
          }
        },
        
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
        },
        TooManyRequests: {
          description: 'طلبات كثيرة جداً',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'محاولات كثيرة جداً، الرجاء المحاولة لاحقاً',
                code: 'RATE_LIMIT_EXCEEDED'
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
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../routes/**/*.js'),
    path.join(__dirname, '../models/*.js')
  ]
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpecs;
module.exports.convertJoiToSwagger = convertJoiToSwagger;