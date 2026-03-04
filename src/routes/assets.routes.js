// src/routes/assets.routes.js

const express = require('express');
const router = express.Router();
const assetService = require('../services/asset.service');
const path = require('path');

// GET جميع الصور
router.get('/images', async (req, res) => {
    try {
        const images = await assetService.getAllImages('images');
        res.json({
            success: true,
            data: images
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch images'
        });
    }
});

// GET جميع الأيقونات
router.get('/icons', async (req, res) => {
    try {
        const icons = await assetService.getAllImages('icons');
        res.json({
            success: true,
            data: icons
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch icons'
        });
    }
});

// GET الصور الافتراضية
router.get('/defaults', async (req, res) => {
    try {
        const defaults = await assetService.getDefaultImages();
        res.json({
            success: true,
            data: defaults
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch default images'
        });
    }
});

module.exports = router;