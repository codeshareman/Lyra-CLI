/**
 * ArticleFilter 属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ArticleFilter } from './ArticleFilter';
import { HookManager } from '../core/HookManager';
import { Article, ArticleFilterOptions } from '../types/interfaces';

describe('ArticleFilter Property Tests', () => {
  let testDir: string;
  let hookManager: HookManager;
  let runIndex: number;

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../test-property-articles', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });
    hookManager = new HookManager();
    runIndex = 0;
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
    hookManager.clearHooks();
  });

  // 辅助函数：创建测试文章文件
  async function createTestArticle(
    filePath: string,
    article: { title: string; url?: string; rating?: number; description?: string | null; tags?: string[]; category?: string }
  ): Promise<void> {
    const frontmatter = {
      title: article.title,
      ...(article.url && { url: article.url }),
      ...(article.rating !== undefined && { rating: article.rating }),
      ...(article.description && { description: article.description }),
      ...(article.tags && { tags: article.tags }),
      ...(article.category && { category: article.category })
    };

    const content = `---
${Object.entries(frontmatter)
  .map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  })
  .join('\n')}
---

# ${article.title}

This is the content of the article.
`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async function createRunDir(): Promise<string> {
    const runDir = path.join(testDir, `run-${runIndex++}`);
    await fs.mkdir(runDir, { recursive: true });
    return runDir;
  }

  const safeFileNameArbitrary = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

  describe('Property 4: 文章筛选按评分降序排列', () => {
    it('对于任意文章集合，返回的列表应该按评分降序排列', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              url: fc.webUrl(),
              rating: fc.integer({ min: 0, max: 5 }),
              description: fc.option(fc.string({ maxLength: 200 }))
            }),
            { minLength: 2, maxLength: 20 }
          ),
          fc.integer({ min: 1, max: 50 }),
          async (articles, topN) => {
            const runDir = await createRunDir();
            // 创建测试文章文件
            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `article-${i}.md`);
              await createTestArticle(filePath, articles[i]);
            }

            // 创建 ArticleFilter 并筛选
            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN });

            // 验证按评分降序排列
            for (let i = 0; i < result.length - 1; i++) {
              expect(result[i].rating).toBeGreaterThanOrEqual(result[i + 1].rating);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于相同评分的文章，排序应该保持稳定', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { minLength: 3, maxLength: 10 }),
          async (sameRating, titles) => {
            const runDir = await createRunDir();
            // 创建相同评分的文章
            for (let i = 0; i < titles.length; i++) {
              const filePath = path.join(runDir, `same-rating-${i}.md`);
              await createTestArticle(filePath, {
                title: titles[i],
                url: `https://example.com/${i}`,
                rating: sameRating
              });
            }

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN: titles.length });

            // 所有文章应该有相同评分
            result.forEach(article => {
              expect(article.rating).toBe(sameRating);
            });

            // 应该返回所有文章
            expect(result.length).toBe(titles.length);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property 5: 文章筛选返回前 N 篇', () => {
    it('对于任意文章集合，返回的数量应该等于 min(topN, 总数)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              rating: fc.integer({ min: 0, max: 5 })
            }),
            { minLength: 1, maxLength: 30 }
          ),
          fc.integer({ min: 1, max: 50 }),
          async (articles, topN) => {
            const runDir = await createRunDir();
            // 创建测试文章文件
            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `article-${i}.md`);
              await createTestArticle(filePath, {
                title: articles[i].title,
                url: `https://example.com/${i}`,
                rating: articles[i].rating
              });
            }

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN });

            // 验证返回数量
            const expectedCount = Math.min(topN, articles.length);
            expect(result.length).toBe(expectedCount);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于空目录，应该返回空数组', async () => {
      const filter = new ArticleFilter(testDir, hookManager);
      const result = await filter.filter({ topN: 10 });
      
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Property 6: 文章筛选遵守最小评分阈值', () => {
    it('对于任意文章集合和阈值，所有返回文章的评分都应该 >= 阈值', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              rating: fc.integer({ min: 0, max: 5 })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 1, max: 50 }),
          async (articles, minRating, topN) => {
            const runDir = await createRunDir();
            // 创建测试文章文件
            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `article-${i}.md`);
              await createTestArticle(filePath, {
                title: articles[i].title,
                url: `https://example.com/${i}`,
                rating: articles[i].rating
              });
            }

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN, minRating });

            // 验证所有返回的文章评分都 >= 阈值
            result.forEach(article => {
              expect(article.rating).toBeGreaterThanOrEqual(minRating);
            });

            // 验证返回数量不超过符合条件的文章数
            const qualifiedCount = articles.filter(a => a.rating >= minRating).length;
            expect(result.length).toBeLessThanOrEqual(Math.min(topN, qualifiedCount));
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于高阈值，应该正确过滤低评分文章', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 5 }), // 高阈值
          async (minRating) => {
            const runDir = await createRunDir();
            // 创建混合评分的文章
            const articles = [
              { title: 'Low Rating 1', rating: 1 },
              { title: 'Low Rating 2', rating: 2 },
              { title: 'High Rating 1', rating: 4 },
              { title: 'High Rating 2', rating: 5 },
              { title: 'Threshold Rating', rating: minRating }
            ];

            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `mixed-${i}.md`);
              await createTestArticle(filePath, {
                title: articles[i].title,
                url: `https://example.com/${i}`,
                rating: articles[i].rating
              });
            }

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN: 10, minRating });

            // 验证没有低于阈值的文章
            result.forEach(article => {
              expect(article.rating).toBeGreaterThanOrEqual(minRating);
            });

            // 验证包含阈值评分的文章
            const thresholdArticle = result.find(a => a.rating === minRating);
            expect(thresholdArticle).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 31 & 32: Hook 执行前后调用正确性', () => {
    it('beforeArticleFilter hook 应该在筛选前被调用', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              rating: fc.integer({ min: 0, max: 5 })
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (articles) => {
            const runDir = await createRunDir();
            // 创建测试文章
            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `hook-before-${i}.md`);
              await createTestArticle(filePath, {
                title: articles[i].title,
                rating: articles[i].rating
              });
            }

            // 创建 beforeArticleFilter hook
            const hookPath = path.join(runDir, 'before-hook.js');
            const hookContent = `
module.exports = function(context) {
  // 为所有文章添加标记，证明 hook 被调用
  return context.data.map(article => ({
    ...article,
    beforeHookApplied: true
  }));
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook('beforeArticleFilter', hookPath);

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN: 10 });

            // 验证 hook 被应用
            result.forEach(article => {
              expect(article).toHaveProperty('beforeHookApplied', true);
            });
          }
        ),
        { numRuns: 20 }
      );
    });

    it('afterArticleFilter hook 应该在筛选后被调用', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              rating: fc.integer({ min: 3, max: 5 }) // 高评分确保被选中
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (articles) => {
            const runDir = await createRunDir();
            // 创建测试文章
            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `hook-after-${i}.md`);
              await createTestArticle(filePath, {
                title: articles[i].title,
                rating: articles[i].rating
              });
            }

            // 创建 afterArticleFilter hook
            const hookPath = path.join(runDir, 'after-hook.js');
            const hookContent = `
module.exports = function(context) {
  // 为筛选后的文章添加标记
  return context.data.map(article => ({
    ...article,
    afterHookApplied: true,
    finalRating: article.rating
  }));
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook('afterArticleFilter', hookPath);

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN: 5 });

            // 验证 hook 被应用到最终结果
            result.forEach(article => {
              expect(article).toHaveProperty('afterHookApplied', true);
              expect(article).toHaveProperty('finalRating');
            });
          }
        ),
        { numRuns: 20 }
      );
    });

    it('customArticleScore hook 应该能修改文章评分', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              rating: fc.integer({ min: 1, max: 3 }) // 原始低评分
            }),
            { minLength: 3, maxLength: 8 }
          ),
          fc.integer({ min: 1, max: 2 }), // 评分增量
          async (articles, ratingBoost) => {
            const runDir = await createRunDir();
            // 创建测试文章
            for (let i = 0; i < articles.length; i++) {
              const filePath = path.join(runDir, `score-${i}.md`);
              await createTestArticle(filePath, {
                title: articles[i].title,
                rating: articles[i].rating
              });
            }

            // 创建 customArticleScore hook
            const hookPath = path.join(runDir, 'score-hook.js');
            const hookContent = `
module.exports = function(context) {
  // 为所有文章增加评分
  return context.data.map(article => ({
    ...article,
    rating: article.rating + ${ratingBoost},
    originalRating: article.rating
  }));
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook('customArticleScore', hookPath);

            const filter = new ArticleFilter(runDir, hookManager);
            const result = await filter.filter({ topN: 10 });

            // 验证评分被修改
            result.forEach(article => {
              expect(article).toHaveProperty('originalRating');
              expect(article.rating).toBe((article as any).originalRating + ratingBoost);
            });

            // 验证仍然按修改后的评分排序
            for (let i = 0; i < result.length - 1; i++) {
              expect(result[i].rating).toBeGreaterThanOrEqual(result[i + 1].rating);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 39 & 40: Glob 模式正确性', () => {
    it('exclude 模式应该正确排除匹配的文件', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(safeFileNameArbitrary, { minLength: 2, maxLength: 8 }),
          async (fileNames) => {
            const runDir = await createRunDir();
            // 创建测试文件，一些在 exclude 目录中
            const excludeDir = path.join(runDir, 'exclude');
            await fs.mkdir(excludeDir, { recursive: true });

            for (let i = 0; i < fileNames.length; i++) {
              const fileName = `${fileNames[i]}.md`;
              
              // 一半文件放在 exclude 目录
              const filePath = i % 2 === 0 
                ? path.join(runDir, fileName)
                : path.join(excludeDir, fileName);
                
              await createTestArticle(filePath, {
                title: fileNames[i],
                rating: 3
              });
            }

            // 使用 exclude 模式
            const dataSource = {
              path: runDir,
              include: ['**/*.md'],
              exclude: ['exclude/**']
            };

            const filter = new ArticleFilter(dataSource, hookManager);
            const result = await filter.filter({ topN: 100 });

            // 验证没有来自 exclude 目录的文件
            result.forEach(article => {
              expect(article.path).not.toContain('exclude');
            });

            // 验证包含非 exclude 目录的文件
            const expectedCount = Math.ceil(fileNames.length / 2);
            expect(result.length).toBe(expectedCount);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('include 模式应该只包含匹配的文件', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(safeFileNameArbitrary, { minLength: 3, maxLength: 8 }),
          async (fileNames) => {
            const runDir = await createRunDir();
            // 创建不同扩展名的文件
            for (let i = 0; i < fileNames.length; i++) {
              const extensions = ['.md', '.txt', '.json'];
              const ext = extensions[i % extensions.length];
              const filePath = path.join(runDir, `${fileNames[i]}${ext}`);
              
              if (ext === '.md') {
                await createTestArticle(filePath, {
                  title: fileNames[i],
                  rating: 3
                });
              } else {
                // 创建非 markdown 文件
                await fs.writeFile(filePath, `Content of ${fileNames[i]}`, 'utf-8');
              }
            }

            // 只包含 .md 文件
            const dataSource = {
              path: runDir,
              include: ['**/*.md'],
              exclude: []
            };

            const filter = new ArticleFilter(dataSource, hookManager);
            const result = await filter.filter({ topN: 100 });

            // 验证所有结果都是 .md 文件
            result.forEach(article => {
              expect(article.path).toMatch(/\.md$/);
            });

            // 验证数量正确
            const mdCount = fileNames.filter((_, i) => i % 3 === 0).length;
            expect(result.length).toBe(mdCount);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('边界情况测试', () => {
    it('应该处理缺少评分字段的文章', async () => {
      const filePath = path.join(testDir, 'no-rating.md');
      const content = `---
title: "No Rating Article"
url: "https://example.com"
---

Content without rating.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const filter = new ArticleFilter(testDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(0); // 默认评分
      expect(result[0].title).toBe('No Rating Article');
    });

    it('应该处理无效的 frontmatter', async () => {
      const filePath = path.join(testDir, 'invalid-frontmatter.md');
      const content = `---
invalid yaml: [unclosed
---

Content with invalid frontmatter.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const filter = new ArticleFilter(testDir, hookManager);
      
      // 应该优雅处理错误
      await expect(filter.filter({ topN: 10 })).resolves.not.toThrow();
    });

    it('应该处理不存在的数据源目录', async () => {
      const nonExistentPath = path.join(testDir, 'nonexistent');
      const filter = new ArticleFilter(nonExistentPath, hookManager);

      await expect(filter.filter({ topN: 10 })).rejects.toThrow();
    });
  });
});
