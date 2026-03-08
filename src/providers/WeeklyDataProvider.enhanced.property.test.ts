import * as fc from 'fast-check';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WeeklyDataProvider } from './WeeklyDataProvider';
import { HookManager } from '../core/HookManager';
import { EnhancedTemplateConfig, EnhancedTemplateData } from '../types/interfaces';

const categoryToModule: Record<string, keyof EnhancedTemplateData['content']> = {
  本周动态: 'weeklyUpdates',
  文章: 'reading',
  书籍: 'reading',
  工具: 'tech',
  代码: 'tech',
  摄影: 'life',
  生活: 'life',
  好物: 'products',
  美食: 'food',
  运动: 'exercise',
  音乐: 'music',
  随感: 'thoughts',
  思考: 'thoughts',
};

async function createEnhancedProvider(baseDir: string): Promise<{ provider: WeeklyDataProvider; config: EnhancedTemplateConfig }> {
  await fs.mkdir(path.join(baseDir, 'articles'), { recursive: true });
  await fs.mkdir(path.join(baseDir, 'tools'), { recursive: true });
  await fs.mkdir(path.join(baseDir, 'notes'), { recursive: true });

  const config: EnhancedTemplateConfig = {
    enabled: true,
    template: { path: './templates/weekly.hbs' },
    sources: {
      articles: path.join(baseDir, 'articles'),
      tools: path.join(baseDir, 'tools'),
      notes: path.join(baseDir, 'notes'),
    },
    output: {
      path: baseDir,
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

  const provider = new WeeklyDataProvider(config, new HookManager(), baseDir);
  return { provider, config };
}

describe('WeeklyDataProvider Enhanced Property Tests', () => {
  describe('Property 23: Category-to-Module Mapping', () => {
    it('should route recognized categories to the expected module', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...Object.keys(categoryToModule)), async (category) => {
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wdp-map-'));

          try {
            const { provider, config } = await createEnhancedProvider(tempDir);

            await fs.writeFile(
              path.join(tempDir, 'notes', 'mapped.md'),
              `---\ntitle: ${JSON.stringify(`mapped-${category}`)}\ncategory: ${JSON.stringify(
                category
              )}\ncreated: 2024-01-03\n---\n`,
              'utf-8'
            );

            const data = (await provider.collectData({
              date: new Date('2024-01-04'),
              config,
            })) as EnhancedTemplateData;

            const expectedModule = categoryToModule[category];
            const expectedItems = data.content[expectedModule] || [];

            expect(expectedItems.length).toBeGreaterThan(0);
            expect(expectedItems.some((item: any) => item.title === `mapped-${category}` || item.type === `mapped-${category}`)).toBe(true);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 24: Unmapped Category Fallback', () => {
    it('should route unknown categories to thoughts module', async () => {
      const known = new Set(Object.keys(categoryToModule));

      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 16 })
            .filter((v) => !known.has(v) && v.trim().length > 0),
          async (unknownCategory) => {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wdp-fallback-'));

            try {
              const { provider, config } = await createEnhancedProvider(tempDir);

              await fs.writeFile(
                path.join(tempDir, 'notes', 'unknown.md'),
                `---\ntitle: ${JSON.stringify(
                  `unknown-${unknownCategory}`
                )}\ncategory: ${JSON.stringify(
                  unknownCategory
                )}\ncreated: 2024-01-03\n---\n`,
                'utf-8'
              );

              const data = (await provider.collectData({
                date: new Date('2024-01-04'),
                config,
              })) as EnhancedTemplateData;

              expect(
                data.content.thoughts?.some((item) => item.title.startsWith('unknown-'))
              ).toBe(true);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
