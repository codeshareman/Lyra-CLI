import { ContentGenerator } from './ContentGenerator';
import {
  ITemplateRegistry,
  IConfigManager,
  ITemplateEngine,
  IDataProvider,
  ILogger,
  GenerateOptions,
  SystemConfig,
  TemplateConfig,
  TemplateData,
  ValidationResult,
  DataProviderConstructor
} from '../types/interfaces';
import { ErrorCode } from '../types/errors';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock implementations
class MockLogger implements ILogger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  setLevel = jest.fn();
}

class MockTemplateRegistry implements ITemplateRegistry {
  private templates = new Map<string, DataProviderConstructor>();

  registerTemplate = jest.fn((name: string, provider: DataProviderConstructor) => {
    this.templates.set(name, provider);
  });

  getTemplate = jest.fn();
  
  getTemplateConstructor = jest.fn((name: string) => {
    return this.templates.get(name) || null;
  });

  listTemplates = jest.fn(() => [
    { name: 'weekly', description: 'Weekly template', version: '1.0.0' }
  ]);

  hasTemplate = jest.fn((name: string) => this.templates.has(name));
}

class MockConfigManager implements IConfigManager {
  load = jest.fn();
  getTemplateConfig = jest.fn();
  validate = jest.fn();
}

class MockTemplateEngine implements ITemplateEngine {
  render = jest.fn();
  registerHelper = jest.fn();
}

class MockDataProvider implements IDataProvider {
  collectData = jest.fn();
  validateData = jest.fn();
  getTemplatePath = jest.fn();
}

// Mock fs module
jest.mock('fs/promises');

