// ============================================
// ملف: src/routes/item.routes.js (محدث)
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { itemController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// ========== مسارات عامة ==========
router.get('/', PaginationUtils.validatePaginationParams, itemController.getItemsPaginated);

// ========== مسارات محمية (أدمن) ==========
router.post("/", auth, role("admin"), upload("items").single("image"), itemController.createItem);
router.put("/:id/image", auth, role("admin"), upload("items").single("image"), itemController.updateItemImage);
router.delete("/:id", auth, role("admin"), itemController.deleteItem);

module.exports = router;