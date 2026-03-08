import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WeeklyDataProvider } from './WeeklyDataProvider';
import { HookManager } from '../core/HookManager';
import { EnhancedTemplateData, EnhancedTemplateConfig } from '../types/interfaces';

describe('WeeklyDataProvider Enhanced Mode', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'weekly-enhanced-test-'));

    await fs.mkdir(path.join(tempDir, 'articles'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tools'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'notes'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'life'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'food'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'exercise'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'music'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should map categories to target modules and fallback unknown categories to thoughts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'articles', 'reading.md'),
      `---
title: Reading Article
url: https://example.com/read
rating: 5
category: 文章
date: 2024-01-03
---
content
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'tools', 'tools.md'),
      `---
category: 工具
tools:
  - title: Dev Tool
    url: https://example.com/tool
    rating: 5
---
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'notes', 'weekly-update.md'),
      `---
title: Weekly Update Note
category: 本周动态
created: 2024-01-02
---
update
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'notes', 'unknown-note.md'),
      `---
title: Unknown Category Note
category: 未知分类
created: 2024-01-02
---
unknown
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'life', 'life.md'),
      `---
title: Life Record
images:
  - https://example.com/life.jpg
date: 2024-01-03
category: 生活
---
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'food', 'food.md'),
      `---
title: Food Record
images:
  - https://example.com/food.jpg
date: 2024-01-03
category: 美食
---
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'exercise', 'exercise.md'),
      `---
type: Running
duration: 30
date: 2024-01-03
category: 运动
---
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'music', 'music.md'),
      `---
title: Song A
artist: Artist A
category: 音乐
---
`,
      'utf-8'
    );

    const config: EnhancedTemplateConfig = {
      enabled: true,
      template: { path: './templates/weekly.hbs' },
      sources: {
        articles: path.join(tempDir, 'articles'),
        tools: path.join(tempDir, 'tools'),
        notes: path.join(tempDir, 'notes'),
        life: path.join(tempDir, 'life'),
        food: path.join(tempDir, 'food'),
        exercise: path.join(tempDir, 'exercise'),
        music: path.join(tempDir, 'music'),
      },
      output: {
        path: tempDir,
        filename: 'weekly-{{issueNumber}}.md',
      },
      content: {
        articles: { topN: 10, minRating: 0 },
        tools: { perCategory: 5 },
        notes: { groupBy: 'none' },
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
    };

    const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);
    const data = (await provider.collectData({ date: new Date('2024-01-04'), config })) as EnhancedTemplateData;

    expect(data.content.reading?.some((item) => item.title === 'Reading Article')).toBe(true);
    expect(data.content.tech?.some((item) => item.title === 'Dev Tool')).toBe(true);
    expect(data.content.weeklyUpdates?.some((item) => item.title === 'Weekly Update Note')).toBe(true);
    expect(data.content.thoughts?.some((item) => item.title === 'Unknown Category Note')).toBe(true);

    expect(data.content.life?.some((item) => item.title === 'Life Record')).toBe(true);
    expect(data.content.food?.some((item) => item.title === 'Food Record')).toBe(true);
    expect(data.content.exercise?.some((item) => item.type === 'Running')).toBe(true);
    expect(data.content.music?.some((item) => item.title === 'Song A')).toBe(true);
  });

  it('should apply independent module filters and generate module statistics', async () => {
    await fs.writeFile(
      path.join(tempDir, 'articles', 'a1.md'),
      `---
title: High Rated
url: https://example.com/high
rating: 5
category: 文章
date: 2024-01-03
---
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'articles', 'a2.md'),
      `---
title: Low Rated
url: https://example.com/low
rating: 3
category: 文章
date: 2024-01-03
---
`,
      'utf-8'
    );

    await fs.writeFile(
      path.join(tempDir, 'notes', 't1.md'),
      `---
title: Should Be Hidden
category: 随感
created: 2024-01-03
---
`,
      'utf-8'
    );

    const config: EnhancedTemplateConfig = {
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
        tools: { perCategory: 5 },
        notes: { groupBy: 'none' },
      },
      modules: {
        reading: {
          enabled: true,
          filter: { minRating: 5 },
        },
        thoughts: {
          enabled: false,
        },
      },
    };

    const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);
    const data = (await provider.collectData({ date: new Date('2024-01-04'), config })) as EnhancedTemplateData;

    expect(data.content.reading).toHaveLength(1);
    expect(data.content.reading?.[0].title).toBe('High Rated');

    expect(data.content.thoughts).toHaveLength(0);

    expect(data.statistics.reading).toBe(data.content.reading?.length || 0);
    expect(data.statistics.thoughts).toBe(data.content.thoughts?.length || 0);
  });
});
