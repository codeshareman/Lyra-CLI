/**
 * beforeRender Hook Example
 * 
 * This hook is called before the template is rendered.
 * You can use it to modify the template data or add custom sections.
 * 
 * @param {Object} context - Hook context
 * @param {string} context.type - Hook type ('beforeRender')
 * @param {Object} context.data - Template data (metadata, content, statistics)
 * @param {Object} context.config - Template configuration
 * @param {Object} context.options - Generation options
 * @returns {Object} Modified template data
 */
module.exports = function beforeRender(context) {
  const { data } = context;
  
  // Example: Add a custom summary section
  const customSummary = {
    totalItems: data.statistics.articles + data.statistics.tools + data.statistics.notes,
    generatedAt: new Date().toISOString(),
    weekNumber: getWeekNumber(new Date(data.metadata.weekStart))
  };
  
  // Example: Add trending topics based on tags
  const allTags = [
    ...(data.content.articles || []).flatMap(a => a.tags || []),
    ...(data.content.notes || []).flatMap(n => n.tags || [])
  ];
  
  const tagCounts = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});
  
  const trendingTopics = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);
  
  return {
    ...data,
    customSummary,
    trendingTopics
  };
};

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
