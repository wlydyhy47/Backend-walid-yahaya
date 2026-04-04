// ============================================
// ملف: src/routes/map.routes.js
// الوصف: مسارات الخرائط والتتبع الموحدة
// الإصدار: 3.0
// ============================================

const express = require('express');
const router = express.Router();

const { validateCoordinates, validateRoute } = require('../middlewares/map.middleware');
const mapController = require('../controllers/map.controller');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const { driverMiddleware, storeOwnerMiddleware } = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: 🗺️ Map
 *   description: خدمات الخرائط والتتبع والملاحة
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Location:
 *       type: object
 *       properties:
 *         latitude:
 *           type: number
 *           example: 24.7136
 *         longitude:
 *           type: number
 *           example: 46.6753
 *         address:
 *           type: string
 *           example: شارع الملك فهد، الرياض
 *     
 *     Route:
 *       type: object
 *       properties:
 *         distance:
 *           type: number
 *           description: المسافة بالمتر
 *           example: 1250
 *         distanceKm:
 *           type: number
 *           description: المسافة بالكيلومتر
 *           example: 1.25
 *         duration:
 *           type: number
 *           description: المدة بالثواني
 *           example: 540
 *         durationMinutes:
 *           type: number
 *           description: المدة بالدقائق
 *           example: 9
 *         geometry:
 *           type: object
 *           description: مسار الخط على الخريطة
 *         steps:
 *           type: array
 *           description: خطوات التوجيه
 *     
 *     DriverLocation:
 *       type: object
 *       properties:
 *         driverId:
 *           type: string
 *         location:
 *           $ref: '#/components/schemas/Location'
 *         accuracy:
 *           type: number
 *         speed:
 *           type: number
 *         heading:
 *           type: number
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// جميع المسارات تحتاج توثيق
router.use(auth);

// ========== 1. مسارات عامة (لجميع المستخدمين) ==========

/**
 * @swagger
 * /map/directions:
 *   post:
 *     summary: حساب المسار بين نقطتين
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - origin
 *               - destination
 *             properties:
 *               origin:
 *                 type: object
 *                 required:
 *                   - latitude
 *                   - longitude
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 24.7136
 *                   longitude:
 *                     type: number
 *                     example: 46.6753
 *                   address:
 *                     type: string
 *               destination:
 *                 type: object
 *                 required:
 *                   - latitude
 *                   - longitude
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 24.7210
 *                   longitude:
 *                     type: number
 *                     example: 46.6820
 *               profile:
 *                 type: string
 *                 enum: [driving, walking, cycling]
 *                 default: driving
 *               alternatives:
 *                 type: boolean
 *                 default: false
 *                 description: إظهار مسارات بديلة
 *     responses:
 *       200:
 *         description: تم حساب المسار بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Route'
 *       400:
 *         description: إحداثيات غير صحيحة
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/directions',
  validateRoute,
  mapController.getDirections);

/**
 * @swagger
 * /map/geocode:
 *   get:
 *     summary: تحويل عنوان إلى إحداثيات (Geocoding)
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         example: شارع الملك فهد، الرياض
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           default: ar
 *     responses:
 *       200:
 *         description: قائمة النتائج
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       latitude:
 *                         type: number
 *                       longitude:
 *                         type: number
 *                       formattedAddress:
 *                         type: string
 *                       confidence:
 *                         type: number
 *       400:
 *         description: العنوان مطلوب
 */
router.get('/geocode', mapController.geocode);

/**
 * @swagger
 * /map/reverse-geocode:
 *   get:
 *     summary: تحويل إحداثيات إلى عنوان (Reverse Geocoding)
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *         example: 24.7136
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *         example: 46.6753
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           default: ar
 *     responses:
 *       200:
 *         description: العنوان
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     street:
 *                       type: string
 *                     city:
 *                       type: string
 *                     country:
 *                       type: string
 *                     coordinates:
 *                       $ref: '#/components/schemas/Location'
 */
router.get('/reverse-geocode', mapController.reverseGeocode);

/**
 * @swagger
 * /map/distance:
 *   post:
 *     summary: حساب المسافة بين عدة نقاط
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - points
 *             properties:
 *               points:
 *                 type: array
 *                 minItems: 2
 *                 items:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *               profile:
 *                 type: string
 *                 enum: [driving, walking, cycling]
 *                 default: driving
 *     responses:
 *       200:
 *         description: المسافات المحسوبة
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     matrix:
 *                       type: array
 *                     distances:
 *                       type: array
 *                     durations:
 *                       type: array
 */
router.post('/distance', mapController.calculateDistance);

