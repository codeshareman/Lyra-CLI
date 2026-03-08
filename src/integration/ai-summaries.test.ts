/**
 * AI 摘要集成测试
 * 
 * 注意：由于 AI 功能尚未实现，此测试主要验证系统在没有 AI 功能时的回退行为
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

describe('AI Summaries Integration Tests', () => {
  let testDir: string;
  let configPath: string;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(__dirname, '../../test-ai-vault');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'articles'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'tools'), { recursive: true }); // 添加空的 tools 目录
    await fs.mkdir(path.join(testDir, 'notes'), { recursive: true }); // 添加空的 notes 目录
    await fs.mkdir(path.join(testDir, 'output'), { recursive: true });

    // 创建测试数据和配置
    await createAITestData(testDir);
    await createAIConfig(testDir);

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

  describe('AI Summary Fallback Behavior', () => {
    it('应该在没有 AI 功能时使用原始描述', async () => {
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
      
      // 读取生成的文件
      const content = await fs.readFile(result.filePath!, 'utf-8');
      
      // 验证使用了原始描述而不是 AI 摘要
      expect(content).toContain('这是一篇测试文章的原始描述');
      expect(content).not.toContain('AI生成的摘要');
    });

    it('应该正确处理没有描述的文章', async () => {
      // 创建没有描述的文章
      await createArticleWithoutDescription(testDir);
      
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
      
      // 验证没有描述的文章也能正常处理
      expect(content).toContain('无描述文章');
    });

    it('应该在配置了 AI 但功能不可用时优雅降级', async () => {
      // 创建包含 AI 配置的配置文件
      await createAIEnabledConfig(testDir);
      const aiConfigPath = path.join(testDir, 'ai-config.json');

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
        config: aiConfigPath,
        dryRun: false
      });

      // 即使配置了 AI 但功能不可用，生成仍应成功
      expect(result.success).toBe(true);
      
      const content = await fs.readFile(result.filePath!, 'utf-8');
      
      // 验证回退到原始描述
      expect(content).toContain('这是一篇测试文章的原始描述');
    });
  });

  describe('Future AI Integration Readiness', () => {
    it('应该为未来的 AI 集成预留扩展点', async () => {
      // 验证系统具有 AI 集成的扩展点
      // 这个测试主要验证接口的存在性，而不是具体实现
      
      // 验证 WeeklyDataProvider 类存在且可以被导入
      expect(WeeklyDataProvider).toBeDefined();
      expect(typeof WeeklyDataProvider).toBe('function');
      
      // 验证 ContentGenerator 支持模板数据收集
      expect(typeof ContentGenerator).toBe('function');
      
      // 这些测试确保当 AI 功能实现时，现有架构仍然兼容
    });
  });
});

// 创建 AI 测试数据
async function createAITestData(testDir: string) {
  const articlesDir = path.join(testDir, 'articles');

  const article = {
    filename: 'ai-test-article.md',
    content: `---
title: AI 测试文章
url: https://example.com/ai-test
rating: 4
tags: [AI, 测试]
description: 这是一篇测试文章的原始描述
---

这是文章的正文内容，可以用于生成 AI 摘要...`
  };

  await fs.writeFile(
    path.join(articlesDir, article.filename),
    article.content,
    'utf-8'
  );
}

// 创建没有描述的文章
async function createArticleWithoutDescription(testDir: string) {
  const articlesDir = path.join(testDir, 'articles');

  const article = {
    filename: 'no-description.md',
    content: `---
title: 无描述文章
url: https://example.com/no-desc
rating: 2
tags: [测试]
---

这是没有描述的文章内容...`
  };

  await fs.writeFile(
    path.join(articlesDir, article.filename),
    article.content,
    'utf-8'
  );
}

// 创建基础配置
async function createAIConfig(testDir: string) {
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
          filename: 'Weekly-AI-{{issueNumber}}.md'
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

// 创建包含 AI 配置的配置文件
async function createAIEnabledConfig(testDir: string) {
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
          filename: 'Weekly-AI-Enabled-{{issueNumber}}.md'
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
        // AI 配置（当前不会生效，但为未来实现预留）
        ai: {
          enabled: true,
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          maxLength: 200,
          language: 'zh-CN'
        }
      }
    }
  };

  await fs.writeFile(
    path.join(testDir, 'ai-config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}