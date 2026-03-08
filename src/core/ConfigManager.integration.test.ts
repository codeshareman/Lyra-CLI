/**
 * ConfigManager 集成测试 - Hook 加载功能
 */

import { ConfigManager } from './ConfigManager';
import { HookManager } from './HookManager';
import path from 'path';

describe('ConfigManager - Hook Loading Integration', () => {
  let configManager: ConfigManager;
  let hookManager: HookManager;

  beforeEach(() => {
    hookManager = new HookManager();
    configManager = new ConfigManager(hookManager);
  });

  afterEach(() => {
    hookManager.clearHooks();
  });

  describe('loadHooks', () => {
    it('应该从配置中加载并注册 hooks', async () => {
      // 加载包含 hooks 的配置
      const configPath = path.resolve(__dirname, '../../test-fixtures/config-with-hooks.json');
      
      const config = await configManager.load(configPath);

      // 验证配置已加载
      expect(config).toBeDefined();
      expect(config.templates.weekly).toBeDefined();
      expect(config.templates.weekly.hooks).toBeDefined();
      expect(config.templates.weekly.hooks!.customArticleScore).toBeDefined();

      // 验证 hook 已注册到 HookManager
      expect(hookManager.hasHook('customArticleScore')).toBe(true);
    });

    it('应该正确执行已注册的 hook', async () => {
      // 加载包含 hooks 的配置
      const configPath = path.resolve(__dirname, '../../test-fixtures/config-with-hooks.json');
      await configManager.load(configPath);

      // 准备测试数据
      const testArticles = [
        { title: 'Article 1', rating: 3, url: 'http://example.com/1' },
        { title: 'Article 2', rating: 4, url: 'http://example.com/2' },
      ];

      // 执行 hook
      const result = await hookManager.executeHook('customArticleScore', {
        type: 'customArticleScore',
        data: testArticles,
        config: {},
        options: {},
      });

      // 验证 hook 已正确修改数据（评分 +1）
      expect(result).toHaveLength(2);
      expect(result[0].rating).toBe(4); // 3 + 1
      expect(result[1].rating).toBe(5); // 4 + 1
    });

    it('应该在没有 HookManager 时正常工作', async () => {
      // 创建不带 HookManager 的 ConfigManager
      const configManagerWithoutHooks = new ConfigManager();

      // 加载配置应该成功，但不会注册 hooks
      const configPath = path.resolve(__dirname, '../../test-fixtures/config-with-hooks.json');
      const config = await configManagerWithoutHooks.load(configPath);

      // 验证配置已加载
      expect(config).toBeDefined();
      expect(config.templates.weekly).toBeDefined();
    });

    it('应该在 hook 文件不存在时记录警告并继续', async () => {
      // 监听 console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // 创建包含无效 hook 路径的配置
      const invalidConfig = {
        global: {
          logLevel: 'info' as const,
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            hooks: {
              customArticleScore: './nonexistent/hook.js',
            },
            sources: {
              articles: './test-fixtures/articles',
            },
            output: {
              path: './test-output',
              filename: 'test.md',
            },
            content: {},
          },
        },
      };

      // 模拟 cosmiconfig 返回无效配置
      const configManagerSpy = new ConfigManager(hookManager);
      (configManagerSpy as any).loadedConfig = invalidConfig;
      (configManagerSpy as any).loadHooks(invalidConfig);

      // 验证警告已记录
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('加载 hook 失败');

      warnSpy.mockRestore();
    });

    it('应该在 hook 类型无效时记录警告并跳过', async () => {
      // 监听 console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // 创建包含无效 hook 类型的配置
      const invalidConfig = {
        global: {
          logLevel: 'info' as const,
          defaultTemplate: 'weekly',
        },
        templates: {
          weekly: {
            enabled: true,
            template: { path: './templates/weekly.hbs' },
            hooks: {
              invalidHookType: './test-fixtures/hooks/customScore.js',
            },
            sources: {
              articles: './test-fixtures/articles',
            },
            output: {
              path: './test-output',
              filename: 'test.md',
            },
            content: {},
          },
        },
      };

      // 加载 hooks
      const configManagerSpy = new ConfigManager(hookManager);
      (configManagerSpy as any).loadHooks(invalidConfig);

      // 验证警告已记录
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('无效的 hook 类型');

      warnSpy.mockRestore();
    });
  });
});
