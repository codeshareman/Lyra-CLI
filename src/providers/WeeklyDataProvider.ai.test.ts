import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WeeklyDataProvider } from './WeeklyDataProvider';
import { HookManager } from '../core/HookManager';
import { EnhancedTemplateConfig, EnhancedTemplateData } from '../types/interfaces';
import { TemplateEngine } from '../core/TemplateEngine';

describe('WeeklyDataProvider AI Summary Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'weekly-ai-test-'));
    await fs.mkdir(path.join(tempDir, 'articles'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tools'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'notes'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createConfig(): EnhancedTemplateConfig {
    return {
      enabled: true,
      template: { path: './templates/weekly.hbs' },
      sources: {
        articles: path.join(tempDir, 'articles'),
        tools: path.join(tempDir, 'tools'),
        notes: path.join(tempDir, 'notes'),
      },
      output: {
        path: tempDir,
        filename: 'weekly-{{issueNumber}}.md',
      },
      content: {
        articles: { topN: 10, minRating: 0 },
        tools: { perCategory: 3 },
        notes: { groupBy: 'none' },
      },
      ai: {
        enabled: true,
        provider: 'mock',
        model: 'mock-model',
        apiKey: 'mock',
        summaries: {
          enabled: true,
          maxLength: 220,
          language: 'zh-CN',
        },
      },
      modules: {
        reading: { enabled: true },
      },
    };
  }

  it('should generate reading summaries within configured max length', async () => {
    const longContent = '这是一个很长的内容片段。'.repeat(80);

    await fs.writeFile(
      path.join(tempDir, 'articles', 'long-reading.md'),
      `---
title: Long Reading
url: https://example.com/long
rating: 5
category: 文章
date: 2024-01-03
---
${longContent}
`,
      'utf-8'
    );

    const config = createConfig();
    const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);

    const data = (await provider.collectData({
      date: new Date('2024-01-04'),
      config,
    })) as EnhancedTemplateData;

    expect(data.content.reading).toHaveLength(1);
    expect(data.content.reading?.[0].aiSummary).toBeDefined();
    expect((data.content.reading?.[0].aiSummary || '').length).toBeLessThanOrEqual(220);
  });

  it('should render personal reflection after AI summary in reading module', async () => {
    await fs.writeFile(
      path.join(tempDir, 'articles', 'reflection.md'),
      `---
title: Reflection Article
url: https://example.com/reflection
rating: 5
category: 文章
date: 2024-01-03
description: 这是摘要来源文本。
personalReflection: 这是个人回响内容。
---
body
`,
      'utf-8'
    );

    const config = createConfig();
    const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);
    const data = (await provider.collectData({
      date: new Date('2024-01-04'),
      config,
    })) as EnhancedTemplateData;

    const templateEngine = new TemplateEngine();
    const templatePath = path.join(__dirname, '../../templates/weekly.hbs');
    const rendered = await templateEngine.render(templatePath, data);

    const summary = data.content.reading?.[0].aiSummary || '';
    const reflection = '这是个人回响内容。';

    expect(rendered.indexOf(summary)).toBeGreaterThan(-1);
    expect(rendered.indexOf(reflection)).toBeGreaterThan(rendered.indexOf(summary));
  });

  it('should fallback to title when summary source is missing', async () => {
    await fs.writeFile(
      path.join(tempDir, 'articles', 'fallback.md'),
      `---
title: Fallback Title
url: https://example.com/fallback
rating: 5
category: 文章
date: 2024-01-03
---
`,
      'utf-8'
    );

    const config = createConfig();
    const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);

    const data = (await provider.collectData({
      date: new Date('2024-01-04'),
      config,
    })) as EnhancedTemplateData;

    expect(data.content.reading).toHaveLength(1);
    expect(data.content.reading?.[0].aiSummary).toBe('Fallback Title');
  });
});
