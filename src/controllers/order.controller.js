const Order = require("../models/order.model");
const Address = require("../models/address.model");
const DriverLocation = require("../models/driverLocation.model");

/**
 * 🏎️ تعيين أقرب سائق متاح حسب إحداثيات نقطة البداية (pickup)
 */
const assignClosestDriver = async (orderId, pickupCoordinates) => {
  const nearestDriver = await DriverLocation.findOne({ order: null }).near("location", {
    center: { type: "Point", coordinates: pickupCoordinates },
    maxDistance: 5000, // 5 كم
  });

  if (!nearestDriver) return null;

  await Order.findByIdAndUpdate(orderId, {
    driver: nearestDriver.driver,
    status: "accepted",
  });

  return nearestDriver.driver;
};

/**
 * Create order (Client)
 * POST /api/orders
 * يدعم التوصيل من أي عنوان إلى أي عنوان
 */
exports.createOrder = async (req, res) => {
  try {
    const { items, totalPrice, pickupAddress, deliveryAddress } = req.body;

    // التحقق من ملكية العميل للعناوين
    const pickup = await Address.findOne({ _id: pickupAddress, user: req.user.id });
    const delivery = await Address.findOne({ _id: deliveryAddress, user: req.user.id });

    if (!pickup || !delivery) {
      return res.status(400).json({ message: "Invalid pickup or delivery address" });
    }

    // إنشاء الطلب
    const order = await Order.create({
      user: req.user.id,
      items,
      totalPrice,
      pickupAddress,
      deliveryAddress,
      status: "pending",
    });

    // تعيين أقرب سائق تلقائيًا
    const newDriver = await assignClosestDriver(order._id, [pickup.longitude, pickup.latitude]);

    // population للرد
    const populatedOrder = await order.populate([
      { path: "user", select: "name phone image" },
      { path: "driver", select: "name phone" },
      { path: "pickupAddress" },
      { path: "deliveryAddress" },
    ]);

    res.status(201).json({ order: populatedOrder, assignedDriver: newDriver || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

/**
 * Admin: Reassign driver
 * PUT /api/orders/:orderId/reassign
 */
exports.reassignDriver = async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId).populate("pickupAddress");
  if (!order) return res.status(404).json({ message: "Order not found" });

  // إعادة تعيين السائق
  order.driver = null;
  order.status = "pending";
  await order.save();

  const newDriver = await assignClosestDriver(order._id, [
    order.pickupAddress.longitude,
    order.pickupAddress.latitude,
  ]);

  res.json({ newDriver });
};

/**
 * Get my orders (Client)
 * GET /api/orders/me
 */
exports.getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user.id })
    .populate("driver", "name phone")
    .populate("pickupAddress")
    .populate("deliveryAddress");

  res.json(orders);
};

/**
 * Admin: get all orders
 * GET /api/orders
 */
exports.getAllOrders = async (req, res) => {
  const orders = await Order.find()
    .populate("user", "name phone")
    .populate("driver", "name phone")
    .populate("pickupAddress")
    .populate("deliveryAddress");

  res.json(orders);
};

/**
 * Assign driver manually (Admin)
 * PUT /api/orders/:id/assign
 */
exports.assignDriver = async (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body;

  const order = await Order.findByIdAndUpdate(
    id,
    { driver: driverId, status: "accepted" },
    { new: true }
  )
    .populate("driver", "name phone")
    .populate("pickupAddress")
    .populate("deliveryAddress");

  res.json(order);
};

/**
 * Update order status (Driver)
 * PUT /api/orders/:id/status
 */
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = await Order.findByIdAndUpdate(id, { status }, { new: true });

  res.json(order);
};
