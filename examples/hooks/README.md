# Hook Function Examples

This directory contains example hook functions that demonstrate how to customize the content generation process.

## Hook Types

### 1. beforeArticleFilter
Called before articles are filtered. Use this to preprocess articles or add metadata.

**Context:**
- `type`: 'beforeArticleFilter'
- `data`: Array of all articles
- `config`: Template configuration
- `options`: Filter options (topN, minRating)

**Example:** `before-article-filter.js`

### 2. customArticleScore
Customize the scoring algorithm for articles. The default sorts by rating.

**Context:**
- `type`: 'customArticleScore'
- `data`: Array of articles
- `config`: Template configuration
- `options`: Filter options

**Example:** `custom-article-score.js` - Boosts recent articles and featured content

### 3. afterArticleFilter
Called after articles are filtered. Use this to post-process the filtered results.

**Context:**
- `type`: 'afterArticleFilter'
- `data`: Array of filtered articles
- `config`: Template configuration
- `options`: Filter options

### 4. beforeToolFilter
Called before tools are filtered.

**Context:**
- `type`: 'beforeToolFilter'
- `data`: Array of all tools
- `config`: Template configuration
- `options`: Filter options (perCategory)

### 5. customToolScore
Customize the scoring algorithm for tools.

**Context:**
- `type`: 'customToolScore'
- `data`: Array of tools
- `config`: Template configuration
- `options`: Filter options

### 6. afterToolFilter
Called after tools are filtered.

**Context:**
- `type`: 'afterToolFilter'
- `data`: Array of filtered tools
- `config`: Template configuration
- `options`: Filter options

**Example:** `after-tool-filter.js` - Adds category emojis

### 7. contentFilter
Filter aggregated content (notes).

**Context:**
- `type`: 'contentFilter'
- `data`: Array of content items
- `config`: Template configuration
- `options`: Aggregation options

### 8. beforeRender
Called before the template is rendered. Modify template data or add custom sections.

**Context:**
- `type`: 'beforeRender'
- `data`: Complete template data (metadata, content, statistics)
- `config`: Template configuration
- `options`: Generation options

**Example:** `before-render.js` - Adds custom summary and trending topics

### 9. afterRender
Called after the template is rendered. Modify the final output.

**Context:**
- `type`: 'afterRender'
- `data`: Rendered content (string)
- `config`: Template configuration
- `options`: Generation options

## Hook Function Signature

All hook functions must follow this signature:

```javascript
/**
 * @param {Object} context - Hook context
 * @param {string} context.type - Hook type
 * @param {any} context.data - Hook-specific data
 * @param {Object} context.config - Template configuration
 * @param {Object} context.options - Hook-specific options
 * @returns {any} Modified data (same type as input data)
 */
module.exports = function myHook(context) {
  const { data, config, options } = context;
  
  // Your custom logic here
  
  return modifiedData;
};
```

## Using Hooks

1. Create your hook function file (e.g., `my-custom-hook.js`)
2. Add it to your configuration:

```json
{
  "templates": {
    "weekly": {
      "hooks": {
        "customArticleScore": "./hooks/my-custom-hook.js"
      }
    }
  }
}
```

3. The hook will be automatically loaded and executed at the appropriate time

## Error Handling

If a hook throws an error, the system will:
1. Log a warning message
2. Continue with the default behavior
3. Use the original data (graceful degradation)

This ensures that a broken hook won't prevent content generation.

## Best Practices

1. **Keep hooks simple** - Complex logic should be in separate modules
2. **Return the same data type** - Don't change the structure of the data
3. **Handle errors gracefully** - Use try-catch blocks for risky operations
4. **Log useful information** - Help with debugging
5. **Test your hooks** - Create test cases to verify behavior
6. **Document your hooks** - Explain what they do and why

## Async Hooks

Hooks can be async functions:

```javascript
module.exports = async function myAsyncHook(context) {
  const { data } = context;
  
  // Async operation
  const enrichedData = await fetchAdditionalData(data);
  
  return enrichedData;
};
```

## Examples by Use Case

### Boost Recent Content
See `custom-article-score.js` - Increases rating for recent articles

### Add Visual Elements
See `after-tool-filter.js` - Adds category emojis

### Custom Summaries
See `before-render.js` - Adds trending topics and custom statistics

### Filter by Tags
Create a hook that filters content based on specific tags

### Enrich with External Data
Fetch additional information from APIs or databases

### Custom Formatting
Modify titles, descriptions, or other text fields
