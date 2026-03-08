import { ConfigManager } from './ConfigManager';
import { SystemConfig, TemplateConfig } from '../types/interfaces';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;

  beforeEach(async () => {
    configManager = new ConfigManager();
    // Create a temporary directory for test configs
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('load', () => {
    it('should load configuration from a specific file path', async () => {
      const configPath = path.join(tempDir, '.content-generatorrc.json');
      const testConfig = {
        global: {
          logLevel: 'debug',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: {
              clippings: './Clippings',
              tools: './Tools',
              notes: './Notes',
            },
            output: {
              path: './output',
              filename: 'weekly-{{issueNumber}}.md',
            },
            content: {
              articles: { topN: 5 },
            },
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(testConfig));

      const config = await configManager.load(configPath);

      expect(config.global.logLevel).toBe('debug');
      expect(config.global.defaultTemplate).toBe('weekly');
      expect(config.templates.weekly.enabled).toBe(true);
    });

    it('should return default configuration when no config file exists', async () => {
      // Change to temp directory where no config exists
      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const config = await configManager.load();

        expect(config.global.logLevel).toBe('info');
        expect(config.global.defaultTemplate).toBe('weekly');
        expect(config.templates.weekly).toBeDefined();
        expect(config.templates.weekly.enabled).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should merge user configuration with defaults', async () => {
      const configPath = path.join(tempDir, '.content-generatorrc.json');
      const partialConfig = {
        global: {
          logLevel: 'error',
        },
        templates: {
          weekly: {
            enabled: false,
            content: {
              articles: { topN: 15 },
            },
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(partialConfig));

      const config = await configManager.load(configPath);

      // User values should override defaults
      expect(config.global.logLevel).toBe('error');
      expect(config.templates.weekly.enabled).toBe(false);
      expect(config.templates.weekly.content.articles.topN).toBe(15);

      // Default values should be preserved
      expect(config.global.defaultTemplate).toBe('weekly');
      expect(config.templates.weekly.template.path).toBe('./templates/weekly.hbs');
    });

    it('should throw error for invalid configuration', async () => {
      const configPath = path.join(tempDir, '.content-generatorrc.json');
      const invalidConfig = {
        global: {
          logLevel: 'invalid-level',
        },
        templates: {},
      };

      await fs.writeFile(configPath, JSON.stringify(invalidConfig));

      await expect(configManager.load(configPath)).rejects.toThrow('validation failed');
    });

    it('should support multiple data sources for a template', async () => {
      const configPath = path.join(tempDir, '.content-generatorrc.json');
      const testConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: {
              clippings: [
                { path: './Clippings', priority: 1 },
                { path: './Archive/Clippings', priority: 0 },
              ],
              tools: './Tools',
              notes: './Notes',
            },
            output: {
              path: './output',
              filename: 'weekly.md',
            },
            content: {},
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(testConfig));

      const config = await configManager.load(configPath);

      expect(Array.isArray(config.templates.weekly.sources.clippings)).toBe(true);
    });
  });

  describe('getTemplateConfig', () => {
    it('should return template configuration for existing template', async () => {
      await configManager.load();

      const weeklyConfig = configManager.getTemplateConfig('weekly');

      expect(weeklyConfig).not.toBeNull();
      expect(weeklyConfig?.enabled).toBe(true);
      expect(weeklyConfig?.template.path).toBe('./templates/weekly.hbs');
    });

    it('should return null for non-existent template', async () => {
      await configManager.load();

      const config = configManager.getTemplateConfig('non-existent');

      expect(config).toBeNull();
    });

    it('should return null when no configuration is loaded', () => {
      const config = configManager.getTemplateConfig('weekly');

      expect(config).toBeNull();
    });
  });

  describe('validate', () => {
    it('should validate a correct configuration', () => {
      const validConfig: SystemConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: {
              clippings: './Clippings',
              tools: './Tools',
              notes: './Notes',
            },
            output: {
              path: './output',
              filename: 'weekly.md',
            },
            content: {
              articles: { topN: 10 },
            },
          },
        },
      };

      const result = configManager.validate(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing global configuration', () => {
      const invalidConfig = {
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
          },
        },
      } as any;

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少全局配置');
    });

    it('should detect invalid log level', () => {
      const invalidConfig: SystemConfig = {
        global: {
          logLevel: 'invalid' as any,
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
          },
        },
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('无效的 global.logLevel'))).toBe(true);
    });

    it('should detect missing template path', () => {
      const invalidConfig: SystemConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: '' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
          },
        },
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('缺少 template.path'))).toBe(true);
    });

    it('should detect missing sources configuration', () => {
      const invalidConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
          },
        },
      } as any;

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('缺少或无效的数据源配置'))).toBe(true);
    });

    it('should detect missing output configuration', () => {
      const invalidConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            content: {},
          },
        },
      } as any;

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('缺少 output.path'))).toBe(true);
    });

    it('should detect invalid hook configuration', () => {
      const invalidConfig: SystemConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
            hooks: {
              beforeArticleFilter: '',
            },
          },
        },
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('钩子路径无效'))).toBe(true);
    });

    it('should validate data source configurations', () => {
      const invalidConfig: SystemConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: {
              clippings: { path: '', include: 'not-an-array' as any },
            },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
          },
        },
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      // DataSourceManager 使用英文错误消息，所以我们需要匹配英文
      expect(result.errors.some((e) => e.includes('path is required') || e.includes('缺少或无效的路径'))).toBe(true);
      expect(result.errors.some((e) => e.includes('include must be an array') || e.includes('include 必须是数组'))).toBe(true);
    });

    it('should validate schedule configuration', () => {
      const invalidConfig: SystemConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
            schedule: {
              enabled: true,
              cron: '',
            },
          },
        },
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('缺少 schedule.cron'))).toBe(true);
    });

    it('should detect empty templates configuration', () => {
      const invalidConfig: SystemConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {},
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('未配置任何模板');
    });
  });

  describe('default configuration', () => {
    it('should provide sensible defaults', async () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const config = await configManager.load();

        expect(config.global.logLevel).toBe('info');
        expect(config.global.defaultTemplate).toBe('weekly');
        expect(config.templates.weekly.enabled).toBe(true);
        expect(config.templates.weekly.content.articles.topN).toBe(10);
        expect(config.templates.weekly.content.articles.minRating).toBe(3);
        expect(config.templates.weekly.content.tools.perCategory).toBe(1);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('configuration merging', () => {
    it('should deep merge nested content configuration', async () => {
      const configPath = path.join(tempDir, '.content-generatorrc.json');
      const partialConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {
              articles: {
                topN: 20,
                // minRating should come from defaults
              },
              tools: {
                perCategory: 2,
              },
            },
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(partialConfig));

      const config = await configManager.load(configPath);

      expect(config.templates.weekly.content.articles.topN).toBe(20);
      expect(config.templates.weekly.content.articles.minRating).toBe(3);
      expect(config.templates.weekly.content.tools.perCategory).toBe(2);
    });

    it('should preserve hooks from user config', async () => {
      const configPath = path.join(tempDir, '.content-generatorrc.json');
      const testConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            sources: { clippings: './Clippings' },
            output: { path: './output', filename: 'weekly.md' },
            content: {},
            hooks: {
              beforeArticleFilter: './hooks/custom-filter.js',
              afterRender: './hooks/post-process.js',
            },
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(testConfig));

      const config = await configManager.load(configPath);

      expect(config.templates.weekly.hooks?.beforeArticleFilter).toBe(
        './hooks/custom-filter.js'
      );
      expect(config.templates.weekly.hooks?.afterRender).toBe('./hooks/post-process.js');
    });
  });
});
