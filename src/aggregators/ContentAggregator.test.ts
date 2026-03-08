import { ContentAggregator } from './ContentAggregator';
import { HookManager } from '../core/HookManager';
import { ContentItem, AggregateOptions } from '../types/interfaces';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ContentAggregator', () => {
  let tempDir: string;
  let hookManager: HookManager;

  beforeEach(async () => {
    // 创建临时测试目录
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'content-aggregator-test-')
    );
    hookManager = new HookManager();
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
    hookManager.clearHooks();
  });

  /**
   * 辅助函数：创建测试内容文件
   */
  async function createContent(
    dir: string,
    filename: string,
    frontmatter: Record<string, any>,
    content: string = 'Test content'
  ): Promise<string> {
    const filePath = path.join(dir, filename);
    const yamlContent = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`;
        }
        if (value instanceof Date) {
          return `${key}: ${value.toISOString()}`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join('\n');

    const fileContent = `---\n${yamlContent}\n---\n\n${content}`;
    await fs.writeFile(filePath, fileContent, 'utf-8');
    return filePath;
  }

  describe('基本聚合功能', () => {
    it('应该从单个数据源聚合内容', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      await createContent(tempDir, 'note1.md', {
        title: 'Note 1',
        created: today.toISOString(),
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Note 2',
        created: yesterday.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const startDate = new Date(yesterday);
      startDate.setDate(startDate.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate,
        endDate: new Date(today.getTime() + 86400000), // +1 day
      });

      expect(result).toHaveLength(2);
      expect(result.some((item) => item.title === 'Note 1')).toBe(true);
      expect(result.some((item) => item.title === 'Note 2')).toBe(true);
    });

    it('应该按日期范围筛选内容', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);

      await createContent(tempDir, 'recent.md', {
        title: 'Recent Note',
        created: today.toISOString(),
      });
      await createContent(tempDir, 'old.md', {
        title: 'Old Note',
        created: lastWeek.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const result = await aggregator.aggregate({
        startDate: yesterday,
        endDate: new Date(today.getTime() + 86400000),
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Recent Note');
    });

    it('应该使用默认结束日期（开始日期 + 7 天）', async () => {
      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const tenDaysAgo = new Date(today);
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      await createContent(tempDir, 'recent.md', {
        title: 'Recent Note',
        created: threeDaysAgo.toISOString(),
      });
      await createContent(tempDir, 'old.md', {
        title: 'Old Note',
        created: tenDaysAgo.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      // 开始日期设置为 5 天前，这样 3 天前的内容在范围内，10 天前的不在
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 5);

      const result = await aggregator.aggregate({ startDate });

      // 应该包含 7 天内的内容（从 5 天前到 2 天后）
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Recent Note');
    });

    it('应该提取所有必需和可选字段', async () => {
      const today = new Date();
      await createContent(
        tempDir,
        'note.md',
        {
          title: 'Test Note',
          created: today.toISOString(),
          description: 'Test description',
          tags: ['tech', 'ai'],
          category: 'Technology',
        },
        'Test content body'
      );

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      const item = result[0];
      expect(item.title).toBe('Test Note');
      expect(item.description).toBe('Test description');
      expect(item.tags).toEqual(['tech', 'ai']);
      expect(item.category).toBe('Technology');
      expect(item.content).toContain('Test content body');
      expect(item.contentHash).toBeDefined();
      expect(item.path).toContain('note.md');
    });

    it('应该提取内容图片配置字段', async () => {
      const today = new Date();
      await createContent(
        tempDir,
        'note-with-image.md',
        {
          title: 'Note With Images',
          created: today.toISOString(),
          coverImage: 'https://example.com/note-cover.jpg',
          images: [
            'https://example.com/note-cover.jpg',
            'https://example.com/note-detail.jpg',
          ],
        },
        'Content with image fields'
      );

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      const item = result[0];
      expect(item.image).toBe('https://example.com/note-cover.jpg');
      expect(item.coverImage).toBe('https://example.com/note-cover.jpg');
      expect(item.images).toEqual([
        'https://example.com/note-cover.jpg',
        'https://example.com/note-detail.jpg',
      ]);
    });

    it('应该使用 date 字段作为创建日期的后备', async () => {
      const today = new Date();
      await createContent(tempDir, 'note.md', {
        title: 'Note with date field',
        date: today.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Note with date field');
    });

    it('应该使用文件修改时间作为创建日期的最后后备', async () => {
      // 创建没有 created 或 date 字段的文件
      await createContent(tempDir, 'note.md', {
        title: 'Note without date',
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      // 验证 created 字段存在且可以转换为有效的日期
      expect(result[0].created).toBeDefined();
      const createdDate = new Date(result[0].created);
      expect(createdDate.getTime()).toBeGreaterThan(0);
      expect(isNaN(createdDate.getTime())).toBe(false);
    });

    it('应该计算内容哈希', async () => {
      const today = new Date();
      await createContent(tempDir, 'note.md', {
        title: 'Test Note',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].contentHash).toBeDefined();
      expect(typeof result[0].contentHash).toBe('string');
      if (result[0].contentHash) {
        expect(result[0].contentHash.length).toBe(64); // SHA-256 哈希长度
      }
    });
  });

  describe('分组功能', () => {
    it('应该按标签分组内容', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Tech Note',
        created: today.toISOString(),
        tags: ['tech', 'programming'],
      });
      await createContent(tempDir, 'note2.md', {
        title: 'AI Note',
        created: today.toISOString(),
        tags: ['ai', 'tech'],
      });
      await createContent(tempDir, 'note3.md', {
        title: 'Design Note',
        created: today.toISOString(),
        tags: ['design'],
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'tags',
      });

      // 多标签内容应该出现在所有相关标签组中
      expect(result).toHaveLength(3);
      expect(result.some((item) => item.title === 'Tech Note')).toBe(true);
      expect(result.some((item) => item.title === 'AI Note')).toBe(true);
      expect(result.some((item) => item.title === 'Design Note')).toBe(true);
    });

    it('应该按类别分组内容', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Tech Note',
        created: today.toISOString(),
        category: 'Technology',
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Design Note',
        created: today.toISOString(),
        category: 'Design',
      });
      await createContent(tempDir, 'note3.md', {
        title: 'Another Tech Note',
        created: today.toISOString(),
        category: 'Technology',
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'category',
      });

      expect(result).toHaveLength(3);
      expect(result.some((item) => item.title === 'Tech Note')).toBe(true);
      expect(result.some((item) => item.title === 'Design Note')).toBe(true);
      expect(
        result.some((item) => item.title === 'Another Tech Note')
      ).toBe(true);
    });

    it('应该将无标签内容归入 Uncategorized 组', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Tagged Note',
        created: today.toISOString(),
        tags: ['tech'],
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Untagged Note',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'tags',
      });

      expect(result).toHaveLength(2);
      expect(result.some((item) => item.title === 'Tagged Note')).toBe(true);
      expect(result.some((item) => item.title === 'Untagged Note')).toBe(
        true
      );
    });

    it('应该将无类别内容归入 Uncategorized 组', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Categorized Note',
        created: today.toISOString(),
        category: 'Technology',
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Uncategorized Note',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'category',
      });

      expect(result).toHaveLength(2);
      expect(
        result.some((item) => item.title === 'Categorized Note')
      ).toBe(true);
      expect(
        result.some((item) => item.title === 'Uncategorized Note')
      ).toBe(true);
    });

    it('应该支持 groupBy: none（不分组）', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Note 1',
        created: today.toISOString(),
        tags: ['tech'],
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Note 2',
        created: today.toISOString(),
        tags: ['design'],
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'none',
      });

      expect(result).toHaveLength(2);
    });

    it('应该在未指定 groupBy 时不分组', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Note 1',
        created: today.toISOString(),
        tags: ['tech'],
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Note 2',
        created: today.toISOString(),
        tags: ['design'],
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('多数据源支持', () => {
    it('应该从多个数据源合并内容', async () => {
      const today = new Date();
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      await fs.mkdir(source1);
      await fs.mkdir(source2);

      await createContent(source1, 'note1.md', {
        title: 'From Source 1',
        created: today.toISOString(),
      });
      await createContent(source2, 'note2.md', {
        title: 'From Source 2',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(
        [{ path: source1 }, { path: source2 }],
        hookManager
      );
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(2);
      expect(result.some((item) => item.title === 'From Source 1')).toBe(
        true
      );
      expect(result.some((item) => item.title === 'From Source 2')).toBe(
        true
      );
    });

    it('应该按优先级处理数据源', async () => {
      const today = new Date();
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      await fs.mkdir(source1);
      await fs.mkdir(source2);

      // 两个数据源包含同名文件
      await createContent(source1, 'note.md', {
        title: 'Low Priority',
        created: today.toISOString(),
      });
      await createContent(source2, 'note.md', {
        title: 'High Priority',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(
        [
          { path: source1, priority: 0 },
          { path: source2, priority: 1 },
        ],
        hookManager
      );
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      // 应该只有一个内容项（高优先级的）
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('High Priority');
    });

    it('应该保留数据源别名', async () => {
      const today = new Date();
      await createContent(tempDir, 'note.md', {
        title: 'Test Note',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(
        { path: tempDir, alias: 'test-source' },
        hookManager
      );
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('test-source');
    });

    it('应该应用 include 模式', async () => {
      const today = new Date();
      const subdir = path.join(tempDir, 'subdir');
      await fs.mkdir(subdir);

      await createContent(tempDir, 'root.md', {
        title: 'Root Note',
        created: today.toISOString(),
      });
      await createContent(subdir, 'sub.md', {
        title: 'Sub Note',
        created: today.toISOString(),
      });

      // 只包含根目录的文件
      const aggregator = new ContentAggregator(
        { path: tempDir, include: ['*.md'] },
        hookManager
      );
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Root Note');
    });

    it('应该应用 exclude 模式', async () => {
      const today = new Date();
      const archive = path.join(tempDir, 'Archive');
      await fs.mkdir(archive);

      await createContent(tempDir, 'active.md', {
        title: 'Active Note',
        created: today.toISOString(),
      });
      await createContent(archive, 'archived.md', {
        title: 'Archived Note',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(
        { path: tempDir, exclude: ['**/Archive/**'] },
        hookManager
      );
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Active Note');
    });
  });

  describe('钩子集成', () => {
    it('应该执行 contentFilter 钩子', async () => {
      const today = new Date();
      await createContent(tempDir, 'note1.md', {
        title: 'Tech Note',
        created: today.toISOString(),
        tags: ['tech'],
      });
      await createContent(tempDir, 'note2.md', {
        title: 'Other Note',
        created: today.toISOString(),
        tags: ['other'],
      });

      // 注册钩子：只保留 tech 标签的内容
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data.filter(item => 
            item.tags && item.tags.includes('tech')
          );
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('contentFilter', hookPath);

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Tech Note');
    });

    it('应该在钩子执行失败时使用默认行为', async () => {
      const today = new Date();
      await createContent(tempDir, 'note.md', {
        title: 'Test Note',
        created: today.toISOString(),
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
      hookManager.registerHook('contentFilter', hookPath);

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      // 应该回退到默认行为，返回内容
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Note');
    });
  });

  describe('错误处理', () => {
    it('应该在目录不存在时抛出错误', async () => {
      const aggregator = new ContentAggregator(
        '/nonexistent/path',
        hookManager
      );

      await expect(
        aggregator.aggregate({
          startDate: new Date(),
        })
      ).rejects.toThrow('所有数据源都不可用');
    });

    it('应该在单个文件解析失败时继续处理其他文件', async () => {
      const today = new Date();
      await createContent(tempDir, 'valid.md', {
        title: 'Valid Note',
        created: today.toISOString(),
      });

      // 创建无效的 markdown 文件
      await fs.writeFile(
        path.join(tempDir, 'invalid.md'),
        'Invalid content without frontmatter',
        'utf-8'
      );

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      // 应该至少包含有效的内容
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].title).toBe('Valid Note');
    });

    it('应该在数据源不存在时跳过该数据源', async () => {
      const today = new Date();
      const validSource = path.join(tempDir, 'valid');
      await fs.mkdir(validSource);
      await createContent(validSource, 'note.md', {
        title: 'Valid Note',
        created: today.toISOString(),
      });

      const aggregator = new ContentAggregator(
        [{ path: validSource }, { path: '/nonexistent/path' }],
        hookManager
      );
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid Note');
    });
  });

  describe('边界情况', () => {
    it('应该处理空目录', async () => {
      const aggregator = new ContentAggregator(tempDir, hookManager);
      const result = await aggregator.aggregate({
        startDate: new Date(),
      });

      expect(result).toEqual([]);
    });

    it('应该处理所有内容都在日期范围外的情况', async () => {
      const today = new Date();
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      await createContent(tempDir, 'old.md', {
        title: 'Old Note',
        created: lastMonth.toISOString(),
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toEqual([]);
    });

    it('应该处理缺少 title 字段的内容（使用文件名）', async () => {
      const today = new Date();
      const filePath = path.join(tempDir, 'no-title.md');
      await fs.writeFile(
        filePath,
        `---
created: ${today.toISOString()}
---

Content without title.`,
        'utf-8'
      );

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('no-title');
    });

    it('应该处理空标签数组', async () => {
      const today = new Date();
      await createContent(tempDir, 'note.md', {
        title: 'Note with empty tags',
        created: today.toISOString(),
        tags: [],
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'tags',
      });

      expect(result).toHaveLength(1);
    });

    it('应该处理空类别字符串', async () => {
      const today = new Date();
      await createContent(tempDir, 'note.md', {
        title: 'Note with empty category',
        created: today.toISOString(),
        category: '',
      });

      const aggregator = new ContentAggregator(tempDir, hookManager);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await aggregator.aggregate({
        startDate: yesterday,
        groupBy: 'category',
      });

      expect(result).toHaveLength(1);
    });
  });
});
