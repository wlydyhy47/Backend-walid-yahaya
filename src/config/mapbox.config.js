// ============================================
// ملف: src/config/mapbox.config.js
// الوصف: إعدادات Mapbox
// ============================================

require('dotenv').config();

module.exports = {
  accessToken: process.env.MAPBOX_ACCESS_TOKEN,
  secretToken: process.env.MAPBOX_SECRET_TOKEN,
  style: process.env.MAPBOX_STYLE || 'mapbox/streets-v12',
  defaultZoom: parseInt(process.env.MAPBOX_DEFAULT_ZOOM) || 13,
  
  // URLs
  baseUrl: 'https://api.mapbox.com',
  directionsUrl: 'https://api.mapbox.com/directions/v5/mapbox',
  geocodingUrl: 'https://api.mapbox.com/geocoding/v5',
  isochroneUrl: 'https://api.mapbox.com/isochrone/v1/mapbox',
  matrixUrl: 'https://api.mapbox.com/matrix/v1/mapbox',
  
  // إعدادات إضافية
  language: 'ar',  // اللغة العربية
  units: 'metric', // وحدات القياس
  profile: 'driving' // نمط القيادة الافتراضي
};