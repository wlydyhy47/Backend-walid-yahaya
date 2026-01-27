const Item = require("../models/item.model");

/**
 * POST /api/items
 * Create item with image (Cloudinary)
 */
exports.createItem = async (req, res) => {
  try {
    const { name, price, restaurant } = req.body;

    const item = await Item.create({
      name,
      price,
      restaurant,
      image: req.file ? req.file.path : null, // ✅ Cloudinary URL
    });

    await item.populate("restaurant", "name");

    res.status(201).json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create item" });
  }
};

/**
 * PUT /api/items/:id/image
 * Update item image (Cloudinary)
 */
exports.updateItemImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const item = await Item.findByIdAndUpdate(
      id,
      { image: req.file.path }, // ✅ Cloudinary URL
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update item image" });
  }
};

/**
 * DELETE /api/items/:id
 * Delete item (image remains in Cloudinary unless deleted manually)
 */
exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Item.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete item" });
  }
};
