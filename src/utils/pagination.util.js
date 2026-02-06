/**
 * 🎯 أدوات المساعدة للتعامل مع Pagination
 */

class PaginationUtils {
  /**
   * تحويل query parameters إلى options للـ pagination
   */
  static getPaginationOptions(req) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    
    // الحصول على ترتيب الفرز
    let sort = {};
    if (req.query.sortBy) {
      const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
      sort[req.query.sortBy] = sortOrder;
    } else {
      sort = { createdAt: -1 }; // الترتيب الافتراضي
    }
    
    // البحث النصي
    const search = req.query.search || '';
    const searchFields = req.query.searchFields ? req.query.searchFields.split(',') : [];
    
    return {
      page,
      limit,
      skip,
      sort,
      search,
      searchFields,
      filters: this.parseFilters(req.query),
    };
  }

  /**
   * تحويل query filters إلى كائن قابل للاستخدام
   */
  static parseFilters(query) {
    const filters = {};
    
    // فلترة حسب الحقول البسيطة
    Object.keys(query).forEach(key => {
      if (key.startsWith('filter[') && key.endsWith(']')) {
        const field = key.substring(7, key.length - 1);
        const value = query[key];
        
        if (value !== undefined && value !== '') {
          // معالجة القيم الخاصة
          if (value === 'true' || value === 'false') {
            filters[field] = value === 'true';
          } else if (!isNaN(value) && value !== '') {
            filters[field] = Number(value);
          } else {
            filters[field] = value;
          }
        }
      }
    });

    // فلترة النطاقات (between)
    if (query.minPrice || query.maxPrice) {
      filters.price = {};
      if (query.minPrice) filters.price.$gte = Number(query.minPrice);
      if (query.maxPrice) filters.price.$lte = Number(query.maxPrice);
    }

    if (query.minDate || query.maxDate) {
      filters.createdAt = {};
      if (query.minDate) filters.createdAt.$gte = new Date(query.minDate);
      if (query.maxDate) filters.createdAt.$lte = new Date(query.maxDate);
    }

    // فلترة المصفوفات (array)
    if (query.tags) {
      filters.tags = { $in: query.tags.split(',') };
    }

    if (query.categories) {
      filters.category = { $in: query.categories.split(',') };
    }

    return filters;
  }

  /**
   * إنشاء استجابة pagination موحدة
   */
  static createPaginationResponse(data, total, paginationOptions, extra = {}) {
    const { page, limit } = paginationOptions;
    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      data: data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
      },
      ...extra,
      timestamp: new Date(),
    };
  }

  /**
   * بناء روابط pagination للـ HATEOAS
   */
  static buildPaginationLinks(req, paginationData) {
    const { page, limit, totalPages } = paginationData;
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    
    const links = {
      self: `${baseUrl}?page=${page}&limit=${limit}`,
      first: `${baseUrl}?page=1&limit=${limit}`,
      last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
    };

    if (page < totalPages) {
      links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
    }

    if (page > 1) {
      links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
    }

    return links;
  }

  /**
   * إنشاء استعلام بحث نصي
   */
  static buildSearchQuery(search, searchFields = []) {
    if (!search || searchFields.length === 0) return {};
    
    const searchQuery = {
      $or: searchFields.map(field => ({
        [field]: { $regex: search, $options: 'i' }
      }))
    };
    
    return searchQuery;
  }

  /**
   * معالجة aggregation pipeline للـ pagination
   */
  static getAggregationPipeline(paginationOptions, matchStage = {}) {
    const { skip, limit, sort } = paginationOptions;
    
    return [
      { $match: matchStage },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ];
  }

  /**
   * التحقق من صحة معاملات pagination
   */
  static validatePaginationParams(req, res, next) {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);
    
    if (page && (isNaN(page) || page < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive number',
      });
    }
    
    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100',
      });
    }
    
    next();
  }
}

module.exports = PaginationUtils;