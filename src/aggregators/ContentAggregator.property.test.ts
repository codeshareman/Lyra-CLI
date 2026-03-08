/**
 * ContentAggregator 属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ContentAggregator } from './ContentAggregator';
import { HookManager } from '../core/HookManager';
import { ContentItem, AggregateOptions } from '../types/interfaces';

describe('ContentAggregator Property Tests', () => {
  let testDir: string;
  let hookManager: HookManager;
  let runIndex: number;

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../test-property-content', Date.now().toString());
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

  // 辅助函数：创建测试内容文件
  async function createTestContentFile(
    filePath: string,
    content: {
      title: string;
      created?: Date;
      description?: string;
      tags?: string[];
      category?: string;
    }
  ): Promise<void> {
    const frontmatter = {
      title: content.title,
      ...(content.created && { created: content.created.toISOString() }),
      ...(content.description && { description: content.description }),
      ...(content.tags && { tags: content.tags }),
      ...(content.category && { category: content.category })
    };

    const fileContent = `---
${Object.entries(frontmatter)
  .map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}:\n${value.map(v => `  - ${JSON.stringify(v)}`).join('\n')}`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  })
  .join('\n')}
---

# ${content.title}

This is the content of ${content.title}.
`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, fileContent, 'utf-8');
  }

  async function createRunDir(): Promise<string> {
    const runDir = path.join(testDir, `run-${runIndex++}`);
    await fs.mkdir(runDir, { recursive: true });
    return runDir;
  }

  const safeTagArbitrary = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

  describe('Property 9: 内容聚合按日期范围筛选', () => {
    it('对于任意日期范围，返回的内容应该在指定范围内', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
          fc.integer({ min: 1, max: 30 }), // 日期范围天数
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              daysOffset: fc.integer({ min: -10, max: 40 }), // 相对于开始日期的偏移
              description: fc.option(fc.string({ maxLength: 200 }))
            }),
            { minLength: 1, maxLength: 15 }
          ),
          async (startDate, rangeDays, contentItems) => {
            const runDir = await createRunDir();
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + rangeDays);

            // 创建测试内容文件
            for (let i = 0; i < contentItems.length; i++) {
              const itemDate = new Date(startDate);
              itemDate.setDate(itemDate.getDate() + contentItems[i].daysOffset);

              const filePath = path.join(runDir, `content-${i}.md`);
              await createTestContentFile(filePath, {
                title: contentItems[i].title,
                created: itemDate,
                description: contentItems[i].description || undefined
              });
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate,
              endDate,
              groupBy: 'none'
            });

            // 验证所有返回的内容都在日期范围内
            result.forEach(item => {
              expect(item.created.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
              expect(item.created.getTime()).toBeLessThanOrEqual(endDate.getTime());
            });

            // 验证在范围内的内容都被包含
            const expectedItems = contentItems.filter(item => {
              const itemDate = new Date(startDate);
              itemDate.setDate(itemDate.getDate() + item.daysOffset);
              return itemDate >= startDate && itemDate <= endDate;
            });

            expect(result.length).toBe(expectedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    }, 15000);

    it('对于默认日期范围（7天），应该正确筛选内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              daysOffset: fc.integer({ min: -5, max: 15 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (startDate, contentItems) => {
            const runDir = await createRunDir();
            // 创建测试内容文件
            for (let i = 0; i < contentItems.length; i++) {
              const itemDate = new Date(startDate);
              itemDate.setDate(itemDate.getDate() + contentItems[i].daysOffset);

              const filePath = path.join(runDir, `content-${i}.md`);
              await createTestContentFile(filePath, {
                title: contentItems[i].title,
                created: itemDate
              });
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate,
              // 不指定 endDate，应该默认为 startDate + 7 天
              groupBy: 'none'
            });

            const expectedEndDate = new Date(startDate);
            expectedEndDate.setDate(expectedEndDate.getDate() + 7);

            // 验证所有返回的内容都在 7 天范围内
            result.forEach(item => {
              expect(item.created.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
              expect(item.created.getTime()).toBeLessThanOrEqual(expectedEndDate.getTime());
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 10: 按标签分组的正确性', () => {
    it('对于任意标签组合，分组后的内容应该保留正确的标签信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              tags: fc.array(
                safeTagArbitrary,
                { minLength: 1, maxLength: 5 }
              )
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (contentItems) => {
            const runDir = await createRunDir();
            const baseDate = new Date('2024-01-01');
            const normalizedItems = contentItems.map((item, index) => ({
              ...item,
              title: `${item.title}-${index}`
            }));

            // 创建测试内容文件
            for (let i = 0; i < normalizedItems.length; i++) {
              const filePath = path.join(runDir, `content-${i}.md`);
              await createTestContentFile(filePath, {
                title: normalizedItems[i].title,
                created: baseDate,
                tags: normalizedItems[i].tags
              });
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate: baseDate,
              groupBy: 'tags'
            });

            // 验证所有内容都保留了标签信息
            result.forEach(item => {
              expect(item.tags).toBeDefined();
              expect(Array.isArray(item.tags)).toBe(true);
              
              // 验证标签存在于原始数据中
              const originalItem = normalizedItems.find(c => c.title === item.title);
              expect(originalItem).toBeDefined();
              expect(item.tags).toEqual(originalItem!.tags);
            });

            // 验证所有原始内容都被包含
            expect(result.length).toBe(normalizedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于多标签内容，应该正确处理标签信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              tags: fc.array(
                fc.constantFrom('tech', 'design', 'business', 'personal', 'learning'),
                { minLength: 2, maxLength: 4 }
              ).map(arr => [...new Set(arr)]) // 去重
            }),
            { minLength: 2, maxLength: 8 }
          ),
          async (contentItems) => {
            const runDir = await createRunDir();
            const baseDate = new Date('2024-01-01');
            const normalizedItems = contentItems.map((item, index) => ({
              ...item,
              title: `${item.title}-${index}`
            }));

            // 创建测试内容文件
            for (let i = 0; i < normalizedItems.length; i++) {
              const filePath = path.join(runDir, `multi-tag-${i}.md`);
              await createTestContentFile(filePath, {
                title: normalizedItems[i].title,
                created: baseDate,
                tags: normalizedItems[i].tags
              });
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate: baseDate,
              groupBy: 'tags'
            });

            // 验证多标签内容的标签完整性
            result.forEach(item => {
              const originalItem = normalizedItems.find(c => c.title === item.title);
              expect(originalItem).toBeDefined();
              
              // 验证所有原始标签都被保留
              originalItem!.tags.forEach(tag => {
                expect(item.tags).toContain(tag);
              });
            });
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Property 11: 按类别分组的正确性', () => {
    it('对于任意类别组合，分组后的内容应该保留正确的类别信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              category: fc.constantFrom('work', 'personal', 'learning', 'project', 'idea')
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (contentItems) => {
            const runDir = await createRunDir();
            const baseDate = new Date('2024-01-01');
            const normalizedItems = contentItems.map((item, index) => ({
              ...item,
              title: `${item.title}-${index}`
            }));

            // 创建测试内容文件
            for (let i = 0; i < normalizedItems.length; i++) {
              const filePath = path.join(runDir, `category-${i}.md`);
              await createTestContentFile(filePath, {
                title: normalizedItems[i].title,
                created: baseDate,
                category: normalizedItems[i].category
              });
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate: baseDate,
              groupBy: 'category'
            });

            // 验证所有内容都保留了类别信息
            result.forEach(item => {
              expect(item.category).toBeDefined();
              expect(typeof item.category).toBe('string');
              
              // 验证类别存在于原始数据中
              const originalItem = normalizedItems.find(c => c.title === item.title);
              expect(originalItem).toBeDefined();
              expect(item.category).toBe(originalItem!.category);
            });

            // 验证所有原始内容都被包含
            expect(result.length).toBe(normalizedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于混合类别内容，应该正确分组', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.constantFrom('work', 'personal', 'learning'),
            { minLength: 1, maxLength: 3 }
          ),
          fc.integer({ min: 1, max: 3 }), // 每个类别的内容数量
          async (categories, itemsPerCategory) => {
            const runDir = await createRunDir();
            const baseDate = new Date('2024-01-01');
            const uniqueCategories = Array.from(new Set(categories));
            let fileIndex = 0;

            // 为每个类别创建内容
            for (const category of uniqueCategories) {
              for (let i = 0; i < itemsPerCategory; i++) {
                const filePath = path.join(runDir, `${category}-${i}.md`);
                await createTestContentFile(filePath, {
                  title: `${category} item ${i + 1}`,
                  created: baseDate,
                  category
                });
                fileIndex++;
              }
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate: baseDate,
              groupBy: 'category'
            });

            // 验证每个类别的内容数量
            const resultByCategory: Record<string, ContentItem[]> = {};
            for (const item of result) {
              if (!resultByCategory[item.category!]) {
                resultByCategory[item.category!] = [];
              }
              resultByCategory[item.category!].push(item);
            }

            for (const category of uniqueCategories) {
              expect(resultByCategory[category]).toBeDefined();
              expect(resultByCategory[category].length).toBe(itemsPerCategory);
            }

            // 验证总数正确
            expect(result.length).toBe(uniqueCategories.length * itemsPerCategory);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Property 12: 多标签内容出现在所有相关组', () => {
    it('对于多标签内容，应该保留所有标签信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              tags: fc.array(
                fc.stringMatching(/^[a-zA-Z0-9_-]{1,15}$/),
                { minLength: 2, maxLength: 5 }
              ).map(arr => [...new Set(arr)]) // 确保标签唯一
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (contentItems) => {
            const runDir = await createRunDir();
            const baseDate = new Date('2024-01-01');
            const normalizedItems = contentItems.map((item, index) => ({
              ...item,
              title: `${item.title}-${index}`
            }));

            // 创建测试内容文件
            for (let i = 0; i < normalizedItems.length; i++) {
              const filePath = path.join(runDir, `multi-tag-content-${i}.md`);
              await createTestContentFile(filePath, {
                title: normalizedItems[i].title,
                created: baseDate,
                tags: normalizedItems[i].tags
              });
            }

            const aggregator = new ContentAggregator(runDir, hookManager);
            const result = await aggregator.aggregate({
              startDate: baseDate,
              groupBy: 'tags'
            });

            // 验证结果数量与原始内容项数量一致
            expect(result.length).toBe(normalizedItems.length);

            // 验证每个结果项都有标签
            result.forEach(item => {
              expect(item.tags).toBeDefined();
              expect(Array.isArray(item.tags)).toBe(true);
              expect(item.tags!.length).toBeGreaterThan(0);
            });

            // 验证所有原始标签都被保留（按唯一标题匹配，避免依赖返回顺序）
            const resultByTitle = new Map(result.map(item => [item.title, item]));
            for (const originalItem of normalizedItems) {
              const resultItem = resultByTitle.get(originalItem.title);
              expect(resultItem).toBeDefined();

              const sortedOriginalTags = [...originalItem.tags].sort();
              const sortedResultTags = [...(resultItem!.tags || [])].sort();
              expect(sortedResultTags).toEqual(sortedOriginalTags);

              if (originalItem.tags.length > 1) {
                originalItem.tags.forEach(tag => {
                  expect(resultItem!.tags!).toContain(tag);
                });
              }
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('对于包含相同标签的不同内容，应该正确处理', async () => {
      const baseDate = new Date('2024-01-01');
      const sharedTags = ['tech', 'learning'];
      
      // 创建多个内容项，它们共享一些标签
      const contentItems = [
        { title: 'Content 1', tags: ['tech', 'learning', 'javascript'] },
        { title: 'Content 2', tags: ['tech', 'design'] },
        { title: 'Content 3', tags: ['learning', 'python'] },
        { title: 'Content 4', tags: ['tech', 'learning', 'ai'] }
      ];

      for (let i = 0; i < contentItems.length; i++) {
        const filePath = path.join(testDir, `shared-tag-${i}.md`);
        await createTestContentFile(filePath, {
          title: contentItems[i].title,
          created: baseDate,
          tags: contentItems[i].tags
        });
      }

      const aggregator = new ContentAggregator(testDir, hookManager);
      const result = await aggregator.aggregate({
        startDate: baseDate,
        groupBy: 'tags'
      });

      // 验证所有内容都被包含
      expect(result.length).toBe(contentItems.length);

      // 验证共享标签的内容都保留了正确的标签
      const techItems = result.filter(item => item.tags?.includes('tech'));
      const learningItems = result.filter(item => item.tags?.includes('learning'));

      expect(techItems.length).toBe(3); // Content 1, 2, 4
      expect(learningItems.length).toBe(3); // Content 1, 3, 4

      // 验证标签信息完整性
      result.forEach(item => {
        const originalItem = contentItems.find(c => c.title === item.title);
        expect(item.tags).toEqual(originalItem!.tags);
      });
    });
  });

  describe('边界情况测试', () => {
    it('应该处理没有创建日期的内容', async () => {
      const filePath = path.join(testDir, 'no-date.md');
      const content = `---
title: "Content Without Date"
description: "Content without explicit date"
---

# Content Without Date

This content has no explicit creation date.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const aggregator = new ContentAggregator(testDir, hookManager);
      const result = await aggregator.aggregate({
        startDate: new Date('2020-01-01'),
        endDate: new Date('2030-12-31'),
        groupBy: 'none'
      });

      expect(result).toHaveLength(1);
      expect(result[0].created).toBeDefined();
      expect(typeof result[0].created.getTime()).toBe('number');
      expect(result[0].created.getTime()).not.toBeNaN();
      expect(result[0].title).toBe('Content Without Date');
    });

    it('应该处理空目录', async () => {
      const aggregator = new ContentAggregator(testDir, hookManager);
      const result = await aggregator.aggregate({
        startDate: new Date('2024-01-01'),
        groupBy: 'none'
      });

      expect(result).toEqual([]);
    });

    it('应该处理无效的日期格式', async () => {
      const filePath = path.join(testDir, 'invalid-date.md');
      const content = `---
title: "Invalid Date Content"
created: "not-a-date"
---

# Invalid Date Content

This content has an invalid date.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const aggregator = new ContentAggregator(testDir, hookManager);
      
      // 应该优雅处理无效日期
      await expect(aggregator.aggregate({
        startDate: new Date('2024-01-01'),
        groupBy: 'none'
      })).resolves.not.toThrow();
    });

    it('应该处理不存在的数据源目录', async () => {
      const nonExistentPath = path.join(testDir, 'nonexistent');
      const aggregator = new ContentAggregator(nonExistentPath, hookManager);

      await expect(aggregator.aggregate({
        startDate: new Date('2024-01-01'),
        groupBy: 'none'
      })).rejects.toThrow();
    });

    it('应该正确处理 groupBy none 选项', async () => {
      const baseDate = new Date('2024-01-01');
      
      // 创建一些测试内容
      const contentItems = [
        { title: 'Item 1', tags: ['tag1', 'tag2'] },
        { title: 'Item 2', category: 'category1' },
        { title: 'Item 3', tags: ['tag3'], category: 'category2' }
      ];

      for (let i = 0; i < contentItems.length; i++) {
        const filePath = path.join(testDir, `none-group-${i}.md`);
        await createTestContentFile(filePath, {
          title: contentItems[i].title,
          created: baseDate,
          tags: contentItems[i].tags,
          category: contentItems[i].category
        });
      }

      const aggregator = new ContentAggregator(testDir, hookManager);
      const result = await aggregator.aggregate({
        startDate: baseDate,
        groupBy: 'none'
      });

      // 验证返回所有内容，不进行特殊分组处理
      expect(result.length).toBe(contentItems.length);
      
      // 验证内容保持原始结构
      result.forEach(item => {
        const originalItem = contentItems.find(c => c.title === item.title);
        expect(originalItem).toBeDefined();
      });
    });
  });
});
