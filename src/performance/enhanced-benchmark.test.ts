import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ContentGenerator } from '../core/ContentGenerator';
import { TemplateRegistry } from '../core/TemplateRegistry';
import { ConfigManager } from '../core/ConfigManager';
import { TemplateEngine } from '../core/TemplateEngine';
import { HookManager } from '../core/HookManager';
import { Logger } from '../core/Logger';
import { WeeklyDataProvider } from '../providers/WeeklyDataProvider';
import { PlatformExporter } from '../export/PlatformExporter';
import { EnhancedContentFilter } from '../filters/EnhancedContentFilter';
import { ContentItem, TemplateData } from '../types/interfaces';

describe('Enhanced Weekly Benchmarks', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enhanced-benchmark-'));
    for (const dir of ['articles', 'tools', 'notes', 'life', 'food', 'exercise', 'music', 'output']) {
      await fs.mkdir(path.join(testDir, dir), { recursive: true });
    }
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  function createGenerator(logLevel: 'debug' | 'info' | 'warning' | 'error' = 'error') {
    const logger = new Logger(logLevel, false);
    const hookManager = new HookManager();
    const templateRegistry = new TemplateRegistry(logger);
    const configManager = new ConfigManager(hookManager);
    const templateEngine = new TemplateEngine();

    templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

    return new ContentGenerator(templateRegistry, configManager, templateEngine, logger, hookManager);
  }

  async function createEnhancedConfig(configPath: string, topN = 200): Promise<void> {
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          global: {
            logLevel: 'error',
            defaultTemplate: 'weekly',
          },
          templates: {
            weekly: {
              enabled: true,
              templateVersion: 'enhanced',
              template: {
                path: path.join(__dirname, '../../templates/weekly.hbs'),
              },
              sources: {
                articles: path.join(testDir, 'articles'),
                tools: path.join(testDir, 'tools'),
                notes: path.join(testDir, 'notes'),
                life: path.join(testDir, 'life'),
                food: path.join(testDir, 'food'),
                exercise: path.join(testDir, 'exercise'),
                music: path.join(testDir, 'music'),
              },
              output: {
                path: path.join(testDir, 'output'),
                filename: 'Enhanced-Weekly-{{issueNumber}}.md',
              },
              content: {
                articles: { topN, minRating: 0 },
                tools: { perCategory: 10 },
                notes: { groupBy: 'none' },
              },
              ai: {
                enabled: false,
                provider: 'mock',
                model: 'mock-model',
                apiKey: 'mock',
              },
              modules: {
                weeklyUpdates: { enabled: true },
                reading: { enabled: true },
                tech: { enabled: true },
                life: { enabled: true },
                products: { enabled: true },
                food: { enabled: true },
                exercise: { enabled: true },
                music: { enabled: true },
                thoughts: { enabled: true },
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  async function seedArticles(count: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < count; i += 1) {
      await fs.writeFile(
        path.join(testDir, 'articles', `article-${i}.md`),
        `---
title: Article ${i}
url: https://example.com/article-${i}
rating: 5
category: 文章
date: ${today}
description: performance article ${i}
---
这是用于性能测试的文章 ${i}。
`,
        'utf-8'
      );
    }

    await fs.writeFile(
      path.join(testDir, 'notes', 'weekly-update.md'),
      `---
title: Weekly Update
category: 本周动态
created: ${today}
---
更新内容。
`,
      'utf-8'
    );
  }

  it('should generate 50-article enhanced weekly under 5 seconds', async () => {
    await seedArticles(50);
    const configPath = path.join(testDir, 'benchmark-config.json');
    await createEnhancedConfig(configPath, 60);

    const generator = createGenerator('error');
    const start = Date.now();
    const result = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });
    const duration = Date.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  it('should render template in under 100ms per cached render', async () => {
    const templatePath = path.join(testDir, 'render-benchmark.hbs');
    await fs.writeFile(
      templatePath,
      '# {{metadata.title}}\n{{#each content.items}}- {{this}}\n{{/each}}',
      'utf-8'
    );

    const engine = new TemplateEngine();
    const data: TemplateData = {
      metadata: { title: 'Performance Render' },
      content: { items: ['a', 'b', 'c'] },
      statistics: {},
    };

    await engine.render(templatePath, data);

    const start = Date.now();
    const rendered = await engine.render(templatePath, data);
    const duration = Date.now() - start;

    expect(rendered).toContain('Performance Render');
    expect(duration).toBeLessThan(100);
  });

  it('should filter 1000 items in under 10ms', () => {
    const filter = new EnhancedContentFilter();
    const now = new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const items: ContentItem[] = Array.from({ length: 1000 }, (_, index) => ({
      title: `Item ${index}`,
      path: `/tmp/item-${index}.md`,
      created: now,
      category: index % 2 === 0 ? '文章' : '工具',
      tags: index % 3 === 0 ? ['bench', 'perf'] : ['misc'],
      aiSummary: 'summary',
      description: 'desc',
      content: 'content',
      source: 'benchmark',
      ...( { rating: 5 } as any),
    }));

    const start = Date.now();
    const filtered = filter.filter(items as any, {
      categories: ['文章', '工具'],
      tags: ['bench'],
      dateRange: { start: startDate, end: endDate },
      minRating: 4,
    });
    const duration = Date.now() - start;

    expect(filtered.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(10);
  });

  it('should export each format in under 500ms', async () => {
    const exporter = new PlatformExporter();
    const markdown = [
      '# Enhanced Weekly',
      '',
      '## 📚 精读与输入',
      '- [Article](https://example.com/article)',
      '',
      '## 🛠️ 技术与生产力',
      '- Tool description',
    ].join('\n');

    const markdownStart = Date.now();
    const markdownResult = await exporter.export(markdown, 'markdown');
    const markdownDuration = Date.now() - markdownStart;

    const htmlStart = Date.now();
    const htmlResult = await exporter.export(markdown, 'html', { includeStyles: true });
    const htmlDuration = Date.now() - htmlStart;

    const wechatStart = Date.now();
    const wechatResult = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      validateImages: true,
      backgroundImage: 'https://example.com/bg.jpg',
    });
    const wechatDuration = Date.now() - wechatStart;

    expect(markdownResult.content).toContain('# Enhanced Weekly');
    expect(htmlResult.content).toContain('<html');
    expect(wechatResult.content).toContain('wechat-article');

    expect(markdownDuration).toBeLessThan(500);
    expect(htmlDuration).toBeLessThan(500);
    expect(wechatDuration).toBeLessThan(500);
  });

  it('should log progress information for datasets larger than 100 items', async () => {
    await seedArticles(150);
    const configPath = path.join(testDir, 'progress-config.json');
    await createEnhancedConfig(configPath, 200);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const generator = createGenerator('info');
      const result = await generator.generate('weekly', {
        config: configPath,
        dryRun: false,
      });

      expect(result.success).toBe(true);

      const messages = infoSpy.mock.calls.map((call) => String(call[0]));
      const progressMessages = messages.filter((message) => message.includes('处理进度'));

      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages.some((message) => message.includes('1/3'))).toBe(true);
    } finally {
      infoSpy.mockRestore();
    }
  });
});
