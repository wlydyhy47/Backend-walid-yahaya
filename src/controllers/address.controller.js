const Address = require("../models/address.model");

// ➕ إضافة عنوان
exports.createAddress = async (req, res) => {
  try {
    const address = await Address.create({
      ...req.body,
      user: req.user.id,
    });

    // لو العنوان افتراضي → نلغي البقية
    if (address.isDefault) {
      await Address.updateMany(
        { user: req.user.id, _id: { $ne: address._id } },
        { isDefault: false }
      );
    }

    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ message: "Failed to create address" });
  }
};

// 📍 جلب عناوين المستخدم
exports.getMyAddresses = async (req, res) => {
  const addresses = await Address.find({ user: req.user.id });
  res.json(addresses);
};

// 🗑 حذف عنوان
exports.deleteAddress = async (req, res) => {
  await Address.findOneAndDelete({
    _id: req.params.id,
    user: req.user.id,
  });

  res.json({ message: "Address deleted" });
};
