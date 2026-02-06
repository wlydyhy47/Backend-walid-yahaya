const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // المحادثة التي تنتمي إليها الرسالة
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    
    // المرسل
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    // نوع الرسالة
    type: {
      type: String,
      required: true,
      enum: [
        "text",         // نص
        "image",        // صورة
        "video",        // فيديو
        "audio",        // صوت
        "file",         // ملف
        "location",     // موقع
        "contact",      // جهة اتصال
        "sticker",      // ملصق
        "system",       // رسالة نظام
        "order_update", // تحديث طلب
        "delivery",     // تحديث توصيل
      ],
      default: "text",
    },
    
    // محتوى الرسالة
    content: {
      text: {
        type: String,
        trim: true,
        maxlength: 5000,
      },
      media: {
        url: String,
        thumbnail: String,
        filename: String,
        size: Number,
        mimeType: String,
        duration: Number, // للملفات الصوتية/المرئية
        dimensions: {
          width: Number,
          height: Number,
        },
      },
      location: {
        latitude: Number,
        longitude: Number,
        address: String,
      },
      contact: {
        name: String,
        phone: String,
        email: String,
      },
      system: {
        action: String,
        data: mongoose.Schema.Types.Mixed,
      },
    },
    
    // رد على رسالة سابقة
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    
    // إشارات للأعضاء (Mentions)
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    // الوسوم (للتنظيم)
    tags: [{
      type: String,
      trim: true,
    }],
    
    // معلومات التسليم والقراءة
    delivery: {
      sentAt: {
        type: Date,
        default: Date.now,
        index: true,
      },
      deliveredAt: Date,
      readBy: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      }],
      deliveredTo: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        deliveredAt: Date,
      }],
    },
    
    // معلومات التحرير
    edited: {
      isEdited: {
        type: Boolean,
        default: false,
      },
      editCount: {
        type: Number,
        default: 0,
      },
      lastEditedAt: Date,
      history: [{
        content: mongoose.Schema.Types.Mixed,
        editedAt: Date,
      }],
    },
    
    // معلومات الحذف
    deleted: {
      isDeleted: {
        type: Boolean,
        default: false,
      },
      deletedAt: Date,
      deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      deleteType: {
        type: String,
        enum: ["sender", "admin", "system"],
      },
    },
    
    // ردود الفعل (Reactions)
    reactions: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      emoji: {
        type: String,
        required: true,
      },
      reactedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // للرسائل المهمة (Starred)
    starredBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    // للرسائل المثبتة
    pinned: {
      isPinned: {
        type: Boolean,
        default: false,
      },
      pinnedAt: Date,
      pinnedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    
    // الرسائل المحولة (Forwarded)
    forwarded: {
      isForwarded: {
        type: Boolean,
        default: false,
      },
      originalMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
      forwardCount: {
        type: Number,
        default: 0,
      },
    },
    
    // ميتاداتا إضافية
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // النسخ الإضافية (للرسائل المنقولة)
    copies: [{
      conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
      },
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
      },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
messageSchema.index({ conversation: 1, "delivery.sentAt": -1 });
messageSchema.index({ sender: 1, "delivery.sentAt": -1 });
messageSchema.index({ "delivery.readBy.user": 1 });
messageSchema.index({ type: 1, "delivery.sentAt": -1 });

// Middleware
messageSchema.pre("save", function(next) {
  // إذا كانت رسالة نصية وتحتوي على mentions
  if (this.type === "text" && this.content.text) {
    // استخراج الـ mentions من النص (@username)
    const mentionRegex = /@([\w\u0600-\u06FF]+)/g;
    const mentions = [...this.content.text.matchAll(mentionRegex)].map(m => m[1]);
    
    if (mentions.length > 0) {
      // TODO: تحويل usernames إلى user IDs
    }
  }
  
  // إذا تم التعديل
  if (this.isModified("content") && !this.isNew) {
    this.edited.isEdited = true;
    this.edited.editCount += 1;
    this.edited.lastEditedAt = new Date();
    
    // حفظ التاريخ
    this.edited.history.push({
      content: this._previousContent || this.content,
      editedAt: new Date(),
    });
    
    // الحفاظ على آخر 10 تعديلات فقط
    if (this.edited.history.length > 10) {
      this.edited.history = this.edited.history.slice(-10);
    }
  }
  
  next();
});

messageSchema.pre("save", async function(next) {
  if (this.isNew) {
    // تحديث آخر رسالة في المحادثة
    const Conversation = require("./conversation.model");
    await Conversation.findByIdAndUpdate(
      this.conversation,
      {
        lastMessage: this._id,
        lastActivity: new Date(),
        $inc: { "stats.messageCount": 1 },
      }
    );
    
    // تحديث وقت آخر رسالة
    if (!this.conversation.stats?.firstMessageAt) {
      await Conversation.findByIdAndUpdate(
        this.conversation,
        {
          "stats.firstMessageAt": new Date(),
          "stats.lastMessageAt": new Date(),
        }
      );
    }
  }
  next();
});

// Virtuals
messageSchema.virtual("isRead").get(function() {
  return this.delivery.readBy.length > 0;
});

messageSchema.virtual("isDelivered").get(function() {
  return this.delivery.deliveredTo.length > 0;
});

messageSchema.virtual("timeAgo").get(function() {
  const now = new Date();
  const sent = new Date(this.delivery.sentAt);
  const diffMs = now - sent;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
  return `منذ ${Math.floor(diffDays / 30)} شهر`;
});

// Methods
messageSchema.methods.markAsDelivered = async function(userId) {
  if (!this.delivery.deliveredTo.some(d => d.user.toString() === userId.toString())) {
    this.delivery.deliveredTo.push({
      user: userId,
      deliveredAt: new Date(),
    });
    
    if (!this.delivery.deliveredAt) {
      this.delivery.deliveredAt = new Date();
    }
    
    await this.save();
  }
  return this;
};

messageSchema.methods.markAsRead = async function(userId) {
  if (!this.delivery.readBy.some(r => r.user.toString() === userId.toString())) {
    this.delivery.readBy.push({
      user: userId,
      readAt: new Date(),
    });
    await this.save();
  }
  return this;
};

messageSchema.methods.addReaction = async function(userId, emoji) {
  // إزالة رد الفعل السابق لنفس المستخدم
  this.reactions = this.reactions.filter(
    reaction => reaction.user.toString() !== userId.toString()
  );
  
  // إضافة رد الفعل الجديد
  this.reactions.push({
    user: userId,
    emoji,
    reactedAt: new Date(),
  });
  
  await this.save();
  return this;
};

messageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(
    reaction => reaction.user.toString() !== userId.toString()
  );
  
  await this.save();
  return this;
};

