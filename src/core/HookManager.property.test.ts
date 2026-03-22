/**
 * HookManager 属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HookManager } from './HookManager';
import { HookType, HookContext } from '../types/interfaces';

describe('HookManager Property Tests', () => {
  let testDir: string;
  let hookManager: HookManager;

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../test-property-hooks');
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

  describe('Property 30: Hook 注册后可查找', () => {
    it('对于任意钩子类型和路径，注册后应该可以通过 hasHook 查找', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'beforeArticleFilter',
            'afterArticleFilter', 
            'customArticleScore',
            'beforeToolFilter',
            'afterToolFilter',
            'customToolScore',
            'contentFilter',
            'beforeRender',
            'afterRender'
          ),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (hookType, hookName) => {
            hookManager.clearHooks();
            // 创建有效的 hook 文件
            const hookPath = path.join(testDir, `${hookName}.js`);
            const hookContent = `
module.exports = function(context) {
  // ${hookType} hook implementation
  return context.data || context;
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');

            // 注册前应该不存在
            expect(hookManager.hasHook(hookType as HookType)).toBe(false);

            // 注册 hook
            hookManager.registerHook(hookType as HookType, hookPath);

            // 注册后应该存在
            expect(hookManager.hasHook(hookType as HookType)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于任意多个不同的钩子类型，都应该能正确注册和查找', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray([
            'beforeArticleFilter',
            'afterArticleFilter', 
            'customArticleScore',
            'beforeToolFilter',
            'afterToolFilter',
            'customToolScore',
            'contentFilter',
            'beforeRender',
            'afterRender'
          ], { minLength: 1, maxLength: 5 }),
          async (hookTypes) => {
            hookManager.clearHooks();
            // 为每个钩子类型创建文件并注册
            for (const hookType of hookTypes) {
              const hookPath = path.join(testDir, `${hookType}.js`);
              const hookContent = `
module.exports = function(context) {
  return context.data || context;
};
`;
              await fs.writeFile(hookPath, hookContent, 'utf-8');
              hookManager.registerHook(hookType as HookType, hookPath);
            }

            // 验证所有注册的钩子都能查找到
            for (const hookType of hookTypes) {
              expect(hookManager.hasHook(hookType as HookType)).toBe(true);
            }

            // 验证未注册的钩子查找不到
            const allHookTypes = [
              'beforeArticleFilter', 'afterArticleFilter', 'customArticleScore',
              'beforeToolFilter', 'afterToolFilter', 'customToolScore',
              'contentFilter', 'beforeRender', 'afterRender'
            ];
            
            for (const hookType of allHookTypes) {
              if (!hookTypes.includes(hookType)) {
                expect(hookManager.hasHook(hookType as HookType)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 34: Hook 错误时优雅降级', () => {
    it('对于任意抛出错误的钩子函数，应该返回原始数据并记录错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'beforeArticleFilter',
            'afterArticleFilter', 
            'customArticleScore'
          ),
          fc.array(fc.record({
            title: fc.string({ minLength: 1 }),
            url: fc.webUrl(),
            rating: fc.integer({ min: 0, max: 5 })
          }), { minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (hookType, originalData, errorMessage) => {
            // 创建会抛出错误的 hook 文件
            const hookPath = path.join(testDir, `error-${hookType}.js`);
            const hookContent = `
module.exports = function(context) {
  throw new Error('${errorMessage}');
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');

            // 注册错误的 hook
            hookManager.registerHook(hookType as HookType, hookPath);

            // 创建 hook 上下文
            const context: HookContext = {
              type: hookType as HookType,
              data: originalData,
              config: {},
              options: {}
            };

            // 执行 hook 应该返回原始数据（优雅降级）
            const result = await hookManager.executeHook(hookType as HookType, context);

            // 应该返回原始数据
            expect(result).toEqual(originalData);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于任意同步和异步错误，都应该正确处理', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // 决定是同步还是异步错误
          fc.array(fc.object(), { minLength: 1, maxLength: 5 }),
          async (isAsync, testData) => {
            const hookType = 'beforeRender';
            const hookPath = path.join(testDir, `error-${isAsync ? 'async' : 'sync'}.js`);
            
            const hookContent = isAsync ? `
module.exports = async function(context) {
  await new Promise(resolve => setTimeout(resolve, 1));
  throw new Error('Async error');
};
` : `
module.exports = function(context) {
  throw new Error('Sync error');
};
`;
            
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook(hookType, hookPath);

            const context: HookContext = {
              type: hookType,
              data: testData,
              config: {},
              options: {}
            };

            const result = await hookManager.executeHook(hookType, context);
            expect(result).toEqual(testData);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 35: Hook 上下文完整性', () => {
    it('对于任意钩子执行，上下文应该包含所有必需字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'beforeArticleFilter',
            'customToolScore',
            'beforeRender'
          ),
          fc.array(fc.object(), { minLength: 0, maxLength: 10 }),
          fc.object(),
          fc.object(),
          async (hookType, data, config, options) => {
            // 创建验证上下文的 hook
            const hookPath = path.join(testDir, `context-${hookType}.js`);
            const hookContent = `
module.exports = function(context) {
  // 验证上下文字段
  if (!context.hasOwnProperty('type')) {
    throw new Error('Missing type field');
  }
  if (!context.hasOwnProperty('data')) {
    throw new Error('Missing data field');
  }
  if (!context.hasOwnProperty('config')) {
    throw new Error('Missing config field');
  }
  if (!context.hasOwnProperty('options')) {
    throw new Error('Missing options field');
  }
  
  // 验证字段值
  if (context.type !== '${hookType}') {
    throw new Error('Incorrect type value');
  }
  
  // 返回修改后的数据以验证传递正确
  return { ...context.data, contextVerified: true };
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook(hookType as HookType, hookPath);

            const context: HookContext = {
              type: hookType as HookType,
              data,
              config,
              options
            };

            // 执行 hook 不应该抛出错误
            const result = await hookManager.executeHook(hookType as HookType, context);
            
            // 验证 hook 成功执行并修改了数据
            expect(result).toHaveProperty('contextVerified', true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 36: Hook 数据修改往返正确性', () => {
    it('对于任意钩子函数，如果返回修改后的数据，应该正确传递', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'beforeArticleFilter',
            'afterToolFilter',
            'beforeRender'
          ),
          fc.array(fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.integer({ min: 0, max: 100 })
          }), { minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (hookType, originalData, modificationMarker) => {
            // 创建修改数据的 hook
            const hookPath = path.join(testDir, `modify-${hookType}.js`);
            const hookContent = `
module.exports = function(context) {
  // 修改数据：为每个项目添加标记
  if (Array.isArray(context.data)) {
    return context.data.map(item => ({
      ...item,
      modified: '${modificationMarker}',
      originalId: item.id
    }));
  } else {
    return {
      ...context.data,
      modified: '${modificationMarker}'
    };
  }
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook(hookType as HookType, hookPath);

            const context: HookContext = {
              type: hookType as HookType,
              data: originalData,
              config: {},
              options: {}
            };

            const result = await hookManager.executeHook(hookType as HookType, context);

            // 验证数据被正确修改
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(originalData.length);
            
            for (let i = 0; i < result.length; i++) {
              expect(result[i]).toHaveProperty('modified', modificationMarker);
              expect(result[i]).toHaveProperty('originalId', originalData[i].id);
              expect(result[i].name).toBe(originalData[i].name);
              expect(result[i].value).toBe(originalData[i].value);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于返回不同类型数据的钩子，应该正确处理', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.array(fc.object()),
            fc.object(),
            fc.string(),
            fc.integer(),
            fc.boolean()
          ),
          async (originalData) => {
            const hookType = 'beforeRender';
            const hookPath = path.join(testDir, 'transform-data.js');
            const hookContent = `
module.exports = function(context) {
  // 将任何数据包装在对象中
  return {
    originalData: context.data,
    transformed: true,
    timestamp: Date.now()
  };
};
`;
            await fs.writeFile(hookPath, hookContent, 'utf-8');
            hookManager.registerHook(hookType, hookPath);

            const context: HookContext = {
              type: hookType,
              data: originalData,
              config: {},
              options: {}
            };

            const result = await hookManager.executeHook(hookType, context);

            // 验证数据转换正确
            expect(result).toHaveProperty('originalData');
            expect(result.originalData).toEqual(originalData);
            expect(result).toHaveProperty('transformed', true);
            expect(result).toHaveProperty('timestamp');
            expect(typeof result.timestamp).toBe('number');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('边界情况测试', () => {
    it('应该处理未注册的钩子类型', async () => {
      const context: HookContext = {
        type: 'beforeArticleFilter',
        data: [{ test: 'data' }],
        config: {},
        options: {}
      };

      const result = await hookManager.executeHook('beforeArticleFilter', context);
      expect(result).toEqual(context.data);
    });

    it('应该处理无效的钩子文件', async () => {
      const hookPath = path.join(testDir, 'invalid.js');
      const invalidContent = `
// 这不是一个有效的模块导出
const notAFunction = "I'm not a function";
`;
      await fs.writeFile(hookPath, invalidContent, 'utf-8');

      expect(() => {
        hookManager.registerHook('beforeArticleFilter', hookPath);
      }).toThrow();
    });

    it('应该处理不存在的钩子文件', () => {
      const nonExistentPath = path.join(testDir, 'nonexistent.js');
      
      expect(() => {
        hookManager.registerHook('beforeArticleFilter', nonExistentPath);
      }).toThrow();
    });

    it('应该正确清除所有钩子', async () => {
      // 注册多个钩子
      const hookTypes: HookType[] = ['beforeArticleFilter', 'customToolScore', 'beforeRender'];
      
      for (const hookType of hookTypes) {
        const hookPath = path.join(testDir, `${hookType}.js`);
        const hookContent = `module.exports = function(context) { return context.data; };`;
        await fs.writeFile(hookPath, hookContent, 'utf-8');
        hookManager.registerHook(hookType, hookPath);
      }

      // 验证所有钩子都已注册
      for (const hookType of hookTypes) {
        expect(hookManager.hasHook(hookType)).toBe(true);
      }

      // 清除所有钩子
      hookManager.clearHooks();

      // 验证所有钩子都已清除
      for (const hookType of hookTypes) {
        expect(hookManager.hasHook(hookType)).toBe(false);
      }
    });
  });
});
