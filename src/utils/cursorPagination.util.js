// utils/cursorPagination.util.js - ملف جديد
class CursorPagination {
  static async paginate(model, query = {}, limit = 20, cursor = null, sortField = '_id') {
    const paginatedQuery = { ...query };
    
    if (cursor) {
      paginatedQuery[sortField] = sortField === '_id' 
        ? { $lt: mongoose.Types.ObjectId(cursor) }
        : { $lt: cursor };
    }
    
    const items = await model.find(paginatedQuery)
      .sort({ [sortField]: -1 })
      .limit(limit + 1);
    
    const hasMore = items.length > limit;
    const results = items.slice(0, limit);
    const nextCursor = hasMore ? results[results.length - 1][sortField] : null;
    
    return { results, nextCursor, hasMore, total: await model.countDocuments(query) };
  }
}

// استخدامها في controller
const { results, nextCursor } = await CursorPagination.paginate(
  Order, 
  { user: userId },
  20,
  req.query.cursor
);