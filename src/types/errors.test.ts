import {
  ErrorCode,
  ContentGeneratorError,
  ConfigError,
  TemplateError,
  DataCollectionError,
  FileSystemError,
  ValidationError,
  RenderError,
  RegistryError,
  ScheduleError,
  HookError,
  DataSourceError,
  AIError,
  CacheError,
  RateLimitError
} from './errors';

describe('错误处理', () => {
  describe('ErrorCode 枚举', () => {
    it('应该包含所有必需的错误代码', () => {
      expect(ErrorCode.E001).toBe('TEMPLATE_NOT_FOUND');
      expect(ErrorCode.E002).toBe('TEMPLATE_PARSE_ERROR');
      expect(ErrorCode.E003).toBe('OUTPUT_DIR_ERROR');
      expect(ErrorCode.E004).toBe('FILE_EXISTS');
      expect(ErrorCode.E005).toBe('DATA_VALIDATION_ERROR');
      expect(ErrorCode.E006).toBe('CONFIG_ERROR');
      expect(ErrorCode.E007).toBe('SOURCE_NOT_FOUND');
      expect(ErrorCode.E008).toBe('INVALID_DATE');
      expect(ErrorCode.E009).toBe('METADATA_ERROR');
      expect(ErrorCode.E010).toBe('RENDER_ERROR');
      expect(ErrorCode.E011).toBe('REGISTRY_ERROR');
      expect(ErrorCode.E012).toBe('SCHEDULE_ERROR');
      expect(ErrorCode.E013).toBe('HOOK_LOAD_ERROR');
      expect(ErrorCode.E014).toBe('HOOK_EXECUTION_ERROR');
      expect(ErrorCode.E015).toBe('DATA_SOURCE_ERROR');
      expect(ErrorCode.E016).toBe('GLOB_PATTERN_ERROR');
      expect(ErrorCode.E017).toBe('AI_API_ERROR');
      expect(ErrorCode.E018).toBe('SUMMARY_CACHE_ERROR');
      expect(ErrorCode.E019).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('ContentGeneratorError 基类', () => {
    it('应该正确设置错误属性', () => {
      const error = new ContentGeneratorError(
        ErrorCode.E001,
        '测试错误消息',
        { test: 'details' }
      );

      expect(error.code).toBe(ErrorCode.E001);
      expect(error.message).toBe('测试错误消息');
      expect(error.details).toEqual({ test: 'details' });
      expect(error.name).toBe('ContentGeneratorError');
      expect(error instanceof Error).toBe(true);
    });

    it('应该在没有详细信息时正常工作', () => {
      const error = new ContentGeneratorError(ErrorCode.E001, '测试错误消息');

      expect(error.code).toBe(ErrorCode.E001);
      expect(error.message).toBe('测试错误消息');
      expect(error.details).toBeUndefined();
    });
  });

  describe('ConfigError', () => {
    it('应该正确处理配置错误', () => {
      const error = new ConfigError(
        ErrorCode.E006,
        '配置文件无效',
        { configPath: '/path/to/config' }
      );

      expect(error.code).toBe(ErrorCode.E006);
      expect(error.message).toBe('配置文件无效');
      expect(error.details).toEqual({ configPath: '/path/to/config' });
      expect(error.name).toBe('ConfigError');
      expect(error instanceof ContentGeneratorError).toBe(true);
    });
  });

  describe('TemplateError', () => {
    it('应该正确处理模板未找到错误 (E001)', () => {
      const error = new TemplateError(
        ErrorCode.E001,
        '模板类型不存在: weekly',
        { templateType: 'weekly' }
      );

      expect(error.code).toBe(ErrorCode.E001);
      expect(error.message).toBe('模板类型不存在: weekly');
      expect(error.details).toEqual({ templateType: 'weekly' });
      expect(error.name).toBe('TemplateError');
    });

    it('应该正确处理模板解析错误 (E002)', () => {
      const error = new TemplateError(
        ErrorCode.E002,
        '模板解析失败',
        { templatePath: '/path/to/template.hbs' }
      );

      expect(error.code).toBe(ErrorCode.E002);
      expect(error.message).toBe('模板解析失败');
      expect(error.details).toEqual({ templatePath: '/path/to/template.hbs' });
    });
  });

  describe('DataCollectionError', () => {
    it('应该正确处理数据源未找到错误 (E007)', () => {
      const error = new DataCollectionError(
        ErrorCode.E007,
        '数据源不存在',
        { sourcePath: '/path/to/source' }
      );

      expect(error.code).toBe(ErrorCode.E007);
      expect(error.message).toBe('数据源不存在');
      expect(error.details).toEqual({ sourcePath: '/path/to/source' });
      expect(error.name).toBe('DataCollectionError');
    });

    it('应该正确处理无效日期错误 (E008)', () => {
      const error = new DataCollectionError(
        ErrorCode.E008,
        '日期格式无效',
        { date: 'invalid-date' }
      );

      expect(error.code).toBe(ErrorCode.E008);
      expect(error.message).toBe('日期格式无效');
      expect(error.details).toEqual({ date: 'invalid-date' });
    });
  });

  describe('FileSystemError', () => {
    it('应该正确处理输出目录错误 (E003)', () => {
      const error = new FileSystemError(
        ErrorCode.E003,
        '无法创建输出目录',
        { path: '/output/path', error: 'Permission denied' }
      );

      expect(error.code).toBe(ErrorCode.E003);
      expect(error.message).toBe('无法创建输出目录');
      expect(error.details).toEqual({ path: '/output/path', error: 'Permission denied' });
      expect(error.name).toBe('FileSystemError');
    });

    it('应该正确处理文件已存在错误 (E004)', () => {
      const error = new FileSystemError(
        ErrorCode.E004,
        '目标文件已存在',
        { path: '/output/file.md' }
      );

      expect(error.code).toBe(ErrorCode.E004);
      expect(error.message).toBe('目标文件已存在');
      expect(error.details).toEqual({ path: '/output/file.md' });
    });
  });

  describe('ValidationError', () => {
    it('应该正确处理数据验证错误 (E005)', () => {
      const error = new ValidationError(
        ErrorCode.E005,
        '数据验证失败',
        { errors: ['字段缺失', '格式错误'] }
      );

      expect(error.code).toBe(ErrorCode.E005);
      expect(error.message).toBe('数据验证失败');
      expect(error.details).toEqual({ errors: ['字段缺失', '格式错误'] });
      expect(error.name).toBe('ValidationError');
    });

    it('应该正确处理配置验证错误 (E006)', () => {
      const error = new ValidationError(
        ErrorCode.E006,
        '配置验证失败',
        { errors: ['必需字段缺失'] }
      );

      expect(error.code).toBe(ErrorCode.E006);
      expect(error.message).toBe('配置验证失败');
      expect(error.details).toEqual({ errors: ['必需字段缺失'] });
    });
  });

  describe('RenderError', () => {
    it('应该正确处理渲染错误 (E010)', () => {
      const error = new RenderError(
        ErrorCode.E010,
        '模板渲染失败',
        { templatePath: '/template.hbs', error: 'Syntax error' }
      );

      expect(error.code).toBe(ErrorCode.E010);
      expect(error.message).toBe('模板渲染失败');
      expect(error.details).toEqual({ templatePath: '/template.hbs', error: 'Syntax error' });
      expect(error.name).toBe('RenderError');
    });
  });

  describe('RegistryError', () => {
    it('应该正确处理注册表错误 (E011)', () => {
      const error = new RegistryError(
        ErrorCode.E011,
        '模板类型已存在',
        { templateType: 'weekly' }
      );

      expect(error.code).toBe(ErrorCode.E011);
      expect(error.message).toBe('模板类型已存在');
      expect(error.details).toEqual({ templateType: 'weekly' });
      expect(error.name).toBe('RegistryError');
    });
  });

  describe('ScheduleError', () => {
    it('应该正确处理调度错误 (E012)', () => {
      const error = new ScheduleError(
        ErrorCode.E012,
        'Cron 表达式无效',
        { cronExpression: 'invalid-cron' }
      );

      expect(error.code).toBe(ErrorCode.E012);
      expect(error.message).toBe('Cron 表达式无效');
      expect(error.details).toEqual({ cronExpression: 'invalid-cron' });
      expect(error.name).toBe('ScheduleError');
    });
  });

  describe('HookError', () => {
    it('应该正确处理 Hook 加载错误 (E013)', () => {
      const error = new HookError(
        ErrorCode.E013,
        'Hook 文件加载失败',
        { hookPath: '/path/to/hook.js', error: 'Module not found' }
      );

      expect(error.code).toBe(ErrorCode.E013);
      expect(error.message).toBe('Hook 文件加载失败');
      expect(error.details).toEqual({ hookPath: '/path/to/hook.js', error: 'Module not found' });
      expect(error.name).toBe('HookError');
    });

    it('应该正确处理 Hook 执行错误 (E014)', () => {
      const error = new HookError(
        ErrorCode.E014,
        'Hook 执行失败',
        { hookType: 'beforeArticleFilter', error: 'Runtime error' }
      );

      expect(error.code).toBe(ErrorCode.E014);
      expect(error.message).toBe('Hook 执行失败');
      expect(error.details).toEqual({ hookType: 'beforeArticleFilter', error: 'Runtime error' });
    });
  });

  describe('DataSourceError', () => {
    it('应该正确处理数据源错误 (E015)', () => {
      const error = new DataSourceError(
        ErrorCode.E015,
        '数据源配置无效',
        { source: { path: '/invalid/path' } }
      );

      expect(error.code).toBe(ErrorCode.E015);
      expect(error.message).toBe('数据源配置无效');
      expect(error.details).toEqual({ source: { path: '/invalid/path' } });
      expect(error.name).toBe('DataSourceError');
    });

    it('应该正确处理 Glob 模式错误 (E016)', () => {
      const error = new DataSourceError(
        ErrorCode.E016,
        'Glob 模式无效',
        { pattern: '[invalid-glob' }
      );

      expect(error.code).toBe(ErrorCode.E016);
      expect(error.message).toBe('Glob 模式无效');
      expect(error.details).toEqual({ pattern: '[invalid-glob' });
    });
  });

  describe('AIError', () => {
    it('应该正确处理 AI API 错误 (E017)', () => {
      const error = new AIError(
        ErrorCode.E017,
        'AI API 调用失败',
        { provider: 'openai', statusCode: 429, message: 'Rate limit exceeded' }
      );

      expect(error.code).toBe(ErrorCode.E017);
      expect(error.message).toBe('AI API 调用失败');
      expect(error.details).toEqual({ 
        provider: 'openai', 
        statusCode: 429, 
        message: 'Rate limit exceeded' 
      });
      expect(error.name).toBe('AIError');
    });
  });

  describe('CacheError', () => {
    it('应该正确处理缓存错误 (E018)', () => {
      const error = new CacheError(
        ErrorCode.E018,
        '缓存操作失败',
        { operation: 'save', cachePath: '/cache/file.json' }
      );

      expect(error.code).toBe(ErrorCode.E018);
      expect(error.message).toBe('缓存操作失败');
      expect(error.details).toEqual({ operation: 'save', cachePath: '/cache/file.json' });
      expect(error.name).toBe('CacheError');
    });
  });

  describe('RateLimitError', () => {
    it('应该正确处理速率限制错误 (E019)', () => {
      const error = new RateLimitError(
        ErrorCode.E019,
        '速率限制超出',
        { requestsPerMinute: 60, waitTime: 30000 }
      );

      expect(error.code).toBe(ErrorCode.E019);
      expect(error.message).toBe('速率限制超出');
      expect(error.details).toEqual({ requestsPerMinute: 60, waitTime: 30000 });
      expect(error.name).toBe('RateLimitError');
    });
  });

  describe('错误消息格式化', () => {
    it('应该包含中文错误消息', () => {
      const errors = [
        new ConfigError(ErrorCode.E006, '配置文件无效'),
        new TemplateError(ErrorCode.E001, '模板类型不存在'),
        new DataCollectionError(ErrorCode.E007, '数据源不存在'),
        new FileSystemError(ErrorCode.E003, '无法创建输出目录'),
        new ValidationError(ErrorCode.E005, '数据验证失败'),
        new RenderError(ErrorCode.E010, '模板渲染失败'),
        new RegistryError(ErrorCode.E011, '模板类型已存在'),
        new ScheduleError(ErrorCode.E012, 'Cron 表达式无效'),
        new HookError(ErrorCode.E013, 'Hook 文件加载失败'),
        new DataSourceError(ErrorCode.E015, '数据源配置无效'),
        new AIError(ErrorCode.E017, 'AI API 调用失败'),
        new CacheError(ErrorCode.E018, '缓存操作失败'),
        new RateLimitError(ErrorCode.E019, '速率限制超出')
      ];

      errors.forEach(error => {
        expect(error.message).toMatch(/[\u4e00-\u9fa5]/); // 包含中文字符
        expect(Object.values(ErrorCode)).toContain(error.code); // 错误代码是有效的枚举值
      });
    });

    it('应该提供有用的错误详细信息', () => {
      const error = new TemplateError(
        ErrorCode.E001,
        '模板类型不存在: weekly',
        { 
          templateType: 'weekly',
          availableTemplates: ['daily', 'monthly'],
          suggestion: '请检查模板类型是否正确注册'
        }
      );

      expect(error.details.templateType).toBe('weekly');
      expect(error.details.availableTemplates).toEqual(['daily', 'monthly']);
      expect(error.details.suggestion).toBe('请检查模板类型是否正确注册');
    });
  });

  describe('优雅降级', () => {
    it('应该在 Hook 错误时继续执行', () => {
      const hookError = new HookError(
        ErrorCode.E014,
        'Hook 执行失败，但系统继续运行',
        { 
          hookType: 'beforeArticleFilter',
          error: 'Runtime error',
          gracefulDegradation: true
        }
      );

      expect(hookError.details.gracefulDegradation).toBe(true);
      expect(hookError.message).toContain('但系统继续运行');
    });

    it('应该在 AI 错误时回退到描述', () => {
      const aiError = new AIError(
        ErrorCode.E017,
        'AI 摘要生成失败，使用原始描述',
        { 
          provider: 'openai',
          fallbackUsed: true,
          fallbackValue: '原始文章描述'
        }
      );

      expect(aiError.details.fallbackUsed).toBe(true);
      expect(aiError.details.fallbackValue).toBe('原始文章描述');
      expect(aiError.message).toContain('使用原始描述');
    });

    it('应该在缓存错误时继续操作', () => {
      const cacheError = new CacheError(
        ErrorCode.E018,
        '缓存保存失败，但操作继续',
        { 
          operation: 'save',
          cachePath: '/cache/file.json',
          continueWithoutCache: true
        }
      );

      expect(cacheError.details.continueWithoutCache).toBe(true);
      expect(cacheError.message).toContain('但操作继续');
    });
  });
});