/**
 * @swagger
 * /map/static:
 *   get:
 *     summary: الحصول على صورة ثابتة للخريطة
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: zoom
 *         schema:
 *           type: integer
 *           default: 13
 *           minimum: 1
 *           maximum: 19
 *       - in: query
 *         name: width
 *         schema:
 *           type: integer
 *           default: 600
 *           maximum: 2000
 *       - in: query
 *         name: height
 *         schema:
 *           type: integer
 *           default: 400
 *           maximum: 2000
 *       - in: query
 *         name: markers
 *         schema:
 *           type: string
 *         description: علامات على الخريطة (lat,lng,color,label)
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: مسار على الخريطة
 *     responses:
 *       200:
 *         description: رابط الصورة
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 */
router.get('/static', mapController.getStaticMap);

/**
 * @swagger
 * /map/stores:
 *   get:
 *     summary: الحصول على جميع المتاجر على الخريطة
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: integer
 *           default: 5000
 *           description: نصف القطر بالمتر
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: openNow
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: قائمة المتاجر مع مواقعها
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     stores:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           logo:
 *                             type: string
 *                           category:
 *                             type: string
 *                           rating:
 *                             type: number
 *                           deliveryFee:
 *                             type: number
 *                           location:
 *                             $ref: '#/components/schemas/Location'
 *                     count:
 *                       type: integer
 */
router.get('/stores', mapController.getStoresMap);

// ========== 2. مسارات العملاء ==========

/**
 * @swagger
 * /map/order/{orderId}/route:
 *   get:
 *     summary: تتبع مسار طلب محدد (للعميل)
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: مسار الطلب وموقع المندوب
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     order:
 *                       $ref: '#/components/schemas/Order'
 *                     driverLocation:
 *                       $ref: '#/components/schemas/Location'
 *                     route:
 *                       $ref: '#/components/schemas/Route'
 *                     estimatedArrival:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: ليس لديك صلاحية لتتبع هذا الطلب
 *       404:
 *         description: الطلب غير موجود
 */
router.get('/order/:orderId/route', mapController.getOrderRoute);

/**
 * @swagger
 * /map/driver/{driverId}/track:
 *   get:
 *     summary: تتبع مندوب محدد في الوقت الحقيقي
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: موقع المندوب الحالي
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/DriverLocation'
 */
router.get('/driver/:driverId/track', mapController.trackDriver);

// ========== 3. مسارات المندوبين ==========

/**
 * @swagger
 * /map/driver/location:
 *   put:
 *     summary: تحديث موقع المندوب الحالي
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 example: 24.7136
 *               longitude:
 *                 type: number
 *                 example: 46.6753
 *               accuracy:
 *                 type: number
 *                 example: 10
 *                 description: دقة الموقع بالمتر
 *               heading:
 *                 type: number
 *                 example: 180
 *                 description: الاتجاه بالدرجات
 *               speed:
 *                 type: number
 *                 example: 45
 *                 description: السرعة كم/ساعة
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: تم تحديث الموقع
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     location:
 *                       $ref: '#/components/schemas/Location'
 *                     accuracy:
 *                       type: number
 *                     heading:
 *                       type: number
 *                     speed:
 *                       type: number
 *                     timestamp:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح - يتطلب دور مندوب
 */
router.put('/driver/location',
  driverMiddleware,
  validateCoordinates,
  mapController.updateDriverLocation);

/**
 * @swagger
 * /map/driver/current-route:
 *   get:
 *     summary: الحصول على مسار الطلب الحالي للمندوب
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: مسار الطلب الحالي
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     order:
 *                       $ref: '#/components/schemas/Order'
 *                     route:
 *                       $ref: '#/components/schemas/Route'
 *                     currentLocation:
 *                       $ref: '#/components/schemas/Location'
 *       204:
 *         description: لا يوجد طلب حالي
 */
