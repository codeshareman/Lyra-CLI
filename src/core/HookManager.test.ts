import { HookManager } from './HookManager';
import { HookType, HookContext } from '../types/interfaces';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('HookManager', () => {
  let hookManager: HookManager;
  let tempDir: string;

  beforeEach(async () => {
    hookManager = new HookManager();
    // 创建临时目录用于测试钩子文件
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }

    // 清理 require 缓存
    Object.keys(require.cache).forEach((key) => {
      if (key.includes(tempDir)) {
        delete require.cache[key];
      }
    });
  });

  describe('registerHook', () => {
    it('应该成功注册有效的钩子函数', async () => {
      const hookPath = path.join(tempDir, 'test-hook.js');
      const hookCode = `
        module.exports = function(context) {
          return context.data;
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      expect(() => {
        hookManager.registerHook('beforeArticleFilter', hookPath);
      }).not.toThrow();

      expect(hookManager.hasHook('beforeArticleFilter')).toBe(true);
    });

    it('应该支持 default 导出的钩子函数', async () => {
      const hookPath = path.join(tempDir, 'default-hook.js');
      const hookCode = `
        module.exports.default = function(context) {
          return context.data;
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      expect(() => {
        hookManager.registerHook('afterArticleFilter', hookPath);
      }).not.toThrow();

      expect(hookManager.hasHook('afterArticleFilter')).toBe(true);
    });

    it('应该拒绝非函数的钩子', async () => {
      const hookPath = path.join(tempDir, 'invalid-hook.js');
      const hookCode = `
        module.exports = { notAFunction: true };
      `;
      await fs.writeFile(hookPath, hookCode);

      expect(() => {
        hookManager.registerHook('customArticleScore', hookPath);
      }).toThrow('is not a function');
    });

    it('应该拒绝不存在的钩子文件', () => {
      const hookPath = path.join(tempDir, 'non-existent.js');

      expect(() => {
        hookManager.registerHook('beforeToolFilter', hookPath);
      }).toThrow('Failed to register hook');
    });

    it('应该支持注册多个不同类型的钩子', async () => {
      const hook1Path = path.join(tempDir, 'hook1.js');
      const hook2Path = path.join(tempDir, 'hook2.js');

      await fs.writeFile(
        hook1Path,
        'module.exports = (ctx) => ctx.data;'
      );
      await fs.writeFile(
        hook2Path,
        'module.exports = (ctx) => ctx.data;'
      );

      hookManager.registerHook('beforeArticleFilter', hook1Path);
      hookManager.registerHook('afterToolFilter', hook2Path);

      expect(hookManager.hasHook('beforeArticleFilter')).toBe(true);
      expect(hookManager.hasHook('afterToolFilter')).toBe(true);
    });

    it('应该允许覆盖已注册的钩子', async () => {
      const hook1Path = path.join(tempDir, 'hook1.js');
      const hook2Path = path.join(tempDir, 'hook2.js');

      await fs.writeFile(
        hook1Path,
        'module.exports = (ctx) => "first";'
      );
      await fs.writeFile(
        hook2Path,
        'module.exports = (ctx) => "second";'
      );

      hookManager.registerHook('beforeRender', hook1Path);
      hookManager.registerHook('beforeRender', hook2Path);

      const context: HookContext = {
        type: 'beforeRender',
        data: 'test',
        config: {},
        options: {},
      };

      const result = await hookManager.executeHook('beforeRender', context);
      expect(result).toBe('second');
    });
  });

  describe('executeHook', () => {
    it('应该执行已注册的同步钩子函数', async () => {
      const hookPath = path.join(tempDir, 'sync-hook.js');
      const hookCode = `
        module.exports = function(context) {
          return context.data.map(item => item * 2);
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      hookManager.registerHook('customArticleScore', hookPath);

      const context: HookContext = {
        type: 'customArticleScore',
        data: [1, 2, 3],
        config: {},
        options: {},
      };

      const result = await hookManager.executeHook('customArticleScore', context);
      expect(result).toEqual([2, 4, 6]);
    });

    it('应该执行已注册的异步钩子函数', async () => {
      const hookPath = path.join(tempDir, 'async-hook.js');
      const hookCode = `
        module.exports = async function(context) {
          return new Promise(resolve => {
            setTimeout(() => resolve(context.data + ' processed'), 10);
          });
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      hookManager.registerHook('afterRender', hookPath);

      const context: HookContext = {
        type: 'afterRender',
        data: 'content',
        config: {},
        options: {},
      };

      const result = await hookManager.executeHook('afterRender', context);
      expect(result).toBe('content processed');
    });

    it('应该在钩子未注册时返回原始数据', async () => {
      const context: HookContext = {
        type: 'beforeArticleFilter',
        data: [1, 2, 3],
        config: {},
        options: {},
      };

      const result = await hookManager.executeHook('beforeArticleFilter', context);
      expect(result).toEqual([1, 2, 3]);
    });

    it('应该在钩子执行失败时优雅降级并返回原始数据', async () => {
      const hookPath = path.join(tempDir, 'failing-hook.js');
      const hookCode = `
        module.exports = function(context) {
          throw new Error('Hook execution failed');
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      hookManager.registerHook('contentFilter', hookPath);

      const context: HookContext = {
        type: 'contentFilter',
        data: [1, 2, 3],
        config: {},
        options: {},
      };

      // 捕获 console.warn 输出
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await hookManager.executeHook('contentFilter', context);

      expect(result).toEqual([1, 2, 3]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hook contentFilter execution failed')
      );

      warnSpy.mockRestore();
    });

    it('应该将完整的上下文传递给钩子函数', async () => {
      const hookPath = path.join(tempDir, 'context-hook.js');
      const hookCode = `
        module.exports = function(context) {
          return {
            type: context.type,
            dataLength: context.data.length,
            hasConfig: !!context.config,
            hasOptions: !!context.options
          };
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      hookManager.registerHook('beforeToolFilter', hookPath);

      const context: HookContext = {
        type: 'beforeToolFilter',
        data: [1, 2, 3],
        config: { setting: 'value' },
        options: { option: 'test' },
      };

      const result = await hookManager.executeHook('beforeToolFilter', context);

      expect(result).toEqual({
        type: 'beforeToolFilter',
        dataLength: 3,
        hasConfig: true,
        hasOptions: true,
      });
    });

    it('应该支持钩子函数修改数据', async () => {
      const hookPath = path.join(tempDir, 'modify-hook.js');
      const hookCode = `
        module.exports = function(context) {
          return context.data.filter(item => item.rating >= 4);
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      hookManager.registerHook('afterArticleFilter', hookPath);

      const context: HookContext = {
        type: 'afterArticleFilter',
        data: [
          { title: 'Article 1', rating: 5 },
          { title: 'Article 2', rating: 3 },
          { title: 'Article 3', rating: 4 },
        ],
        config: {},
        options: {},
      };

      const result = await hookManager.executeHook('afterArticleFilter', context);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Article 1');
      expect(result[1].title).toBe('Article 3');
    });
  });

  describe('hasHook', () => {
    it('应该在钩子已注册时返回 true', async () => {
      const hookPath = path.join(tempDir, 'test-hook.js');
      await fs.writeFile(hookPath, 'module.exports = (ctx) => ctx.data;');

      hookManager.registerHook('beforeArticleFilter', hookPath);

      expect(hookManager.hasHook('beforeArticleFilter')).toBe(true);
    });

    it('应该在钩子未注册时返回 false', () => {
      expect(hookManager.hasHook('afterArticleFilter')).toBe(false);
    });

    it('应该正确区分不同类型的钩子', async () => {
      const hookPath = path.join(tempDir, 'test-hook.js');
      await fs.writeFile(hookPath, 'module.exports = (ctx) => ctx.data;');

      hookManager.registerHook('beforeArticleFilter', hookPath);

      expect(hookManager.hasHook('beforeArticleFilter')).toBe(true);
      expect(hookManager.hasHook('afterArticleFilter')).toBe(false);
      expect(hookManager.hasHook('customArticleScore')).toBe(false);
    });
  });

  describe('clearHooks', () => {
    it('应该清除所有已注册的钩子', async () => {
      const hook1Path = path.join(tempDir, 'hook1.js');
      const hook2Path = path.join(tempDir, 'hook2.js');

      await fs.writeFile(hook1Path, 'module.exports = (ctx) => ctx.data;');
      await fs.writeFile(hook2Path, 'module.exports = (ctx) => ctx.data;');

      hookManager.registerHook('beforeArticleFilter', hook1Path);
      hookManager.registerHook('afterToolFilter', hook2Path);

      expect(hookManager.hasHook('beforeArticleFilter')).toBe(true);
      expect(hookManager.hasHook('afterToolFilter')).toBe(true);

      hookManager.clearHooks();

      expect(hookManager.hasHook('beforeArticleFilter')).toBe(false);
      expect(hookManager.hasHook('afterToolFilter')).toBe(false);
    });

    it('应该在清除后允许重新注册钩子', async () => {
      const hookPath = path.join(tempDir, 'test-hook.js');
      await fs.writeFile(hookPath, 'module.exports = (ctx) => ctx.data;');

      hookManager.registerHook('beforeRender', hookPath);
      hookManager.clearHooks();
      hookManager.registerHook('beforeRender', hookPath);

      expect(hookManager.hasHook('beforeRender')).toBe(true);
    });

    it('应该在空的 HookManager 上安全调用', () => {
      expect(() => {
        hookManager.clearHooks();
      }).not.toThrow();
    });
  });

  describe('所有钩子类型支持', () => {
    const allHookTypes: HookType[] = [
      'beforeArticleFilter',
      'afterArticleFilter',
      'customArticleScore',
      'beforeToolFilter',
      'afterToolFilter',
      'customToolScore',
      'contentFilter',
      'beforeRender',
      'afterRender',
    ];

    it('应该支持所有定义的钩子类型', async () => {
      const hookPath = path.join(tempDir, 'universal-hook.js');
      await fs.writeFile(hookPath, 'module.exports = (ctx) => ctx.data;');

      for (const hookType of allHookTypes) {
        hookManager.registerHook(hookType, hookPath);
        expect(hookManager.hasHook(hookType)).toBe(true);
      }
    });

    it('应该能够执行所有类型的钩子', async () => {
      const hookPath = path.join(tempDir, 'universal-hook.js');
      const hookCode = `
        module.exports = function(context) {
          return context.type + ' executed';
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      for (const hookType of allHookTypes) {
        hookManager.registerHook(hookType, hookPath);

        const context: HookContext = {
          type: hookType,
          data: 'test',
          config: {},
          options: {},
        };

        const result = await hookManager.executeHook(hookType, context);
        expect(result).toBe(`${hookType} executed`);
      }
    });
  });

  describe('错误处理', () => {
    it('应该在钩子文件语法错误时抛出错误', async () => {
      const hookPath = path.join(tempDir, 'syntax-error.js');
      await fs.writeFile(hookPath, 'this is not valid javascript {{{');

      expect(() => {
        hookManager.registerHook('beforeArticleFilter', hookPath);
      }).toThrow('Failed to register hook');
    });

    it('应该在钩子路径为空时抛出错误', () => {
      expect(() => {
        hookManager.registerHook('beforeArticleFilter', '');
      }).toThrow();
    });

    it('应该在异步钩子抛出错误时优雅降级', async () => {
      const hookPath = path.join(tempDir, 'async-error-hook.js');
      const hookCode = `
        module.exports = async function(context) {
          throw new Error('Async error');
        };
      `;
      await fs.writeFile(hookPath, hookCode);

      hookManager.registerHook('afterRender', hookPath);

      const context: HookContext = {
        type: 'afterRender',
        data: 'original',
        config: {},
        options: {},
      };

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await hookManager.executeHook('afterRender', context);

      expect(result).toBe('original');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
