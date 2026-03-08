import { ToolFilter } from './ToolFilter';
import { HookManager } from '../core/HookManager';
import { Tool, ToolFilterOptions } from '../types/interfaces';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ToolFilter', () => {
  let tempDir: string;
  let hookManager: HookManager;

  beforeEach(async () => {
    // 创建临时测试目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-filter-test-'));
    hookManager = new HookManager();
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
    hookManager.clearHooks();
  });

  /**
   * 辅助函数：创建测试分类文件
   */
  async function createCategoryFile(
    dir: string,
    filename: string,
    frontmatter: Record<string, any>
  ): Promise<string> {
    const filePath = path.join(dir, filename);
    const yamlContent = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (key === 'tools' && Array.isArray(value)) {
          const toolsYaml = value
            .map((tool) => {
              const toolEntries = Object.entries(tool)
                .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
                .join('\n');
              return `  - \n${toolEntries}`;
            })
            .join('\n');
          return `${key}:\n${toolsYaml}`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join('\n');

    const content = `---\n${yamlContent}\n---\n\n# ${frontmatter.category || filename}\n\nCategory content here.`;
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('基本筛选功能', () => {
    it('应该从单个分类文件筛选工具', async () => {
      await createCategoryFile(tempDir, 'dev-tools.md', {
        category: 'Development',
        tools: [
          {
            title: 'Tool 1',
            url: 'https://example.com/tool1',
            rating: 5,
          },
          {
            title: 'Tool 2',
            url: 'https://example.com/tool2',
            rating: 3,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Tool 1');
      expect(result[0].rating).toBe(5);
      expect(result[0].category).toBe('Development');
      expect(result[1].title).toBe('Tool 2');
      expect(result[1].rating).toBe(3);
    });

    it('应该从每个分类选择评分最高的工具', async () => {
      await createCategoryFile(tempDir, 'dev-tools.md', {
        category: 'Development',
        tools: [
          {
            title: 'Dev Tool 1',
            url: 'https://example.com/dev1',
            rating: 5,
          },
          {
            title: 'Dev Tool 2',
            url: 'https://example.com/dev2',
            rating: 3,
          },
          {
            title: 'Dev Tool 3',
            url: 'https://example.com/dev3',
            rating: 4,
          },
        ],
      });

      await createCategoryFile(tempDir, 'design-tools.md', {
        category: 'Design',
        tools: [
          {
            title: 'Design Tool 1',
            url: 'https://example.com/design1',
            rating: 4,
          },
          {
            title: 'Design Tool 2',
            url: 'https://example.com/design2',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 1 });

      // 应该返回每个分类的最高评分工具
      expect(result).toHaveLength(2);

      const devTool = result.find((t) => t.category === 'Development');
      const designTool = result.find((t) => t.category === 'Design');

      expect(devTool?.title).toBe('Dev Tool 1');
      expect(devTool?.rating).toBe(5);
      expect(designTool?.title).toBe('Design Tool 2');
      expect(designTool?.rating).toBe(5);
    });

    it('应该返回每个分类的前 N 个工具', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Tool 1',
            url: 'https://example.com/1',
            rating: 5,
          },
          {
            title: 'Tool 2',
            url: 'https://example.com/2',
            rating: 4,
          },
          {
            title: 'Tool 3',
            url: 'https://example.com/3',
            rating: 3,
          },
          {
            title: 'Tool 4',
            url: 'https://example.com/4',
            rating: 2,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 2 });

      expect(result).toHaveLength(2);
      expect(result[0].rating).toBe(5);
      expect(result[1].rating).toBe(4);
    });

    it('应该保留工具的分类信息', async () => {
      await createCategoryFile(tempDir, 'productivity.md', {
        category: 'Productivity',
        tools: [
          {
            title: 'Productivity Tool',
            url: 'https://example.com/prod',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Productivity');
    });

    it('应该使用文件名作为分类名（如果 frontmatter 中没有 category）', async () => {
      await createCategoryFile(tempDir, 'ai-tools.md', {
        tools: [
          {
            title: 'AI Tool',
            url: 'https://example.com/ai',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('ai-tools');
    });

    it('应该处理缺少评分字段的工具（默认为 0）', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'No Rating',
            url: 'https://example.com/1',
          },
          {
            title: 'With Rating',
            url: 'https://example.com/2',
            rating: 3,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].rating).toBe(3);
      expect(result[1].rating).toBe(0);
    });

    it('应该提取所有必需和可选字段', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'Testing',
        tools: [
          {
            title: 'Test Tool',
            url: 'https://example.com/test',
            rating: 4,
            description: 'A great testing tool',
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      const tool = result[0];
      expect(tool.title).toBe('Test Tool');
      expect(tool.url).toBe('https://example.com/test');
      expect(tool.rating).toBe(4);
      expect(tool.description).toBe('A great testing tool');
      expect(tool.category).toBe('Testing');
    });

    it('应该提取工具图片配置字段', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'Testing',
        tools: [
          {
            title: 'Image Tool',
            url: 'https://example.com/image-tool',
            rating: 5,
            coverImage: 'https://example.com/tool-cover.jpg',
            images: [
              'https://example.com/tool-cover.jpg',
              'https://example.com/tool-detail.jpg',
            ],
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      const tool = result[0];
      expect(tool.image).toBe('https://example.com/tool-cover.jpg');
      expect(tool.coverImage).toBe('https://example.com/tool-cover.jpg');
      expect(tool.images).toEqual([
        'https://example.com/tool-cover.jpg',
        'https://example.com/tool-detail.jpg',
      ]);
    });

    it('应该支持 score 字段作为评分', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Tool with Score',
            url: 'https://example.com/1',
            score: 4,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(4);
    });

    it('应该支持 name 字段作为 title', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            name: 'Tool Name',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Tool Name');
    });
  });

  describe('多数据源支持', () => {
    it('应该从多个数据源合并工具', async () => {
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      await fs.mkdir(source1);
      await fs.mkdir(source2);

      await createCategoryFile(source1, 'tools1.md', {
        category: 'Category1',
        tools: [
          {
            title: 'Tool from Source 1',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      await createCategoryFile(source2, 'tools2.md', {
        category: 'Category2',
        tools: [
          {
            title: 'Tool from Source 2',
            url: 'https://example.com/2',
            rating: 4,
          },
        ],
      });

      const filter = new ToolFilter(
        [{ path: source1 }, { path: source2 }],
        hookManager
      );
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(2);
      expect(result.find((t) => t.title === 'Tool from Source 1')).toBeDefined();
      expect(result.find((t) => t.title === 'Tool from Source 2')).toBeDefined();
    });

    it('应该按优先级处理数据源（基于 URL 去重）', async () => {
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      await fs.mkdir(source1);
      await fs.mkdir(source2);

      // 两个数据源包含相同 URL 的工具
      await createCategoryFile(source1, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Low Priority Tool',
            url: 'https://example.com/tool',
            rating: 3,
          },
        ],
      });

      await createCategoryFile(source2, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'High Priority Tool',
            url: 'https://example.com/tool',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(
        [
          { path: source1, priority: 0 },
          { path: source2, priority: 1 },
        ],
        hookManager
      );
      const result = await filter.filter({ perCategory: 10 });

      // 应该只有一个工具（高优先级的）
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('High Priority Tool');
      expect(result[0].rating).toBe(5);
    });

    it('应该保留数据源别名', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Test Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(
        { path: tempDir, alias: 'test-source' },
        hookManager
      );
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('test-source');
    });

    it('应该应用 include 模式', async () => {
      const subdir = path.join(tempDir, 'subdir');
      await fs.mkdir(subdir);

      await createCategoryFile(tempDir, 'root.md', {
        category: 'Root',
        tools: [
          {
            title: 'Root Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      await createCategoryFile(subdir, 'sub.md', {
        category: 'Sub',
        tools: [
          {
            title: 'Sub Tool',
            url: 'https://example.com/2',
            rating: 4,
          },
        ],
      });

      // 只包含根目录的文件
      const filter = new ToolFilter(
        { path: tempDir, include: ['*.md'] },
        hookManager
      );
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Root Tool');
    });

    it('应该应用 exclude 模式', async () => {
      const archive = path.join(tempDir, 'Archive');
      await fs.mkdir(archive);

      await createCategoryFile(tempDir, 'active.md', {
        category: 'Active',
        tools: [
          {
            title: 'Active Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      await createCategoryFile(archive, 'archived.md', {
        category: 'Archived',
        tools: [
          {
            title: 'Archived Tool',
            url: 'https://example.com/2',
            rating: 4,
          },
        ],
      });

      const filter = new ToolFilter(
        { path: tempDir, exclude: ['**/Archive/**'] },
        hookManager
      );
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Active Tool');
    });
  });

  describe('钩子集成', () => {
    it('应该执行 beforeToolFilter 钩子', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Premium Tool',
            url: 'https://example.com/1',
            rating: 5,
            description: 'premium',
          },
          {
            title: 'Free Tool',
            url: 'https://example.com/2',
            rating: 4,
            description: 'free',
          },
        ],
      });

      // 注册钩子：只保留 premium 工具
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data.filter(tool => 
            tool.description && tool.description.includes('premium')
          );
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('beforeToolFilter', hookPath);

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Premium Tool');
    });

    it('应该执行 customToolScore 钩子', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Short Description',
            url: 'https://example.com/1',
            rating: 3,
            description: 'Short',
          },
          {
            title: 'Long Description',
            url: 'https://example.com/2',
            rating: 3,
            description: 'This is a much longer description with more details',
          },
        ],
      });

      // 注册钩子：根据描述长度调整评分
      const hookPath = path.join(tempDir, 'hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data.map(tool => ({
            ...tool,
            rating: tool.rating + (tool.description && tool.description.length > 20 ? 2 : 0)
          }));
        };
      `,
        'utf-8'
      );
      hookManager.registerHook('customToolScore', hookPath);

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Long Description');
      expect(result[0].rating).toBe(5);
      expect(result[1].title).toBe('Short Description');
      expect(result[1].rating).toBe(3);
    });

    it('应该执行 afterToolFilter 钩子', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Tool 1',
            url: 'https://example.com/1',
            rating: 5,
          },
          {
            title: 'Tool 2',
            url: 'https://example.com/2',
            rating: 4,
          },
        ],
      });

      // 注册钩子：只返回第一个工具
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
      hookManager.registerHook('afterToolFilter', hookPath);

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Tool 1');
    });
  });

  describe('错误处理', () => {
    it('应该在目录不存在时抛出错误', async () => {
      const filter = new ToolFilter('/nonexistent/path', hookManager);

      await expect(filter.filter({ perCategory: 1 })).rejects.toThrow(
        '所有数据源都不可用'
      );
    });

    it('应该在单个文件解析失败时继续处理其他文件', async () => {
      await createCategoryFile(tempDir, 'valid.md', {
        category: 'Valid',
        tools: [
          {
            title: 'Valid Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      // 创建无效的 markdown 文件
      await fs.writeFile(
        path.join(tempDir, 'invalid.md'),
        'Invalid content without frontmatter',
        'utf-8'
      );

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      // 应该至少包含有效的工具
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].title).toBe('Valid Tool');
    });

    it('应该在数据源不存在时跳过该数据源', async () => {
      const validSource = path.join(tempDir, 'valid');
      await fs.mkdir(validSource);
      await createCategoryFile(validSource, 'tools.md', {
        category: 'Valid',
        tools: [
          {
            title: 'Valid Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(
        [{ path: validSource }, { path: '/nonexistent/path' }],
        hookManager
      );
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid Tool');
    });

    it('应该在钩子执行失败时使用默认行为', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Test Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
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
      hookManager.registerHook('beforeToolFilter', hookPath);

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      // 应该回退到默认行为，返回工具
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Tool');
    });
  });

  describe('边界情况', () => {
    it('应该处理空目录', async () => {
      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 1 });

      expect(result).toEqual([]);
    });

    it('应该处理 perCategory 为 0', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Test Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 0 });

      expect(result).toEqual([]);
    });

    it('应该处理 perCategory 大于分类工具总数', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Test Tool',
            url: 'https://example.com/1',
            rating: 5,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 100 });

      expect(result).toHaveLength(1);
    });

    it('应该处理空的 tools 数组', async () => {
      await createCategoryFile(tempDir, 'empty.md', {
        category: 'Empty',
        tools: [],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toEqual([]);
    });

    it('应该处理缺少 tools 字段的分类文件', async () => {
      await createCategoryFile(tempDir, 'no-tools.md', {
        category: 'NoTools',
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      expect(result).toEqual([]);
    });

    it('应该处理工具缺少 URL 的情况', async () => {
      await createCategoryFile(tempDir, 'tools.md', {
        category: 'General',
        tools: [
          {
            title: 'Tool without URL',
            rating: 5,
          },
          {
            title: 'Tool with URL',
            url: 'https://example.com/1',
            rating: 4,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 10 });

      // 应该包含两个工具（URL 为空字符串）
      expect(result).toHaveLength(2);
      // 工具按评分排序，rating 5 在前，rating 4 在后
      expect(result[0].title).toBe('Tool without URL');
      expect(result[0].url).toBe('');
      expect(result[0].rating).toBe(5);
      expect(result[1].title).toBe('Tool with URL');
      expect(result[1].url).toBe('https://example.com/1');
      expect(result[1].rating).toBe(4);
    });

    it('应该处理多个分类返回正确数量的工具', async () => {
      await createCategoryFile(tempDir, 'dev.md', {
        category: 'Development',
        tools: [
          {
            title: 'Dev Tool 1',
            url: 'https://example.com/dev1',
            rating: 5,
          },
          {
            title: 'Dev Tool 2',
            url: 'https://example.com/dev2',
            rating: 4,
          },
          {
            title: 'Dev Tool 3',
            url: 'https://example.com/dev3',
            rating: 3,
          },
        ],
      });

      await createCategoryFile(tempDir, 'design.md', {
        category: 'Design',
        tools: [
          {
            title: 'Design Tool 1',
            url: 'https://example.com/design1',
            rating: 5,
          },
          {
            title: 'Design Tool 2',
            url: 'https://example.com/design2',
            rating: 4,
          },
        ],
      });

      const filter = new ToolFilter(tempDir, hookManager);
      const result = await filter.filter({ perCategory: 2 });

      // 应该返回 4 个工具（每个分类 2 个）
      expect(result).toHaveLength(4);

      const devTools = result.filter((t) => t.category === 'Development');
      const designTools = result.filter((t) => t.category === 'Design');

      expect(devTools).toHaveLength(2);
      expect(designTools).toHaveLength(2);
    });
  });
});