describe('ContentGenerator', () => {
  let contentGenerator: ContentGenerator;
  let mockRegistry: MockTemplateRegistry;
  let mockConfigManager: MockConfigManager;
  let mockTemplateEngine: MockTemplateEngine;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockRegistry = new MockTemplateRegistry();
    mockConfigManager = new MockConfigManager();
    mockTemplateEngine = new MockTemplateEngine();
    mockLogger = new MockLogger();

    contentGenerator = new ContentGenerator(
      mockRegistry,
      mockConfigManager,
      mockTemplateEngine,
      mockLogger,
      undefined // hookManager is optional
    );

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('generate', () => {
    const mockConfig: SystemConfig = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly'
      },
      templates: {
        weekly: {
          enabled: true,
          template: { path: './templates/weekly.hbs' },
          sources: {
            articles: 'test/articles',
            tools: 'test/tools',
            notes: 'test/notes'
          },
          output: {
            path: 'test/output',
            filename: 'Weekly-{{issueNumber}}.md'
          },
          content: {}
        }
      }
    };

    const mockTemplateData: TemplateData = {
      metadata: {
        issueNumber: 1,
        title: 'Weekly #1',
        date: '2024-01-15'
      },
      content: {
        articles: [],
        tools: [],
        notes: []
      },
      statistics: {
        articles: 0,
        tools: 0,
        notes: 0
      }
    };

    beforeEach(() => {
      // Setup default mock behaviors
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.validate.mockReturnValue({ valid: true, errors: [] });
      mockConfigManager.getTemplateConfig.mockReturnValue(mockConfig.templates.weekly);
      
      const MockProviderClass = jest.fn().mockImplementation(() => {
        const provider = new MockDataProvider();
        provider.collectData.mockResolvedValue(mockTemplateData);
        provider.validateData.mockReturnValue({ valid: true, errors: [] });
        provider.getTemplatePath.mockReturnValue('./templates/weekly.hbs');
        return provider;
      });
      
      mockRegistry.registerTemplate('weekly', MockProviderClass as any);
      mockRegistry.getTemplateConstructor.mockReturnValue(MockProviderClass as any);
      
      mockTemplateEngine.render.mockResolvedValue('# Weekly #1\n\nContent here');
      
      // Mock fs functions
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('应该成功生成内容', async () => {
      // Override the default mock: template file exists, output file doesn't exist
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // template file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // output file doesn't exist

      const options: GenerateOptions = {
        dryRun: false,
        verbose: false
      };

      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(true);
      // 使用绝对路径，因为 ContentGenerator 会解析为绝对路径
      expect(result.filePath).toBe(path.resolve(process.cwd(), 'test/output/Weekly-1.md'));
      expect(result.message).toContain('成功生成');
      expect(result.statistics).toEqual(mockTemplateData.statistics);
    });

    it('应该在预览模式下输出内容到控制台', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const options: GenerateOptions = {
        dryRun: true,
        verbose: false
      };

      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeUndefined();
      expect(result.message).toContain('预览模式');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('应该在模板类型不存在时返回错误', async () => {
      mockConfigManager.getTemplateConfig.mockReturnValue(null);

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('nonexistent', options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('模板类型不存在');
    });

    it('应该在配置验证失败时返回错误', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: ['缺少必需字段']
      });

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('配置验证失败');
    });

    it('应该在数据验证失败时返回错误', async () => {
      const MockProviderClass = jest.fn().mockImplementation(() => {
        const provider = new MockDataProvider();
        provider.collectData.mockResolvedValue(mockTemplateData);
        provider.validateData.mockReturnValue({
          valid: false,
          errors: ['缺少期数']
        });
        provider.getTemplatePath.mockReturnValue('./templates/weekly.hbs');
        return provider;
      });
      
      mockRegistry.getTemplateConstructor.mockReturnValue(MockProviderClass as any);

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('数据验证失败');
    });

    it('应该在模板文件不存在时返回错误', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('文件不存在'));

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('模板文件不存在');
    });

    it('应该在目标文件已存在时返回错误', async () => {
      // First access (template file) succeeds
      // Second access (output file) succeeds, indicating file exists
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // template exists
        .mockResolvedValueOnce(undefined); // output file exists

      // Mock readFile to return content with different cycle
      (fs.readFile as jest.Mock).mockResolvedValue(`---
weekStart: '2024-01-01'
weekEnd: '2024-01-07'
---

Existing content`);

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('目标文件已存在');
    });

    it('应该创建输出目录（如果不存在）', async () => {
      const options: GenerateOptions = {};
      await contentGenerator.generate('weekly', options);

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'test/output'),
        { recursive: true }
      );
    });

    it('应该使用 UTF-8 编码和 LF 换行符写入文件', async () => {
      // Override the default mock
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // template file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // output file doesn't exist

      mockTemplateEngine.render.mockResolvedValue('Line 1\r\nLine 2\r\nLine 3');

      const options: GenerateOptions = {};
      await contentGenerator.generate('weekly', options);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'test/output/Weekly-1.md'),
        'Line 1\nLine 2\nLine 3',
        { encoding: 'utf-8' }
      );
    });

    it('应该根据 export.formats 额外导出 wechat 文件', async () => {
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // template file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // output file doesn't exist

      mockTemplateEngine.render.mockResolvedValue('# Weekly #1\n\nHello');
      mockConfigManager.getTemplateConfig.mockReturnValue({
        ...mockConfig.templates.weekly,
        export: {
          formats: ['markdown', 'wechat'],
          wechat: {
            validateImages: true,
            backgroundPreset: 'grid',
          },
        },
      } as any);

      const result = await contentGenerator.generate('weekly', {});

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'test/output/Weekly-1.wechat.html'),
        expect.stringContaining('<article class="cg-article wechat-article'),
        { encoding: 'utf-8' }
      );
    });

    it('应该将 wechat 图片代理与优化配置传递到导出结果', async () => {
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      mockTemplateEngine.render.mockResolvedValue(
        '# Weekly #1\n\n![封面](https://images.unsplash.com/photo-abc.jpg)'
      );
      mockConfigManager.getTemplateConfig.mockReturnValue({
        ...mockConfig.templates.weekly,
        export: {
          formats: ['markdown', 'wechat'],
          wechat: {
            validateImages: true,
            imageProxyUrl: 'https://images.weserv.nl/?url={url}',
            imageOptimization: {
              maxWidth: 900,
              quality: 78,
              format: 'webp',
            },
          },
        },
      } as any);

      const result = await contentGenerator.generate('weekly', {});

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'test/output/Weekly-1.wechat.html'),
        expect.stringContaining('https://images.weserv.nl/'),
        { encoding: 'utf-8' }
      );
    });

    it('应该正确替换文件名中的占位符', async () => {
      // Override the default mock
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // template file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // output file doesn't exist
      
      const customTemplateData = {
        ...mockTemplateData,
        metadata: {
          issueNumber: 42,
          date: '2024-01-15',
          title: 'Weekly #42'
        }
      };

      const MockProviderClass = jest.fn().mockImplementation(() => {
        const provider = new MockDataProvider();
        provider.collectData.mockResolvedValue(customTemplateData);
        provider.validateData.mockReturnValue({ valid: true, errors: [] });
        provider.getTemplatePath.mockReturnValue('./templates/weekly.hbs');
        return provider;
      });
      
      mockRegistry.getTemplateConstructor.mockReturnValue(MockProviderClass as any);

      const customConfig = {
        ...mockConfig.templates.weekly,
        output: {
          path: 'test/output',
          filename: 'Weekly-{{issueNumber}}-{{date}}.md'
        }
      };
      mockConfigManager.getTemplateConfig.mockReturnValue(customConfig);

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('weekly', options);

      expect(result.filePath).toBe(path.resolve(process.cwd(), 'test/output/Weekly-42-2024-01-15.md'));
    });

    it('应该在模板未启用时返回失败', async () => {
      const disabledConfig = {
        ...mockConfig.templates.weekly,
        enabled: false
      };
      mockConfigManager.getTemplateConfig.mockReturnValue(disabledConfig);

      const options: GenerateOptions = {};
      const result = await contentGenerator.generate('weekly', options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('未启用');
    });

    it('应该记录生成过程的日志', async () => {
      // Override the default mock
      (fs.access as jest.Mock)
        .mockResolvedValueOnce(undefined) // template file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // output file doesn't exist
      
      const options: GenerateOptions = {};
      await contentGenerator.generate('weekly', options);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('开始生成'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('正在收集数据'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('正在验证数据'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('正在渲染模板'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('内容生成完成'));
    });
  });

  describe('listTemplates', () => {
    it('应该返回所有已注册的模板类型', () => {
      mockRegistry.listTemplates.mockReturnValue([
        { name: 'weekly', description: 'Weekly template', version: '1.0.0' },
        { name: 'monthly', description: 'Monthly template', version: '1.0.0' }
      ]);

      const templates = contentGenerator.listTemplates();

      expect(templates).toEqual(['weekly', 'monthly']);
    });

    it('应该在没有注册模板时返回空数组', () => {
      mockRegistry.listTemplates.mockReturnValue([]);

      const templates = contentGenerator.listTemplates();

      expect(templates).toEqual([]);
    });
  });
});
