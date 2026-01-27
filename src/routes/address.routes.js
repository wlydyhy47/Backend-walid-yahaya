const express = require("express");
const router = express.Router();

const addressController = require("../controllers/address.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/", auth, addressController.createAddress);
router.get("/me", auth, addressController.getMyAddresses);
router.delete("/:id", auth, addressController.deleteAddress);

module.exports = router;