messageSchema.methods.toggleStar = async function(userId) {
  const index = this.starredBy.findIndex(
    id => id.toString() === userId.toString()
  );
  
  if (index === -1) {
    this.starredBy.push(userId);
  } else {
    this.starredBy.splice(index, 1);
  }
  
  await this.save();
  return this;
};

messageSchema.methods.pin = async function(userId) {
  this.pinned.isPinned = true;
  this.pinned.pinnedAt = new Date();
  this.pinned.pinnedBy = userId;
  
  await this.save();
  return this;
};

messageSchema.methods.unpin = async function() {
  this.pinned.isPinned = false;
  this.pinned.pinnedAt = null;
  this.pinned.pinnedBy = null;
  
  await this.save();
  return this;
};

messageSchema.methods.softDelete = async function(userId, deleteType = "sender") {
  this.deleted.isDeleted = true;
  this.deleted.deletedAt = new Date();
  this.deleted.deletedBy = userId;
  this.deleted.deleteType = deleteType;
  
  await this.save();
  return this;
};

messageSchema.methods.edit = async function(newContent) {
  const oldContent = { ...this.content };
  
  this.content = newContent;
  await this.save();
  
  return { oldContent, newContent };
};

// Static Methods
messageSchema.statics.createTextMessage = async function(conversationId, senderId, text, replyTo = null) {
  const message = await this.create({
    conversation: conversationId,
    sender: senderId,
    type: "text",
    content: {
      text: text.trim(),
    },
    replyTo,
    delivery: {
      sentAt: new Date(),
    },
  });
  
  return message;
};

