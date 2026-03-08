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

describe('Enhanced Weekly E2E Integration', () => {
  let testDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enhanced-e2e-'));
    outputDir = path.join(testDir, 'output');

    for (const dir of ['articles', 'tools', 'notes', 'life', 'food', 'exercise', 'music', 'output']) {
      await fs.mkdir(path.join(testDir, dir), { recursive: true });
    }

    await seedData(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  function createGenerator() {
    const logger = new Logger('error', false);
    const hookManager = new HookManager();
    const templateRegistry = new TemplateRegistry(logger);
    const configManager = new ConfigManager(hookManager);
    const templateEngine = new TemplateEngine();

    templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

    return new ContentGenerator(templateRegistry, configManager, templateEngine, logger, hookManager);
  }

  function createEnhancedConfig(configPath: string, modules?: Record<string, any>, aiEnabled = false) {
    return fs.writeFile(
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
                path: outputDir,
                filename: 'Enhanced-Weekly-{{issueNumber}}.md',
              },
              content: {
                articles: { topN: 20, minRating: 0 },
                tools: { perCategory: 10 },
                notes: { groupBy: 'none' },
              },
              ai: aiEnabled
                ? {
                    enabled: true,
                    provider: 'mock',
                    model: 'mock-model',
                    apiKey: 'mock',
                    summaries: {
                      enabled: true,
                      maxLength: 220,
                    },
                  }
                : {
                    enabled: false,
                    provider: 'mock',
                    model: 'mock-model',
                    apiKey: 'mock',
                  },
              modules: modules || {
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

  it('should generate enhanced weekly with all modules enabled', async () => {
    const configPath = path.join(testDir, 'enhanced-config.json');
    await createEnhancedConfig(configPath);

    const generator = createGenerator();
    const result = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();

    const content = await fs.readFile(result.filePath!, 'utf-8');

    expect(content).toContain('## 📅 本周动态');
    expect(content).toContain('## 📚 精读与输入');
    expect(content).toContain('## 🛠️ 技术与生产力');
    expect(content).toContain('## 🖼️ 生活瞬间');
    expect(content).toContain('## 🍴 饮食记录');
    expect(content).toContain('## 🏸 运动记录');
    expect(content).toContain('## 🎵 本周旋律');
    expect(content).toContain('## 💬 随感');
  });

  it('should support selective module enablement', async () => {
    const configPath = path.join(testDir, 'selective-config.json');
    await createEnhancedConfig(configPath, {
      weeklyUpdates: { enabled: false },
      reading: { enabled: true },
      tech: { enabled: false },
      life: { enabled: false },
      products: { enabled: false },
      food: { enabled: false },
      exercise: { enabled: false },
      music: { enabled: false },
      thoughts: { enabled: false },
    });

    const generator = createGenerator();
    const result = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(result.filePath!, 'utf-8');

    expect(content).toContain('## 📚 精读与输入');
    expect(content).not.toContain('## 🛠️ 技术与生产力');
    expect(content).not.toContain('## 🖼️ 生活瞬间');
    expect(content).not.toContain('## 🍴 饮食记录');
  });

  it('should support multi-format export from generated markdown', async () => {
    const configPath = path.join(testDir, 'export-config.json');
    await createEnhancedConfig(configPath);

    const generator = createGenerator();
    const result = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    const markdown = await fs.readFile(result.filePath!, 'utf-8');

    const exporter = new PlatformExporter();
    const html = await exporter.export(markdown, 'html', { includeStyles: true });
    const wechat = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      validateImages: true,
      backgroundImage: 'https://example.com/bg.jpg',
    });

    expect(html.content).toContain('<html');
    expect(html.content).toContain('<style>');
    expect(wechat.content).toContain('wechat-article');
  });

  it('should integrate AI summary behavior in reading module', async () => {
    const configPath = path.join(testDir, 'ai-config.json');
    await createEnhancedConfig(configPath, undefined, true);

    const generator = createGenerator();
    const first = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });

    const second = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const firstContent = await fs.readFile(first.filePath!, 'utf-8');
    const secondContent = await fs.readFile(second.filePath!, 'utf-8');

    expect(firstContent).toContain('## 📚 精读与输入');
    expect(firstContent).toContain('个人回响');
    expect(secondContent).toContain('## 📚 精读与输入');
  });

  it('should keep legacy config usable after migration', async () => {
    const configPath = path.join(testDir, 'legacy-config.json');

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
              template: {
                path: path.join(__dirname, '../../templates/weekly.hbs'),
              },
              sources: {
                articles: path.join(testDir, 'articles'),
                tools: path.join(testDir, 'tools'),
                notes: path.join(testDir, 'notes'),
              },
              output: {
                path: outputDir,
                filename: 'Legacy-Weekly-{{issueNumber}}.md',
              },
              content: {
                articles: { topN: 10, minRating: 0 },
                tools: { perCategory: 3 },
                notes: { groupBy: 'none' },
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const generator = createGenerator();
    const result = await generator.generate('weekly', {
      config: configPath,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(result.filePath!, 'utf-8');
    expect(content).toContain('# Weekly');
  });
});

async function seedData(baseDir: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  await fs.writeFile(
    path.join(baseDir, 'articles', 'article.md'),
    `---
title: Enhanced Reading
url: https://example.com/enhanced-reading
rating: 5
category: 文章
date: ${today}
description: 这是用于增强周报的阅读摘要来源。
personalReflection: 这是我对内容的个人回响。
---
阅读正文内容。
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'tools', 'tools.md'),
    `---
category: 工具
tools:
  - title: Enhanced Tool
    url: https://example.com/tool
    rating: 5
    description: 工具描述
---
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'notes', 'update.md'),
    `---
title: Weekly Update
category: 本周动态
created: ${today}
---
本周更新内容。
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'notes', 'thought.md'),
    `---
title: Weekly Thought
category: 思考
created: ${today}
---
本周随感。
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'life', 'life.md'),
    `---
title: Life Moment
images:
  - https://example.com/life.jpg
date: ${today}
category: 生活
---
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'food', 'food.md'),
    `---
title: Food Note
images:
  - https://example.com/food.jpg
date: ${today}
category: 美食
---
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'exercise', 'exercise.md'),
    `---
type: Running
duration: 45
date: ${today}
category: 运动
---
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(baseDir, 'music', 'music.md'),
    `---
title: Song
artist: Artist
category: 音乐
---
`,
    'utf-8'
  );
}
