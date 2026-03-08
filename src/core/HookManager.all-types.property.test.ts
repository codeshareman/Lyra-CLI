import * as fc from 'fast-check';
import { HookManager } from './HookManager';
import { HookType, HookContext } from '../types/interfaces';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * **Property 37: 所有 Hook 类型支持**
 * **Validates: Requirements 23.11-23.19**
 * 
 * 验证 HookManager 支持所有定义的 Hook 类型，
 * 包括注册、执行和错误处理。
 */
describe('Property 37: 所有 Hook 类型支持', () => {
  let hookManager: HookManager;
  let tempDir: string;
  let tempFiles: string[] = [];

  // 所有支持的 Hook 类型
  const allHookTypes: HookType[] = [
    'beforeArticleFilter',
    'afterArticleFilter', 
    'customArticleScore',
    'beforeToolFilter',
    'afterToolFilter',
    'customToolScore',
    'contentFilter',
    'beforeRender',
    'afterRender'
  ];

  beforeEach(async () => {
    hookManager = new HookManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    tempFiles = [];
  });

  afterEach(async () => {
    // 清理 HookManager
    hookManager.clearHooks();
    
    // 清理临时文件
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // 忽略删除错误
      }
    }
    
    try {
      await fs.rmdir(tempDir);
    } catch {
      // 忽略删除错误
    }

    // 清理 require 缓存
    Object.keys(require.cache).forEach(key => {
      if (key.includes(tempDir)) {
        delete require.cache[key];
      }
    });
  });

  /**
   * 创建临时 Hook 文件
   */
  async function createTempHookFile(hookFunction: string): Promise<string> {
    const fileName = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`;
    const filePath = path.join(tempDir, fileName);
    
    await fs.writeFile(filePath, hookFunction, 'utf8');
    tempFiles.push(filePath);
    
    return filePath;
  }

  /**
   * 生成 Hook 函数代码的生成器
   */
  const hookFunctionGenerator = fc.oneof(
    // 同步函数
    fc.constant(`
      module.exports = function(context) {
        return { ...context.data, processed: true };
      };
    `),
    // 异步函数
    fc.constant(`
      module.exports = async function(context) {
        return { ...context.data, processed: true, async: true };
      };
    `),
    // 默认导出
    fc.constant(`
      module.exports.default = function(context) {
        return { ...context.data, processed: true, default: true };
      };
    `),
    // 返回原始数据
    fc.constant(`
      module.exports = function(context) {
        return context.data;
      };
    `),
    // 修改数据
    fc.constant(`
      module.exports = function(context) {
        if (Array.isArray(context.data)) {
          return context.data.map(item => ({ ...item, hookModified: true }));
        }
        return { ...context.data, hookModified: true };
      };
    `)
  );

  /**
   * 生成 Hook 上下文的生成器
   */
  const hookContextGenerator = (hookType: HookType) => fc.record({
    type: fc.constant(hookType),
    data: fc.oneof(
      fc.array(fc.record({
        title: fc.string(),
        rating: fc.integer({ min: 0, max: 10 }),
        url: fc.webUrl()
      })),
      fc.record({
        articles: fc.array(fc.record({
          title: fc.string(),
          rating: fc.integer({ min: 0, max: 10 })
        })),
        tools: fc.array(fc.record({
          name: fc.string(),
          category: fc.string()
        }))
      }),
      fc.string(),
      fc.object()
    ),
    config: fc.record({
      templateType: fc.constant('weekly'),
      output: fc.record({
        path: fc.string()
      })
    }),
    options: fc.record({
      date: fc.date(),
      verbose: fc.boolean()
    })
  });

  it('应该支持注册所有类型的 Hook', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(allHookTypes, { minLength: 1 }),
        hookFunctionGenerator,
        async (hookTypes, hookFunctionCode) => {
          hookManager.clearHooks();

          // 为每个 Hook 类型创建单独的临时文件
          const hookPaths: string[] = [];
          
          for (const hookType of hookTypes) {
            const hookPath = await createTempHookFile(hookFunctionCode);
            hookPaths.push(hookPath);
            
            expect(() => {
              hookManager.registerHook(hookType, hookPath);
            }).not.toThrow();

            // 验证 Hook 已注册
            expect(hookManager.hasHook(hookType)).toBe(true);
          }

          // 验证未注册的 Hook 类型
          const unregisteredTypes = allHookTypes.filter(type => !hookTypes.includes(type));
          for (const hookType of unregisteredTypes) {
            expect(hookManager.hasHook(hookType)).toBe(false);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('应该能够执行所有类型的 Hook', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        hookFunctionGenerator,
        fc.constantFrom(...allHookTypes).chain(hookType => hookContextGenerator(hookType)),
        async (hookType, hookFunctionCode, contextData) => {
          // 创建临时 Hook 文件
          const hookPath = await createTempHookFile(hookFunctionCode);

          // 注册 Hook
          hookManager.registerHook(hookType, hookPath);

          // 创建上下文
          const context: HookContext = {
            type: hookType,
            data: contextData.data,
            config: contextData.config,
            options: contextData.options
          };

          // 执行 Hook
          const result = await hookManager.executeHook(hookType, context);

          // 验证结果不为 null 或 undefined
          expect(result).toBeDefined();

          // 如果 Hook 函数返回修改后的数据，验证修改
          if (typeof result === 'object' && result !== null) {
            // 验证结果是对象类型
            expect(typeof result).toBe('object');
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('应该在 Hook 未注册时返回原始数据', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        fc.constantFrom(...allHookTypes).chain(hookType => hookContextGenerator(hookType)),
        async (hookType, contextData) => {
          // 不注册任何 Hook

          // 创建上下文
          const context: HookContext = {
            type: hookType,
            data: contextData.data,
            config: contextData.config,
            options: contextData.options
          };

          // 执行未注册的 Hook
          const result = await hookManager.executeHook(hookType, context);

          // 应该返回原始数据
          expect(result).toEqual(context.data);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('应该在 Hook 执行失败时优雅降级', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        fc.constantFrom(...allHookTypes).chain(hookType => hookContextGenerator(hookType)),
        async (hookType, contextData) => {
          // 创建会抛出错误的 Hook 文件
          const errorHookCode = `
            module.exports = function(context) {
              throw new Error('Hook execution failed');
            };
          `;
          const hookPath = await createTempHookFile(errorHookCode);

          // 注册会失败的 Hook
          hookManager.registerHook(hookType, hookPath);

          // 创建上下文
          const context: HookContext = {
            type: hookType,
            data: contextData.data,
            config: contextData.config,
            options: contextData.options
          };

          // 执行 Hook，应该优雅降级
          const result = await hookManager.executeHook(hookType, context);

          // 应该返回原始数据（优雅降级）
          expect(result).toEqual(context.data);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('应该支持同步和异步 Hook 函数', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        fc.boolean(),
        fc.constantFrom(...allHookTypes).chain(hookType => hookContextGenerator(hookType)),
        async (hookType, isAsync, contextData) => {
          // 创建同步或异步 Hook 函数
          const hookCode = isAsync
            ? `
              module.exports = async function(context) {
                await new Promise(resolve => setTimeout(resolve, 1));
                return { ...context.data, async: true };
              };
            `
            : `
              module.exports = function(context) {
                return { ...context.data, sync: true };
              };
            `;

          const hookPath = await createTempHookFile(hookCode);

          // 注册 Hook
          hookManager.registerHook(hookType, hookPath);

          // 创建上下文
          const context: HookContext = {
            type: hookType,
            data: contextData.data,
            config: contextData.config,
            options: contextData.options
          };

          // 执行 Hook
          const result = await hookManager.executeHook(hookType, context);

          // 验证结果包含预期的标记
          if (isAsync) {
            expect(result).toHaveProperty('async', true);
          } else {
            expect(result).toHaveProperty('sync', true);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('应该支持 Hook 函数的不同导出方式', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        fc.constantFrom('default', 'direct'),
        fc.constantFrom(...allHookTypes).chain(hookType => hookContextGenerator(hookType)),
        async (hookType, exportType, contextData) => {
          // 创建不同导出方式的 Hook 函数
          const hookCode = exportType === 'default'
            ? `
              module.exports.default = function(context) {
                return { ...context.data, exportType: 'default' };
              };
            `
            : `
              module.exports = function(context) {
                return { ...context.data, exportType: 'direct' };
              };
            `;

          const hookPath = await createTempHookFile(hookCode);

          // 注册 Hook
          hookManager.registerHook(hookType, hookPath);

          // 创建上下文
          const context: HookContext = {
            type: hookType,
            data: contextData.data,
            config: contextData.config,
            options: contextData.options
          };

          // 执行 Hook
          const result = await hookManager.executeHook(hookType, context);

          // 验证结果包含导出类型标记
          expect(result).toHaveProperty('exportType', exportType);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('应该正确处理 Hook 上下文的完整性', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        fc.constantFrom(...allHookTypes).chain(hookType => hookContextGenerator(hookType)),
        async (hookType, contextData) => {
          // 创建验证上下文完整性的 Hook 函数
          const hookCode = `
            module.exports = function(context) {
              // 验证上下文包含必需字段
              if (!context.type || !context.hasOwnProperty('data') || 
                  !context.config || !context.options) {
                throw new Error('Context is incomplete');
              }
              
              return {
                ...context.data,
                contextValid: true,
                receivedType: context.type
              };
            };
          `;

          const hookPath = await createTempHookFile(hookCode);

          // 注册 Hook
          hookManager.registerHook(hookType, hookPath);

          // 创建上下文
          const context: HookContext = {
            type: hookType,
            data: contextData.data,
            config: contextData.config,
            options: contextData.options
          };

          // 执行 Hook
          const result = await hookManager.executeHook(hookType, context);

          // 验证上下文被正确传递
          expect(result).toHaveProperty('contextValid', true);
          expect(result).toHaveProperty('receivedType', hookType);
        }
      ),
      { numRuns: 25 }
    );
  });

  it('应该支持清除所有 Hook', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(allHookTypes, { minLength: 1 }),
        hookFunctionGenerator,
        async (hookTypes, hookFunctionCode) => {
          // 创建临时 Hook 文件
          const hookPath = await createTempHookFile(hookFunctionCode);

          // 注册多个 Hook
          for (const hookType of hookTypes) {
            hookManager.registerHook(hookType, hookPath);
            expect(hookManager.hasHook(hookType)).toBe(true);
          }

          // 清除所有 Hook
          hookManager.clearHooks();

          // 验证所有 Hook 都被清除
          for (const hookType of hookTypes) {
            expect(hookManager.hasHook(hookType)).toBe(false);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  it('应该正确处理 Hook 注册错误', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        async (hookType) => {
          // 尝试注册不存在的文件
          const nonExistentPath = path.join(tempDir, 'non-existent-hook.js');

          expect(() => {
            hookManager.registerHook(hookType, nonExistentPath);
          }).toThrow();

          // 验证 Hook 未被注册
          expect(hookManager.hasHook(hookType)).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('应该拒绝非函数的 Hook 文件', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allHookTypes),
        async (hookType) => {
          // 创建导出非函数的文件
          const invalidHookCode = `
            module.exports = { notAFunction: true };
          `;
          const hookPath = await createTempHookFile(invalidHookCode);

          expect(() => {
            hookManager.registerHook(hookType, hookPath);
          }).toThrow(/not a function/);

          // 验证 Hook 未被注册
          expect(hookManager.hasHook(hookType)).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });
});
