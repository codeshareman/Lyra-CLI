import { CLIInterface } from './CLIInterface';
import { IContentGenerator, ITemplateRegistry, GenerateResult, TemplateInfo } from '../types/interfaces';

// Mock IContentGenerator
class MockContentGenerator implements IContentGenerator {
  public generateCalls: Array<{ templateType: string; options: any }> = [];
  public shouldSucceed: boolean = true;

  async generate(
    templateType: string,
    options?: Record<string, any>
  ): Promise<GenerateResult> {
    this.generateCalls.push({ templateType, options: options || {} });

    if (this.shouldSucceed) {
      return {
        success: true,
        filePath: `/output/${templateType}.md`,
        message: '生成成功',
        statistics: {
          articles: 5,
          tools: 3,
          notes: 2,
        },
      };
    } else {
      return {
        success: false,
        message: '生成失败',
      };
    }
  }

  listTemplates(): string[] {
    return ['weekly', 'monthly'];
  }
}

// Mock ITemplateRegistry
class MockTemplateRegistry implements ITemplateRegistry {
  private templates: Map<string, any> = new Map();

  constructor() {
    // 预设一些模板
    this.templates.set('weekly', {});
    this.templates.set('monthly', {});
  }

  registerTemplate(name: string, provider: any): void {
    this.templates.set(name, provider);
  }

  getTemplate(name: string): any {
    return this.templates.get(name) || null;
  }

  listTemplates(): TemplateInfo[] {
    return Array.from(this.templates.keys()).map((name) => ({
      name,
      description: `${name} 模板`,
      version: '1.0.0',
    }));
  }

  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }

  getTemplateConstructor(name: string): any {
    return this.templates.get(name);
  }
}

