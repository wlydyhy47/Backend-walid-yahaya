module.exports = {
  output: {
    filePath: 'repomix-output.xml',
    style: 'xml',
    headerText: '📦 Backend Project - Walid Yahaya',
    topFilesLength: 15,
    removeComments: true,
    removeEmptyLines: true
  },
  
  include: [
    'src/**/*.js',
    'src/**/*.json',
    '*.js',
    'package.json',
    'prisma/**/*.prisma',
    '*.sql'
  ],
  
  ignore: {
    useGitignore: true,
    useDefaultPatterns: true,
    customPatterns: [
      'node_modules/',
      'dist/',
      'build/',
      '.env',
      '.env.*',
      '*.log',
      'coverage/',
      '.git/',
      'temp/',
      'tmp/',
      'repomix-output.*'
    ]
  },
  
  security: {
    enableSecurityCheck: true,
    suspiciousPatterns: [
      'password',
      'secret',
      'api[_-]?key',
      'token',
      'credentials',
      'private[_-]?key',
      'JWT_SECRET',
      'DATABASE_URL',
      'STRIPE_SECRET'
    ],
    excludePatterns: [
      '**/*.test.js',
      '**/*.spec.js'
    ]
  },
  
  tokenCount: {
    encoding: 'o200k_base'
  },
  
  compression: {
    enabled: false,
    level: 6
  }
};