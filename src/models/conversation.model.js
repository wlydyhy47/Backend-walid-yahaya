const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    // نوع المحادثة
    type: {
      type: String,
      required: true,
      enum: [
        "direct",        // مباشرة بين شخصين
        "support",       // مع الدعم الفني
        "order",         // خاصة بالطلب
        "group",         // مجموعة
        "broadcast",     // بث
      ],
      default: "direct",
      index: true,
    },
    
    // عنوان المحادثة (للرسائل الجماعية)
    title: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    
    // وصف المحادثة (للرسائل الجماعية)
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    
    // صورة المحادثة
    image: {
      type: String,
    },
    
    // المشاركون في المحادثة
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    }],
    
    // معلومات إضافية حسب نوع المحادثة
    metadata: {
      // لمحادثات الدعم
      support: {
        department: {
          type: String,
          enum: ["technical", "billing", "general", "complaints"],
        },
        priority: {
          type: String,
          enum: ["low", "medium", "high", "urgent"],
          default: "medium",
        },
        status: {
          type: String,
          enum: ["open", "pending", "resolved", "closed"],
          default: "open",
        },
        assignedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        tags: [String],
      },
      
      // لمحادثات الطلبات
      order: {
        orderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Order",
        },
        restaurant: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Restaurant",
        },
        driver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["active", "completed", "cancelled"],
          default: "active",
        },
      },
      
      // للمحادثات الجماعية
      group: {
        isPublic: {
          type: Boolean,
          default: false,
        },
        maxParticipants: {
          type: Number,
          default: 100,
        },
        admins: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        }],
        joinCode: String,
      },
    },
    
    // آخر رسالة
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    
    // وقت آخر نشاط
    lastActivity: {
      type: Date,
      default: Date.now,
      index: true,
    },
    
    // إعدادات الإشعارات
    notificationSettings: {
      mute: {
        type: Boolean,
        default: false,
      },
      muteUntil: Date,
      sound: {
        type: Boolean,
        default: true,
      },
      vibrate: {
        type: Boolean,
        default: true,
      },
    },
    
    // إعدادات الخصوصية
    privacySettings: {
      allowNewMembers: {
        type: Boolean,
        default: false,
      },
      showOnlineStatus: {
        type: Boolean,
        default: true,
      },
      showReadReceipts: {
        type: Boolean,
        default: true,
      },
      allowMedia: {
        type: Boolean,
        default: true,
      },
      allowVoiceMessages: {
        type: Boolean,
        default: true,
      },
    },
    
    // الوسوم
    tags: [{
      type: String,
      trim: true,
      index: true,
    }],
    
    // تاريخ الأرشيف
    archivedAt: Date,
    
    // تاريخ الحذف
    deletedAt: Date,
    
    // تاريخ الانتهاء (للمحادثات المؤقتة)
    expiresAt: {
      type: Date,
    },
    
    // الإحصائيات
    stats: {
      messageCount: {
        type: Number,
        default: 0,
      },
      participantCount: {
        type: Number,
        default: 0,
      },
      unreadCount: {
        type: Number,
        default: 0,
      },
      lastMessageAt: Date,
      firstMessageAt: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
conversationSchema.index({ participants: 1, lastActivity: -1 });
conversationSchema.index({ type: 1, "metadata.order.orderId": 1 });
conversationSchema.index({ "metadata.support.status": 1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Middleware
conversationSchema.pre("save", function(next) {
  // تحديث عدد المشاركين
  this.stats.participantCount = this.participants.length;
  
  // تحديث آخر نشاط
  if (this.isModified("lastActivity")) {
    this.lastActivity = new Date();
  }
  
  // إذا كانت محادثة طلب وتم إلغاء الطلب، أرجع المحادثة
  if (this.type === "order" && this.metadata.order?.status === "cancelled") {
    this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 أيام
  }
  
  next();
});

// Virtuals
conversationSchema.virtual("isActive").get(function() {
  if (this.expiresAt && this.expiresAt < new Date()) {
    return false;
  }
  
  if (this.archivedAt || this.deletedAt) {
    return false;
  }
  
  if (this.type === "order" && this.metadata.order?.status !== "active") {
    return false;
  }
  
  return true;
});

conversationSchema.virtual("isGroup").get(function() {
  return this.participants.length > 2 || this.type === "group";
});

conversationSchema.virtual("isSupport").get(function() {
  return this.type === "support";
});

conversationSchema.virtual("isOrder").get(function() {
  return this.type === "order";
});

// Methods
conversationSchema.methods.addParticipant = async function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    await this.save();
  }
  return this;
};

conversationSchema.methods.removeParticipant = async function(userId) {
  this.participants = this.participants.filter(
    participant => participant.toString() !== userId.toString()
  );
  await this.save();
  return this;
};

conversationSchema.methods.updateLastMessage = async function(messageId) {
  this.lastMessage = messageId;
  this.lastActivity = new Date();
  this.stats.lastMessageAt = new Date();
  
  if (!this.stats.firstMessageAt) {
    this.stats.firstMessageAt = new Date();
  }
  
  this.stats.messageCount += 1;
  await this.save();
  return this;
};

conversationSchema.methods.mute = async function(duration = null) {
  this.notificationSettings.mute = true;
  
  if (duration) {
    const muteUntil = new Date();
    muteUntil.setHours(muteUntil.getHours() + duration);
    this.notificationSettings.muteUntil = muteUntil;
  }
  
  await this.save();
  return this;
};

conversationSchema.methods.unmute = async function() {
  this.notificationSettings.mute = false;
  this.notificationSettings.muteUntil = null;
  await this.save();
  return this;
};

conversationSchema.methods.archive = async function() {
  this.archivedAt = new Date();
  await this.save();
  return this;
};

conversationSchema.methods.unarchive = async function() {
  this.archivedAt = null;
  await this.save();
  return this;
};

conversationSchema.methods.markAsDeleted = async function() {
  this.deletedAt = new Date();
  await this.save();
  return this;
};

// Static Methods
conversationSchema.statics.findByParticipants = async function(participantIds, type = "direct") {
  const query = {
    type,
    participants: { $all: participantIds, $size: participantIds.length },
    deletedAt: null,
  };
  
  return await this.findOne(query);
};

conversationSchema.statics.createDirectChat = async function(user1Id, user2Id) {
  const existingChat = await this.findByParticipants([user1Id, user2Id], "direct");
  
  if (existingChat) {
    return existingChat;
  }
  
  const chat = await this.create({
    type: "direct",
    participants: [user1Id, user2Id],
    lastActivity: new Date(),
  });
  
  return chat;
};

conversationSchema.statics.createSupportChat = async function(userId, department = "general") {
  const User = require("./user.model");
  
  // البحث عن ممثل دعم متاح
  const supportAgent = await User.findOne({
    role: "admin",
    "preferences.supportAgent": true,
    isOnline: true,
  });
  
  const chat = await this.create({
    type: "support",
    participants: [userId, ...(supportAgent ? [supportAgent._id] : [])],
    metadata: {
      support: {
        department,
        priority: department === "complaints" ? "high" : "medium",
        status: "open",
        assignedTo: supportAgent?._id || null,
        tags: [department, "new"],
      },
    },
    lastActivity: new Date(),
  });
  
  return chat;
};

conversationSchema.statics.createOrderChat = async function(orderId, userId, driverId = null, restaurantId = null) {
  const participants = [userId];
  
  if (driverId) participants.push(driverId);
  
  const chat = await this.create({
    type: "order",
    title: `محادثة الطلب #${orderId.toString().slice(-6)}`,
    participants,
    metadata: {
      order: {
        orderId,
        restaurant: restaurantId,
        driver: driverId,
        status: "active",
      },
    },
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 يوم
    lastActivity: new Date(),
  });
  
  return chat;
};

conversationSchema.statics.createGroupChat = async function(creatorId, title, description = "", participants = [], isPublic = false) {
  const allParticipants = [...new Set([creatorId, ...participants])];
  
  const chat = await this.create({
    type: "group",
    title,
    description,
    participants: allParticipants,
    image: null,
    metadata: {
      group: {
        isPublic,
        maxParticipants: 100,
        admins: [creatorId],
        joinCode: isPublic ? Math.random().toString(36).substring(2, 8).toUpperCase() : null,
      },
    },
    lastActivity: new Date(),
  });
  
  return chat;
};

conversationSchema.statics.getUserConversations = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    type,
    archived = false,
    includeExpired = false,
  } = options;
  
  const skip = (page - 1) * limit;
  
  const query = {
    participants: userId,
    deletedAt: null,
  };
  
  if (type) query.type = type;
  
  if (!archived) {
    query.archivedAt = null;
  }
  
  if (!includeExpired) {
    query.$or = [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ];
  }
  
  const [conversations, total] = await Promise.all([
    this.find(query)
      .populate("participants", "name image role isOnline")
      .populate("lastMessage")
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    
    this.countDocuments(query),
  ]);
  
  // حساب عدد الرسائل غير المقروءة لكل محادثة
  const Message = require("./message.model");
  
  for (const conversation of conversations) {
    conversation.unreadCount = await Message.countDocuments({
      conversation: conversation._id,
      "readBy.user": { $ne: userId },
      sender: { $ne: userId },
    });
    
    conversation.isActive = conversation.expiresAt 
      ? conversation.expiresAt > new Date() 
      : true;
  }
  
  return {
    conversations,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

module.exports = mongoose.model("Conversation", conversationSchema);