// src/controllers/user.controller.js (محسن بالكامل)

const User = require("../models/user.model");
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

/**
 * @desc    جلب جميع المستخدمين
 * @route   GET /api/users
 * @access  Admin
 */
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password -verificationCode -resetPasswordToken");
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error("Error in getUsers:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch users" 
    });
  }
};

/**
 * @desc    جلب مستخدم محدد
 * @route   GET /api/users/:id
 * @access  Admin
 */
exports.getUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId)
      .select("name email phone role image isVerified isActive createdAt")
      .populate('favorites', 'name image');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error("Error in getUser:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid user ID format" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * @desc    جلب بيانات المستخدم الحالي
 * @route   GET /api/users/me
 * @access  Authenticated
 */
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("name email phone role image isVerified createdAt")
      .populate('favorites', 'name image type averageRating');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // إضافة صورة محسنة إذا كانت موجودة
    let profileData = user.toObject();
    if (user.image) {
      const publicId = fileService.extractPublicIdFromUrl(user.image);
      if (publicId) {
        profileData.optimizedImages = {
          thumbnail: fileService.getOptimizedUrl(publicId, 'thumbnail'),
          small: fileService.getOptimizedUrl(publicId, 'small'),
          medium: fileService.getOptimizedUrl(publicId, 'medium')
        };
      }
    }

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error("Error in getMyProfile:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * @desc    رفع صورة شخصية محسنة
 * @route   PUT /api/users/me/avatar
 * @access  Authenticated
 */
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "No file uploaded" 
      });
    }

    // ✅ التحقق من صحة الملف باستخدام fileService
    fileService.validateFile(req.file, 'avatar');

    // ✅ الحصول على الصورة القديمة لحذفها
    const oldUser = await User.findById(req.user.id).select('image');
    let oldPublicId = null;
    
    if (oldUser && oldUser.image) {
      oldPublicId = fileService.extractPublicIdFromUrl(oldUser.image);
    }

    // ✅ تحديث المستخدم بالصورة الجديدة
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        image: req.file.path,
        'metadata.avatar': {
          publicId: req.file.publicId,
          uploadedAt: new Date(),
          thumbnail: req.file.thumbnail || fileService.getOptimizedUrl(req.file.publicId, 'thumbnail')
        }
      },
      { new: true }
    ).select("name email phone role image");

    // ✅ حذف الصورة القديمة من Cloudinary (إذا وجدت)
    if (oldPublicId) {
      fileService.deleteFile(oldPublicId).catch(err => 
        console.error('Error deleting old avatar:', err)
      );
    }

    // ✅ إنشاء روابط لصور محسنة بأحجام مختلفة
    const optimizedImages = {
      thumbnail: req.file.thumbnail || fileService.getOptimizedUrl(req.file.publicId, 'thumbnail'),
      small: fileService.getOptimizedUrl(req.file.publicId, 'small'),
      medium: fileService.getOptimizedUrl(req.file.publicId, 'medium'),
      large: fileService.getOptimizedUrl(req.file.publicId, 'large')
    };

    res.json({
      success: true,
      message: "Avatar uploaded successfully",
      data: {
        user,
        image: {
          url: req.file.path,
          thumbnail: optimizedImages.thumbnail,
          allSizes: optimizedImages
        }
      }
    });

  } catch (error) {
    console.error("Error in uploadAvatar:", error);
    
    // إذا كان الخطأ من AppError نستخدم رسالته
    if (error.isOperational) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to upload avatar" 
    });
  }
};

/**
 * @desc    حذف الصورة الشخصية
 * @route   DELETE /api/users/me/avatar
 * @access  Authenticated
 */
exports.deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('image metadata.avatar.publicId');

    if (!user || !user.image) {
      return res.status(404).json({
        success: false,
        message: "No avatar found"
      });
    }

    // استخراج publicId من الرابط
    const publicId = user.metadata?.avatar?.publicId || 
                     fileService.extractPublicIdFromUrl(user.image);

    // حذف من Cloudinary
    if (publicId) {
      await fileService.deleteFile(publicId);
    }

    // تحديث المستخدم
    user.image = null;
    user.metadata = { ...user.metadata, avatar: undefined };
    await user.save();

    res.json({
      success: true,
      message: "Avatar deleted successfully"
    });

  } catch (error) {
    console.error("Error in deleteAvatar:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete avatar"
    });
  }
};

/**
 * @desc    إنشاء مستخدم جديد (للمسؤول)
 * @route   POST /api/users
 * @access  Admin
 */
exports.createUser = async (req, res) => {
  try {
    const { name, phone, role, email } = req.body;

    // تحقق من البيانات المطلوبة
    if (!name || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: "Name and phone are required" 
      });
    }

    // تحقق من عدم تكرار رقم الهاتف
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists"
      });
    }

    // إنشاء المستخدم
    const user = await User.create({
      name,
      phone,
      email,
      role: role || 'client',
      isVerified: false,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user.select("name email phone role isActive createdAt")
    });

  } catch (error) {
    console.error("Error in createUser:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create user" 
    });
  }
};

/**
 * @desc    تحديث بيانات المستخدم
 * @route   PUT /api/users/:id
 * @access  Admin
 */
exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, isActive } = req.body;
    const userId = req.params.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { name, email, role, isActive },
      { new: true, runValidators: true }
    ).select("name email phone role isActive image");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "User updated successfully",
      data: user
    });

  } catch (error) {
    console.error("Error in updateUser:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user"
    });
  }
};

/**
 * @desc    حذف مستخدم (تعطيل)
 * @route   DELETE /api/users/:id
 * @access  Admin
 */
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // منع حذف المسؤول الرئيسي
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account"
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "User deactivated successfully"
    });

  } catch (error) {
    console.error("Error in deleteUser:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user"
    });
  }
};