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
const handleFormData = require('../middlewares/formDataHandler');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

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
router.use(storeOwnerMiddleware);

router.get('/profile', vendorController.getMyProfile);

router.put('/profile', validate(updateProfileSchema), vendorController.updateProfile);

router.put('/profile/avatar', 
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  vendorController.updateAvatar
);

router.get('/store', vendorController.getMyStore);

router.put('/store', validate(updateStoreSchema), vendorController.updateStore);

router.put('/store/logo', 
  upload('stores/logos', ['image']).single('logo'), 
  vendorController.updateStoreLogo
);

router.put('/store/cover', 
  upload('stores/covers', ['image']).single('cover'), 
  vendorController.updateStoreCover
);

router.put('/store/toggle-status', vendorController.toggleStoreStatus);

router.get('/store/addresses', vendorController.getAddresses);

router.post('/store/addresses', vendorController.createAddress);

router.put('/store/addresses/:id', vendorController.updateAddress);

router.delete('/store/addresses/:id', vendorController.deleteAddress);

router.get('/store/addresses/:id', vendorController.getAddressById);

router.get('/products', PaginationUtils.validatePaginationParams, productController.getVendorProducts);

router.post('/products', 
  validate(createProductSchema),
  upload('products', ['image']).single('image'),
  handleFormData, 
  productController.createProduct
);

router.get('/products/:id', productController.getProductById);

router.put('/products/:id',
  validate(updateProductSchema),
  handleFormData,
  productController.updateProduct
);

router.put('/products/:id/image', 
  upload('products', ['image']).single('image'), 
  productController.updateProductImage
);

router.delete('/products/:id', productController.deleteProduct);

router.put('/products/:id/toggle-availability', productController.toggleAvailability);

router.put('/products/:id/inventory', validate(updateInventorySchema), productController.updateInventory);

// ========== مسارات الطلبات - الثابتة أولاً ==========
// 1. المسارات الثابتة (بدون :id)
router.get('/orders/stats', orderController.getVendorOrderStats);
router.get('/orders/today', orderController.getTodayOrders);
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getVendorOrders);

// 2. المسارات الديناميكية (تحتوي على :id) - تأتي بعد الثابتة
router.get('/orders/:id', orderController.getOrderDetails);
router.put('/orders/:id/accept', orderController.acceptOrder);
router.put('/orders/:id/reject', orderController.rejectOrder);
router.put('/orders/:id/start-preparing', orderController.startPreparing);
router.put('/orders/:id/mark-ready', orderController.markOrderReady);

router.get('/analytics', vendorController.getAnalytics);

router.get('/analytics/financial', vendorController.getFinancialReport);

router.get('/analytics/performance', vendorController.getPerformanceReport);

router.get('/analytics/products', vendorController.getProductAnalytics);

router.get('/reviews', PaginationUtils.validatePaginationParams, reviewController.getVendorReviews);

router.get('/reviews/stats', reviewController.getVendorReviewStats);

router.post('/reviews/:id/reply', reviewController.replyToReview);

module.exports = router;