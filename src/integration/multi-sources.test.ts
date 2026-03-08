/**
 * 多数据源集成测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContentGenerator } from '../core/ContentGenerator';
import { TemplateRegistry } from '../core/TemplateRegistry';
import { ConfigManager } from '../core/ConfigManager';
import { TemplateEngine } from '../core/TemplateEngine';
import { HookManager } from '../core/HookManager';
import { Logger } from '../core/Logger';
import { WeeklyDataProvider } from '../providers/WeeklyDataProvider';

describe('Multi-Data Sources Integration Tests', () => {
  let testDir: string;
  let configPath: string;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(__dirname, '../../test-multi-sources-vault');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'source1', 'articles'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'source2', 'articles'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'source3', 'articles'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'tools'), { recursive: true }); // 添加空的 tools 目录
    await fs.mkdir(path.join(testDir, 'notes'), { recursive: true }); // 添加空的 notes 目录
    await fs.mkdir(path.join(testDir, 'output'), { recursive: true });

    // 创建测试数据和配置
    await createMultiSourceData(testDir);
    await createMultiSourceConfig(testDir);

    configPath = path.join(testDir, 'config.json');
  });

  afterAll(async () => {
    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('Multi-Source Content Collection', () => {
    it('应该从所有数据源收集内容', async () => {
      const logger = new Logger('error', false);
      const hookManager = new HookManager();
      const templateRegistry = new TemplateRegistry(logger);
      const configManager = new ConfigManager(hookManager);
      const templateEngine = new TemplateEngine();

      templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

      const generator = new ContentGenerator(
        templateRegistry,
        configManager,
        templateEngine,
        logger,
        hookManager
      );

      const result = await generator.generate('weekly', {
        config: configPath,
        dryRun: false
      });

      expect(result.success).toBe(true);
      expect(result.statistics!.articles).toBe(3); // 来自 3 个数据源的文章
      
      // 读取生成的文件
      const content = await fs.readFile(result.filePath!, 'utf-8');
      
      // 验证来自不同数据源的内容都被包含
      expect(content).toContain('高优先级文章'); // source1
      expect(content).toContain('中优先级文章'); // source2  
      expect(content).toContain('低优先级文章'); // source3
    });

    it('应该按优先级排序内容', async () => {
      const logger = new Logger('error', false);
      const hookManager = new HookManager();
      const templateRegistry = new TemplateRegistry(logger);
      const configManager = new ConfigManager(hookManager);
      const templateEngine = new TemplateEngine();

      templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

      const generator = new ContentGenerator(
        templateRegistry,
        configManager,
        templateEngine,
        logger,
        hookManager
      );

      const result = await generator.generate('weekly', {
        config: configPath,
        dryRun: false
      });

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(result.filePath!, 'utf-8');
      
      // 验证高优先级内容出现在前面
      const highPriorityIndex = content.indexOf('高优先级文章');
      const lowPriorityIndex = content.indexOf('低优先级文章');
      
      expect(highPriorityIndex).toBeLessThan(lowPriorityIndex);
    });

    it('应该处理重复内容的去重', async () => {
      // 创建包含重复内容的配置
      await createDuplicateContentConfig(testDir);
      await createDuplicateContent(testDir);
      
      const duplicateConfigPath = path.join(testDir, 'duplicate-config.json');

      const logger = new Logger('error', false);
      const hookManager = new HookManager();
      const templateRegistry = new TemplateRegistry(logger);
      const configManager = new ConfigManager(hookManager);
      const templateEngine = new TemplateEngine();

      templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

      const generator = new ContentGenerator(
        templateRegistry,
        configManager,
        templateEngine,
        logger,
        hookManager
      );

      const result = await generator.generate('weekly', {
        config: duplicateConfigPath,
        dryRun: false
      });

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(result.filePath!, 'utf-8');
      
      // 验证重复内容只出现一次
      const matches = content.match(/重复文章/g);
      expect(matches?.length).toBe(1); // 只应该出现一次
    });
  });
});

// 创建多数据源测试数据
async function createMultiSourceData(testDir: string) {
  // Source 1 - 高优先级
  const source1Article = `---
title: 高优先级文章
url: https://example.com/high-priority
rating: 5
tags: [高优先级]
description: 来自高优先级数据源的文章
---

高优先级内容...`;

  await fs.writeFile(
    path.join(testDir, 'source1/articles/high-priority.md'),
    source1Article,
    'utf-8'
  );

  // Source 2 - 中优先级
  const source2Article = `---
title: 中优先级文章
url: https://example.com/medium-priority
rating: 3
tags: [中优先级]
description: 来自中优先级数据源的文章
---

中优先级内容...`;

  await fs.writeFile(
    path.join(testDir, 'source2/articles/medium-priority.md'),
    source2Article,
    'utf-8'
  );

  // Source 3 - 低优先级
  const source3Article = `---
title: 低优先级文章
url: https://example.com/low-priority
rating: 1
tags: [低优先级]
description: 来自低优先级数据源的文章
---

低优先级内容...`;

  await fs.writeFile(
    path.join(testDir, 'source3/articles/low-priority.md'),
    source3Article,
    'utf-8'
  );
}

// 创建多数据源配置
async function createMultiSourceConfig(testDir: string) {
  const config = {
    global: {
      logLevel: 'error' as const,
      defaultTemplate: 'weekly'
    },
    templates: {
      weekly: {
        enabled: true,
        template: {
          path: path.join(__dirname, '../../templates/weekly.hbs')
        },
        sources: {
          articles: [
            {
              path: path.join(testDir, 'source1'),
              priority: 10,
              alias: 'high-priority-source'
            },
            {
              path: path.join(testDir, 'source2'),
              priority: 5,
              alias: 'medium-priority-source'
            },
            {
              path: path.join(testDir, 'source3'),
              priority: 1,
              alias: 'low-priority-source'
            }
          ],
          tools: path.join(testDir, 'tools'), // 添加空的 tools 目录
          notes: path.join(testDir, 'notes')  // 添加空的 notes 目录
        },
        output: {
          path: path.join(testDir, 'output'),
          filename: 'Weekly-MultiSource-{{issueNumber}}.md'
        },
        content: {
          articles: {
            topN: 10,
            minRating: 0
          },
          tools: {
            perCategory: 1
          },
          notes: {
            groupBy: 'none' as const
          }
        }
      }
    }
  };

  await fs.writeFile(
    path.join(testDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}

// 创建重复内容测试数据
async function createDuplicateContent(testDir: string) {
  // 在两个数据源中创建相同的文章
  const duplicateArticle = `---
title: 重复文章
url: https://example.com/duplicate
rating: 4
tags: [重复]
description: 这是一篇重复的文章
---

重复内容...`;

  await fs.writeFile(
    path.join(testDir, 'source1/articles/duplicate.md'),
    duplicateArticle,
    'utf-8'
  );

  await fs.writeFile(
    path.join(testDir, 'source2/articles/duplicate.md'),
    duplicateArticle,
    'utf-8'
  );
}

// 创建包含重复内容的配置
async function createDuplicateContentConfig(testDir: string) {
  const config = {
    global: {
      logLevel: 'error' as const,
      defaultTemplate: 'weekly'
    },
    templates: {
      weekly: {
        enabled: true,
        template: {
          path: path.join(__dirname, '../../templates/weekly.hbs')
        },
        sources: {
          articles: [
            {
              path: path.join(testDir, 'source1'),
              priority: 10
            },
            {
              path: path.join(testDir, 'source2'),
              priority: 5
            }
          ],
          tools: path.join(testDir, 'tools'),
          notes: path.join(testDir, 'notes')
        },
        output: {
          path: path.join(testDir, 'output'),
          filename: 'Weekly-Duplicate-{{issueNumber}}.md'
        },
        content: {
          articles: {
            topN: 10,
            minRating: 0
          },
          tools: {
            perCategory: 1
          },
          notes: {
            groupBy: 'none' as const
          }
        }
      }
    }
  };

  await fs.writeFile(
    path.join(testDir, 'duplicate-config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}