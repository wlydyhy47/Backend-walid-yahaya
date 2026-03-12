const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { driverController } = require('../controllers');

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

router.get("/", auth, role("admin"), driverController.getDrivers);
router.get("/:id/location", auth, driverController.getDriverLocation);

module.exports = router;