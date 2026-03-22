// ============================================
// ملف: src/routes/vendor.routes.js (المصحح النهائي مع Validation)
// ============================================

const express = require('express');
const router = express.Router();

const { 
  vendorController,
  productController,
  orderController,
  reviewController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const { storeOwnerMiddleware } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// ✅ Validators
const {
  updateProfileSchema,
  avatarSchema
} = require('../validators/user.validator');

const {
  createStoreSchema,
  updateStoreSchema
} = require('../validators/store.validator');

const {
  createProductSchema,
  updateProductSchema,
  updateInventorySchema
} = require('../validators/product.validator');

router.use(auth);

// ========== 1. ملف التاجر الشخصي (فقط التاجر) ==========
router.get('/profile', storeOwnerMiddleware, vendorController.getMyProfile);
router.put('/profile', storeOwnerMiddleware, validate(updateProfileSchema), vendorController.updateProfile);
router.put('/profile/avatar', 
  storeOwnerMiddleware,
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  vendorController.updateAvatar
);

// ========== 2. إدارة المتجر (فقط أصحاب المتاجر) ==========
router.get('/store', storeOwnerMiddleware, vendorController.getMyStore);
router.put('/store', storeOwnerMiddleware, validate(updateStoreSchema), vendorController.updateStore);
router.put('/store/logo', 
  storeOwnerMiddleware,
  upload('stores/logos', ['image']).single('logo'), 
  vendorController.updateStoreLogo
);
router.put('/store/cover', 
  storeOwnerMiddleware,
  upload('stores/covers', ['image']).single('cover'), 
  vendorController.updateStoreCover
);
router.put('/store/toggle-status', storeOwnerMiddleware, vendorController.toggleStoreStatus);

// ========== 3. عناوين المتجر (فقط أصحاب المتاجر) ==========
router.get('/store/addresses', storeOwnerMiddleware, vendorController.getAddresses);
router.post('/store/addresses', storeOwnerMiddleware, vendorController.createAddress);
router.put('/store/addresses/:id', storeOwnerMiddleware, vendorController.updateAddress);
router.delete('/store/addresses/:id', storeOwnerMiddleware, vendorController.deleteAddress);
router.get('/store/addresses/:id', storeOwnerMiddleware, vendorController.getAddressById);

// ========== 4. المنتجات (فقط أصحاب المتاجر) ==========
router.get('/products', storeOwnerMiddleware, PaginationUtils.validatePaginationParams, productController.getVendorProducts);
router.post('/products', 
  storeOwnerMiddleware,
  validate(createProductSchema),
  upload('products', ['image']).single('image'), 
  productController.createProduct
);
router.get('/products/:id', storeOwnerMiddleware, productController.getProductById);
router.put('/products/:id', storeOwnerMiddleware, validate(updateProductSchema), productController.updateProduct);
router.put('/products/:id/image', 
  storeOwnerMiddleware,
  upload('products', ['image']).single('image'), 
  productController.updateProductImage
);
router.delete('/products/:id', storeOwnerMiddleware, productController.deleteProduct);
router.put('/products/:id/toggle-availability', storeOwnerMiddleware, productController.toggleAvailability);
router.put('/products/:id/inventory', storeOwnerMiddleware, validate(updateInventorySchema), productController.updateInventory);

// ========== 5. الطلبات (فقط أصحاب المتاجر) ==========
router.get('/orders', storeOwnerMiddleware, PaginationUtils.validatePaginationParams, orderController.getVendorOrders);
router.get('/orders/:id', storeOwnerMiddleware, orderController.getOrderDetails);
router.put('/orders/:id/accept', storeOwnerMiddleware, orderController.acceptOrder);
router.put('/orders/:id/reject', storeOwnerMiddleware, orderController.rejectOrder);
router.put('/orders/:id/mark-ready', storeOwnerMiddleware, orderController.markOrderReady);
router.put('/orders/:id/start-preparing', storeOwnerMiddleware, orderController.startPreparing);
router.get('/orders/today', storeOwnerMiddleware, orderController.getTodayOrders);
router.get('/orders/stats', storeOwnerMiddleware, orderController.getVendorOrderStats);

// ========== 6. التحليلات (فقط أصحاب المتاجر) ==========
router.get('/analytics', storeOwnerMiddleware, vendorController.getAnalytics);
router.get('/analytics/financial', storeOwnerMiddleware, vendorController.getFinancialReport);
router.get('/analytics/performance', storeOwnerMiddleware, vendorController.getPerformanceReport);
router.get('/analytics/products', storeOwnerMiddleware, vendorController.getProductAnalytics);

// ========== 7. التقييمات (فقط أصحاب المتاجر) ==========
router.get('/reviews', storeOwnerMiddleware, PaginationUtils.validatePaginationParams, reviewController.getVendorReviews);
router.get('/reviews/stats', storeOwnerMiddleware, reviewController.getVendorReviewStats);
router.post('/reviews/:id/reply', storeOwnerMiddleware, reviewController.replyToReview);

module.exports = router;