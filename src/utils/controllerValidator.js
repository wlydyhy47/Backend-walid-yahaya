// ============================================
// ملف: src/utils/controllerValidator.js
// الوصف: التحقق من وجود جميع الدوال في الـ Controllers
// الإصدار: 2.0 (متكامل)
// ============================================

const fs = require('fs');
const path = require('path');
const chalk = require('chalk'); // يمكن تثبيته: npm install chalk

// ========== 1. تعريف الدوال المطلوبة لكل Controller ==========

const REQUIRED_METHODS = {
  // Order Controller
  orderController: {
    required: [
      'createOrder',
      'getOrderDetails',
      'getMyOrdersPaginated',
      'getDriverOrders',
      'getAllOrdersPaginated',
      'acceptOrder',
      'rejectOrder',
      'markOrderReady',
      'startPreparing',
      'getVendorOrders',
      'getVendorOrderStats',
      'getTodayOrders',
      'updateStatus',
      'cancelOrder',
      'assignDriver',
      'reassignDriver',
      'forceCancelOrder',
      'trackOrder',
      'updateDriverLocation',
      'getDriverLocation',
      'getOrderTimeline',
      'getDriverEarnings',
      'getCurrentDelivery',
      'getOrderStats',
      'getDailyStats',
      'getMonthlyStats',
      'getDriverOrdersById',
      'getStoreOrdersById',
      'rateOrder',
      'reportOrderIssue'
    ],
    optional: [
      'getTodayRevenue'
    ]
  },

  // Driver Controller
  driverController: {
    required: [
      'getMyProfile',
      'toggleAvailability',
      'updateLocation',
      'getCurrentOrder',
      'getMyStats',
      'getDrivers',
      'getDriverById',
      'getDriverLocation',
      'getDriverStatsById',
      'updateAvatar',
      'getEarningsHistory',
      'getPerformanceReport',
      'verifyDriver',
      'toggleDriverStatus'
    ],
    optional: []
  },

  // Aggregate Controller
  aggregateController: {
    required: [
      'getDashboardData',
      'getStoresPaginated',
      'getItemsPaginated',
      'getOrdersPaginatedAdmin',
      'getStoreDetails',
      'getOrderWithTracking',
      'getHomeData',
      'clearCache',
      'clearCachePattern',
      'getCacheStats',
      'getAdminDashboard',
      'getAdminStats',
      'getAdminUserStats',
      'getAdminOrderStats',
      'getAdminRevenueStats',
      'getUserAnalytics',
      'getOrderAnalytics',
      'getRevenueAnalytics',
      'unifiedSearch',
      'getPublicStats',
      'getMyOrdersPaginated',
      'calculateETA',
      'getStatusText',
      'exportOrdersReport',
      'exportUsersReport',
      'exportRevenueReport',
      'exportDriversReport',
      'exportStoresReport',
      'getDailyAdvancedStats',
      'getWeeklyAdvancedStats',
      'getMonthlyAdvancedStats',
      'getCustomStats'
    ],
    optional: []
  },

  // Notification Controller
  notificationController: {
    required: [
      'getUserNotifications',
      'getUnreadCount',
      'getNotificationStats',
      'markAsRead',
      'markAsUnread',
      'archive',
      'deleteNotification',
      'markAllAsRead',
      'deleteReadNotifications',
      'updateNotificationPreferences',
      'registerDevice',
      'unregisterDevice',
      'sendCustomNotification',
      'getCampaignStats',
      'getAllNotificationsStats',
      'cleanupExpiredNotifications',
      'createWelcomeNotification',
      'createPasswordChangedNotification',
      'createCampaign',
      'getCampaigns',
      'pauseCampaign',
      'resumeCampaign',
      'deleteCampaign'
    ],
    optional: []
  },

  // Store Controller
  storeController: {
    required: [
      'getStoresPaginated',
      'getStoresSmart',
      'searchStores',
      'getStoreDetails',
      'getStoreProducts',
      'addReview',
      'getStoreReviews',
      'createStore',
      'updateStore',
      'updateStoreLogo',
      'updateStoreCover',
      'deleteStore',
      'toggleStoreStatus',
      'verifyStore',
      'getStoreStats',
      'uploadStoreFiles',
      'advancedSearch'
    ],
    optional: []
  },

  // User Controller
  userController: {
    required: [
      'getUsers',
      'getUserById',
      'createUser',
      'updateUserById',
      'deleteUserById',
      'getMyProfile',
      'getMyCompleteProfile',
      'updateMyProfile',
      'updateCompleteProfile',
      'uploadAvatar',
      'updateCoverImage',
      'deleteAvatar',
      'changePassword',
      'getMyFavorites',
      'addToFavorites',
      'removeFromFavorites',
      'checkFavoriteStatus',
      'updateFavorite',
      'getUserStats',
      'getActivityLog',
      'updatePresence'
    ],
    optional: []
  },

  // Auth Controller
  authController: {
    required: [
      'register',
      'login',
      'verifyAccount',
      'resendVerification',
      'forgotPassword',
      'resetPassword',
      'refreshToken',
      'logout',
      'validateToken',
      'changePassword',
      'revokeAllSessions'
    ],
    optional: []
  },

  // Address Controller
  addressController: {
    required: [
      'createAddress',
      'getMyAddresses',
      'deleteAddress',
      'updateAddress',
      'setDefaultAddress',
      'getAddressById'
    ],
    optional: []
  },

  // Favorite Controller
  favoriteController: {
    required: [
      'getUserFavorites',
      'addToFavorites',
      'removeFromFavorites',
      'checkFavoriteStatus',
      'updateFavorite'
    ],
    optional: []
  },

  // Review Controller
  reviewController: {
    required: [
      'addReview',
      'getStoreReviews',
      'getVendorReviews',
      'getVendorReviewStats',
      'replyToReview'
    ],
    optional: []
  },

  // Loyalty Controller
  loyaltyController: {
    required: [
      'getPoints',
      'getRewards',
      'getTransactions',
      'addPoints',
      'redeemPoints',
      'getStats'
    ],
    optional: []
  },

  // Product Controller
  productController: {
    required: [
      'getVendorProducts',
      'getAllProducts',
      'getProductById',
      'createProduct',
      'updateProduct',
      'updateProductImage',
      'deleteProduct',
      'toggleAvailability',
      'updateInventory',
      'toggleFeatured'
    ],
    optional: []
  },

  // Chat Controller
  chatController: {
    required: [
      'getUserConversations',
      'createDirectChat',
      'createOrderChat',
      'createSupportChat',
      'createGroupChat',
      'getConversation',
      'updateConversation',
      'deleteConversation',
      'archiveConversation',
      'muteConversation',
      'unmuteConversation',
      'addParticipant',
      'removeParticipant',
      'getParticipants',
      'makeAdmin',
      'removeAdmin',
      'getConversationMessages',
      'sendTextMessage',
      'sendMediaMessage',
      'sendLocationMessage',
      'sendContactMessage',
      'updateMessage',
      'deleteMessage',
      'forwardMessage',
      'addReaction',
      'removeReaction',
      'pinMessage',
      'unpinMessage',
      'starMessage',
      'unstarMessage',
      'searchMessages',
      'globalSearch',
      'getConversationMedia',
      'getConversationFiles',
      'getConversationLinks',
      'getChatStats',
      'getConversationStats',
      'getOnlineParticipants',
      'getTotalUnreadCount',
      'getSupportConversations',
      'assignSupportAgent',
      'resolveSupportChat',
      'getSupportStats',
      'getAllConversations',
      'adminDeleteConversation',
      'broadcastMessage'
    ],
    optional: []
  },

  // Health Controller
  healthController: {
    required: [
      'quickHealthCheck',
      'fullHealthCheck',
      'readinessProbe',
      'livenessProbe'
    ],
    optional: []
  },

  // Security Controller
  securityController: {
    required: [
      'checkPassword',
      'checkEmail',
      'getSecurityHeaders'
    ],
    optional: []
  },

  // Assets Controller
  assetsController: {
    required: [
      'getImages',
      'getIcons',
      'getDefaultImages'
    ],
    optional: []
  },

  // Analytics Controller
  analyticsController: {
    required: [
      'getUserAnalytics',
      'getOrderAnalytics',
      'getRevenueAnalytics'
    ],
    optional: []
  },

  // Vendor Controller
  vendorController: {
    required: [
      'getMyProfile',
      'updateProfile',
      'updateAvatar',
      'getMyStore',
      'updateStore',
      'updateStoreLogo',
      'updateStoreCover',
      'toggleStoreStatus',
      'getAddresses',
      'createAddress',
      'updateAddress',
      'deleteAddress',
      'getAddressById',
      'getAnalytics',
      'getFinancialReport',
      'getPerformanceReport',
      'getProductAnalytics'
    ],
    optional: []
  }
};

