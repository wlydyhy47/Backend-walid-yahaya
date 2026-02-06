const express = require("express");
const router = express.Router();
const itemController = require("../controllers/item.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// GET all items with pagination
router.get('/', PaginationUtils.validatePaginationParams, itemController.getItemsPaginated);

router.post(
  "/",
  auth,
  role("admin"),
  upload("items").single("image"),
  itemController.createItem
);

// PUT image
router.put(
  "/:id/image",
  auth,
  role("admin"),
  upload("items").single("image"),
  itemController.updateItemImage
);

router.delete(
  "/:id",
  auth,
  role("admin"),
  itemController.deleteItem
);

module.exports = router;