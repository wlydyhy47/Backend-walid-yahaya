const User = require('../models/user.model');
const Address = require('../models/address.model');
const Order = require('../models/order.model');
const Restaurant = require('../models/restaurant.model');
const RestaurantAddress = require('../models/restaurantAddress.model');
const Review = require('../models/review.model');
const Item = require('../models/item.model');
const DriverLocation = require('../models/driverLocation.model');

/**
 * 1️⃣ بيانات لوحة تحكم المستخدم
 * GET /api/aggregate/dashboard
 */
exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // تنفيذ جميع الاستعلامات بالتوازي
    const [
      user,
      addresses,
      orders,
      restaurants
    ] = await Promise.all([
      // بيانات المستخدم
      User.findById(userId).select('name phone role image'),
      
      // عناوين المستخدم
      Address.find({ user: userId }),
      
      // طلبات المستخدم
      Order.find({ user: userId })
        .populate('driver', 'name phone')
        .populate('pickupAddress')
        .populate('deliveryAddress')
        .sort({ createdAt: -1 })
        .limit(10),
      
      // المطاعم المفتوحة
      Restaurant.find({ isOpen: true })
        .select('name image description type')
        .limit(20)
    ]);

    res.json({
      success: true,
      data: {
        user,
        addresses,
        recentOrders: orders,
        featuredRestaurants: restaurants
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Dashboard aggregation error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard data' 
    });
  }
};

/**
 * 2️⃣ تفاصيل مطعم كاملة
 * GET /api/aggregate/restaurants/:id/full
 */
exports.getRestaurantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [
      restaurant,
      addresses,
      reviews,
      items
    ] = await Promise.all([
      // بيانات المطعم
      Restaurant.findById(id)
        .populate('createdBy', 'name phone'),
      
      // عناوين المطعم
      RestaurantAddress.find({ restaurant: id }),
      
      // التقييمات
      Review.find({ restaurant: id })
        .populate('user', 'name')
        .sort({ createdAt: -1 }),
      
      // العناصر (الأطعمة)
      Item.find({ restaurant: id, isAvailable: true })
    ]);

    if (!restaurant) {
      return res.status(404).json({ 
        success: false, 
        message: 'Restaurant not found' 
      });
    }

    res.json({
      success: true,
      data: {
        restaurant,
        addresses,
        reviews,
        items,
        stats: {
          reviewCount: reviews.length,
          itemCount: items.length,
          addressCount: addresses.length
        }
      }
    });
  } catch (error) {
    console.error('❌ Restaurant details error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch restaurant details' 
    });
  }
};

/**
 * 3️⃣ تفاصيل الطلب مع التتبع
 * GET /api/aggregate/orders/:id/full
 */
exports.getOrderWithTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // جلب الطلب مع كل البيانات المرتبطة
    const order = await Order.findOne({ _id: id, user: userId })
      .populate('user', 'name phone image')
      .populate('driver', 'name phone image')
      .populate('restaurant', 'name image')
      .populate('pickupAddress')
      .populate('deliveryAddress');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // جلب موقع السائق الحالي
    let driverLocation = null;
    if (order.driver) {
      driverLocation = await DriverLocation.findOne({
        driver: order.driver._id,
        order: order._id
      }).sort({ createdAt: -1 });
    }

    // جلب تاريخ الموقع للسائق (آخر 10 مواقع)
    const locationHistory = order.driver ? 
      await DriverLocation.find({ 
        driver: order.driver._id,
        order: order._id 
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('location createdAt')
      : [];

    res.json({
      success: true,
      data: {
        order,
        tracking: {
          currentLocation: driverLocation,
          history: locationHistory,
          isActive: !!driverLocation
        },
        metadata: {
          hasDriver: !!order.driver,
          status: order.status,
          estimatedTime: calculateETA(order) // دالة افتراضية
        }
      }
    });
  } catch (error) {
    console.error('❌ Order tracking error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch order details' 
    });
  }
};

/**
 * 4️⃣ بيانات صفحة الرئيسية للزوار
 * GET /api/aggregate/home
 */
exports.getHomeData = async (req, res) => {
  try {
    const [
      topRestaurants,
      featuredItems,
      recentReviews
    ] = await Promise.all([
      // أفضل المطاعم تقييماً
      Restaurant.find({ isOpen: true })
        .sort({ averageRating: -1 })
        .limit(8)
        .select('name image averageRating type'),
      
      // عناصر مميزة
      Item.find({ isAvailable: true })
        .populate('restaurant', 'name')
        .sort({ createdAt: -1 })
        .limit(12)
        .select('name price image restaurant'),
      
      // أحدث التقييمات
      Review.find()
        .populate('user', 'name')
        .populate('restaurant', 'name image')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    res.json({
      success: true,
      data: {
        topRestaurants,
        featuredItems,
        recentReviews,
        stats: {
          restaurantCount: await Restaurant.countDocuments({ isOpen: true }),
          itemCount: await Item.countDocuments({ isAvailable: true })
        }
      }
    });
  } catch (error) {
    console.error('❌ Home data error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load home page data' 
    });
  }
};

// دالة مساعدة لحساب الوقت المتوقع للوصول
function calculateETA(order) {
  // هذه دالة افتراضية - يمكنك تطويرها حسب منطقك
  const statusTimes = {
    pending: 'قيد الانتظار',
    accepted: '10-15 دقيقة',
    picked: '5-10 دقائق',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  
  return statusTimes[order.status] || 'غير معروف';
}