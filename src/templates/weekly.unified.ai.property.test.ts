import * as fc from 'fast-check';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { TemplateEngine } from '../core/TemplateEngine';
import { EnhancedTemplateData, EnhancedTemplateConfig } from '../types/interfaces';
import { WeeklyDataProvider } from '../providers/WeeklyDataProvider';
import { HookManager } from '../core/HookManager';

const templatePath = path.join(__dirname, '../../templates/weekly.hbs');

function createBaseData(summary: string, reflection?: string): EnhancedTemplateData {
  return {
    metadata: {
      id: '20240101120000',
      title: 'Enhanced Weekly #AI',
      type: 'weekly',
      issueNumber: 1,
      year: 2024,
      date: '2024-01-01',
      weekStart: '2024-01-01',
      weekEnd: '2024-01-07',
      created: '2024-01-01T12:00:00Z',
      modified: '2024-01-01T12:00:00Z',
      status: 'draft',
      tags: ['weekly'],
      publishedPlatforms: [],
    },
    content: {
      weeklyUpdates: [],
      reading: [
        {
          title: 'Reading Item',
          url: 'https://example.com/reading',
          rating: 5,
          aiSummary: summary,
          ...(reflection ? { personalReflection: reflection } : {}),
        },
      ],
      tech: [],
      life: [],
      products: [],
      food: [],
      exercise: [],
      music: [],
      thoughts: [],
    },
    statistics: {
      weeklyUpdates: 0,
      reading: 1,
      tech: 0,
      life: 0,
      products: 0,
      food: 0,
      exercise: 0,
      music: 0,
      thoughts: 0,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

describe('Weekly Unified AI Property Tests', () => {
  const safeTextArb = fc
    .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')), {
      minLength: 1,
      maxLength: 120,
    })
    .filter((text) => text.trim().length > 0);

  describe('Property 25: AI Summary Display', () => {
    it('should render AI summary in reading module', async () => {
      const engine = new TemplateEngine();

      await fc.assert(
        fc.asyncProperty(safeTextArb, async (summary) => {
          const data = createBaseData(summary);
          const rendered = await engine.render(templatePath, data);
          const escapedSummary = escapeHtml(summary);
          expect(rendered.includes(summary) || rendered.includes(escapedSummary)).toBe(true);
          expect(rendered).toContain('## 📚 精读与输入');
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 26: Personal Reflection Positioning', () => {
    it('should render personal reflection after AI summary', async () => {
      const engine = new TemplateEngine();

      await fc.assert(
        fc.asyncProperty(
          safeTextArb,
          safeTextArb,
          async (summary, reflection) => {
            const aiSummary = `AI-${summary}`;
            const personalReflection = `REF-${reflection}`;
            const data = createBaseData(aiSummary, personalReflection);
            const rendered = await engine.render(templatePath, data);

            const summaryPos = Math.max(
              rendered.indexOf(aiSummary),
              rendered.indexOf(escapeHtml(aiSummary))
            );
            const reflectionPos = Math.max(
              rendered.indexOf(personalReflection),
              rendered.indexOf(escapeHtml(personalReflection))
            );

            expect(summaryPos).toBeGreaterThan(-1);
            expect(reflectionPos).toBeGreaterThan(summaryPos);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 27: AI Summary Length Constraint', () => {
    it('should keep generated summary within configured length limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 200, max: 300 }),
          fc.string({ minLength: 350, maxLength: 800 }),
          async (maxLength, longText) => {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-len-prop-'));

            try {
              await fs.mkdir(path.join(tempDir, 'articles'), { recursive: true });
              await fs.mkdir(path.join(tempDir, 'tools'), { recursive: true });
              await fs.mkdir(path.join(tempDir, 'notes'), { recursive: true });

              await fs.writeFile(
                path.join(tempDir, 'articles', 'reading.md'),
                `---\ntitle: Long AI Input\nurl: https://example.com/long\nrating: 5\ncategory: 文章\ndate: 2024-01-03\n---\n${longText}`,
                'utf-8'
              );

              const config: EnhancedTemplateConfig = {
                enabled: true,
                ...( { templateVersion: 'enhanced' } as any),
                template: { path: './templates/weekly.hbs' },
                sources: {
                  articles: path.join(tempDir, 'articles'),
                  tools: path.join(tempDir, 'tools'),
                  notes: path.join(tempDir, 'notes'),
                },
                output: { path: tempDir, filename: 'weekly.md' },
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
                  summaries: { enabled: true, maxLength },
                },
              };

              const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);
              const data = (await provider.collectData({
                date: new Date('2024-01-04'),
                config,
              })) as EnhancedTemplateData;

              expect((data.content.reading?.[0].aiSummary || '').length).toBeLessThanOrEqual(maxLength);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property 28: AI Summary Fallback', () => {
    it('should fallback to title/description when summary generation source is insufficient', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter((title) => title.trim().length > 0),
          async (title) => {
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-fallback-prop-'));

          try {
            await fs.mkdir(path.join(tempDir, 'articles'), { recursive: true });
            await fs.mkdir(path.join(tempDir, 'tools'), { recursive: true });
            await fs.mkdir(path.join(tempDir, 'notes'), { recursive: true });

            await fs.writeFile(
              path.join(tempDir, 'articles', 'fallback.md'),
              `---\ntitle: ${JSON.stringify(title)}\nurl: https://example.com/fallback\nrating: 5\ncategory: 文章\ndate: 2024-01-03\n---\n`,
              'utf-8'
            );

            const config: EnhancedTemplateConfig = {
              enabled: true,
              ...( { templateVersion: 'enhanced' } as any),
              template: { path: './templates/weekly.hbs' },
              sources: {
                articles: path.join(tempDir, 'articles'),
                tools: path.join(tempDir, 'tools'),
                notes: path.join(tempDir, 'notes'),
              },
              output: { path: tempDir, filename: 'weekly.md' },
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
                summaries: { enabled: true, maxLength: 220 },
              },
            };

            const provider = new WeeklyDataProvider(config, new HookManager(), tempDir);
            const data = (await provider.collectData({
              date: new Date('2024-01-04'),
              config,
            })) as EnhancedTemplateData;

            const summary = data.content.reading?.[0].aiSummary || '';
            expect(summary.length).toBeGreaterThan(0);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
