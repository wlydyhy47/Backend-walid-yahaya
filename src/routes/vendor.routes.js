// ============================================
// ملف: src/routes/vendor.routes.js (المصحح بالكامل)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد الـ Controllers
const { 
  vendorController,
  productController,
  orderController,
  reviewController
} = require('../controllers');

// ✅ استيراد الـ middlewares
const auth = require('../middlewares/auth.middleware');
const { storeOwnerMiddleware } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// جميع مسارات التاجر تحتاج توثيق وصلاحية صاحب متجر
router.use(auth);
router.use(storeOwnerMiddleware);

// ========== 1. ملف التاجر الشخصي ==========
router.get('/profile', vendorController.getMyProfile);
router.put('/profile', vendorController.updateProfile);

// ✅ تم تفعيل مسار رفع الصورة الشخصية
router.put('/profile/avatar', 
  upload('users/avatars', ['image']).single('image'), 
  vendorController.updateAvatar
);

// ========== 2. إدارة المتجر ==========
router.get('/store', vendorController.getMyStore);
router.put('/store', vendorController.updateStore);

// ✅ تم تفعيل مسارات رفع صور المتجر
router.put('/store/logo', 
  upload('stores/logos', ['image']).single('logo'), 
  vendorController.updateStoreLogo
);

router.put('/store/cover', 
  upload('stores/covers', ['image']).single('cover'), 
  vendorController.updateStoreCover
);

router.put('/store/toggle-status', vendorController.toggleStoreStatus);

// ========== 3. عناوين المتجر ==========
router.get('/store/addresses', vendorController.getAddresses);
router.post('/store/addresses', vendorController.createAddress);
router.put('/store/addresses/:id', vendorController.updateAddress);
router.delete('/store/addresses/:id', vendorController.deleteAddress);
router.get('/store/addresses/:id', vendorController.getAddressById);

// ========== 4. المنتجات ==========
router.get('/products', PaginationUtils.validatePaginationParams, productController.getVendorProducts);

// ✅ تم تفعيل مسار إنشاء المنتج مع رفع الصورة
router.post('/products', 
  upload('products', ['image']).single('image'), 
  productController.createProduct
);

router.get('/products/:id', productController.getProductById);
router.put('/products/:id', productController.updateProduct);

// ✅ تم تفعيل مسار تحديث صورة المنتج
router.put('/products/:id/image', 
  upload('products', ['image']).single('image'), 
  productController.updateProductImage
);

router.delete('/products/:id', productController.deleteProduct);
router.put('/products/:id/toggle-availability', productController.toggleAvailability);
router.put('/products/:id/inventory', productController.updateInventory);

// ========== 5. الطلبات ==========
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getVendorOrders);
router.get('/orders/:id', orderController.getOrderDetails);
router.put('/orders/:id/accept', orderController.acceptOrder);
router.put('/orders/:id/reject', orderController.rejectOrder);
router.put('/orders/:id/mark-ready', orderController.markOrderReady);
router.put('/orders/:id/start-preparing', orderController.startPreparing);
router.get('/orders/today', orderController.getTodayOrders);
router.get('/orders/stats', orderController.getVendorOrderStats);

// ========== 6. التحليلات ==========
router.get('/analytics', vendorController.getAnalytics);
router.get('/analytics/financial', vendorController.getFinancialReport);
router.get('/analytics/performance', vendorController.getPerformanceReport);
router.get('/analytics/products', vendorController.getProductAnalytics);

// ========== 7. التقييمات ==========
router.get('/reviews', PaginationUtils.validatePaginationParams, reviewController.getVendorReviews);
router.get('/reviews/stats', reviewController.getVendorReviewStats);
router.post('/reviews/:id/reply', reviewController.replyToReview);

module.exports = router;