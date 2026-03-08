/**
 * customArticleScore Hook Example
 * 
 * This hook allows you to customize the scoring algorithm for articles.
 * The default behavior is to sort by rating, but you can implement
 * any custom logic here.
 * 
 * @param {Object} context - Hook context
 * @param {string} context.type - Hook type ('customArticleScore')
 * @param {Array} context.data - Array of articles
 * @param {Object} context.config - Template configuration
 * @param {Object} context.options - Filter options
 * @returns {Array} Articles with modified ratings
 */
module.exports = function customArticleScore(context) {
  const { data: articles } = context;
  
  // Example: Boost recent articles (within last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return articles.map(article => {
    let adjustedRating = article.rating;
    
    // Boost recent articles by 1 point
    if (article.created && new Date(article.created) > sevenDaysAgo) {
      adjustedRating += 1;
    }
    
    // Boost articles with specific tags
    if (article.tags && article.tags.includes('featured')) {
      adjustedRating += 2;
    }
    
    return {
      ...article,
      rating: adjustedRating,
      originalRating: article.rating
    };
  });
};
