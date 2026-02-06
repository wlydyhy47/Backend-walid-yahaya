const Item = require("../models/item.model");
const PaginationUtils = require('../utils/pagination.util');

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


/**
 * 📋 الحصول على العناصر مع Pagination
 * GET /api/items
 */
exports.getItemsPaginated = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    
    let query = { isAvailable: true };
    
    if (filters.restaurant) {
      query.restaurant = filters.restaurant;
    }
    
    if (filters.category) {
      query.category = filters.category;
    }
    
    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
      if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
    }

    const [items, total] = await Promise.all([
      Item.find(query)
        .populate('restaurant', 'name image')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      
      Item.countDocuments(query),
    ]);

    const response = PaginationUtils.createPaginationResponse(
      items,
      total,
      paginationOptions
    );
    
    res.json(response);
  } catch (error) {
    console.error('Pagination error:', error);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
};