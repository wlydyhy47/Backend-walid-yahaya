// ============================================
// ملف: src/routes/address.routes.js (المصحح مع Validation)
// ============================================

const express = require("express");
const router = express.Router();

const { addressController } = require('../controllers');

const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");

const {
  createAddressSchema,
  updateAddressSchema
} = require('../validators/address.validator');

// جميع المسارات تحتاج توثيق
router.use(auth);

router.post("/", validate(createAddressSchema), addressController.createAddress);
router.get("/me", addressController.getMyAddresses);
router.put("/:id", validate(updateAddressSchema), addressController.updateAddress);
router.delete("/:id", addressController.deleteAddress);
router.get("/:id", addressController.getAddressById);
router.put("/:id/set-default", addressController.setDefaultAddress);

module.exports = router;