messageSchema.statics.createMediaMessage = async function(conversationId, senderId, mediaData, type = "image") {
  const message = await this.create({
    conversation: conversationId,
    sender: senderId,
    type,
    content: {
      media: mediaData,
    },
    delivery: {
      sentAt: new Date(),
    },
  });
  
  return message;
};

messageSchema.statics.createSystemMessage = async function(conversationId, action, data = {}) {
  const message = await this.create({
    conversation: conversationId,
    sender: null, // النظام
    type: "system",
    content: {
      system: {
        action,
        data,
      },
    },
    delivery: {
      sentAt: new Date(),
    },
  });
  
  return message;
};

messageSchema.statics.createOrderUpdateMessage = async function(conversationId, orderData) {
  const message = await this.create({
    conversation: conversationId,
    sender: null,
    type: "order_update",
    content: {
      text: `تحديث على الطلب: ${orderData.status}`,
      system: {
        action: "order_update",
        data: orderData,
      },
    },
    delivery: {
      sentAt: new Date(),
    },
  });
  
  return message;
};

messageSchema.statics.getConversationMessages = async function(conversationId, options = {}) {
  const {
    page = 1,
    limit = 50,
    before = null,
    after = null,
    types = [],
    includeDeleted = false,
    includeSystem = true,
  } = options;
  
  const skip = (page - 1) * limit;
  
  const query = {
    conversation: conversationId,
  };
  
  if (!includeDeleted) {
    query["deleted.isDeleted"] = false;
  }
  
  if (!includeSystem) {
    query.type = { $ne: "system" };
  }
  
  if (types.length > 0) {
    query.type = { $in: types };
  }
  
  if (before) {
    query["delivery.sentAt"] = { $lt: new Date(before) };
  }
  
  if (after) {
    query["delivery.sentAt"] = { $gt: new Date(after) };
  }
  
  const [messages, total] = await Promise.all([
    this.find(query)
      .populate("sender", "name image role")
      .populate("replyTo", "content.text sender type delivery.sentAt")
      .populate("mentions", "name image")
      .sort({ "delivery.sentAt": -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    
    this.countDocuments(query),
  ]);
  
  // عكس الترتيب لأقدم → أحدث
  messages.reverse();
  
  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + limit < total,
    },
  };
};

messageSchema.statics.searchMessages = async function(conversationId, searchTerm, options = {}) {
  const {
    page = 1,
    limit = 20,
    sender = null,
    types = ["text"],
    dateFrom = null,
    dateTo = null,
  } = options;
  
  const skip = (page - 1) * limit;
  
  const query = {
    conversation: conversationId,
    "deleted.isDeleted": false,
    type: { $in: types },
  };
  
  if (searchTerm) {
    query["content.text"] = { $regex: searchTerm, $options: "i" };
  }
  
  if (sender) {
    query.sender = sender;
  }
  
  if (dateFrom) {
    query["delivery.sentAt"] = { $gte: new Date(dateFrom) };
  }
  
  if (dateTo) {
    query["delivery.sentAt"] = { $lte: new Date(dateTo) };
  }
  
  const [messages, total] = await Promise.all([
    this.find(query)
      .populate("sender", "name image")
      .sort({ "delivery.sentAt": -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    
    this.countDocuments(query),
  ]);
  
  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

messageSchema.statics.markAllAsRead = async function(conversationId, userId) {
  const result = await this.updateMany(
    {
      conversation: conversationId,
      sender: { $ne: userId },
      "delivery.readBy.user": { $ne: userId },
    },
    {
      $push: {
        "delivery.readBy": {
          user: userId,
          readAt: new Date(),
        },
      },
    }
  );
  
  return result.modifiedCount;
};

messageSchema.statics.getUnreadCount = async function(conversationId, userId) {
  return await this.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    "delivery.readBy.user": { $ne: userId },
    "deleted.isDeleted": false,
  });
};

module.exports = mongoose.model("Message", messageSchema);