import { ArticleFilter } from './ArticleFilter';
import { HookManager } from '../core/HookManager';
import { Article, ArticleFilterOptions } from '../types/interfaces';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ArticleFilter', () => {
  let tempDir: string;
  let hookManager: HookManager;

  beforeEach(async () => {
    // 创建临时测试目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'article-filter-test-'));
    hookManager = new HookManager();
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
    hookManager.clearHooks();
  });

  /**
   * 辅助函数：创建测试文章文件
   */
  async function createArticle(
    dir: string,
    filename: string,
    frontmatter: Record<string, any>
  ): Promise<string> {
    const filePath = path.join(dir, filename);
    const yamlContent = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join('\n');

    const content = `---\n${yamlContent}\n---\n\n# ${frontmatter.title || 'Article'}\n\nContent here.`;
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('基本筛选功能', () => {
    it('应该从单个数据源筛选文章', async () => {
      // 创建测试文章
      await createArticle(tempDir, 'article1.md', {
        title: 'Article 1',
        url: 'https://example.com/1',
        rating: 5,
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'Article 2',
        url: 'https://example.com/2',
        rating: 3,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Article 1');
      expect(result[0].rating).toBe(5);
      expect(result[1].title).toBe('Article 2');
      expect(result[1].rating).toBe(3);
    });

    it('应该按评分降序排序', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'Low Rating',
        url: 'https://example.com/1',
        rating: 2,
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'High Rating',
        url: 'https://example.com/2',
        rating: 5,
      });
      await createArticle(tempDir, 'article3.md', {
        title: 'Medium Rating',
        url: 'https://example.com/3',
        rating: 3,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(3);
      expect(result[0].rating).toBe(5);
      expect(result[1].rating).toBe(3);
      expect(result[2].rating).toBe(2);
    });

    it('应该返回前 N 篇文章', async () => {
      // 创建 5 篇文章
      for (let i = 1; i <= 5; i++) {
        await createArticle(tempDir, `article${i}.md`, {
          title: `Article ${i}`,
          url: `https://example.com/${i}`,
          rating: i,
        });
      }

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 3 });

      expect(result).toHaveLength(3);
      expect(result[0].rating).toBe(5);
      expect(result[1].rating).toBe(4);
      expect(result[2].rating).toBe(3);
    });

    it('应该遵守最小评分阈值', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'High Rating',
        url: 'https://example.com/1',
        rating: 5,
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'Medium Rating',
        url: 'https://example.com/2',
        rating: 3,
      });
      await createArticle(tempDir, 'article3.md', {
        title: 'Low Rating',
        url: 'https://example.com/3',
        rating: 1,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10, minRating: 3 });

      expect(result).toHaveLength(2);
      expect(result.every((article) => article.rating >= 3)).toBe(true);
    });

    it('应该处理缺少评分字段的文章（默认为 0）', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'No Rating',
        url: 'https://example.com/1',
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'With Rating',
        url: 'https://example.com/2',
        rating: 3,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].rating).toBe(3);
      expect(result[1].rating).toBe(0);
    });

    it('应该提取所有必需和可选字段', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Test Article',
        url: 'https://example.com/test',
        rating: 4,
        description: 'Test description',
        tags: ['tech', 'ai'],
        category: 'Technology',
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      const article = result[0];
      expect(article.title).toBe('Test Article');
      expect(article.url).toBe('https://example.com/test');
      expect(article.rating).toBe(4);
      expect(article.description).toBe('Test description');
      expect(article.tags).toEqual(['tech', 'ai']);
      expect(article.category).toBe('Technology');
    });

    it('应该提取文章图片配置字段', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Article With Images',
        url: 'https://example.com/image',
        rating: 5,
        coverImage: 'https://example.com/cover.jpg',
        images: [
          'https://example.com/cover.jpg',
          'https://example.com/detail-1.jpg',
          'https://example.com/detail-2.jpg',
        ],
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      const article = result[0];
      expect(article.image).toBe('https://example.com/cover.jpg');
      expect(article.coverImage).toBe('https://example.com/cover.jpg');
      expect(article.images).toEqual([
        'https://example.com/cover.jpg',
        'https://example.com/detail-1.jpg',
        'https://example.com/detail-2.jpg',
      ]);
    });

    it('应该支持 score 字段作为评分', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Article with Score',
        url: 'https://example.com/1',
        score: 4,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(4);
    });

    it('应该回退 source 字段作为 URL，并解析 published 为 created', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Article with Source and Published',
        source: 'https://example.com/source-only',
        rating: 5,
        published: '2026-03-01',
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/source-only');
      expect(result[0].created).toBe(new Date('2026-03-01').toISOString());
    });
  });

  describe('多数据源支持', () => {
    it('应该从多个数据源合并文章', async () => {
      // 创建两个数据源目录
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      await fs.mkdir(source1);
      await fs.mkdir(source2);

      await createArticle(source1, 'article1.md', {
        title: 'From Source 1',
        url: 'https://example.com/1',
        rating: 5,
      });
      await createArticle(source2, 'article2.md', {
        title: 'From Source 2',
        url: 'https://example.com/2',
        rating: 4,
      });

      const filter = new ArticleFilter(
        [{ path: source1 }, { path: source2 }],
        hookManager
      );
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('From Source 1');
      expect(result[1].title).toBe('From Source 2');
    });

    it('应该按优先级处理数据源', async () => {
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      await fs.mkdir(source1);
      await fs.mkdir(source2);

      // 两个数据源包含同名文件
      await createArticle(source1, 'article.md', {
        title: 'Low Priority',
        url: 'https://example.com/1',
        rating: 3,
      });
      await createArticle(source2, 'article.md', {
        title: 'High Priority',
        url: 'https://example.com/2',
        rating: 5,
      });

      const filter = new ArticleFilter(
        [
          { path: source1, priority: 0 },
          { path: source2, priority: 1 },
        ],
        hookManager
      );
      const result = await filter.filter({ topN: 10 });

      // 应该只有一篇文章（高优先级的）
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('High Priority');
    });

    it('应该保留数据源别名', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Test Article',
        url: 'https://example.com/1',
        rating: 5,
      });

      const filter = new ArticleFilter(
        { path: tempDir, alias: 'test-source' },
        hookManager
      );
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('test-source');
    });

    it('应该应用 include 模式', async () => {
      const subdir = path.join(tempDir, 'subdir');
      await fs.mkdir(subdir);

      await createArticle(tempDir, 'root.md', {
        title: 'Root Article',
        url: 'https://example.com/1',
        rating: 5,
      });
      await createArticle(subdir, 'sub.md', {
        title: 'Sub Article',
        url: 'https://example.com/2',
        rating: 4,
      });

      // 只包含根目录的文件
      const filter = new ArticleFilter(
        { path: tempDir, include: ['*.md'] },
        hookManager
      );
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Root Article');
    });

    it('应该应用 exclude 模式', async () => {
      const archive = path.join(tempDir, 'Archive');
      await fs.mkdir(archive);

      await createArticle(tempDir, 'active.md', {
        title: 'Active Article',
        url: 'https://example.com/1',
        rating: 5,
      });
      await createArticle(archive, 'archived.md', {
        title: 'Archived Article',
        url: 'https://example.com/2',
        rating: 4,
      });

      const filter = new ArticleFilter(
        { path: tempDir, exclude: ['**/Archive/**'] },
        hookManager
      );
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Active Article');
    });
  });

  describe('钩子集成', () => {
    it('应该执行 beforeArticleFilter 钩子', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'Article 1',
        url: 'https://example.com/1',
        rating: 5,
        tags: ['tech'],
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'Article 2',
        url: 'https://example.com/2',
        rating: 4,
        tags: ['other'],
      });

      // 注册钩子：只保留 tech 标签的文章
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data.filter(article => 
            article.tags && article.tags.includes('tech')
          );
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('beforeArticleFilter', hookPath);

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Article 1');
    });

    it('应该执行 customArticleScore 钩子', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'Short',
        url: 'https://example.com/1',
        rating: 3,
        description: 'Short',
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'Long',
        url: 'https://example.com/2',
        rating: 3,
        description: 'This is a much longer description with more content',
      });

      // 注册钩子：根据描述长度调整评分
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data.map(article => ({
            ...article,
            rating: article.rating + (article.description && article.description.length > 20 ? 1 : 0)
          }));
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('customArticleScore', hookPath);

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Long');
      expect(result[0].rating).toBe(4);
      expect(result[1].title).toBe('Short');
      expect(result[1].rating).toBe(3);
    });

    it('应该执行 afterArticleFilter 钩子', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'Article 1',
        url: 'https://example.com/1',
        rating: 5,
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'Article 2',
        url: 'https://example.com/2',
        rating: 4,
      });

      // 注册钩子：只返回第一篇文章
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data.slice(0, 1);
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('afterArticleFilter', hookPath);

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Article 1');
    });
  });

  describe('错误处理', () => {
    it('应该在目录不存在时抛出错误', async () => {
      const filter = new ArticleFilter('/nonexistent/path', hookManager);

      await expect(filter.filter({ topN: 10 })).rejects.toThrow(
        '所有数据源都不可用'
      );
    });

    it('应该在单个文件解析失败时继续处理其他文件', async () => {
      await createArticle(tempDir, 'valid.md', {
        title: 'Valid Article',
        url: 'https://example.com/1',
        rating: 5,
      });

      // 创建无效的 markdown 文件
      await fs.writeFile(
        path.join(tempDir, 'invalid.md'),
        'Invalid content without frontmatter',
        'utf-8'
      );

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      // 应该至少包含有效的文章
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].title).toBe('Valid Article');
    });

    it('应该在数据源不存在时跳过该数据源', async () => {
      const validSource = path.join(tempDir, 'valid');
      await fs.mkdir(validSource);
      await createArticle(validSource, 'article.md', {
        title: 'Valid Article',
        url: 'https://example.com/1',
        rating: 5,
      });

      const filter = new ArticleFilter(
        [{ path: validSource }, { path: '/nonexistent/path' }],
        hookManager
      );
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid Article');
    });

    it('应该在钩子执行失败时使用默认行为', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Test Article',
        url: 'https://example.com/1',
        rating: 5,
      });

      // 注册会抛出错误的钩子
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          throw new Error('Hook error');
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('beforeArticleFilter', hookPath);

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      // 应该回退到默认行为，返回文章
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Article');
    });
  });

  describe('边界情况', () => {
    it('应该处理空目录', async () => {
      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toEqual([]);
    });

    it('应该处理 topN 为 0', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Test Article',
        url: 'https://example.com/1',
        rating: 5,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 0 });

      expect(result).toEqual([]);
    });

    it('应该处理 topN 大于文章总数', async () => {
      await createArticle(tempDir, 'article.md', {
        title: 'Test Article',
        url: 'https://example.com/1',
        rating: 5,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 100 });

      expect(result).toHaveLength(1);
    });

    it('应该处理所有文章评分都低于阈值的情况', async () => {
      await createArticle(tempDir, 'article1.md', {
        title: 'Low Rating 1',
        url: 'https://example.com/1',
        rating: 1,
      });
      await createArticle(tempDir, 'article2.md', {
        title: 'Low Rating 2',
        url: 'https://example.com/2',
        rating: 2,
      });

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10, minRating: 5 });

      expect(result).toEqual([]);
    });

    it('应该处理缺少 title 字段的文章（使用文件名）', async () => {
      const filePath = path.join(tempDir, 'no-title.md');
      await fs.writeFile(
        filePath,
        `---
url: https://example.com/1
rating: 5
---

Content without title.`,
        'utf-8'
      );

      const filter = new ArticleFilter(tempDir, hookManager);
      const result = await filter.filter({ topN: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('no-title');
    });
  });
});
