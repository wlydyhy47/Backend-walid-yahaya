/**
 * Middleware لتعطيل الكاش لطلبات معينة
 */
const disableCache = (req, res, next) => {
  // تعطيل الكاش لهذا الطلب
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // إضافة header للإشارة إلى تعطيل الكاش
  res.locals.noCache = true;
  
  next();
};

module.exports = disableCache;