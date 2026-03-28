// ============================================
// ملف: src/models/message.model.js (محدث)
// الوصف: نموذج الرسائل مع ميزات متقدمة
// ============================================

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    type: {
      type: String,
      required: true,
      enum: [
        "text", "image", "video", "audio", "file",
        "location", "contact", "sticker", "system",
        "order_update", "delivery", "payment",
      ],
      default: "text",
    },
    
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
        duration: Number,
        dimensions: {
          width: Number,
          height: Number,
        },
      },
      location: {
        latitude: Number,
        longitude: Number,
        address: String,
        name: String,
      },
      contact: {
        name: String,
        phone: String,
        email: String,
        photo: String,
      },
      system: {
        action: String,
        data: mongoose.Schema.Types.Mixed,
      },
      payment: {
        amount: Number,
        method: String,
        status: String,
        transactionId: String,
      },
    },
    
    // ========== 🔥 إضافات جديدة ==========
    
    /**
     * معرف الرسالة المؤقت (للعميل)
     */
    tempId: String,
    
    /**
     * معرف الرسالة الأصلية (للرسائل المحولة)
     */
    originalMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    
    /**
     * إيصال القراءة
     */
    readReceipts: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      readAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    /**
     * إيصال التسليم
     */
    deliveryReceipts: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      deliveredAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // ========== نهاية الإضافات ==========
    
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    tags: [{
      type: String,
      trim: true,
    }],
    
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
    
    starredBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
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
    
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
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

// ========== Indexes ==========
messageSchema.index({ conversation: 1, "delivery.sentAt": -1 });
messageSchema.index({ sender: 1, "delivery.sentAt": -1 });
messageSchema.index({ "delivery.readBy.user": 1 });
messageSchema.index({ type: 1, "delivery.sentAt": -1 });
messageSchema.index({ tempId: 1 });

// ========== Virtuals ==========

messageSchema.virtual("isRead").get(function() {
  return this.readReceipts?.length > 0 || this.delivery.readBy.length > 0;
});

messageSchema.virtual("isDelivered").get(function() {
  return this.deliveryReceipts?.length > 0 || this.delivery.deliveredTo.length > 0;
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

// ========== Methods ==========

/**
 * إضافة إيصال قراءة
 */
messageSchema.methods.addReadReceipt = async function(userId) {
  if (!this.readReceipts.some(r => r.user.toString() === userId.toString())) {
    this.readReceipts.push({
      user: userId,
      readAt: new Date(),
    });
    await this.save();
  }
  return this;
};

/**
 * إضافة إيصال تسليم
 */
messageSchema.methods.addDeliveryReceipt = async function(userId) {
  if (!this.deliveryReceipts.some(r => r.user.toString() === userId.toString())) {
    this.deliveryReceipts.push({
      user: userId,
      deliveredAt: new Date(),
    });
    await this.save();
  }
  return this;
};

/**
* الحصول على إحصائيات القراءة
*/
messageSchema.methods.getReadStats = function() {
  const totalParticipants = this.conversation?.participants?.length || 0;
  const readCount = this.readReceipts?.length || 0;
  
  return {
    read: readCount,
    total: totalParticipants,
    percentage: totalParticipants > 0 ? (readCount / totalParticipants) * 100 : 0,
    readBy: this.readReceipts
  };
};

// ========== Static Methods ==========

/**
 * إنشاء رسالة نصية
 */
messageSchema.statics.createTextMessage = async function(conversationId, senderId, text, replyTo = null, tempId = null) {
  const message = await this.create({
    conversation: conversationId,
    sender: senderId,
    type: "text",
    content: { text: text.trim() },
    replyTo,
    tempId,
    delivery: { sentAt: new Date() },
  });
  
  return message;
};

/**
 * إنشاء رسالة وسائط
 */
messageSchema.statics.createMediaMessage = async function(conversationId, senderId, mediaData, type = "image", tempId = null) {
  const message = await this.create({
    conversation: conversationId,
    sender: senderId,
    type,
    content: { media: mediaData },
    tempId,
    delivery: { sentAt: new Date() },
  });
  
  return message;
};

/**
 * الحصول على رسائل المحادثة
 */
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
  
  const query = { conversation: conversationId };
  
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

/**
 * البحث في الرسائل
 */
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

/**
* تحديد الكل كمقروء
*/
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

/**
 * الحصول على عدد الرسائل غير المقروءة
 */
messageSchema.statics.getUnreadCount = async function(conversationId, userId) {
  return await this.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    "delivery.readBy.user": { $ne: userId },
    "deleted.isDeleted": false,
  });
};


/**
 * تعديل رسالة
 */
messageSchema.methods.edit = async function(newContent) {
  this.edited = {
    isEdited: true,
    editCount: (this.edited?.editCount || 0) + 1,
    lastEditedAt: new Date(),
    history: [
      ...(this.edited?.history || []),
      { content: this.content, editedAt: new Date() }
    ].slice(-5)
  };
  this.content.text = newContent;
  await this.save();
  return this;
};

/**
 * حذف ناعم لرسالة
 */
messageSchema.methods.softDelete = async function(deletedBy, deleteType = 'sender') {
  this.deleted = {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy,
    deleteType
  };
  await this.save();
  return this;
};

/**
 * إضافة رد فعل
 */
messageSchema.methods.addReaction = async function(userId, emoji) {
  const existingReaction = this.reactions.find(
    r => r.user.toString() === userId.toString() && r.emoji === emoji
  );
  
  if (!existingReaction) {
    this.reactions.push({ user: userId, emoji, reactedAt: new Date() });
    await this.save();
  }
  return this;
};

/**
 * إزالة رد فعل
 */
messageSchema.methods.removeReaction = async function(userId, emoji = null) {
  if (emoji) {
    this.reactions = this.reactions.filter(
      r => !(r.user.toString() === userId.toString() && r.emoji === emoji)
    );
  } else {
    this.reactions = this.reactions.filter(
      r => r.user.toString() !== userId.toString()
    );
  }
  await this.save();
  return this;
};

/**
 * تثبيت رسالة
 */
messageSchema.methods.pin = async function(userId) {
  this.pinned = {
    isPinned: true,
    pinnedAt: new Date(),
    pinnedBy: userId
  };
  await this.save();
  return this;
};

/**
 * إلغاء تثبيت رسالة
 */
messageSchema.methods.unpin = async function() {
  this.pinned = {
    isPinned: false,
    pinnedAt: null,
    pinnedBy: null
  };
  await this.save();
  return this;
};

/**
 * تبديل وضع النجمة
 */
messageSchema.methods.toggleStar = async function(userId) {
  const index = this.starredBy.findIndex(id => id.toString() === userId.toString());
  
  if (index === -1) {
    this.starredBy.push(userId);
  } else {
    this.starredBy.splice(index, 1);
  }
  
  await this.save();
  return this;
};

/**
 * إنشاء رسالة نظام
 */
messageSchema.statics.createSystemMessage = async function(conversationId, action, data = {}) {
  const message = await this.create({
    conversation: conversationId,
    sender: null,
    type: "system",
    content: {
      system: { action, data }
    },
    delivery: { sentAt: new Date() }
  });
  
  return message;
};

module.exports = mongoose.model("Message", messageSchema);