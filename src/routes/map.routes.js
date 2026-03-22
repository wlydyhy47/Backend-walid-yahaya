// ============================================
// ملف: src/routes/map.routes.js
// الوصف: مسارات الخرائط لجميع الأدوار
// ============================================

const express = require('express');
const router = express.Router();

const mapController = require('../controllers/map.controller');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const { driverMiddleware, storeOwnerMiddleware } = require('../middlewares/role.middleware');

// جميع المسارات تحتاج توثيق
router.use(auth);

// ========== 1. مسارات عامة (لجميع المستخدمين) ==========

// حساب المسار بين نقطتين
router.post('/directions', mapController.getDirections);

// البحث عن عنوان
router.get('/geocode', mapController.geocode);

// الحصول على عنوان من إحداثيات
router.get('/reverse-geocode', mapController.reverseGeocode);

// حساب المسافة بين نقاط
router.post('/distance', mapController.calculateDistance);

// الحصول على صورة ثابتة للخريطة
router.get('/static', mapController.getStaticMap);

// الحصول على جميع المتاجر على الخريطة
router.get('/stores', mapController.getStoresMap);

// ========== 2. مسارات العملاء ==========

// تتبع طلب محدد (مسار كامل)
router.get('/order/:orderId/route', mapController.getOrderRoute);

// تتبع مندوب محدد
router.get('/driver/:driverId/track', mapController.trackDriver);

// ========== 3. مسارات المندوبين ==========

// تحديث موقع المندوب
router.put('/driver/location', driverMiddleware, mapController.updateDriverLocation);

// الحصول على مسار الطلب الحالي
router.get('/driver/current-route', driverMiddleware, async (req, res) => {
  try {
    const driverId = req.user.id;
    const currentOrder = await require('../models/order.model').findOne({
      driver: driverId,
      status: { $in: ['accepted', 'picked'] }
    });

    if (!currentOrder) {
      return res.json({ success: true, data: null });
    }

    const route = await mapController.getOrderRoute({
      params: { orderId: currentOrder._id },
      user: req.user
    }, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== 4. مسارات أصحاب المتاجر ==========

// الحصول على منطقة التوصيل (Isochrone)
router.get('/store/:storeId/isochrone', storeOwnerMiddleware, mapController.getStoreIsochrone);

// العثور على أقرب مندوب للمتجر
router.post('/store/nearest-driver', storeOwnerMiddleware, mapController.findNearestDriver);

// ========== 5. مسارات الأدمن ==========

// العثور على أقرب مندوب
router.post('/nearest-driver', role('admin'), mapController.findNearestDriver);

// إحصائيات مواقع المندوبين
router.get('/drivers/locations', role('admin'), async (req, res) => {
  try {
    const DriverLocation = require('../models/driverLocation.model');
    
    const locations = await DriverLocation.find()
      .populate('driver', 'name phone rating driverInfo.isAvailable')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      data: locations.map(loc => ({
        driver: loc.driver,
        location: {
          latitude: loc.location.coordinates[1],
          longitude: loc.location.coordinates[0]
        },
        accuracy: loc.accuracy,
        speed: loc.speed,
        updatedAt: loc.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// تتبع جميع المندوبين
router.get('/drivers/track-all', role('admin'), async (req, res) => {
  try {
    const DriverLocation = require('../models/driverLocation.model');
    
    const drivers = await DriverLocation.find()
      .populate('driver', 'name phone rating')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: drivers.map(d => ({
        driver: d.driver,
        location: {
          latitude: d.location.coordinates[1],
          longitude: d.location.coordinates[0]
        },
        lastUpdate: d.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;