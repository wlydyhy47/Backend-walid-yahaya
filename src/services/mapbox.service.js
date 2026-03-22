// ============================================
// ملف: src/services/mapbox.service.js
// الوصف: خدمة خرائط Mapbox المتكاملة
// ============================================

const axios = require('axios');
const { businessLogger } = require("../utils/logger.util");

class MapboxService {
  constructor() {
    this.accessToken = process.env.MAPBOX_SECRET_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
    this.baseUrl = 'https://api.mapbox.com';
    this.directionsUrl = `${this.baseUrl}/directions/v5/mapbox`;
    this.geocodingUrl = `${this.baseUrl}/geocoding/v5`;
    this.isochroneUrl = `${this.baseUrl}/isochrone/v1/mapbox`;
    this.matrixUrl = `${this.baseUrl}/matrix/v1/mapbox`;
    
    businessLogger.info('Mapbox service initialized');
  }

  // ========== 1. دوال المسارات (Directions) ==========

  /**
   * حساب المسار بين نقطتين
   * @param {Object} origin - { longitude, latitude }
   * @param {Object} destination - { longitude, latitude }
   * @param {Object} options - خيارات إضافية
   */
  async getDirections(origin, destination, options = {}) {
    try {
      const {
        profile = 'driving',
        alternatives = false,
        steps = true,
        geometries = 'geojson',
        overview = 'full',
        annotations = ['distance', 'duration']
      } = options;

      const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      
      const response = await axios.get(`${this.directionsUrl}/${profile}/${coordinates}`, {
        params: {
          access_token: this.accessToken,
          alternatives,
          steps,
          geometries,
          overview,
          annotations: annotations.join(',')
        }
      });

      const route = response.data.routes[0];
      
      return {
        success: true,
        data: {
          distance: route.distance, // بالأمتار
          distanceKm: (route.distance / 1000).toFixed(2),
          duration: route.duration, // بالثواني
          durationMinutes: Math.round(route.duration / 60),
          durationHuman: this.formatDuration(route.duration),
          geometry: route.geometry,
          steps: steps ? route.legs[0].steps : null,
          summary: route.summary
        }
      };
    } catch (error) {
      businessLogger.error('Mapbox directions error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * حساب مسار متعدد النقاط
   */
  async getMultiPointDirections(points, profile = 'driving') {
    try {
      const coordinates = points.map(p => `${p.longitude},${p.latitude}`).join(';');
      
      const response = await axios.get(`${this.directionsUrl}/${profile}/${coordinates}`, {
        params: {
          access_token: this.accessToken,
          steps: true,
          geometries: 'geojson',
          overview: 'full'
        }
      });

      return {
        success: true,
        data: response.data.routes[0]
      };
    } catch (error) {
      businessLogger.error('Multi-point directions error:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 2. دوال الترميز الجغرافي (Geocoding) ==========

  /**
   * تحويل عنوان إلى إحداثيات
   */
  async forwardGeocode(address) {
    try {
      const response = await axios.get(`${this.geocodingUrl}/mapbox.places/${encodeURIComponent(address)}.json`, {
        params: {
          access_token: this.accessToken,
          limit: 5,
          language: 'ar'
        }
      });

      const features = response.data.features.map(f => ({
        id: f.id,
        placeName: f.place_name,
        text: f.text,
        center: {
          longitude: f.center[0],
          latitude: f.center[1]
        },
        context: f.context,
        relevance: f.relevance
      }));

      return {
        success: true,
        data: features,
        suggestions: features.map(f => f.placeName)
      };
    } catch (error) {
      businessLogger.error('Forward geocode error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * تحويل إحداثيات إلى عنوان
   */
  async reverseGeocode(longitude, latitude) {
    try {
      const response = await axios.get(`${this.geocodingUrl}/mapbox.places/${longitude},${latitude}.json`, {
        params: {
          access_token: this.accessToken,
          limit: 1,
          language: 'ar'
        }
      });

      if (response.data.features.length === 0) {
        return { success: false, error: 'No address found' };
      }

      const feature = response.data.features[0];
      
      return {
        success: true,
        data: {
          address: feature.place_name,
          street: feature.text,
          city: feature.context?.find(c => c.id.includes('place'))?.text,
          country: feature.context?.find(c => c.id.includes('country'))?.text,
          coordinates: {
            longitude: feature.center[0],
            latitude: feature.center[1]
          }
        }
      };
    } catch (error) {
      businessLogger.error('Reverse geocode error:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 3. دوال المناطق الزمنية (Isochrone) ==========

  /**
   * حساب المناطق التي يمكن الوصول إليها خلال وقت معين
   */
  async getIsochrone(point, minutes = 10, profile = 'driving') {
    try {
      const response = await axios.get(`${this.isochroneUrl}/${profile}/${point.longitude},${point.latitude}`, {
        params: {
          access_token: this.accessToken,
          contours_minutes: minutes,
          polygons: true,
          denoise: 1,
          generalize: 0
        }
      });

      return {
        success: true,
        data: {
          geometry: response.data.features[0]?.geometry,
          minutes,
          profile
        }
      };
    } catch (error) {
      businessLogger.error('Isochrone error:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 4. دوال المصفوفة (Matrix) ==========

  /**
   * حساب المسافات والأوقات بين عدة نقاط
   */
  async getDistanceMatrix(points, profile = 'driving') {
    try {
      const coordinates = points.map(p => `${p.longitude},${p.latitude}`).join(';');
      
      const response = await axios.get(`${this.matrixUrl}/${profile}/${coordinates}`, {
        params: {
          access_token: this.accessToken,
          annotations: 'distance,duration'
        }
      });

      const distances = response.data.distances;
      const durations = response.data.durations;

      const matrix = points.map((origin, i) => ({
        origin: origin,
        destinations: points.map((destination, j) => ({
          destination,
          distance: distances?.[i]?.[j] || null,
          distanceKm: distances?.[i]?.[j] ? (distances[i][j] / 1000).toFixed(2) : null,
          duration: durations?.[i]?.[j] || null,
          durationMinutes: durations?.[i]?.[j] ? Math.round(durations[i][j] / 60) : null
        }))
      }));

      return {
        success: true,
        data: { matrix, distances, durations }
      };
    } catch (error) {
      businessLogger.error('Matrix error:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 5. دوال المندوبين ==========

  /**
   * حساب المسافة بين المندوب والعميل
   */
  async getDriverToCustomerDistance(driverLocation, customerLocation) {
    return this.getDirections(driverLocation, customerLocation);
  }

  /**
   * العثور على أقرب مندوب
   */
  async findNearestDriver(driversLocations, destination, profile = 'driving') {
    try {
      if (!driversLocations.length) {
        return { success: false, error: 'No drivers available' };
      }

      const allPoints = [...driversLocations, destination];
      const matrix = await this.getDistanceMatrix(allPoints, profile);
      
      if (!matrix.success) return matrix;

      const results = driversLocations.map((driver, index) => ({
        driver,
        distance: matrix.data.distances[index][driversLocations.length],
        duration: matrix.data.durations[index][driversLocations.length],
        durationMinutes: matrix.data.durations[index][driversLocations.length] ? 
          Math.round(matrix.data.durations[index][driversLocations.length] / 60) : null
      }));

      const sorted = results.sort((a, b) => a.duration - b.duration);
      
      return {
        success: true,
        data: {
          nearest: sorted[0],
          all: sorted
        }
      };
    } catch (error) {
      businessLogger.error('Find nearest driver error:', error);
      return { success: false, error: error.message };
    }
  }

  // ========== 6. دوال المساعد ==========

  /**
   * تنسيق الوقت
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} ساعة و ${minutes} دقيقة`;
    }
    return `${minutes} دقيقة`;
  }

  /**
   * الحصول على رابط الخريطة
   */
  getStaticMapImage(center, zoom = 13, width = 600, height = 400, markers = []) {
    let url = `${this.baseUrl}/styles/v1/${process.env.MAPBOX_STYLE || 'mapbox/streets-v12'}/static`;
    
    // إضافة المركز
    url += `/${center.longitude},${center.latitude},${zoom}`;
    
    // إضافة الحجم
    url += `/${width}x${height}`;
    
    // إضافة العلامات
    if (markers.length > 0) {
      const markerStrings = markers.map(m => {
        let color = m.color || 'red';
        let label = m.label ? `-${m.label}` : '';
        return `pin-${color}${label}(${m.longitude},${m.latitude})`;
      });
      url += `?overlay=${markerStrings.join(',')}`;
    }
    
    url += `&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;
    
    return url;
  }

  /**
   * الحصول على رابط الخريطة التفاعلية
   */
  getInteractiveMapUrl(center, zoom = 13, markers = []) {
    let url = `https://www.mapbox.com/mapbox-gl-js/example/`;
    // يمكن إضافة معلمات للتخصيص
    return url;
  }
}

module.exports = new MapboxService();