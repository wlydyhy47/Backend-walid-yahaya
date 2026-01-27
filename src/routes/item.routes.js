const express = require("express");
const router = express.Router();
const itemController = require("../controllers/item.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");

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
  upload("items").single("image"),
  itemController.deleteItem
);


module.exports = router;
