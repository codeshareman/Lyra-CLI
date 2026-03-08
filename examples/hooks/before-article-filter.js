/**
 * beforeArticleFilter Hook Example
 * 
 * This hook is called before articles are filtered.
 * You can use it to preprocess articles or add additional metadata.
 * 
 * @param {Object} context - Hook context
 * @param {string} context.type - Hook type ('beforeArticleFilter')
 * @param {Array} context.data - Array of articles
 * @param {Object} context.config - Template configuration
 * @param {Object} context.options - Filter options
 * @returns {Array} Modified array of articles
 */
module.exports = function beforeArticleFilter(context) {
  const { data: articles } = context;
  
  console.log(`Processing ${articles.length} articles before filtering`);
  
  // Example: Add a timestamp to each article
  return articles.map(article => ({
    ...article,
    processedAt: new Date().toISOString()
  }));
};
