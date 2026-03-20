// /opt/render/project/src/src/models/favorite.model.js

const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: [true, "Store ID is required"],
    },
    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true, // يضيف createdAt و updatedAt تلقائياً
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// 🎯 **فهرس مركب لمنع تكرار نفس المطعم لنفس المستخدم**
favoriteSchema.index({ user: 1, store: 1 }, { unique: true });

// 🎯 **Virtual populate للمطعم**
favoriteSchema.virtual("storeDetails", {
  ref: "Store",
  localField: "store",
  foreignField: "_id",
  justOne: true
});

// 🎯 **Virtual populate للمستخدم**
favoriteSchema.virtual("userDetails", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
  justOne: true
});

// 🎯 **Middleware: قبل الحذف**
favoriteSchema.pre("remove", async function(next) {
  console.log(`Removing favorite: User ${this.user} - Store ${this.store}`);
  next();
});

// 🎯 **طرق مساعدة (Methods)**
favoriteSchema.methods = {
  // تفعيل المفضلة
  async activate() {
    this.isActive = true;
    return this.save();
  },
  
  // تعطيل المفضلة
  async deactivate() {
    this.isActive = false;
    return this.save();
  },
  
  // إضافة tag
  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
    return this.save();
  },
  
  // إزالة tag
  removeTag(tag) {
    this.tags = this.tags.filter(t => t !== tag);
    return this.save();
  }
};

// 🎯 **ستاتيك ميثودز (Statics)**
favoriteSchema.statics = {
  // إضافة مطعم للمفضلة
  async addToFavorites(userId, storeId, notes = "", tags = []) {
    try {
      const favorite = await this.findOneAndUpdate(
        { user: userId, store: storeId },
        { user: userId, store: storeId, notes, tags, isActive: true },
        { upsert: true, new: true, runValidators: true }
      );
      return favorite;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error("Store already in favorites");
      }
      throw error;
    }
  },
  
  // إزالة مطعم من المفضلة
  async removeFromFavorites(userId, storeId) {
    return this.findOneAndDelete({ user: userId, store: storeId });
  },
  
  // جلب كل مفضلات المستخدم
  async getUserFavorites(userId, options = {}) {
    const { page = 1, limit = 20, sort = "-createdAt", includeInactive = false } = options;
    
    const query = { user: userId };
    if (!includeInactive) {
      query.isActive = true;
    }
    
    const skip = (page - 1) * limit;
    
    const [favorites, total] = await Promise.all([
      this.find(query)
        .populate({
          path: "store",
          select: "name image description type averageRating deliveryFee estimatedDeliveryTime isOpen",
          populate: {
            path: "items",
            match: { isAvailable: true },
            options: { limit: 3 },
            select: "name price image"
          }
        })
        .sort(sort)
        .skip(skip)
        .limit(limit),
      
      this.countDocuments(query)
    ]);
    
    return {
      favorites,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },
  
  // التحقق إذا كان المطعم في المفضلة
  async isFavorite(userId, storeId) {
    const favorite = await this.findOne({ 
      user: userId, 
      store: storeId,
      isActive: true 
    });
    return !!favorite;
  },
  
  // إحصائيات المفضلة
  async getFavoriteStats(userId) {
    const stats = await this.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), isActive: true } },
      {
        $group: {
          _id: null,
          totalFavorites: { $sum: 1 },
          uniqueTags: { $addToSet: "$tags" },
          recentFavorites: {
            $push: {
              storeId: "$store",
              addedAt: "$createdAt"
            }
          }
        }
      },
      {
        $project: {
          totalFavorites: 1,
          tagCount: { $size: { $reduce: { input: "$uniqueTags", initialValue: [], in: { $concatArrays: ["$$value", "$$this"] } } } },
          recentFavorites: { $slice: ["$recentFavorites", 5] }
        }
      }
    ]);
    
    return stats[0] || { totalFavorites: 0, tagCount: 0, recentFavorites: [] };
  }
};

// 🎯 **تسجيل الموديل**
const Favorite = mongoose.model("Favorite", favoriteSchema);

module.exports = Favorite;