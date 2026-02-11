// /opt/render/project/src/src/controllers/favorite.controller.js

const Favorite = require("../models/favorite.model");

/**
 * GET مفضلات المستخدم
 */
exports.getUserFavorites = async (req, res) => {
  try {
    const { page, limit, sort } = req.query;
    
    const result = await Favorite.getUserFavorites(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      sort: sort || "-createdAt"
    });
    
    res.json(result);
  } catch (error) {
    console.error("Error in getUserFavorites:", error);
    res.status(500).json({ message: "Failed to fetch favorites" });
  }
};

/**
 * POST إضافة للمفضلة
 */
exports.addToFavorites = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { notes, tags } = req.body;
    
    const favorite = await Favorite.addToFavorites(
      req.user.id,
      restaurantId,
      notes,
      tags || []
    );
    
    res.status(201).json({
      message: "Added to favorites successfully",
      favorite
    });
  } catch (error) {
    console.error("Error in addToFavorites:", error);
    
    if (error.message === "Restaurant already in favorites") {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Failed to add to favorites" });
  }
};

/**
 * DELETE إزالة من المفضلة
 */
exports.removeFromFavorites = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    await Favorite.removeFromFavorites(req.user.id, restaurantId);
    
    res.json({ message: "Removed from favorites successfully" });
  } catch (error) {
    console.error("Error in removeFromFavorites:", error);
    res.status(500).json({ message: "Failed to remove from favorites" });
  }
};

/**
 * GET التحقق من حالة المفضلة
 */
exports.checkFavoriteStatus = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const isFavorite = await Favorite.isFavorite(req.user.id, restaurantId);
    
    res.json({ 
      isFavorite,
      restaurantId 
    });
  } catch (error) {
    console.error("Error in checkFavoriteStatus:", error);
    res.status(500).json({ message: "Failed to check favorite status" });
  }
};

/**
 * PUT تحديث المفضلة
 */
exports.updateFavorite = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { notes, tags, isActive } = req.body;
    
    const favorite = await Favorite.findOneAndUpdate(
      { user: req.user.id, restaurant: restaurantId },
      { notes, tags, isActive },
      { new: true, runValidators: true }
    );
    
    if (!favorite) {
      return res.status(404).json({ message: "Favorite not found" });
    }
    
    res.json({
      message: "Favorite updated successfully",
      favorite
    });
  } catch (error) {
    console.error("Error in updateFavorite:", error);
    res.status(500).json({ message: "Failed to update favorite" });
  }
};