/**
 * ToolFilter 属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolFilter } from './ToolFilter';
import { HookManager } from '../core/HookManager';
import { Tool, ToolFilterOptions } from '../types/interfaces';

describe('ToolFilter Property Tests', () => {
  let testDir: string;
  let hookManager: HookManager;

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../test-property-tools', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });
    hookManager = new HookManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
    hookManager.clearHooks();
  });

  // 辅助函数：创建测试工具分类文件
  async function createTestCategoryFile(
    filePath: string,
    category: string,
    tools: Array<{ title: string; url?: string; rating?: number; description?: string }>
  ): Promise<void> {
    const frontmatter = {
      category,
      tools: tools.map(tool => ({
        title: tool.title,
        ...(tool.url && { url: tool.url }),
        ...(tool.rating !== undefined && { rating: tool.rating }),
        ...(tool.description && { description: tool.description })
      }))
    };

    const content = `---
category: ${JSON.stringify(category)}
tools:
${tools.map(tool => `  - title: ${JSON.stringify(tool.title)}
${tool.url ? `    url: ${JSON.stringify(tool.url)}` : ''}
${tool.rating !== undefined ? `    rating: ${tool.rating}` : ''}
${tool.description ? `    description: ${JSON.stringify(tool.description)}` : ''}`).join('\n')}
---

# ${category}

This category contains ${tools.length} tools.
`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  describe('Property 7: 工具筛选每分类返回最高评分', () => {
    it('对于任意工具分类，应该返回每个分类评分最高的工具', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              category: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              tools: fc.array(
                fc.record({
                  title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
                  url: fc.webUrl(),
                  rating: fc.integer({ min: 0, max: 5 }),
                  description: fc.option(fc.string({ maxLength: 200 }))
                }),
                { minLength: 1, maxLength: 10 }
              )
            }),
            { minLength: 1, maxLength: 8 }
          ),
          fc.integer({ min: 1, max: 5 }),
          async (categories, perCategory) => {
            // 创建测试分类文件
            for (let i = 0; i < categories.length; i++) {
              const filePath = path.join(testDir, `${categories[i].category}.md`);
              await createTestCategoryFile(filePath, categories[i].category, categories[i].tools);
            }

            const filter = new ToolFilter(testDir, hookManager);
            const result = await filter.filter({ perCategory });

            // 验证每个分类的工具数量不超过 perCategory
            const resultByCategory: Record<string, Tool[]> = {};
            for (const tool of result) {
              if (!resultByCategory[tool.category]) {
                resultByCategory[tool.category] = [];
              }
              resultByCategory[tool.category].push(tool);
            }

            for (const [category, tools] of Object.entries(resultByCategory)) {
              expect(tools.length).toBeLessThanOrEqual(perCategory);
              
              // 验证该分类的工具按评分降序排列
              for (let i = 0; i < tools.length - 1; i++) {
                expect(tools[i].rating).toBeGreaterThanOrEqual(tools[i + 1].rating);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于单个分类多个工具，应该返回评分最高的前 N 个', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              rating: fc.integer({ min: 0, max: 5 })
            }),
            { minLength: 3, maxLength: 15 }
          ),
          fc.integer({ min: 1, max: 5 }),
          async (tools, perCategory) => {
            const category = 'TestCategory';
            const filePath = path.join(testDir, `${category}.md`);
            
            // 为工具添加 URL
            const toolsWithUrl = tools.map((tool, i) => ({
              ...tool,
              url: `https://example.com/tool-${i}`
            }));
            
            await createTestCategoryFile(filePath, category, toolsWithUrl);

            const filter = new ToolFilter(testDir, hookManager);
            const result = await filter.filter({ perCategory });

            // 验证返回数量
            const expectedCount = Math.min(perCategory, tools.length);
            expect(result.length).toBe(expectedCount);

            // 验证所有工具都属于同一分类
            result.forEach(tool => {
              expect(tool.category).toBe(category);
            });

            // 验证按评分降序排列
            for (let i = 0; i < result.length - 1; i++) {
              expect(result[i].rating).toBeGreaterThanOrEqual(result[i + 1].rating);
            }

            // 验证返回的是评分最高的工具
            if (result.length > 0) {
              const maxRatingInInput = Math.max(...tools.map(t => t.rating));
              expect(result[0].rating).toBe(maxRatingInInput);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 8: 工具保留分类信息', () => {
    it('对于任意工具，返回的工具应该保留正确的分类信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              category: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              tools: fc.array(
                fc.record({
                  title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
                  rating: fc.integer({ min: 0, max: 5 })
                }),
                { minLength: 1, maxLength: 5 }
              )
            }),
            { minLength: 1, maxLength: 5 }
          ).map(arr => {
            // 确保分类名称唯一
            const uniqueCategories = new Map();
            const result = [];
            for (const item of arr) {
              if (!uniqueCategories.has(item.category)) {
                uniqueCategories.set(item.category, true);
                result.push(item);
              }
            }
            return result;
          }),
          async (categories) => {
            // 创建测试分类文件
            for (const categoryData of categories) {
              const filePath = path.join(testDir, `${categoryData.category}.md`);
              const toolsWithUrl = categoryData.tools.map((tool, i) => ({
                ...tool,
                url: `https://example.com/${categoryData.category}-${i}`
              }));
              await createTestCategoryFile(filePath, categoryData.category, toolsWithUrl);
            }

            const filter = new ToolFilter(testDir, hookManager);
            const result = await filter.filter({ perCategory: 10 });

            // 验证每个工具都有正确的分类信息
            result.forEach(tool => {
              expect(tool.category).toBeTruthy();
              expect(typeof tool.category).toBe('string');
              
              // 验证分类存在于输入中
              const categoryExists = categories.some(c => c.category === tool.category);
              expect(categoryExists).toBe(true);
            });

            // 验证所有输入的分类都有对应的工具（如果有工具的话）
            for (const categoryData of categories) {
              if (categoryData.tools.length > 0) {
                const hasToolsFromCategory = result.some(tool => tool.category === categoryData.category);
                expect(hasToolsFromCategory).toBe(true);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于从文件名推断的分类，应该正确设置分类信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              filename: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes('/')),
              tools: fc.array(
                fc.record({
                  title: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
                  rating: fc.integer({ min: 1, max: 5 })
                }),
                { minLength: 1, maxLength: 3 }
              )
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (fileData) => {
            // 创建没有显式分类的文件（从文件名推断）
            for (const data of fileData) {
              const filePath = path.join(testDir, `${data.filename}.md`);
              const toolsWithUrl = data.tools.map((tool, i) => ({
                ...tool,
                url: `https://example.com/${data.filename}-${i}`
              }));
              
              // 创建不包含 category 字段的文件
              const content = `---
tools:
${toolsWithUrl.map(tool => `  - title: ${JSON.stringify(tool.title)}
    url: ${JSON.stringify(tool.url)}
    rating: ${tool.rating}`).join('\n')}
---

# ${data.filename}

Tools in this category.
`;
              await fs.writeFile(filePath, content, 'utf-8');
            }

            const filter = new ToolFilter(testDir, hookManager);
            const result = await filter.filter({ perCategory: 10 });

            // 验证分类名称与文件名匹配
            result.forEach(tool => {
              const expectedCategory = fileData.find(d => 
                result.some(t => t.category === d.filename && t.title === tool.title)
              );
              if (expectedCategory) {
                expect(tool.category).toBe(expectedCategory.filename);
              }
            });
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Property 33: 自定义评分 Hook 应用正确性', () => {
    it('customToolScore hook 应该能修改工具评分并影响排序', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              rating: fc.integer({ min: 1, max: 3 }) // 原始低评分
            }),
            { minLength: 2, maxLength: 8 }
          ),
          fc.integer({ min: 1, max: 2 }), // 评分增量
          async (tools, ratingBoost) => {
            const category = 'TestCategory';
            const filePath = path.join(testDir, `${category}.md`);
            
            const toolsWithUrl = tools.map((tool, i) => ({
              ...tool,
              url: `https://example.com/tool-${i}`
            }));
            
            await createTestCategoryFile(filePath, category, toolsWithUrl);

            // 创建 customToolScore hook
            const hookPath = path.join(testDir, 'tool-score-hook.js');
            const hookContent = `
module.exports = function(context) {
  return context.data.map(tool => ({
    ...tool,
    rating: tool.rating + ${ratingBoost},
    originalRating: tool.rating
  }));
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook('customToolScore', hookPath);

            const filter = new ToolFilter(testDir, hookManager);
            const result = await filter.filter({ perCategory: 10 });

            // 验证评分被修改
            result.forEach(tool => {
              expect(tool).toHaveProperty('originalRating');
              expect(tool.rating).toBe((tool as any).originalRating + ratingBoost);
            });

            // 验证仍然按修改后的评分排序
            for (let i = 0; i < result.length - 1; i++) {
              expect(result[i].rating).toBeGreaterThanOrEqual(result[i + 1].rating);
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('beforeToolFilter 和 afterToolFilter hooks 应该正确执行', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
              rating: fc.integer({ min: 3, max: 5 }) // 高评分确保被选中
            }),
            { minLength: 2, maxLength: 6 }
          ),
          async (tools) => {
            const category = 'TestCategory';
            const filePath = path.join(testDir, `${category}.md`);
            
            const toolsWithUrl = tools.map((tool, i) => ({
              ...tool,
              url: `https://example.com/tool-${i}`
            }));
            
            await createTestCategoryFile(filePath, category, toolsWithUrl);

            // 创建 beforeToolFilter hook
            const beforeHookPath = path.join(testDir, 'before-tool-hook.js');
            const beforeHookContent = `
module.exports = function(context) {
  return context.data.map(tool => ({
    ...tool,
    beforeHookApplied: true
  }));
};
`;
            await fs.writeFile(beforeHookPath, beforeHookContent, 'utf-8');
            hookManager.registerHook('beforeToolFilter', beforeHookPath);

            // 创建 afterToolFilter hook
            const afterHookPath = path.join(testDir, 'after-tool-hook.js');
            const afterHookContent = `
module.exports = function(context) {
  return context.data.map(tool => ({
    ...tool,
    afterHookApplied: true
  }));
};
`;
            await fs.writeFile(afterHookPath, afterHookContent, 'utf-8');
            hookManager.registerHook('afterToolFilter', afterHookPath);

            const filter = new ToolFilter(testDir, hookManager);
            const result = await filter.filter({ perCategory: 5 });

            // 验证两个 hooks 都被应用
            result.forEach(tool => {
              expect(tool).toHaveProperty('beforeHookApplied', true);
              expect(tool).toHaveProperty('afterHookApplied', true);
            });
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('边界情况测试', () => {
    it('应该处理空分类文件', async () => {
      const filePath = path.join(testDir, 'empty-category.md');
      const content = `---
category: "Empty Category"
tools: []
---

# Empty Category

No tools in this category.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const filter = new ToolFilter(testDir, hookManager);
      const result = await filter.filter({ perCategory: 5 });

      expect(result).toEqual([]);
    });

    it('应该处理缺少评分的工具', async () => {
      const filePath = path.join(testDir, 'no-rating.md');
      const content = `---
category: "Test Category"
tools:
  - title: "Tool Without Rating"
    url: "https://example.com/tool"
    description: "A tool without rating"
---

# Test Category

Tools without ratings.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const filter = new ToolFilter(testDir, hookManager);
      const result = await filter.filter({ perCategory: 5 });

      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(0); // 默认评分
      expect(result[0].title).toBe('Tool Without Rating');
    });

    it('应该处理不存在的数据源目录', async () => {
      const nonExistentPath = path.join(testDir, 'nonexistent');
      const filter = new ToolFilter(nonExistentPath, hookManager);

      await expect(filter.filter({ perCategory: 5 })).rejects.toThrow();
    });

    it('应该处理无效的分类文件格式', async () => {
      const filePath = path.join(testDir, 'invalid.md');
      const content = `---
invalid yaml: [unclosed
---

Invalid content.
`;
      await fs.writeFile(filePath, content, 'utf-8');

      const filter = new ToolFilter(testDir, hookManager);
      
      // 应该优雅处理错误
      await expect(filter.filter({ perCategory: 5 })).resolves.not.toThrow();
    });

    it('应该正确处理多个分类的工具数量限制', async () => {
      // 创建多个分类，每个分类有不同数量的工具
      const categories = [
        { name: 'Category1', toolCount: 5 },
        { name: 'Category2', toolCount: 3 },
        { name: 'Category3', toolCount: 8 }
      ];

      for (const cat of categories) {
        const tools = Array.from({ length: cat.toolCount }, (_, i) => ({
          title: `Tool ${i + 1}`,
          url: `https://example.com/${cat.name}-tool-${i}`,
          rating: Math.floor(Math.random() * 5) + 1
        }));

        const filePath = path.join(testDir, `${cat.name}.md`);
        await createTestCategoryFile(filePath, cat.name, tools);
      }

      const perCategory = 2;
      const filter = new ToolFilter(testDir, hookManager);
      const result = await filter.filter({ perCategory });

      // 验证每个分类最多返回 perCategory 个工具
      const resultByCategory: Record<string, Tool[]> = {};
      for (const tool of result) {
        if (!resultByCategory[tool.category]) {
          resultByCategory[tool.category] = [];
        }
        resultByCategory[tool.category].push(tool);
      }

      for (const [category, tools] of Object.entries(resultByCategory)) {
        expect(tools.length).toBeLessThanOrEqual(perCategory);
      }

      // 验证总数不超过 categories.length * perCategory
      expect(result.length).toBeLessThanOrEqual(categories.length * perCategory);
    });
  });
});