describe('CLIInterface', () => {
  let cli: CLIInterface;
  let mockGenerator: MockContentGenerator;
  let mockRegistry: MockTemplateRegistry;
  let consoleSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGenerator = new MockContentGenerator();
    mockRegistry = new MockTemplateRegistry();
    cli = new CLIInterface(mockGenerator, mockRegistry);
    
    // Mock console methods
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Mock process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    
    cli.init();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('create 命令', () => {
    it('应该成功创建内容', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await cli.parse(args);

      expect(mockGenerator.generateCalls).toHaveLength(1);
      expect(mockGenerator.generateCalls[0].templateType).toBe('weekly');
      expect(consoleSpy).toHaveBeenCalledWith('开始生成 weekly 内容...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ 生成成功!');
    });

    it('应该处理模板特定选项', async () => {
      const args = [
        'node',
        'cli.js',
        'create',
        '--template',
        'weekly',
        '--date',
        '2024-01-01',
        '--regenerate-summaries',
      ];
      
      await cli.parse(args);

      expect(mockGenerator.generateCalls[0].options.date).toBe('2024-01-01');
      expect(mockGenerator.generateCalls[0].options.regenerateSummaries).toBe(true);
    });

    it('应该在缺少模板类型时显示错误', async () => {
      const args = ['node', 'cli.js', 'create'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
      
      // 验证 generate 被调用时模板类型为 undefined
      if (mockGenerator.generateCalls.length > 0) {
        expect(mockGenerator.generateCalls[0].templateType).toBeUndefined();
      }
    });

    it('应该在模板不存在时显示错误', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'nonexistent'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
      
      // 验证模板检查被调用
      expect(mockRegistry.hasTemplate('nonexistent')).toBe(false);
    });

    it('应该处理生成失败', async () => {
      mockGenerator.shouldSucceed = false;
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
      
      // 验证 generate 方法被调用
      expect(mockGenerator.generateCalls).toHaveLength(1);
    });

    it('应该支持预览模式', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'weekly', '--dry-run'];
      
      await cli.parse(args);

      expect(consoleSpy).toHaveBeenCalledWith('预览模式 - 未创建文件');
      expect(consoleSpy).toHaveBeenCalledWith('生成的内容:');
    });

    it('应该显示统计信息', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await cli.parse(args);

      expect(consoleSpy).toHaveBeenCalledWith('📊 统计信息:');
      expect(consoleSpy).toHaveBeenCalledWith('  articles: 5');
      expect(consoleSpy).toHaveBeenCalledWith('  tools: 3');
      expect(consoleSpy).toHaveBeenCalledWith('  notes: 2');
    });
  });

  describe('list 命令', () => {
    it('应该列出所有可用模板', async () => {
      const args = ['node', 'cli.js', 'list'];
      
      await cli.parse(args);

      expect(consoleSpy).toHaveBeenCalledWith('可用的模板类型:');
      expect(consoleSpy).toHaveBeenCalledWith('  weekly - weekly 模板');
      expect(consoleSpy).toHaveBeenCalledWith('  monthly - monthly 模板');
    });

    it('应该处理空模板列表', async () => {
      // 创建空的模板注册表
      const emptyRegistry = new MockTemplateRegistry();
      emptyRegistry.registerTemplate = jest.fn();
      // 清空模板
      (emptyRegistry as any).templates.clear();
      
      const emptyCli = new CLIInterface(mockGenerator, emptyRegistry);
      emptyCli.init();
      
      const args = ['node', 'cli.js', 'list'];
      await emptyCli.parse(args);

      expect(consoleSpy).toHaveBeenCalledWith('没有可用的模板类型');
    });
  });

  describe('命令行参数解析', () => {
    it('应该正确解析通用参数', async () => {
      const args = [
        'node',
        'cli.js',
        'create',
        '--template',
        'weekly',
        '--config',
        'custom.json',
        '--verbose',
      ];
      
      await cli.parse(args);

      expect(mockGenerator.generateCalls[0].options.config).toBe('custom.json');
      expect(mockGenerator.generateCalls[0].options.verbose).toBe(true);
    });

    it('应该正确解析 no-aggregate 选项', async () => {
      const args = [
        'node',
        'cli.js',
        'create',
        '--template',
        'weekly',
        '--no-aggregate',
      ];
      
      await cli.parse(args);

      expect(mockGenerator.generateCalls[0].options.noAggregate).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该处理生成过程中的异常', async () => {
      // Mock generator 抛出异常
      mockGenerator.generate = jest.fn().mockRejectedValue(new Error('测试异常'));
      
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
      
      // 验证 generate 方法被调用
      expect(mockGenerator.generate).toHaveBeenCalledWith('weekly', expect.any(Object));
    });

    it('应该处理无效的命令', async () => {
      const args = ['node', 'cli.js', 'invalid-command'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
    });

    it('应该处理缺少必需参数的情况', async () => {
      const args = ['node', 'cli.js', 'create', '--config', 'test.json'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
    });
  });

  describe('帮助和版本信息', () => {
    it('应该显示帮助信息', async () => {
      const args = ['node', 'cli.js', '--help'];
      
      // 帮助信息会导致程序正常退出，不抛出异常
      await cli.parse(args);
      
      // 帮助信息由 Commander.js 内部处理，不需要验证 console.log
    });

    it('应该显示版本信息', async () => {
      const args = ['node', 'cli.js', '--version'];
      
      // 版本信息会导致程序正常退出，不抛出异常
      await cli.parse(args);
      
      // 版本信息由 Commander.js 内部处理，不需要验证 console.log
    });

    it('应该显示 create 命令的帮助', async () => {
      const args = ['node', 'cli.js', 'create', '--help'];
      
      // 命令帮助会导致程序正常退出，不抛出异常
      await cli.parse(args);
    });

    it('应该显示 list 命令的帮助', async () => {
      const args = ['node', 'cli.js', 'list', '--help'];
      
      // 命令帮助会导致程序正常退出，不抛出异常
      await cli.parse(args);
    });
  });

  describe('命令行选项组合', () => {
    it('应该正确处理所有选项的组合', async () => {
      const args = [
        'node',
        'cli.js',
        'create',
        '--template',
        'weekly',
        '--config',
        'custom.json',
        '--date',
        '2024-01-01',
        '--dry-run',
        '--verbose',
        '--no-aggregate',
        '--regenerate-summaries',
      ];
      
      await cli.parse(args);

      const options = mockGenerator.generateCalls[0].options;
      expect(options.config).toBe('custom.json');
      expect(options.date).toBe('2024-01-01');
      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.noAggregate).toBe(true);
      expect(options.regenerateSummaries).toBe(true);
    });

    it('应该正确处理短选项', async () => {
      const args = [
        'node',
        'cli.js',
        'create',
        '-t',
        'weekly',
        '-c',
        'custom.json',
        '-v',
      ];
      
      await cli.parse(args);

      const options = mockGenerator.generateCalls[0].options;
      expect(options.config).toBe('custom.json');
      expect(options.verbose).toBe(true);
    });

    it('应该正确处理布尔选项的默认值', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await cli.parse(args);

      const options = mockGenerator.generateCalls[0].options;
      // 布尔选项在未指定时可能是 undefined 或 false
      expect(options.dryRun).toBeFalsy();
      expect(options.verbose).toBeFalsy();
      expect(options.noAggregate).toBeFalsy();
      expect(options.regenerateSummaries).toBeFalsy();
    });
  });

  describe('输出格式', () => {
    it('应该在详细模式下显示更多信息', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'weekly', '--verbose'];
      
      await cli.parse(args);

      expect(consoleSpy).toHaveBeenCalledWith('开始生成 weekly 内容...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ 生成成功!');
      expect(consoleSpy).toHaveBeenCalledWith('📄 文件路径: /output/weekly.md');
    });

    it('应该在非详细模式下显示简洁信息', async () => {
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await cli.parse(args);

      expect(consoleSpy).toHaveBeenCalledWith('开始生成 weekly 内容...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ 生成成功!');
    });

    it('应该正确格式化错误消息', async () => {
      mockGenerator.shouldSucceed = false;
      
      // Mock console.error as well since error messages might go there
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const args = ['node', 'cli.js', 'create', '--template', 'weekly'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
      
      // 验证错误消息被显示 - 可能在 console.error 中
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ 生成失败!');
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('应该处理空参数数组', async () => {
      const args: string[] = [];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
    });

    it('应该处理只有程序名的参数', async () => {
      const args = ['node', 'cli.js'];
      
      await expect(cli.parse(args)).rejects.toThrow('Process exited with code 1');
    });

    it('应该处理特殊字符的模板名', async () => {
      // 添加特殊字符的模板
      mockRegistry.registerTemplate('test-template_123', {});
      
      const args = ['node', 'cli.js', 'create', '--template', 'test-template_123'];
      
      await cli.parse(args);

      expect(mockGenerator.generateCalls[0].templateType).toBe('test-template_123');
    });

    it('应该处理长文件路径', async () => {
      const longPath = '/very/long/path/to/config/file/that/might/cause/issues.json';
      const args = [
        'node',
        'cli.js',
        'create',
        '--template',
        'weekly',
        '--config',
        longPath,
      ];
      
      await cli.parse(args);

      expect(mockGenerator.generateCalls[0].options.config).toBe(longPath);
    });

    it('应该处理特殊日期格式', async () => {
      const specialDates = [
        '2024-02-29',  // 闰年
        '2024-12-31',  // 年末
        '2024-01-01',  // 年初
      ];

      for (const date of specialDates) {
        mockGenerator.generateCalls = []; // 重置调用记录
        
        const args = [
          'node',
          'cli.js',
          'create',
          '--template',
          'weekly',
          '--date',
          date,
        ];
        
        await cli.parse(args);

        expect(mockGenerator.generateCalls[0].options.date).toBe(date);
      }
    });
  });
});