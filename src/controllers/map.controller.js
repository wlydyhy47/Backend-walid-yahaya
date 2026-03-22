// ============================================
// ملف: src/controllers/map.controller.js
// الوصف: التحكم في عمليات الخرائط
// ============================================

const mapboxService = require('../services/mapbox.service');
const { Order, DriverLocation, Store, Address, User } = require('../models');
const cache = require('../utils/cache.util');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال المسارات والاتجاهات ==========

/**
 * @desc    حساب المسار بين نقطتين
 * @route   POST /api/map/directions
 * @access  Authenticated
 */
exports.getDirections = async (req, res) => {
  try {
    const { origin, destination, profile = 'driving' } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Origin and destination are required'
      });
    }

    const result = await mapboxService.getDirections(origin, destination, { profile });

    res.json({
      success: result.success,
      data: result.data,
      message: result.success ? 'Route calculated successfully' : result.error
    });
  } catch (error) {
    console.error('❌ Directions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate route'
    });
  }
};

/**
 * @desc    الحصول على المسار لطلب معين
 * @route   GET /api/map/order/:orderId/route
 * @access  Authenticated (Client, Driver, Admin)
 */
exports.getOrderRoute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await Order.findById(orderId)
      .populate('pickupAddress')
      .populate('deliveryAddress');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // التحقق من الصلاحيات
    const isOwner = order.user.toString() === userId;
    const isDriver = order.driver?.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isOwner && !isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // جلب موقع المندوب الحالي
    let driverLocation = null;
    if (order.driver) {
      const driverLoc = await DriverLocation.findOne({
        driver: order.driver,
        order: orderId
      }).sort({ createdAt: -1 });
      
      if (driverLoc) {
        driverLocation = {
          latitude: driverLoc.location.coordinates[1],
          longitude: driverLoc.location.coordinates[0]
        };
      }
    }

    // حساب المسار من المندوب إلى الوجهة
    let driverToDestination = null;
    if (driverLocation && order.deliveryAddress?.latitude && order.deliveryAddress?.longitude) {
      driverToDestination = await mapboxService.getDirections(
        driverLocation,
        {
          latitude: order.deliveryAddress.latitude,
          longitude: order.deliveryAddress.longitude
        }
      );
    }

    // حساب المسار الكامل
    const fullRoute = await mapboxService.getDirections(
      {
        latitude: order.pickupAddress?.latitude || order.pickupAddress?.location?.coordinates?.[1],
        longitude: order.pickupAddress?.longitude || order.pickupAddress?.location?.coordinates?.[0]
      },
      {
        latitude: order.deliveryAddress.latitude,
        longitude: order.deliveryAddress.longitude
      }
    );

    res.json({
      success: true,
      data: {
        orderId: order._id,
        pickup: {
          address: order.pickupAddress,
          location: {
            latitude: order.pickupAddress?.latitude,
            longitude: order.pickupAddress?.longitude
          }
        },
        delivery: {
          address: order.deliveryAddress,
          location: {
            latitude: order.deliveryAddress.latitude,
            longitude: order.deliveryAddress.longitude
          }
        },
        driverLocation,
        driverToDestination: driverToDestination?.data || null,
        fullRoute: fullRoute?.data || null,
        estimatedDelivery: order.estimatedDeliveryTime
      }
    });
  } catch (error) {
    console.error('❌ Order route error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order route'
    });
  }
};

// ========== 2. دوال البحث عن العناوين ==========

/**
 * @desc    البحث عن عنوان (تحويل نص إلى إحداثيات)
 * @route   GET /api/map/geocode
 * @access  Authenticated
 */
exports.geocode = async (req, res) => {
  try {
    const { address, limit = 5 } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }

    const result = await mapboxService.forwardGeocode(address);

    res.json({
      success: result.success,
      data: result.data?.slice(0, limit),
      suggestions: result.suggestions?.slice(0, limit)
    });
  } catch (error) {
    console.error('❌ Geocode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to geocode address'
    });
  }
};

/**
 * @desc    الحصول على عنوان من إحداثيات
 * @route   GET /api/map/reverse-geocode
 * @access  Authenticated
 */
