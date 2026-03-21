// ============================================
// ملف: src/config/swagger.js (محدث)
// الوصف: توثيق API باستخدام Swagger
// ============================================

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Food Delivery API',
      version: '1.0.0',
      description: 'توثيق API لتطبيق توصيل الطعام - النسخة المحدثة',
      contact: {
        name: 'فريق الدعم',
        email: 'support@fooddelivery.com',
        url: 'https://fooddelivery.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      },
      'x-logo': {
        url: '/images/logo.png',
        altText: 'Food Delivery Logo'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000/api/v1',
        description: process.env.NODE_ENV === 'production' ? 'سيرفر الإنتاج' : 'سيرفر التطوير'
      },
      {
        url: 'http://localhost:3000/api/v1',
        description: 'سيرفر محلي'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'أدخل التوكن الخاص بك: Bearer <token>'
        }
      },
      schemas: {
        // ====== المستخدمين ======
        User: {
          type: 'object',
          required: ['name', 'phone', 'password'],
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c85'
            },
            name: {
              type: 'string',
              example: 'أحمد محمد',
              description: 'اسم المستخدم'
            },
            phone: {
              type: 'string',
              example: '+212600000000',
              description: 'رقم الهاتف'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'ahmed@example.com',
              description: 'البريد الإلكتروني (اختياري)'
            },
            role: {
              type: 'string',
              enum: ['client', 'driver', 'admin', 'store_owner'],
              example: 'client',
              description: 'دور المستخدم'
            },
            image: {
              type: 'string',
              example: 'https://res.cloudinary.com/.../avatar.jpg',
              description: 'صورة المستخدم'
            },
            isVerified: {
              type: 'boolean',
              example: true,
              description: 'هل الحساب موثق؟'
            },
            isActive: {
              type: 'boolean',
              example: true,
              description: 'هل الحساب نشط؟'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'تاريخ الإنشاء'
            }
          }
        },

        // ====== المطاعم ======
        Store: {
          type: 'object',
          required: ['name'],
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c86'
            },
            name: {
              type: 'string',
              example: 'مطعم الأندلس',
              description: 'اسم المطعم'
            },
            description: {
              type: 'string',
              example: 'أشهى المأكولات العربية',
              description: 'وصف المطعم'
            },
            image: {
              type: 'string',
              example: 'https://res.cloudinary.com/.../store.jpg',
              description: 'صورة المطعم'
            },
            coverImage: {
              type: 'string',
              example: 'https://res.cloudinary.com/.../cover.jpg',
              description: 'صورة الغلاف'
            },
            type: {
              type: 'string',
              enum: ['store', 'cafe', 'bakery', 'fast-food', 'grocery', 'pharmacy', 'other'],
              example: 'store',
              description: 'نوع المطعم'
            },
            isOpen: {
              type: 'boolean',
              example: true,
              description: 'هل المطعم مفتوح؟'
            },
            averageRating: {
              type: 'number',
              example: 4.5,
              description: 'متوسط التقييمات'
            },
            deliveryFee: {
              type: 'number',
              example: 10,
              description: 'رسوم التوصيل'
            },
            estimatedDeliveryTime: {
              type: 'number',
              example: 30,
              description: 'وقت التوصيل التقديري (بالدقائق)'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              example: ['عربي', 'مشاوي', 'بيتزا'],
              description: 'وسوم المطعم'
            }
          }
        },

        // ====== الطلبات ======
        Order: {
          type: 'object',
          required: ['items', 'totalPrice', 'store'],
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c87'
            },
            user: {
              type: 'string',
              example: '60d21b4667d0d8992e610c85',
              description: 'معرف المستخدم'
            },
            store: {
              type: 'string',
              example: '60d21b4667d0d8992e610c86',
              description: 'معرف المطعم'
            },
            driver: {
              type: 'string',
              example: '60d21b4667d0d8992e610c88',
              description: 'معرف المندوب (اختياري)'
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'برجر' },
                  qty: { type: 'number', example: 2 },
                  price: { type: 'number', example: 50 },
                  notes: { type: 'string', example: 'بدون بصل' }
                }
              }
            },
            totalPrice: {
              type: 'number',
              example: 120,
              description: 'السعر الإجمالي'
            },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'picked', 'delivered', 'cancelled'],
              example: 'pending',
              description: 'حالة الطلب'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'تاريخ الإنشاء'
            }
          }
        },

        // ====== الإشعارات ======
        Notification: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c89'
            },
            type: {
              type: 'string',
              enum: ['system', 'order_created', 'order_accepted', 'order_delivered', 'promotion'],
              example: 'order_created',
              description: 'نوع الإشعار'
            },
            title: {
              type: 'string',
              example: 'تم إنشاء الطلب',
              description: 'عنوان الإشعار'
            },
            content: {
              type: 'string',
              example: 'تم إنشاء طلبك رقم #123456',
              description: 'محتوى الإشعار'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              example: 'high',
              description: 'أولوية الإشعار'
            },
            read: {
              type: 'boolean',
              example: false,
              description: 'هل تمت القراءة؟'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'تاريخ الإرسال'
            }
          }
        },

        // ====== عناصر القائمة ======
        Item: {
          type: 'object',
          required: ['name', 'price', 'store'],
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c90'
            },
            name: {
              type: 'string',
              example: 'برجر دجاج',
              description: 'اسم العنصر'
            },
            price: {
              type: 'number',
              example: 45,
              description: 'السعر'
            },
            description: {
              type: 'string',
              example: 'برجر دجاج مقلي مع صوص خاص',
              description: 'وصف العنصر'
            },
            category: {
              type: 'string',
              enum: ['appetizer', 'main', 'dessert', 'drink', 'side', 'special'],
              example: 'main',
              description: 'فئة العنصر'
            },
            image: {
              type: 'string',
              example: 'https://res.cloudinary.com/.../item.jpg',
              description: 'صورة العنصر'
            },
            isAvailable: {
              type: 'boolean',
              example: true,
              description: 'هل العنصر متوفر؟'
            }
          }
        },

        // ====== العناوين ======
        Address: {
          type: 'object',
          required: ['label', 'addressLine'],
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c91'
            },
            label: {
              type: 'string',
              enum: ['Home', 'Work', 'Office', 'Other'],
              example: 'Home',
              description: 'تسمية العنوان'
            },
            addressLine: {
              type: 'string',
              example: 'شارع الحسن الثاني، رقم 10',
              description: 'تفاصيل العنوان'
            },
            city: {
              type: 'string',
              example: 'الدار البيضاء',
              description: 'المدينة'
            },
            latitude: {
              type: 'number',
              example: 33.5731,
              description: 'خط العرض'
            },
            longitude: {
              type: 'number',
              example: -7.5898,
              description: 'خط الطول'
            },
            isDefault: {
              type: 'boolean',
              example: false,
              description: 'هل العنوان افتراضي؟'
            }
          }
        },

        // ====== التقييمات ======
        Review: {
          type: 'object',
          required: ['rating'],
          properties: {
            id: {
              type: 'string',
              example: '60d21b4667d0d8992e610c92'
            },
            user: {
              type: 'string',
              example: '60d21b4667d0d8992e610c85',
              description: 'معرف المستخدم'
            },
            store: {
              type: 'string',
              example: '60d21b4667d0d8992e610c86',
              description: 'معرف المطعم'
            },
            rating: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              example: 4,
              description: 'التقييم'
            },
            comment: {
              type: 'string',
              example: 'طعام لذيذ وسريع',
              description: 'التعليق'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'تاريخ التقييم'
            }
          }
        },

        // ====== الردود العامة ======
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'تمت العملية بنجاح'
            },
            data: {
              type: 'object',
              description: 'بيانات الاستجابة'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },

        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'حدث خطأ في المعالجة'
            },
            code: {
              type: 'string',
              example: 'VALIDATION_ERROR'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },

        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              example: 1
            },
            limit: {
              type: 'integer',
              example: 20
            },
            total: {
              type: 'integer',
              example: 100
            },
            totalPages: {
              type: 'integer',
              example: 5
            },
            hasNextPage: {
              type: 'boolean',
              example: true
            },
            hasPrevPage: {
              type: 'boolean',
              example: false
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'التوكن غير صالح أو منتهي الصلاحية',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
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
              }
            }
          }
        },
        ValidationError: {
          description: 'خطأ في التحقق من البيانات',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        RateLimitError: {
          description: 'تم تجاوز الحد المسموح من الطلبات',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Auth',
        description: 'عمليات المصادقة والتسجيل'
      },
      {
        name: 'Users',
        description: 'إدارة المستخدمين والملفات الشخصية'
      },
      {
        name: 'Stores',
        description: 'إدارة المطاعم وقوائم الطعام'
      },
      {
        name: 'Orders',
        description: 'إدارة الطلبات والتتبع'
      },
      {
        name: 'Items',
        description: 'إدارة عناصر القائمة'
      },
      {
        name: 'Addresses',
        description: 'إدارة العناوين'
      },
      {
        name: 'Chat',
        description: 'الدردشة والمراسلة'
      },
      {
        name: 'Notifications',
        description: 'إدارة الإشعارات'
      },
      {
        name: 'Admin',
        description: 'لوحة تحكم المشرف'
      },
      {
        name: 'Driver',
        description: 'لوحة تحكم المندوب'
      },
      {
        name: 'Store Owner',
        description: 'لوحة تحكم صاحب المطعم'
      },
      {
        name: 'Loyalty',
        description: 'برنامج الولاء والنقاط'
      },
      {
        name: 'Analytics',
        description: 'التحليلات والإحصائيات'
      },
      {
        name: 'Security',
        description: 'فحوصات الأمان'
      },
      {
        name: 'Assets',
        description: 'الملفات الثابتة والصور'
      },
      {
        name: 'Health',
        description: 'فحوصات صحة النظام'
      }
    ],
    externalDocs: {
      description: 'مستودع GitHub',
      url: 'https://github.com/yourusername/food-delivery-api'
    }
  },
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/models/*.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;