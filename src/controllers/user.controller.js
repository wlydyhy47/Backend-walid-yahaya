const User = require("../models/user.model");

exports.getUsers = async (req, res) => {
  const users = await User.find();
  res.json(users);
};

// دالة لجلب مستخدم واحد
exports.getUser = async (req, res) => {
  try {
    const userId = req.params.id; // نفترض أن المعرف يجي من الرابط /api/users/:id
    const user = await User.findById(userId).select("name email phone role"); // جلب الحقول فقط
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    // req.user.id موجود بعد middleware auth
    const user = await User.findById(req.user.id).select("name email phone role image");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { image: req.file.path }, // ✅ Cloudinary URL
      { new: true }
    ).select("name email phone role image");

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.createUser = async (req, res) => {
  const { name, phone, role } = req.body;

  const user = await User.create({
    name,
    phone,
    role,
  });

  res.status(201).json(user);
};
