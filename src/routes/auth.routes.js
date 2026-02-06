const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { validateRegister, validateLogin } = require('../middlewares/validation.middleware');



router.post("/register", validateRegister, authController.register);
router.post("/login", validateLogin, authController.login);


module.exports = router;
