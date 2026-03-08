/**
 * 示例自定义评分 hook
 * 将所有文章的评分提高 1 分
 */
module.exports = function customArticleScore(context) {
  const { data } = context;
  
  // 如果是文章数组，提高每篇文章的评分
  if (Array.isArray(data)) {
    return data.map(article => ({
      ...article,
      rating: article.rating + 1
    }));
  }
  
  return data;
};
