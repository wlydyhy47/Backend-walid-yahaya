const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary"); // تأكد من إعداد ملف config/cloudinary.js

const upload = (folder) => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder, // اسم المجلد في Cloudinary
      format: async (req, file) => "png", // يمكن تغييره حسب الحاجة
      public_id: (req, file) => Date.now() + "-" + file.originalname,
    },
  });

  // فلترة الملفات: السماح فقط بالصور
  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image")) {
      cb(null, true);
    } else {
      cb(new Error("Only images allowed"), false);
    }
  };

  return multer({ storage, fileFilter });
};

module.exports = upload;