router.get('/driver/current-route', driverMiddleware, async (req, res) => {
  try {
    const driverId = req.user.id;
    const Order = require('../models/order.model');

    const currentOrder = await Order.findOne({
      driver: driverId,
      status: { $in: ['accepted', 'picked'] }
    });

    if (!currentOrder) {
      return res.json({ success: true, data: null, message: 'لا يوجد طلب حالي' });
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

/**
 * @swagger
 * /map/store/{storeId}/isochrone:
 *   get:
 *     summary: الحصول على منطقة التوصيل للمتجر (Isochrone)
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: minutes
 *         schema:
 *           type: integer
 *           default: 15
 *           description: وقت التوصيل بالدقائق
 *       - in: query
 *         name: profile
 *         schema:
 *           type: string
 *           enum: [driving, walking, cycling]
 *           default: driving
 *     responses:
 *       200:
 *         description: منطقة التوصيل على شكل مضلع
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     store:
 *                       type: object
 *                     isochrone:
 *                       type: object
 */
router.get('/store/:storeId/isochrone', storeOwnerMiddleware, mapController.getStoreIsochrone);

/**
 * @swagger
 * /map/store/nearest-driver:
 *   post:
 *     summary: العثور على أقرب مندوب للمتجر
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               radius:
 *                 type: integer
 *                 default: 5000
 *                 description: نصف القطر بالمتر
 *               limit:
 *                 type: integer
 *                 default: 10
 *               filters:
 *                 type: object
 *                 properties:
 *                   minRating:
 *                     type: number
 *                   isAvailable:
 *                     type: boolean
 *                   status:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [online, available]
 *     responses:
 *       200:
 *         description: قائمة أقرب المندوبين
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     drivers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           driver:
 *                             type: object
 *                           distance:
 *                             type: number
 *                           distanceKm:
 *                             type: number
 *                           duration:
 *                             type: number
 *                           durationMinutes:
 *                             type: number
 *                     nearest:
 *                       type: object
 */
router.post('/store/nearest-driver', storeOwnerMiddleware, mapController.findNearestDriver);

// ========== 5. مسارات الأدمن ==========

/**
 * @swagger
 * /map/nearest-driver:
 *   post:
 *     summary: العثور على أقرب مندوب (للمشرف)
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               radius:
 *                 type: integer
 *                 default: 5000
 *               limit:
 *                 type: integer
 *                 default: 10
 *               filters:
 *                 type: object
 *                 properties:
 *                   minRating:
 *                     type: number
 *                   isAvailable:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: قائمة أقرب المندوبين
 */
router.post('/nearest-driver',
   role('admin'),
   validateCoordinates,
    mapController.findNearestDriver);

/**
 * @swagger
 * /map/drivers/locations:
 *   get:
 *     summary: مواقع جميع المندوبين (للمشرف)
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [online, offline, busy]
 *       - in: query
 *         name: updatedAfter
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: مواقع المندوبين
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       driver:
 *                         type: object
 *                       location:
 *                         $ref: '#/components/schemas/Location'
 *                       accuracy:
 *                         type: number
 *                       speed:
 *                         type: number
 *                       heading:
 *                         type: number
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 */
router.get('/drivers/locations', role('admin'), async (req, res) => {
  try {
    const DriverLocation = require('../models/driverLocation.model');
    const { limit = 100, status, updatedAfter } = req.query;

    let query = {};
    if (updatedAfter) {
      query.createdAt = { $gte: new Date(updatedAfter) };
    }

    const locations = await DriverLocation.find(query)
      .populate('driver', 'name phone email rating driverInfo.isAvailable driverInfo.status')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    let filteredLocations = locations;
    if (status) {
      filteredLocations = locations.filter(loc =>
        loc.driver?.driverInfo?.status === status
      );
    }

    res.json({
      success: true,
      data: filteredLocations.map(loc => ({
        driver: loc.driver,
        location: {
          latitude: loc.location.coordinates[1],
          longitude: loc.location.coordinates[0]
        },
        accuracy: loc.accuracy,
        speed: loc.speed,
        heading: loc.heading,
        updatedAt: loc.createdAt
      })),
      count: filteredLocations.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @swagger
 * /map/drivers/track-all:
 *   get:
 *     summary: تتبع جميع المندوبين في الوقت الحقيقي
 *     tags: [🗺️ Map]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: مواقع جميع المندوبين مع معلوماتهم
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       driver:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           phone:
 *                             type: string
 *                           rating:
 *                             type: number
 *                           status:
 *                             type: string
 *                           isAvailable:
 *                             type: boolean
 *                       location:
 *                         $ref: '#/components/schemas/Location'
 *                       accuracy:
 *                         type: number
 *                       speed:
 *                         type: number
 *                       heading:
 *                         type: number
 *                       lastUpdate:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 */
router.get('/drivers/track-all', role('admin'), async (req, res) => {
  try {
    const DriverLocation = require('../models/driverLocation.model');

    const drivers = await DriverLocation.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$driver',
          lastLocation: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      {
        $unwind: '$driverInfo'
      },
      {
        $project: {
          driver: {
            id: '$_id',
            name: '$driverInfo.name',
            phone: '$driverInfo.phone',
            rating: '$driverInfo.rating',
            status: '$driverInfo.driverInfo.status',
            isAvailable: '$driverInfo.driverInfo.isAvailable'
          },
          location: {
            latitude: { $arrayElemAt: ['$lastLocation.location.coordinates', 1] },
            longitude: { $arrayElemAt: ['$lastLocation.location.coordinates', 0] }
          },
          accuracy: '$lastLocation.accuracy',
          speed: '$lastLocation.speed',
          heading: '$lastLocation.heading',
          lastUpdate: '$lastLocation.createdAt'
        }
      }
    ]);

    res.json({
      success: true,
      data: drivers,
      count: drivers.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;