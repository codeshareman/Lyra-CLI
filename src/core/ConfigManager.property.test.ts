/**
 * ConfigManager 属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigManager } from './ConfigManager';
import { HookManager } from './HookManager';

describe('ConfigManager Property Tests', () => {
  let testDir: string;
  let configManager: ConfigManager;
  let hookManager: HookManager;

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../test-property-config');
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'hooks'), { recursive: true });
    
    hookManager = new HookManager();
    configManager = new ConfigManager(hookManager);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('Property 46: Hook 配置加载正确性', () => {
    it('应该正确加载所有配置的 hooks', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成 hook 配置
          fc.record({
            beforeArticleFilter: fc.constant('hooks/beforeArticleFilter.js'),
            customArticleScore: fc.constant('hooks/customArticleScore.js'),
            afterArticleFilter: fc.constant('hooks/afterArticleFilter.js'),
            beforeToolFilter: fc.constant('hooks/beforeToolFilter.js'),
            customToolScore: fc.constant('hooks/customToolScore.js'),
            afterToolFilter: fc.constant('hooks/afterToolFilter.js'),
            contentFilter: fc.constant('hooks/contentFilter.js'),
            beforeRender: fc.constant('hooks/beforeRender.js'),
            afterRender: fc.constant('hooks/afterRender.js')
          }),
          async (hookConfig) => {
            // 创建 hook 文件
            for (const [hookType, hookPath] of Object.entries(hookConfig)) {
              const fullPath = path.join(testDir, hookPath);
              const hookContent = `
module.exports = function(context) {
  // ${hookType} hook implementation
  return context.data || context;
};
`;
              await fs.writeFile(fullPath, hookContent, 'utf-8');
            }

            // 创建配置
            const config = {
              global: {
                logLevel: 'error' as const,
                defaultTemplate: 'weekly'
              },
              templates: {
                weekly: {
                  enabled: true,
                  template: { path: '/test/template.hbs' },
                  sources: { articles: '/test/articles' },
                  output: { path: '/test/output', filename: 'test.md' },
                  content: { articles: { topN: 10, minRating: 0 } },
                  hooks: Object.fromEntries(
                    Object.entries(hookConfig).map(([key, value]) => [
                      key,
                      path.join(testDir, value)
                    ])
                  )
                }
              }
            };

            const configPath = path.join(testDir, 'config.json');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

            // 加载配置
            const loadedConfig = await configManager.load(configPath);
            const templateConfig = configManager.getTemplateConfig('weekly');

            // 验证所有 hooks 都被正确注册
            for (const hookType of Object.keys(hookConfig)) {
              expect(hookManager.hasHook(hookType as any)).toBe(true);
            }

            // 验证配置正确加载
            expect(templateConfig).toBeDefined();
            expect(templateConfig.hooks).toBeDefined();
            expect(Object.keys(templateConfig.hooks!)).toHaveLength(Object.keys(hookConfig).length);
          }
        ),
        { numRuns: 5 } // 减少运行次数以提高测试速度
      );
    });

    it('应该处理部分 hook 配置', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成部分 hook 配置
          fc.subarray([
            'beforeArticleFilter',
            'customArticleScore', 
            'afterArticleFilter',
            'beforeToolFilter',
            'customToolScore',
            'afterToolFilter',
            'contentFilter',
            'beforeRender',
            'afterRender'
          ], { minLength: 1, maxLength: 5 }),
          async (selectedHooks) => {
            const hookConfig: Record<string, string> = {};
            
            // 创建选中的 hook 文件
            for (const hookType of selectedHooks) {
              const hookPath = `hooks/${hookType}.js`;
              hookConfig[hookType] = hookPath;
              
              const fullPath = path.join(testDir, hookPath);
              const hookContent = `
module.exports = function(context) {
  // ${hookType} hook implementation
  return context.data || context;
};
`;
              await fs.writeFile(fullPath, hookContent, 'utf-8');
            }

            // 创建配置
            const config = {
              global: {
                logLevel: 'error' as const,
                defaultTemplate: 'weekly'
              },
              templates: {
                weekly: {
                  enabled: true,
                  template: { path: '/test/template.hbs' },
                  sources: { articles: '/test/articles' },
                  output: { path: '/test/output', filename: 'test.md' },
                  content: { articles: { topN: 10, minRating: 0 } },
                  hooks: Object.fromEntries(
                    Object.entries(hookConfig).map(([key, value]) => [
                      key,
                      path.join(testDir, value)
                    ])
                  )
                }
              }
            };

            const configPath = path.join(testDir, 'config.json');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

            // 加载配置
            await configManager.load(configPath);

            // 验证只有选中的 hooks 被注册
            for (const hookType of selectedHooks) {
              expect(hookManager.hasHook(hookType as any)).toBe(true);
            }

            // 验证未选中的 hooks 没有被注册
            const allHooks = [
              'beforeArticleFilter', 'customArticleScore', 'afterArticleFilter',
              'beforeToolFilter', 'customToolScore', 'afterToolFilter',
              'contentFilter', 'beforeRender', 'afterRender'
            ];
            
            for (const hookType of allHooks) {
              if (!selectedHooks.includes(hookType)) {
                expect(hookManager.hasHook(hookType as any)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('应该处理无效的 hook 文件路径', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            validHook: fc.constant('hooks/valid.js'),
            invalidHook: fc.constant('hooks/nonexistent.js')
          }),
          async (hookConfig) => {
            // 只创建有效的 hook 文件
            const validPath = path.join(testDir, hookConfig.validHook);
            const validContent = `
module.exports = function(context) {
  return context.data || context;
};
`;
            await fs.writeFile(validPath, validContent, 'utf-8');

            // 创建配置（包含无效路径）
            const config = {
              global: {
                logLevel: 'error' as const,
                defaultTemplate: 'weekly'
              },
              templates: {
                weekly: {
                  enabled: true,
                  template: { path: '/test/template.hbs' },
                  sources: { articles: '/test/articles' },
                  output: { path: '/test/output', filename: 'test.md' },
                  content: { articles: { topN: 10, minRating: 0 } },
                  hooks: {
                    beforeArticleFilter: path.join(testDir, hookConfig.validHook),
                    customArticleScore: path.join(testDir, hookConfig.invalidHook) // 不存在的文件
                  }
                }
              }
            };

            const configPath = path.join(testDir, 'config.json');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

            // 加载配置应该不会抛出错误（优雅处理）
            await expect(configManager.load(configPath)).resolves.not.toThrow();

            // 有效的 hook 应该被注册
            expect(hookManager.hasHook('beforeArticleFilter')).toBe(true);
            
            // 无效的 hook 不应该被注册
            expect(hookManager.hasHook('customArticleScore')).toBe(false);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Property 22: 配置验证拒绝无效配置', () => {
    it('对于任意无效配置，validate 应该返回 valid: false 并包含错误信息', async () => {
      await fc.assert(
        fc.property(
          fc.oneof(
            // 缺少全局配置
            fc.record({
              templates: fc.record({
                weekly: fc.record({
                  enabled: fc.boolean(),
                  template: fc.record({ path: fc.string() }),
                  sources: fc.record({ articles: fc.string() }),
                  output: fc.record({ path: fc.string(), filename: fc.string() }),
                  content: fc.object()
                })
              })
            }),
            // 无效的 logLevel
            fc.record({
              global: fc.record({
                logLevel: fc.constantFrom('invalid', 'unknown', ''),
                defaultTemplate: fc.string()
              }),
              templates: fc.record({
                weekly: fc.record({
                  enabled: fc.boolean(),
                  template: fc.record({ path: fc.string() }),
                  sources: fc.record({ articles: fc.string() }),
                  output: fc.record({ path: fc.string(), filename: fc.string() }),
                  content: fc.object()
                })
              })
            }),
            // 缺少模板配置
            fc.record({
              global: fc.record({
                logLevel: fc.constantFrom('debug', 'info', 'warning', 'error'),
                defaultTemplate: fc.string()
              }),
              templates: fc.record({})
            }),
            // 缺少模板路径
            fc.record({
              global: fc.record({
                logLevel: fc.constantFrom('debug', 'info', 'warning', 'error'),
                defaultTemplate: fc.string()
              }),
              templates: fc.record({
                weekly: fc.record({
                  enabled: fc.boolean(),
                  sources: fc.record({ articles: fc.string() }),
                  output: fc.record({ path: fc.string(), filename: fc.string() }),
                  content: fc.object()
                })
              })
            }),
            // 缺少输出配置
            fc.record({
              global: fc.record({
                logLevel: fc.constantFrom('debug', 'info', 'warning', 'error'),
                defaultTemplate: fc.string()
              }),
              templates: fc.record({
                weekly: fc.record({
                  enabled: fc.boolean(),
                  template: fc.record({ path: fc.string() }),
                  sources: fc.record({ articles: fc.string() }),
                  content: fc.object()
                })
              })
            })
          ),
          (invalidConfig) => {
            const validation = configManager.validate(invalidConfig as any);
            
            expect(validation.valid).toBe(false);
            expect(validation.errors).toBeDefined();
            expect(validation.errors.length).toBeGreaterThan(0);
            expect(Array.isArray(validation.errors)).toBe(true);
            
            // 每个错误都应该是非空字符串
            validation.errors.forEach(error => {
              expect(typeof error).toBe('string');
              expect(error.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意有效配置，validate 应该返回 valid: true', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            global: fc.record({
              logLevel: fc.constantFrom('debug', 'info', 'warning', 'error'),
              defaultTemplate: fc.string({ minLength: 1 })
            }),
            templates: fc.record({
              weekly: fc.record({
                enabled: fc.boolean(),
                template: fc.record({ 
                  path: fc.string({ minLength: 1 })
                }),
                sources: fc.record({ 
                  articles: fc.string({ minLength: 1 })
                }),
                output: fc.record({ 
                  path: fc.string({ minLength: 1 }), 
                  filename: fc.string({ minLength: 1 })
                }),
                content: fc.record({
                  articles: fc.record({
                    topN: fc.integer({ min: 1, max: 100 }),
                    minRating: fc.integer({ min: 0, max: 5 })
                  })
                })
              })
            })
          }),
          (validConfig) => {
            const validation = configManager.validate(validConfig as any);
            
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 23: 配置合并优先级正确性', () => {
    it('对于任意配置组合，合并后应该使用正确的优先级', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            // 默认配置值
            defaultLogLevel: fc.constantFrom('debug', 'info', 'warning', 'error'),
            defaultTemplate: fc.string({ minLength: 1 }),
            // 用户配置值（不同的值）
            userLogLevel: fc.constantFrom('debug', 'info', 'warning', 'error'),
            userTemplate: fc.string({ minLength: 1 }),
            // 模板特定配置
            templateEnabled: fc.boolean(),
            templatePath: fc.string({ minLength: 1 }),
            userTemplatePath: fc.string({ minLength: 1 })
          }),
          (testData) => {
            // 确保用户值与默认值不同
            fc.pre(testData.userLogLevel !== testData.defaultLogLevel);
            fc.pre(testData.userTemplate !== testData.defaultTemplate);
            fc.pre(testData.userTemplatePath !== testData.templatePath);

            // 创建默认配置
            const defaultConfig = {
              global: {
                logLevel: testData.defaultLogLevel,
                defaultTemplate: testData.defaultTemplate
              },
              templates: {
                weekly: {
                  enabled: testData.templateEnabled,
                  template: { path: testData.templatePath },
                  sources: { articles: '/default/articles' },
                  output: { path: '/default/output', filename: 'default.md' },
                  content: { articles: { topN: 10, minRating: 0 } }
                }
              }
            };

            // 创建用户配置（部分覆盖）
            const userConfig = {
              global: {
                logLevel: testData.userLogLevel,
                defaultTemplate: testData.userTemplate
              },
              templates: {
                weekly: {
                  template: { path: testData.userTemplatePath }
                }
              }
            };

            // 模拟合并过程
            const configManager = new ConfigManager();
            const merged = (configManager as any).mergeWithDefaults(userConfig);

            // 验证用户配置优先级更高
            expect(merged.global.logLevel).toBe(testData.userLogLevel);
            expect(merged.global.defaultTemplate).toBe(testData.userTemplate);
            expect(merged.templates.weekly.template.path).toBe(testData.userTemplatePath);
            
            // 验证未覆盖的配置保持默认值
            expect(merged.templates.weekly.enabled).toBe(testData.templateEnabled);
            expect(merged.templates.weekly.sources.articles).toBe('/default/articles');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于嵌套配置对象，应该正确进行深度合并', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            defaultTopN: fc.integer({ min: 1, max: 50 }),
            defaultMinRating: fc.integer({ min: 0, max: 5 }),
            userTopN: fc.integer({ min: 1, max: 50 }),
            userPerCategory: fc.integer({ min: 1, max: 10 }),
            defaultOutputPath: fc.string({ minLength: 1 }),
            userOutputFilename: fc.string({ minLength: 1 })
          }),
          (testData) => {
            // 确保用户值与默认值不同
            fc.pre(testData.userTopN !== testData.defaultTopN);

            const userConfig = {
              templates: {
                weekly: {
                  content: {
                    articles: {
                      topN: testData.userTopN // 覆盖 topN
                      // 不覆盖 minRating
                    },
                    tools: {
                      perCategory: testData.userPerCategory // 新增字段
                    }
                  },
                  output: {
                    filename: testData.userOutputFilename // 只覆盖 filename
                    // 不覆盖 path
                  }
                }
              }
            };

            const configManager = new ConfigManager();
            const merged = (configManager as any).mergeWithDefaults(userConfig);

            // 验证深度合并结果
            expect(merged.templates.weekly.content.articles.topN).toBe(testData.userTopN);
            expect(merged.templates.weekly.content.articles.minRating).toBe(3); // 默认值
            expect(merged.templates.weekly.content.tools.perCategory).toBe(testData.userPerCategory);
            expect(merged.templates.weekly.output.filename).toBe(testData.userOutputFilename);
            expect(merged.templates.weekly.output.path).toBe('./Weekly'); // 默认值
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});