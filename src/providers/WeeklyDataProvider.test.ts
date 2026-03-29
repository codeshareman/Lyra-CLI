import { WeeklyDataProvider } from './WeeklyDataProvider';
import {
  TemplateConfig,
  IHookManager,
  CollectOptions,
  TemplateData,
} from '../types/interfaces';
import { ArticleFilter } from '../filters/ArticleFilter';
import { ToolFilter } from '../filters/ToolFilter';
import { ContentAggregator } from '../aggregators/ContentAggregator';
import { MetadataManager } from '../metadata/MetadataManager';

// Mock 所有依赖模块
jest.mock('../filters/ArticleFilter');
jest.mock('../filters/ToolFilter');
jest.mock('../aggregators/ContentAggregator');
jest.mock('../metadata/MetadataManager');

describe('WeeklyDataProvider', () => {
  let mockHookManager: jest.Mocked<IHookManager>;
  let mockConfig: TemplateConfig;
  let provider: WeeklyDataProvider;

  beforeEach(() => {
    // 创建 mock hook manager
    mockHookManager = {
      registerHook: jest.fn(),
      executeHook: jest.fn(),
      hasHook: jest.fn().mockReturnValue(false),
      clearHooks: jest.fn(),
    };

    // 创建测试配置
    mockConfig = {
      enabled: true,
      template: {
        path: '/path/to/template.hbs',
      },
      sources: {
        articles: '/path/to/articles',
        tools: '/path/to/tools',
        notes: '/path/to/notes',
      },
      output: {
        path: '/path/to/output',
        filename: 'weekly-{issue}.md',
      },
      content: {
        articles: {
          topN: 10,
          minRating: 3,
        },
        tools: {
          perCategory: 1,
        },
        notes: {
          groupBy: 'tags',
        },
      },
    };

    // 清除所有 mock
    jest.clearAllMocks();

    // 创建 provider 实例
    provider = new WeeklyDataProvider(mockConfig, mockHookManager);
  });

  describe('构造函数', () => {
    it('应该正确初始化所有组件', () => {
      expect(ArticleFilter).toHaveBeenCalledWith(
        '/path/to/articles',
        mockHookManager
      );
      expect(ToolFilter).toHaveBeenCalledWith(
        '/path/to/tools',
        mockHookManager
      );
      expect(ContentAggregator).toHaveBeenCalledWith(
        '/path/to/notes',
        mockHookManager
      );
      expect(MetadataManager).toHaveBeenCalledWith('/path/to/output', undefined);
    });

    it('应该支持备用的数据源配置名称', () => {
      const altConfig = {
        ...mockConfig,
        sources: {
          clippings: '/path/to/clippings',
          tools: '/path/to/tools',
          permanentNotes: '/path/to/permanent-notes',
        },
      };

      new WeeklyDataProvider(altConfig, mockHookManager);

      expect(ArticleFilter).toHaveBeenCalledWith(
        '/path/to/clippings',
        mockHookManager
      );
      expect(ContentAggregator).toHaveBeenCalledWith(
        '/path/to/permanent-notes',
        mockHookManager
      );
    });
  });

  describe('collectData', () => {
    let mockArticleFilter: jest.Mocked<ArticleFilter>;
    let mockToolFilter: jest.Mocked<ToolFilter>;
    let mockContentAggregator: jest.Mocked<ContentAggregator>;
    let mockMetadataManager: jest.Mocked<MetadataManager>;

    beforeEach(() => {
      // 获取 mock 实例
      mockArticleFilter = (ArticleFilter as jest.MockedClass<typeof ArticleFilter>).mock
        .instances[0] as jest.Mocked<ArticleFilter>;
      mockToolFilter = (ToolFilter as jest.MockedClass<typeof ToolFilter>).mock
        .instances[0] as jest.Mocked<ToolFilter>;
      mockContentAggregator = (ContentAggregator as jest.MockedClass<typeof ContentAggregator>).mock
        .instances[0] as jest.Mocked<ContentAggregator>;
      mockMetadataManager = (MetadataManager as jest.MockedClass<typeof MetadataManager>).mock
        .instances[0] as jest.Mocked<MetadataManager>;

      // 设置 mock 返回值
      mockArticleFilter.filter = jest.fn().mockResolvedValue([
        { title: 'Article 1', url: 'http://example.com/1', rating: 5 },
        { title: 'Article 2', url: 'http://example.com/2', rating: 4 },
      ]);

      mockToolFilter.filter = jest.fn().mockResolvedValue([
        { title: 'Tool 1', url: 'http://tool.com/1', rating: 5, category: 'Dev' },
      ]);

      mockContentAggregator.aggregate = jest.fn().mockResolvedValue([
        { title: 'Note 1', path: '/notes/note1.md', created: new Date() },
      ]);

      mockMetadataManager.generate = jest.fn().mockResolvedValue({
        id: '20240101120000',
        title: 'Weekly Issue #1',
        type: 'weekly',
        issueNumber: 1,
        date: '2024-01-01',
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        created: '2024-01-01T12:00:00.000Z',
        modified: '2024-01-01T12:00:00.000Z',
        status: 'published',
        tags: ['weekly', 'newsletter'],
        publishedPlatforms: [],
      });
    });

    it('应该成功收集所有数据', async () => {
      const options: CollectOptions = {
        date: new Date('2024-01-01'),
        config: mockConfig,
      };

      const result = await provider.collectData(options);

      // 验证调用了所有筛选器
      expect(mockArticleFilter.filter).toHaveBeenCalledWith({
        topN: 10,
        minRating: 3,
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        configDir: undefined,
      });
      expect(mockToolFilter.filter).toHaveBeenCalledWith({
        perCategory: 1,
        excludeRecommended: false,
        configDir: undefined,
      });
      expect(mockContentAggregator.aggregate).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        groupBy: 'tags',
        configDir: undefined,
      });
      expect(mockMetadataManager.generate).toHaveBeenCalledWith({
        date: options.date,
        outputPath: '/path/to/output',
      });

      // 验证返回的数据结构
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('statistics');

      expect(result.content.articles).toHaveLength(2);
      expect(result.content.tools).toHaveLength(1);
      expect(result.content.notes).toHaveLength(1);

      expect(result.statistics).toEqual({
        articles: 2,
        tools: 1,
        notes: 1,
      });
    });

    it('应该使用当前日期作为默认基准日期', async () => {
      const options: CollectOptions = {
        config: mockConfig,
      };

      await provider.collectData(options);

      // 验证 aggregate 被调用时使用了日期
      expect(mockContentAggregator.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
        })
      );
    });

    it('应该使用配置中的默认值', async () => {
      const configWithoutDefaults = {
        ...mockConfig,
        content: {},
      };

      const providerWithDefaults = new WeeklyDataProvider(
        configWithoutDefaults,
        mockHookManager
      );

      // 获取新的 mock 实例
      const newMockArticleFilter = (ArticleFilter as jest.MockedClass<typeof ArticleFilter>).mock
        .instances[1] as jest.Mocked<ArticleFilter>;
      const newMockToolFilter = (ToolFilter as jest.MockedClass<typeof ToolFilter>).mock
        .instances[1] as jest.Mocked<ToolFilter>;
      const newMockContentAggregator = (ContentAggregator as jest.MockedClass<typeof ContentAggregator>).mock
        .instances[1] as jest.Mocked<ContentAggregator>;
      const newMockMetadataManager = (MetadataManager as jest.MockedClass<typeof MetadataManager>).mock
        .instances[1] as jest.Mocked<MetadataManager>;

      newMockArticleFilter.filter = jest.fn().mockResolvedValue([]);
      newMockToolFilter.filter = jest.fn().mockResolvedValue([]);
      newMockContentAggregator.aggregate = jest.fn().mockResolvedValue([]);
      newMockMetadataManager.generate = jest.fn().mockResolvedValue({
        id: '20240101120000',
        title: 'Weekly Issue #1',
        type: 'weekly',
        issueNumber: 1,
        date: '2024-01-01',
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        created: '2024-01-01T12:00:00.000Z',
        modified: '2024-01-01T12:00:00.000Z',
        status: 'published',
        tags: ['weekly'],
        publishedPlatforms: [],
      });

      const options: CollectOptions = {
        date: new Date('2024-01-01'),
        config: configWithoutDefaults,
      };

      await providerWithDefaults.collectData(options);

      // 验证使用了默认值
      expect(newMockArticleFilter.filter).toHaveBeenCalledWith({
        topN: 10,
        minRating: 0,
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        configDir: undefined,
      });
      expect(newMockToolFilter.filter).toHaveBeenCalledWith({
        perCategory: 1,
        excludeRecommended: false,
        configDir: undefined,
      });
      expect(newMockContentAggregator.aggregate).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        groupBy: 'none',
        configDir: undefined,
      });
    });

    it('应该在数据收集失败时抛出 DataCollectionError', async () => {
      mockArticleFilter.filter = jest
        .fn()
        .mockRejectedValue(new Error('筛选失败'));

      const options: CollectOptions = {
        date: new Date('2024-01-01'),
        config: mockConfig,
      };

      await expect(provider.collectData(options)).rejects.toThrow(
        '收集 Weekly 数据失败'
      );
    });
  });

  describe('validateData', () => {
    it('应该验证完整的数据结构', () => {
      const validData: TemplateData = {
        metadata: {
          id: '20240101120000',
          title: 'Weekly Issue #1',
          type: 'weekly',
          issueNumber: 1,
          date: '2024-01-01',
          weekStart: '2024-01-01',
          weekEnd: '2024-01-07',
          created: '2024-01-01T12:00:00.000Z',
          modified: '2024-01-01T12:00:00.000Z',
          status: 'published',
          tags: ['weekly', 'newsletter'],
          publishedPlatforms: [],
        },
        content: {
          articles: [],
          tools: [],
          notes: [],
        },
        statistics: {
          articles: 0,
          tools: 0,
          notes: 0,
        },
      };

      const result = provider.validateData(validData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少元数据', () => {
      const invalidData: TemplateData = {
        metadata: {},
        content: {
          articles: [],
          tools: [],
          notes: [],
        },
        statistics: {
          articles: 0,
          tools: 0,
          notes: 0,
        },
      };

      const result = provider.validateData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少期数 (issueNumber)');
      expect(result.errors).toContain('缺少周开始日期 (weekStart)');
      expect(result.errors).toContain('缺少周结束日期 (weekEnd)');
      expect(result.errors).toContain('缺少文档 ID (id)');
      expect(result.errors).toContain('缺少标题 (title)');
    });

    it('应该检测缺少内容数据', () => {
      const invalidData: any = {
        metadata: {
          id: '20240101120000',
          title: 'Weekly Issue #1',
          issueNumber: 1,
          weekStart: '2024-01-01',
          weekEnd: '2024-01-07',
        },
        statistics: {
          articles: 0,
          tools: 0,
          notes: 0,
        },
      };

      const result = provider.validateData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少内容数据');
    });

    it('应该检测内容格式错误', () => {
      const invalidData: any = {
        metadata: {
          id: '20240101120000',
          title: 'Weekly Issue #1',
          issueNumber: 1,
          weekStart: '2024-01-01',
          weekEnd: '2024-01-07',
        },
        content: {
          articles: 'not an array',
          tools: {},
          notes: null,
        },
        statistics: {
          articles: 0,
          tools: 0,
          notes: 0,
        },
      };

      const result = provider.validateData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('文章列表格式错误');
      expect(result.errors).toContain('工具列表格式错误');
      expect(result.errors).toContain('笔记列表格式错误');
    });

    it('应该检测统计信息格式错误', () => {
      const invalidData: any = {
        metadata: {
          id: '20240101120000',
          title: 'Weekly Issue #1',
          issueNumber: 1,
          weekStart: '2024-01-01',
          weekEnd: '2024-01-07',
        },
        content: {
          articles: [],
          tools: [],
          notes: [],
        },
        statistics: {
          articles: 'not a number',
          tools: null,
          notes: undefined,
        },
      };

      const result = provider.validateData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('文章统计信息格式错误');
      expect(result.errors).toContain('工具统计信息格式错误');
      expect(result.errors).toContain('笔记统计信息格式错误');
    });

    it('应该允许空的内容数组', () => {
      const validData: TemplateData = {
        metadata: {
          id: '20240101120000',
          title: 'Weekly Issue #1',
          issueNumber: 1,
          weekStart: '2024-01-01',
          weekEnd: '2024-01-07',
        },
        content: {
          articles: [],
          tools: [],
          notes: [],
        },
        statistics: {
          articles: 0,
          tools: 0,
          notes: 0,
        },
      };

      const result = provider.validateData(validData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getTemplatePath', () => {
    it('应该返回配置中的模板路径', () => {
      const templatePath = provider.getTemplatePath();

      expect(templatePath).toBe('/path/to/template.hbs');
    });
  });
});
