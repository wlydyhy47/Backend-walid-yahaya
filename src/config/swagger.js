const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Food Delivery API',
      version: '1.0.0',
      description: 'API documentation for Food Delivery Application',
      contact: {
        name: 'API Support',
        email: 'support@fooddelivery.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000/api',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['name', 'phone', 'password'],
          properties: {
            name: {
              type: 'string',
              example: 'John Doe'
            },
            phone: {
              type: 'string',
              example: '+1234567890'
            },
            email: {
              type: 'string',
              example: 'john@example.com'
            },
            password: {
              type: 'string',
              format: 'password',
              example: 'password123'
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
              example: 'Error message'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid'
        },
        NotFoundError: {
          description: 'The requested resource was not found'
        },
        ValidationError: {
          description: 'Validation failed'
        }
      }
    },
    tags: [
      {
        name: 'Auth',
        description: 'Authentication endpoints'
      },
      {
        name: 'Users',
        description: 'User management endpoints'
      },
      {
        name: 'Restaurants',
        description: 'Restaurant management endpoints'
      },
      {
        name: 'Orders',
        description: 'Order management endpoints'
      },
      {
        name: 'Chat',
        description: 'Chat and messaging endpoints'
      },
      {
        name: 'Notifications',
        description: 'Notification management endpoints'
      }
    ]
  },
  apis: [
    './src/routes/*.js', 
    './src/controllers/*.js',
    './src/middlewares/*.js' // إضافة
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;