// ========== 2. دوال مساعدة ==========

/**
 * تنسيق النص بألوان (إذا كان chalk متوفراً)
 */
function colorize(text, color) {
  if (chalk && chalk[color]) {
    return chalk[color](text);
  }
  return text;
}

/**
 * طباعة رأس التقرير
 */
function printHeader(title) {
  const line = '='.repeat(60);
  console.log('\n' + colorize(line, 'cyan'));
  console.log(colorize(`🔍 ${title}`, 'cyan'));
  console.log(colorize(line, 'cyan'));
}

/**
 * طباعة نتيجة التحقق
 */
function printResult(controllerName, stats, missingMethods) {
  const status = stats.isValid ? '✅' : '❌';
  const color = stats.isValid ? 'green' : 'red';

  console.log(`\n${colorize(status, color)} ${colorize(controllerName, 'yellow')}`);
  console.log(`   📊 الدوال المطلوبة: ${stats.requiredCount}`);
  console.log(`   📈 الدوال الموجودة: ${stats.existingCount}`);
  console.log(`   📉 الدوال المفقودة: ${stats.missingCount}`);

  if (missingMethods.length > 0) {
    console.log(colorize(`   ⚠️  المفقودة: ${missingMethods.join(', ')}`, 'red'));
  }
}

/**
 * التحقق من وجود دوال في Controller
 */
