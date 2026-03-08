/**
 * afterToolFilter Hook Example
 * 
 * This hook is called after tools are filtered.
 * You can use it to post-process the filtered tools.
 * 
 * @param {Object} context - Hook context
 * @param {string} context.type - Hook type ('afterToolFilter')
 * @param {Array} context.data - Array of filtered tools
 * @param {Object} context.config - Template configuration
 * @param {Object} context.options - Filter options
 * @returns {Array} Modified array of tools
 */
module.exports = function afterToolFilter(context) {
  const { data: tools } = context;
  
  // Example: Add category emoji based on category name
  const categoryEmojis = {
    'Development': '💻',
    'Productivity': '⚡',
    'Design': '🎨',
    'Communication': '💬',
    'Other': '🔧'
  };
  
  return tools.map(tool => ({
    ...tool,
    categoryEmoji: categoryEmojis[tool.category] || '📦',
    displayTitle: `${categoryEmojis[tool.category] || '📦'} ${tool.title}`
  }));
};