exports.reverseGeocode = async (req, res) => {
  try {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }

    const result = await mapboxService.reverseGeocode(parseFloat(longitude), parseFloat(latitude));

    res.json(result);
  } catch (error) {
    console.error('❌ Reverse geocode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse geocode'
    });
  }
};

// ========== 3. دوال المندوبين ==========

/**
 * @desc    العثور على أقرب مندوب
 * @route   POST /api/map/nearest-driver
 * @access  Admin / Vendor
 */
exports.findNearestDriver = async (req, res) => {
  try {
    const { latitude, longitude, radius = 5000, limit = 10 } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    // جلب المندوبين المتاحين
    const drivers = await DriverLocation.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: radius
        }
      }
    })
      .populate('driver', 'name phone rating driverInfo.isAvailable')
      .limit(limit)
      .lean();

    if (!drivers.length) {
      return res.json({
        success: true,
        data: [],
        message: 'No drivers found nearby'
      });
    }

    // حساب المسافات باستخدام Mapbox
    const driversLocations = drivers.map(d => ({
      id: d.driver._id,
      name: d.driver.name,
      latitude: d.location.coordinates[1],
      longitude: d.location.coordinates[0]
    }));

    const result = await mapboxService.findNearestDriver(
      driversLocations,
      { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
    );

    res.json({
      success: true,
      data: {
        drivers: result.data.all.map(d => ({
          ...d.driver,
          distance: d.distance,
          distanceKm: d.distance ? (d.distance / 1000).toFixed(2) : null,
          duration: d.duration,
          durationMinutes: d.durationMinutes
        })),
        nearest: result.data.nearest ? {
          ...result.data.nearest.driver,
          distance: result.data.nearest.distance,
          distanceKm: (result.data.nearest.distance / 1000).toFixed(2),
          durationMinutes: result.data.nearest.durationMinutes
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Find nearest driver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearest driver'
    });
  }
};

/**
 * @desc    تحديث موقع المندوب
 * @route   PUT /api/map/driver/location
 * @access  Driver
 */
exports.updateDriverLocation = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { latitude, longitude, accuracy, heading, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // تحديث الموقع في قاعدة البيانات
    const location = await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      {
        driver: driverId,
        location: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        accuracy,
        heading,
        speed,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    // تحديث موقع المندوب في User
    await User.findByIdAndUpdate(driverId, {
      'driverInfo.currentLocation': {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      }
    });

    // إرسال تحديث عبر Socket.io للطلبات النشطة
    const activeOrders = await Order.find({
      driver: driverId,
      status: { $in: ['accepted', 'picked'] }
    });

    const io = req.app.get('io');
    if (io) {
      activeOrders.forEach(order => {
        io.to(`order:${order._id}`).emit('driver:location:updated', {
          orderId: order._id,
          driverId,
          location: { latitude, longitude },
          accuracy,
          heading,
          speed,
          timestamp: new Date()
        });
      });
    }

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        location: { latitude, longitude },
        accuracy,
        heading,
        speed,
        timestamp: location.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Update driver location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
};

// ========== 4. دوال التتبع في الوقت الحقيقي ==========

/**
 * @desc    تتبع موقع المندوب في الوقت الحقيقي
 * @route   GET /api/map/driver/:driverId/track
 * @access  Client / Admin / Vendor
 */
exports.trackDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // التحقق من الصلاحيات
    if (userRole !== 'admin') {
      // التحقق من أن المستخدم لديه طلب مع هذا المندوب
      const order = await Order.findOne({
        driver: driverId,
        user: userId,
        status: { $in: ['accepted', 'picked'] }
      });

      if (!order && userRole !== 'vendor') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // جلب آخر موقع للمندوب
    const location = await DriverLocation.findOne({ driver: driverId })
      .sort({ createdAt: -1 })
      .lean();

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Driver location not found'
      });
    }

    // جلب معلومات المندوب
    const driver = await User.findById(driverId)
      .select('name phone image rating driverInfo');

    // جلب المسار الأخير (آخر 30 موقع)
    const history = await DriverLocation.find({
      driver: driverId,
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
    })
      .sort({ createdAt: 1 })
      .select('location createdAt')
      .lean();

    res.json({
      success: true,
      data: {
        driver: {
          id: driver._id,
          name: driver.name,
          phone: driver.phone,
          image: driver.image,
          rating: driver.rating,
          isAvailable: driver.driverInfo?.isAvailable
        },
        currentLocation: {
          latitude: location.location.coordinates[1],
          longitude: location.location.coordinates[0],
          accuracy: location.accuracy,
          heading: location.heading,
          speed: location.speed,
          updatedAt: location.createdAt
        },
        history: history.map(h => ({
          latitude: h.location.coordinates[1],
          longitude: h.location.coordinates[0],
          timestamp: h.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('❌ Track driver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track driver'
    });
  }
};

// ========== 5. دوال المتاجر ==========

/**
 * @desc    الحصول على موقع المتجر مع المنطقة الزمنية
 * @route   GET /api/map/store/:storeId/isochrone
 * @access  Vendor / Admin
 */
exports.getStoreIsochrone = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { minutes = 15, profile = 'driving' } = req.query;

    const store = await Store.findById(storeId);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    if (!store.location || !store.location.coordinates) {
      return res.status(400).json({
        success: false,
        message: 'Store location not set'
      });
    }

    const isochrone = await mapboxService.getIsochrone(
      {
        longitude: store.location.coordinates[0],
        latitude: store.location.coordinates[1]
      },
      parseInt(minutes),
      profile
    );

    res.json({
      success: true,
      data: {
        store: {
          id: store._id,
          name: store.name,
          location: {
            latitude: store.location.coordinates[1],
            longitude: store.location.coordinates[0]
          }
        },
        isochrone: isochrone.data,
        message: `Area reachable within ${minutes} minutes`
      }
    });
  } catch (error) {
    console.error('❌ Store isochrone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get store delivery area'
    });
  }
};

