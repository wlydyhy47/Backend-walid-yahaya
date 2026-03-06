// utils/queryBuilder.util.js - ملف جديد
class QueryBuilder {
  constructor(model, query) {
    this.model = model;
    this.query = query;
    this.dbQuery = {};
    this.options = {};
  }

  // أضف فلتر فقط إذا كان موجود
  filterIfExists(field, dbField = null) {
    if (this.query[field]) {
      this.dbQuery[dbField || field] = this.query[field];
    }
    return this;
  }

  // بحث نصي ذكي
  search(fields = []) {
    if (this.query.search && fields.length) {
      this.dbQuery.$or = fields.map(f => ({
        [f]: { $regex: this.query.search, $options: 'i' }
      }));
    }
    return this;
  }

  // فلتر النطاق (min/max)
  rangeFilter(field, minField, maxField) {
    if (this.query[minField] || this.query[maxField]) {
      this.dbQuery[field] = {};
      if (this.query[minField]) this.dbQuery[field].$gte = Number(this.query[minField]);
      if (this.query[maxField]) this.dbQuery[field].$lte = Number(this.query[maxField]);
    }
    return this;
  }

  // Pagination ذكي
  paginate() {
    const page = Math.max(1, parseInt(this.query.page) || 1);
    const limit = Math.min(100, parseInt(this.query.limit) || 20);
    this.options = {
      skip: (page - 1) * limit,
      limit,
      sort: this.query.sortBy ? { [this.query.sortBy]: this.query.sortOrder === 'desc' ? -1 : 1 } : { createdAt: -1 }
    };
    return this;
  }

  // تنفيذ الاستعلام
  async execute() {
    const data = await this.model.find(this.dbQuery, null, this.options);
    const total = await this.model.countDocuments(this.dbQuery);
    return { data, total };
  }
}

module.exports = QueryBuilder;