function validateController(controller, controllerName, requiredMethods, optionalMethods = []) {
  const existing = [];
  const missing = [];
  const optionalExisting = [];
  const optionalMissing = [];

  // التحقق من الدوال المطلوبة
  requiredMethods.forEach(method => {
    if (typeof controller[method] === 'function') {
      existing.push(method);
    } else {
      missing.push(method);
    }
  });

  // التحقق من الدوال الاختيارية
  optionalMethods.forEach(method => {
    if (typeof controller[method] === 'function') {
      optionalExisting.push(method);
    } else {
      optionalMissing.push(method);
    }
  });

  return {
    controllerName,
    requiredCount: requiredMethods.length,
    optionalCount: optionalMethods.length,
    existingCount: existing.length,
    missingCount: missing.length,
    existingMethods: existing,
    missingMethods: missing,
    optionalExisting: optionalExisting,
    optionalMissing: optionalMissing,
    isValid: missing.length === 0,
    details: {
      required: { existing, missing },
      optional: { existing: optionalExisting, missing: optionalMissing }
    }
  };
}

/**
 * التحقق من جميع الـ Controllers
 */
function validateAllControllers() {
  printHeader('التحقق من صحة جميع الـ Controllers');

  const results = [];
  let allValid = true;
  let totalRequired = 0;
  let totalExisting = 0;
  let totalMissing = 0;

  try {
    // استيراد جميع الـ Controllers
    const controllers = require('../controllers');

    // التحقق من كل Controller
    for (const [name, config] of Object.entries(REQUIRED_METHODS)) {
      const controller = controllers[name];

      if (!controller) {
        console.log(`\n❌ ${colorize(name, 'red')} - Controller غير موجود!`);
        allValid = false;
        results.push({
          controllerName: name,
          exists: false,
          isValid: false,
          error: 'Controller not found'
        });
        continue;
      }

      const stats = validateController(
        controller,
        name,
        config.required,
        config.optional
      );

      results.push(stats);

      if (!stats.isValid) {
        allValid = false;
      }

      totalRequired += stats.requiredCount;
      totalExisting += stats.existingCount;
      totalMissing += stats.missingCount;

      printResult(name, stats, stats.missingMethods);
    }

    // طباعة الملخص النهائي
    printHeader('ملخص التحقق النهائي');

    console.log(`\n📊 الإحصائيات العامة:`);
    console.log(`   🎯 إجمالي الدوال المطلوبة: ${totalRequired}`);
    console.log(`   ✅ الدوال الموجودة: ${totalExisting}`);
    console.log(`   ❌ الدوال المفقودة: ${totalMissing}`);
    console.log(`   📈 نسبة الاكتمال: ${((totalExisting / totalRequired) * 100).toFixed(1)}%`);

    if (allValid) {
      console.log(`\n${colorize('🎉 مبروك! جميع الـ Controllers تعمل بشكل صحيح!', 'green')}`);
    } else {
      console.log(`\n${colorize('⚠️  يوجد دوال مفقودة في بعض الـ Controllers', 'yellow')}`);
      console.log(colorize('📝 يرجى إضافة الدوال المفقودة حسب القائمة أعلاه', 'yellow'));
    }

    return {
      success: allValid,
      results,
      summary: {
        totalRequired,
        totalExisting,
        totalMissing,
        completionRate: (totalExisting / totalRequired) * 100,
        controllersChecked: results.length,
        validControllers: results.filter(r => r.isValid).length,
        invalidControllers: results.filter(r => !r.isValid).length
      }
    };

  } catch (error) {
    console.error(`\n${colorize('❌ خطأ في التحقق:', 'red')}`, error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * التحقق من Controller واحد فقط
 */
function validateSingleController(controllerName) {
  printHeader(`التحقق من Controller: ${controllerName}`);

  const config = REQUIRED_METHODS[controllerName];

  if (!config) {
    console.log(`\n${colorize(`❌ لا يوجد تعريف للـ Controller: ${controllerName}`, 'red')}`);
    return null;
  }

  try {
    const controllers = require('../controllers');
    const controller = controllers[controllerName];

    if (!controller) {
      console.log(`\n${colorize(`❌ Controller ${controllerName} غير موجود!`, 'red')}`);
      return null;
    }

    const stats = validateController(
      controller,
      controllerName,
      config.required,
      config.optional
    );

    printResult(controllerName, stats, stats.missingMethods);

    if (stats.missingMethods.length > 0) {
      console.log(`\n${colorize('📝 الدوال المفقودة:', 'yellow')}`);
      stats.missingMethods.forEach(method => {
        console.log(`   - ${method}`);
      });
    }

    return stats;

  } catch (error) {
    console.error(`\n${colorize('❌ خطأ:', 'red')}`, error.message);
    return null;
  }
}

/**
 * تصدير تقرير التحقق إلى ملف
 */
function exportValidationReport() {
  const results = validateAllControllers();
  const reportPath = path.join(__dirname, '../../validation-report.json');

  const report = {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    ...results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 تم حفظ التقرير في: ${reportPath}`);

  return report;
}

/**
 * التحقق السريع (للإستخدام في server.js)
 */
function quickCheck() {
  console.log('\n🚀 بدء التحقق السريع من الـ Controllers...');

  try {
    const controllers = require('../controllers');
    const controllerNames = Object.keys(controllers);

    console.log(`\n📦 الـ Controllers الموجودة: ${controllerNames.length}`);
    controllerNames.forEach(name => {
      const methods = Object.keys(controllers[name]).filter(
        key => typeof controllers[name][key] === 'function'
      );
      console.log(`   ✅ ${name}: ${methods.length} دالة`);
    });

    return {
      success: true,
      controllers: controllerNames,
      count: controllerNames.length
    };

  } catch (error) {
    console.error(`❌ خطأ: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// ========== 3. التصدير ==========

module.exports = {
  // دوال رئيسية
  validateAllControllers,
  validateSingleController,
  validateController,
  exportValidationReport,
  quickCheck,

  // بيانات
  REQUIRED_METHODS,

  // دوال مساعدة للاستخدام المباشر
  checkAll: validateAllControllers,
  checkOne: validateSingleController,
  quick: quickCheck
};