/**
 * @desc    الحصول على جميع المتاجر على الخريطة
 * @route   GET /api/map/stores
 * @access  Public / Client
 */
exports.getStoresMap = async (req, res) => {
  try {
    const { lat, lng, radius = 5000, category, openNow } = req.query;

    let query = { isOpen: true };

    if (category) {
      query.category = category;
    }

    if (openNow === 'true') {
      const day = new Date().getDay();
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = days[day];
      query[`openingHours.${today}.isOpen`] = true;
    }

    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      };
    }

    const stores = await Store.find(query)
      .select('name logo category averageRating deliveryInfo location')
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: {
        stores: stores.map(store => ({
          id: store._id,
          name: store.name,
          logo: store.logo,
          category: store.category,
          rating: store.averageRating,
          deliveryFee: store.deliveryInfo?.deliveryFee,
          location: store.location ? {
            latitude: store.location.coordinates[1],
            longitude: store.location.coordinates[0]
          } : null
        })),
        count: stores.length
      }
    });
  } catch (error) {
    console.error('❌ Get stores map error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stores'
    });
  }
};

// ========== 6. دوال المساعدة ==========

/**
 * @desc    حساب المسافة بين نقطتين
 * @route   POST /api/map/distance
 * @access  Authenticated
 */
exports.calculateDistance = async (req, res) => {
  try {
    const { points } = req.body;

    if (!points || points.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 points are required'
      });
    }

    const result = await mapboxService.getDistanceMatrix(points);

    res.json(result);
  } catch (error) {
    console.error('❌ Calculate distance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate distance'
    });
  }
};

/**
 * @desc    الحصول على صورة ثابتة للخريطة
 * @route   GET /api/map/static
 * @access  Authenticated
 */
exports.getStaticMap = async (req, res) => {
  try {
    const { lat, lng, zoom = 13, width = 600, height = 400, markers } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Center coordinates are required'
      });
    }

    let markersArray = [];
    if (markers) {
      markersArray = JSON.parse(markers);
    }

    const imageUrl = mapboxService.getStaticMapImage(
      { latitude: parseFloat(lat), longitude: parseFloat(lng) },
      parseInt(zoom),
      parseInt(width),
      parseInt(height),
      markersArray
    );

    res.json({
      success: true,
      data: { imageUrl }
    });
  } catch (error) {
    console.error('❌ Static map error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate static map'
    });
  }
};