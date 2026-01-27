const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");

// 1️⃣ جلب بيانات المستخدم الحالي
router.get("/me", auth, userController.getMyProfile);

// 2️⃣ رفع الصورة للمستخدم الحالي


router.put(
  "/me/avatar",
  auth,
  upload("users").single("image"), // ✅ مجلد المستخدمين
  userController.uploadAvatar
);

// 3️⃣ جلب كل المستخدمين (admin فقط)
router.get("/", auth, role("admin"), userController.getUsers);

// 4️⃣ جلب مستخدم واحد حسب id (admin فقط)
router.get("/:id", auth, role("admin"), userController.getUser);

// 5️⃣ إنشاء مستخدم جديد
router.post("/", userController.createUser);

module.exports = router;  
