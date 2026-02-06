const Restaurant = require("../models/restaurant.model");
const RestaurantAddress = require("../models/restaurantAddress.model");
const Item = require("../models/item.model");
const upload = require("../middlewares/upload");
const cloudinary = require("../config/cloudinary");
const cache = require("../utils/cache.util");

/**
 * 📝 إنشاء مطعم كامل مع عناوين وعناصر وصور
 * POST /api/restaurants/complete
 * 
 * Body (multipart/form-data):
 * - name: String (required)
 * - description: String
 * - type: String
 * - phone: String
 * - email: String
 * - deliveryFee: Number
 * - minOrderAmount: Number
 * - estimatedDeliveryTime: Number
 * - tags: String (comma separated)
 * 
 * - image: File (صورة المطعم الرئيسية)
 * - coverImage: File (صورة الغلاف)
 * 
 * - addresses: JSON Array (عناوين المطعم)
 *   [{
 *     addressLine: String,
 *     city: String,
 *     latitude: Number,
 *     longitude: Number
 *   }]
 * 
 * - items: JSON Array (عناصر القائمة)
 *   [{
 *     name: String,
 *     price: Number,
 *     description: String,
 *     category: String,
 *     image: File
 *   }]
 * 
 * - openingHours: JSON Object
 *   {"monday": "09:00-22:00", "tuesday": "09:00-22:00", ...}
 */
