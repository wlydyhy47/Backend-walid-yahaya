// src/routes/driver.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const DriverLocation = require("../models/driverLocation.model");

// للحصول على كل المواقع في الوقت الحالي
router.get("/", auth, role("admin"), async (req, res) => {
  const locations = await DriverLocation.find()
    .populate("driver", "name phone")
    .sort({ timestamp: -1 });
  res.json(locations);
});

module.exports = router;
