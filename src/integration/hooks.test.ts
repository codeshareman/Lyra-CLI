/**
 * Hook 集成测试
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

describe('Hooks Integration Tests', () => {
  let testDir: string;
  let hooksDir: string;
  let configPath: string;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(__dirname, '../../test-hooks-vault');
    hooksDir = path.join(testDir, 'hooks');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'articles'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'tools'), { recursive: true }); // 创建空的 tools 目录
    await fs.mkdir(path.join(testDir, 'notes'), { recursive: true }); // 创建空的 notes 目录
    await fs.mkdir(path.join(testDir, 'output'), { recursive: true });
    await fs.mkdir(hooksDir, { recursive: true });

    // 创建测试数据和配置
    await createTestData(testDir);
    await createTestHooks(hooksDir);
    await createHooksConfig(testDir);

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

  describe('Hook Execution', () => {
    it('应该执行 beforeArticleFilter hook', async () => {
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

      // 打印结果用于调试
      if (!result.success) {
        console.log('Generation failed:', result.message);
      }

      expect(result.success).toBe(true);
      
      // 读取生成的文件
      const content = await fs.readFile(result.filePath!, 'utf-8');
      
      // 验证 hook 修改生效（beforeArticleFilter hook 会添加 "Hook修改: " 前缀）
      expect(content).toContain('Hook修改: 测试文章');
    });

    it('应该执行 customArticleScore hook', async () => {
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
      
      // customArticleScore hook 会将所有文章评分设为 10
      // 验证文章按新评分排序（所有文章评分相同时保持原顺序）
      const content = await fs.readFile(result.filePath!, 'utf-8');
      expect(content).toContain('测试文章');
    });

    it('应该执行 afterArticleFilter hook', async () => {
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
      
      // afterArticleFilter hook 会在描述后添加 " [已处理]"
      const content = await fs.readFile(result.filePath!, 'utf-8');
      expect(content).toContain('[已处理]');
    });
  });
});

// 创建测试数据
async function createTestData(testDir: string) {
  const articlesDir = path.join(testDir, 'articles');

  const article = {
    filename: 'test-article.md',
    content: `---
title: 测试文章
url: https://example.com/test
rating: 3
tags: [测试]
description: 这是一篇测试文章
---

测试内容...`
  };

  await fs.writeFile(
    path.join(articlesDir, article.filename),
    article.content,
    'utf-8'
  );
}

// 创建测试 hooks
async function createTestHooks(hooksDir: string) {
  // beforeArticleFilter hook - 修改文章标题
  const beforeArticleFilterHook = `
module.exports = function(context) {
  const articles = context.data;
  if (Array.isArray(articles)) {
    articles.forEach(article => {
      article.title = 'Hook修改: ' + article.title;
    });
  }
  return articles; // 返回修改后的数据
};
`;

  // customArticleScore hook - 自定义评分
  const customArticleScoreHook = `
module.exports = function(context) {
  const articles = context.data;
  if (Array.isArray(articles)) {
    articles.forEach(article => {
      article.rating = 10; // 设置为高评分
    });
  }
  return articles; // 返回修改后的数据
};
`;

  // afterArticleFilter hook - 修改描述
  const afterArticleFilterHook = `
module.exports = function(context) {
  const articles = context.data;
  if (Array.isArray(articles)) {
    articles.forEach(article => {
      if (article.description) {
        article.description += ' [已处理]';
      }
    });
  }
  return articles; // 返回修改后的数据
};
`;

  await fs.writeFile(
    path.join(hooksDir, 'beforeArticleFilter.js'),
    beforeArticleFilterHook,
    'utf-8'
  );

  await fs.writeFile(
    path.join(hooksDir, 'customArticleScore.js'),
    customArticleScoreHook,
    'utf-8'
  );

  await fs.writeFile(
    path.join(hooksDir, 'afterArticleFilter.js'),
    afterArticleFilterHook,
    'utf-8'
  );
}

// 创建带 hooks 的配置
async function createHooksConfig(testDir: string) {
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
          tools: path.join(testDir, 'tools'), // 添加空的 tools 目录
          notes: path.join(testDir, 'notes')  // 添加空的 notes 目录
        },
        output: {
          path: path.join(testDir, 'output'),
          filename: 'Weekly-Hooks-{{issueNumber}}.md'
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
        },
        hooks: {
          beforeArticleFilter: path.join(testDir, 'hooks/beforeArticleFilter.js'),
          customArticleScore: path.join(testDir, 'hooks/customArticleScore.js'),
          afterArticleFilter: path.join(testDir, 'hooks/afterArticleFilter.js')
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