exports.createCompleteRestaurant = async (req, res) => {
  try {
    // 🔐 التحقق من صلاحية المستخدم (أدمن فقط)
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can create restaurants",
      });
    }

    console.log("🚀 Starting complete restaurant creation...");

    // 📄 معالجة البيانات النصية
    const {
      name,
      description,
      type = "restaurant",
      phone,
      email,
      deliveryFee = 0,
      minOrderAmount = 0,
      estimatedDeliveryTime = 30,
      tags = "",
      addresses = "[]",
      items = "[]",
      openingHours = "{}",
    } = req.body;

    // 🔍 التحقق من البيانات الأساسية
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Restaurant name is required",
      });
    }

    // 🔄 تحويل البيانات من JSON strings إلى objects
    let addressesArray = [];
    let itemsArray = [];
    let openingHoursObj = {};

    try {
      addressesArray = JSON.parse(addresses);
      itemsArray = JSON.parse(items);
      openingHoursObj = JSON.parse(openingHours);
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError);
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format in addresses, items, or openingHours",
      });
    }

    // 🔄 تحويل tags من string إلى array
    const tagsArray = tags
      ? tags.split(",").map((tag) => tag.trim()).filter((tag) => tag)
      : [];

    console.log(`📊 Processing: ${name}`);
    console.log(`📌 Addresses: ${addressesArray.length}`);
    console.log(`📌 Items: ${itemsArray.length}`);
    console.log(`📌 Tags: ${tagsArray.length}`);

    // ============ 1️⃣ رفع الصور إلى Cloudinary ============
    console.log("📤 Uploading images to Cloudinary...");

    let imageUrl = null;
    let coverImageUrl = null;

    try {
      // رفع صورة المطعم الرئيسية
      if (req.files?.image) {
        const imageResult = await cloudinary.uploader.upload(
          req.files.image[0].path,
          {
            folder: "restaurants/main",
            transformation: [
              { width: 800, height: 600, crop: "fill" },
              { quality: "auto:good" },
            ],
          }
        );
        imageUrl = imageResult.secure_url;
        console.log("✅ Main image uploaded:", imageUrl);
      }

      // رفع صورة الغلاف
      if (req.files?.coverImage) {
        const coverResult = await cloudinary.uploader.upload(
          req.files.coverImage[0].path,
          {
            folder: "restaurants/covers",
            transformation: [
              { width: 1200, height: 400, crop: "fill" },
              { quality: "auto:good" },
            ],
          }
        );
        coverImageUrl = coverResult.secure_url;
        console.log("✅ Cover image uploaded:", coverImageUrl);
      }
    } catch (uploadError) {
      console.error("❌ Image upload error:", uploadError);
      return res.status(500).json({
        success: false,
        message: "Failed to upload images",
      });
    }

    // ============ 2️⃣ إنشاء المطعم في قاعدة البيانات ============
    console.log("💾 Creating restaurant in database...");

    let restaurant;
    try {
      restaurant = await Restaurant.create({
        name: name.trim(),
        description: description?.trim(),
        type,
        phone: phone?.trim(),
        email: email?.trim(),
        image: imageUrl,
        coverImage: coverImageUrl,
        deliveryFee: Number(deliveryFee),
        minOrderAmount: Number(minOrderAmount),
        estimatedDeliveryTime: Number(estimatedDeliveryTime),
        tags: tagsArray,
        openingHours: openingHoursObj,
        createdBy: req.user.id,
        isOpen: true,
      });

      console.log("✅ Restaurant created with ID:", restaurant._id);
    } catch (dbError) {
      console.error("❌ Database error creating restaurant:", dbError);
      return res.status(500).json({
        success: false,
        message: "Failed to create restaurant in database",
      });
    }

    // ============ 3️⃣ إنشاء العناوين (إذا وجدت) ============
    let createdAddresses = [];
    if (addressesArray.length > 0) {
      console.log("📍 Creating restaurant addresses...");

      const addressPromises = addressesArray.map(async (addressData, index) => {
        try {
          const address = await RestaurantAddress.create({
            restaurant: restaurant._id,
            addressLine: addressData.addressLine?.trim(),
            city: addressData.city?.trim() || "Niamey",
            latitude: addressData.latitude ? Number(addressData.latitude) : null,
            longitude: addressData.longitude ? Number(addressData.longitude) : null,
          });
          return address;
        } catch (addrError) {
          console.error(`❌ Error creating address ${index + 1}:`, addrError);
          return null;
        }
      });

      const addressesResults = await Promise.allSettled(addressPromises);
      createdAddresses = addressesResults
        .filter((result) => result.status === "fulfilled" && result.value)
        .map((result) => result.value);

      console.log(`✅ Created ${createdAddresses.length} addresses`);
    }

    // ============ 4️⃣ إنشاء العناصر (إذا وجدت) ============
    let createdItems = [];
    if (itemsArray.length > 0) {
      console.log("🍽️ Creating menu items...");

      // جمع ملفات الصور للعناصر
      const itemImages = req.files?.itemImages || [];

      const itemPromises = itemsArray.map(async (itemData, index) => {
        try {
          let itemImageUrl = null;

          // البحث عن صورة العنصر المقابلة
          const matchingImage = itemImages.find(
            (img) => img.fieldname === `items[${index}][image]`
          );

          // رفع صورة العنصر إذا وجدت
          if (matchingImage) {
            try {
              const imageResult = await cloudinary.uploader.upload(
                matchingImage.path,
                {
                  folder: `restaurants/${restaurant._id}/items`,
                  transformation: [
                    { width: 500, height: 500, crop: "fill" },
                    { quality: "auto:good" },
                  ],
                }
              );
              itemImageUrl = imageResult.secure_url;
            } catch (imgError) {
              console.error(`❌ Error uploading item image ${index + 1}:`, imgError);
            }
          }

          // إنشاء العنصر
          const item = await Item.create({
            name: itemData.name?.trim(),
            price: Number(itemData.price) || 0,
            description: itemData.description?.trim(),
            category: itemData.category?.trim() || "main",
            image: itemImageUrl,
            restaurant: restaurant._id,
            isAvailable: true,
          });

          return item;
        } catch (itemError) {
          console.error(`❌ Error creating item ${index + 1}:`, itemError);
          return null;
        }
      });

      const itemsResults = await Promise.allSettled(itemPromises);
      createdItems = itemsResults
        .filter((result) => result.status === "fulfilled" && result.value)
        .map((result) => result.value);

      console.log(`✅ Created ${createdItems.length} menu items`);
    }

    // ============ 5️⃣ إبطال الكاش ============
    cache.invalidatePattern("restaurant:*");
    cache.invalidatePattern("home:*");
    console.log("🗑️ Invalidated related cache");

    // ============ 6️⃣ إعداد الاستجابة النهائية ============
    console.log("🎉 Restaurant creation completed successfully!");

    // جلب المطعم مع جميع البيانات المرتبطة
    const populatedRestaurant = await Restaurant.findById(restaurant._id)
      .populate("createdBy", "name email phone")
      .lean();

    const responseData = {
      success: true,
      message: "Restaurant created successfully",
      data: {
        restaurant: {
          ...populatedRestaurant,
          addresses: createdAddresses,
          items: createdItems,
        },
        summary: {
          addressesCount: createdAddresses.length,
          itemsCount: createdItems.length,
          imagesCount: (imageUrl ? 1 : 0) + (coverImageUrl ? 1 : 0),
        },
      },
      timestamp: new Date(),
    };

    res.status(201).json(responseData);
  } catch (error) {
    console.error("❌ Unexpected error in createCompleteRestaurant:", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * 📤 دالة مساعدة لرفع ملفات متعددة
 */
const uploadMultiple = upload("restaurants").fields([
  { name: "image", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "itemImages", maxCount: 20 }, // يمكن رفع حتى 20 صورة للعناصر
]);

/**
 * 🛠️ Middleware لمعالجة الرفع
 */
exports.uploadRestaurantFiles = (req, res, next) => {
  uploadMultiple(req, res, function (err) {
    if (err) {
      console.error("❌ File upload error:", err);
      return res.status(400).json({
        success: false,
        message: "File upload failed",
        error: err.message,
      });
    }
    next();
  });
};

/**
 * 🎯 تحديث مطعم كامل
 * PUT /api/restaurants/:id/complete
 */
exports.updateCompleteRestaurant = async (req, res) => {
  try {
    // هذا سيكون مشابهًا للإنشاء لكن للتحديث
    // يمكننا تطويره لاحقًا
    res.json({
      success: true,
      message: "Update endpoint will be implemented soon",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Update failed",
    });
  }
};