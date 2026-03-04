// src/services/asset.service.js

const path = require('path');
const fs = require('fs').promises;

class AssetService {
    constructor() {
        this.baseDir = path.join(__dirname, '../public');
        this.cache = new Map();
    }

    async getImage(filename, type = 'images') {
        const imagePath = path.join(this.baseDir, type, filename);
        
        try {
            await fs.access(imagePath);
            return {
                exists: true,
                path: `/${type}/${filename}`,
                url: `${process.env.API_URL || 'http://localhost:3000'}/${type}/${filename}`
            };
        } catch (error) {
            return {
                exists: false,
                default: `/images/default-${type === 'images' ? 'image' : 'icon'}.png`
            };
        }
    }

    async getAllImages(type = 'images') {
        const dir = path.join(this.baseDir, type);
        const files = await fs.readdir(dir);
        
        return files
            .filter(file => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file))
            .map(file => ({
                filename: file,
                url: `/${type}/${file}`,
                fullUrl: `${process.env.API_URL || 'http://localhost:3000'}/${type}/${file}`,
                type: file.split('.').pop().toLowerCase()
            }));
    }

    async getDefaultImages() {
        return {
            avatar: '/images/default-avatar.png',
            restaurant: '/images/default-restaurant.jpg',
            item: '/images/default-item.jpg',
            logo: '/images/logo.png',
            favicon: '/icons/favicon.ico'
        };
    }
}

module.exports = new AssetService();