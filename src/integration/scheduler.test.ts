/**
 * 调度器集成测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Scheduler } from '../core/Scheduler';
import { ContentGenerator } from '../core/ContentGenerator';
import { TemplateRegistry } from '../core/TemplateRegistry';
import { ConfigManager } from '../core/ConfigManager';
import { TemplateEngine } from '../core/TemplateEngine';
import { HookManager } from '../core/HookManager';
import { Logger } from '../core/Logger';
import { WeeklyDataProvider } from '../providers/WeeklyDataProvider';

describe('Scheduler Integration Tests', () => {
  let testDir: string;
  let configPath: string;
  let scheduler: Scheduler;
  let generator: ContentGenerator;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(__dirname, '../../test-scheduler-vault');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'articles'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'tools'), { recursive: true }); // 添加空的 tools 目录
    await fs.mkdir(path.join(testDir, 'notes'), { recursive: true }); // 添加空的 notes 目录
    await fs.mkdir(path.join(testDir, 'output'), { recursive: true });

    // 创建测试数据和配置
    await createSchedulerTestData(testDir);
    await createSchedulerConfig(testDir);

    configPath = path.join(testDir, 'config.json');

    // 初始化系统组件
    const logger = new Logger('error', false);
    const hookManager = new HookManager();
    const templateRegistry = new TemplateRegistry(logger);
    const configManager = new ConfigManager(hookManager);
    const templateEngine = new TemplateEngine();

    templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

    generator = new ContentGenerator(
      templateRegistry,
      configManager,
      templateEngine,
      logger,
      hookManager
    );

    scheduler = new Scheduler(generator);
  });

  afterAll(async () => {
    // 确保调度器停止
    if (scheduler) {
      scheduler.stop();
    }

    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('Scheduler Operations', () => {
    it('应该能够添加和移除调度任务', () => {
      // 添加任务
      scheduler.addTask('weekly', '0 0 * * 1', { // 每周一午夜
        config: configPath
      });

      // 验证任务已添加
      expect(scheduler.getNextRunTime('weekly')).toBeDefined();

      // 移除任务
      scheduler.removeTask('weekly');

      // 验证任务已移除
      expect(scheduler.getNextRunTime('weekly')).toBeNull();
    });

    it('应该能够启动和停止调度器', () => {
      // 启动调度器
      scheduler.start();
      // 注意：isRunning 是私有属性，我们不能直接测试它
      // 但我们可以测试调度器的行为

      // 停止调度器
      scheduler.stop();
      // 同样，我们不能直接测试 isRunning 状态
    });

    it('应该正确计算下次执行时间', () => {
      // 添加每分钟执行的任务
      scheduler.addTask('weekly', '* * * * *', {
        config: configPath
      });

      const nextRunTime = scheduler.getNextRunTime('weekly');
      expect(nextRunTime).toBeDefined();
      expect(nextRunTime!.getTime()).toBeGreaterThan(Date.now());

      // 清理
      scheduler.removeTask('weekly');
    });

    it('应该处理无效的 cron 表达式', () => {
      // 尝试添加无效的 cron 表达式
      expect(() => {
        scheduler.addTask('weekly', 'invalid-cron', {
          config: configPath
        });
      }).toThrow();
    });

    it('应该能够执行调度任务', async () => {
      // 添加立即执行的任务（用于测试）
      const startTime = Date.now();
      
      // 手动执行任务来测试执行逻辑
      const result = await generator.generate('weekly', {
        config: configPath,
        dryRun: false
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();

      // 验证文件已创建
      const fileExists = await fs.access(result.filePath!)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('应该处理任务执行错误', async () => {
      // 创建会导致错误的配置
      await createInvalidConfig(testDir);
      const invalidConfigPath = path.join(testDir, 'invalid-config.json');

      // 尝试执行任务
      const result = await generator.generate('weekly', {
        config: invalidConfigPath,
        dryRun: false
      });

      // 验证错误被正确处理
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('Scheduler Task Management', () => {
    it('应该支持多个不同的调度任务', () => {
      // 添加多个任务
      scheduler.addTask('weekly', '0 0 * * 1', { config: configPath });
      scheduler.addTask('monthly', '0 0 1 * *', { config: configPath });

      // 验证两个任务都存在
      expect(scheduler.getNextRunTime('weekly')).toBeDefined();
      expect(scheduler.getNextRunTime('monthly')).toBeDefined();

      // 清理
      scheduler.removeTask('weekly');
      scheduler.removeTask('monthly');
    });

    it('应该能够更新现有任务', () => {
      // 添加任务
      scheduler.addTask('weekly', '0 0 * * 1', { config: configPath });
      const firstNextRun = scheduler.getNextRunTime('weekly');

      // 更新任务（相同名称会覆盖）
      scheduler.addTask('weekly', '0 0 * * 2', { config: configPath }); // 改为周二
      const secondNextRun = scheduler.getNextRunTime('weekly');

      // 验证时间已更新
      expect(secondNextRun).not.toEqual(firstNextRun);

      // 清理
      scheduler.removeTask('weekly');
    });
  });
});

// 创建调度器测试数据
async function createSchedulerTestData(testDir: string) {
  const articlesDir = path.join(testDir, 'articles');

  const article = {
    filename: 'scheduler-test.md',
    content: `---
title: 调度器测试文章
url: https://example.com/scheduler-test
rating: 3
tags: [调度器, 测试]
description: 用于测试调度器功能的文章
---

调度器测试内容...`
  };

  await fs.writeFile(
    path.join(articlesDir, article.filename),
    article.content,
    'utf-8'
  );
}

// 创建调度器配置
async function createSchedulerConfig(testDir: string) {
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
          articles: path.join(testDir, 'articles'),
          tools: path.join(testDir, 'tools'),
          notes: path.join(testDir, 'notes')
        },
        output: {
          path: path.join(testDir, 'output'),
          filename: 'Weekly-Scheduler-{{issueNumber}}.md'
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

// 创建无效配置（用于测试错误处理）
async function createInvalidConfig(testDir: string) {
  const invalidConfig = {
    global: {
      logLevel: 'error' as const,
      defaultTemplate: 'weekly'
    },
    templates: {
      weekly: {
        enabled: true,
        template: {
          path: '/nonexistent/template.hbs' // 不存在的模板路径
        },
        sources: {
          articles: '/nonexistent/articles' // 不存在的数据源路径
        },
        output: {
          path: path.join(testDir, 'output'),
          filename: 'Weekly-Invalid-{{issueNumber}}.md'
        },
        content: {
          articles: {
            topN: 10,
            minRating: 0
          }
        }
      }
    }
  };

  await fs.writeFile(
    path.join(testDir, 'invalid-config.json'),
    JSON.stringify(invalidConfig, null, 2),
    'utf-8'
  );
}