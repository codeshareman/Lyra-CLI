import * as fc from 'fast-check';
import * as path from 'path';
import { TemplateEngine } from '../core/TemplateEngine';
import { EnhancedTemplateData } from '../types/interfaces';

const templatePath = path.join(__dirname, '../../templates/weekly.hbs');

function createBaseData(): EnhancedTemplateData {
  return {
    metadata: {
      id: '20240101120000',
      title: 'Enhanced Weekly #Property',
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
      reading: [],
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
      reading: 0,
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

describe('Weekly Unified Template Property Tests', () => {
  let templateEngine: TemplateEngine;

  beforeEach(() => {
    templateEngine = new TemplateEngine();
  });

  describe('Property 1: Template Module Structure Rendering', () => {
    it('应始终渲染模块标题，并在有数据时渲染对应内容', async () => {
      // Feature: enhanced-weekly-template, Property 1: Template Module Structure Rendering
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            weeklyUpdates: fc.boolean(),
            reading: fc.boolean(),
            tech: fc.boolean(),
            life: fc.boolean(),
            products: fc.boolean(),
            food: fc.boolean(),
            exercise: fc.boolean(),
            music: fc.boolean(),
            thoughts: fc.boolean(),
          }),
          async (enabled) => {
            const data = createBaseData();

            if (enabled.weeklyUpdates) {
              data.content.weeklyUpdates = [{ title: 'WU', path: '/wu.md', created: new Date() }];
              data.statistics.weeklyUpdates = 1;
            }
            if (enabled.reading) {
              data.content.reading = [{ title: 'R', url: 'https://example.com/r', rating: 5 }];
              data.statistics.reading = 1;
            }
            if (enabled.tech) {
              data.content.tech = [{ title: 'T', url: 'https://example.com/t', rating: 5, category: '工具' }];
              data.statistics.tech = 1;
            }
            if (enabled.life) {
              data.content.life = [{ title: 'L', images: ['https://example.com/l.jpg'], date: new Date() }];
              data.statistics.life = 1;
            }
            if (enabled.products) {
              data.content.products = [{ title: 'P', path: '/p.md', created: new Date() }];
              data.statistics.products = 1;
            }
            if (enabled.food) {
              data.content.food = [{ title: 'F', images: ['https://example.com/f.jpg'], date: new Date() }];
              data.statistics.food = 1;
            }
            if (enabled.exercise) {
              data.content.exercise = [{ type: 'Run', duration: 30, date: new Date() }];
              data.statistics.exercise = 1;
            }
            if (enabled.music) {
              data.content.music = [{ title: 'M', artist: 'A' }];
              data.statistics.music = 1;
            }
            if (enabled.thoughts) {
              data.content.thoughts = [{ title: 'TH', path: '/th.md', created: new Date() }];
              data.statistics.thoughts = 1;
            }

            const result = await templateEngine.render(templatePath, data);

            // 模块标题仅在有内容时渲染
            expect(result.includes('## 本周动态')).toBe(enabled.weeklyUpdates);
            expect(result.includes('## 精读文章')).toBe(enabled.reading);
            expect(result.includes('## 技术与生产力')).toBe(enabled.tech);
            expect(result.includes('## 生活瞬间')).toBe(enabled.life);
            expect(result.includes('## 购物与好物')).toBe(enabled.products);
            expect(result.includes('## 饮食记录')).toBe(enabled.food);
            expect(result.includes('## 运动记录')).toBe(enabled.exercise);
            expect(result.includes('## 本周旋律')).toBe(enabled.music);
            expect(result.includes('## 随感')).toBe(enabled.thoughts);

            // 有内容时应出现对应内容标识
            expect(result.includes('### WU')).toBe(enabled.weeklyUpdates);
            expect(result.includes('### [R](https://example.com/r)')).toBe(enabled.reading);
            expect(result.includes('### [T](https://example.com/t)')).toBe(enabled.tech);
            expect(result.includes('### L')).toBe(enabled.life);
            expect(result.includes('### P')).toBe(enabled.products);
            expect(result.includes('### F')).toBe(enabled.food);
            expect(result.includes('- **Run**：30分钟')).toBe(enabled.exercise);
            expect(result.includes('- **M** - A')).toBe(enabled.music);
            expect(result.includes('### TH')).toBe(enabled.thoughts);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 2: Template Module Icon Rendering', () => {
    it('启用模块时应包含对应图标标题', async () => {
      // Feature: enhanced-weekly-template, Property 2: Template Module Icon Rendering
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'weeklyUpdates',
            'reading',
            'tech',
            'life',
            'products',
            'food',
            'exercise',
            'music',
            'thoughts'
          ),
          async (moduleName) => {
            const data = createBaseData();

            switch (moduleName) {
              case 'weeklyUpdates':
                data.content.weeklyUpdates = [{ title: 'WU', path: '/wu.md', created: new Date() }];
                break;
              case 'reading':
                data.content.reading = [{ title: 'R', url: 'https://example.com/r', rating: 5 }];
                break;
              case 'tech':
                data.content.tech = [{ title: 'T', url: 'https://example.com/t', rating: 5, category: '工具' }];
                break;
              case 'life':
                data.content.life = [{ title: 'L', images: ['https://example.com/l.jpg'], date: new Date() }];
                break;
              case 'products':
                data.content.products = [{ title: 'P', path: '/p.md', created: new Date() }];
                break;
              case 'food':
                data.content.food = [{ title: 'F', images: ['https://example.com/f.jpg'], date: new Date() }];
                break;
              case 'exercise':
                data.content.exercise = [{ type: 'Run', duration: 30, date: new Date() }];
                break;
              case 'music':
                data.content.music = [{ title: 'M', artist: 'A' }];
                break;
              case 'thoughts':
                data.content.thoughts = [{ title: 'TH', path: '/th.md', created: new Date() }];
                break;
            }

            const result = await templateEngine.render(templatePath, data);

            const expectedHeadingByModule: Record<string, string> = {
              weeklyUpdates: '## 本周动态',
              reading: '## 精读文章',
              tech: '## 技术与生产力',
              life: '## 生活瞬间',
              products: '## 购物与好物',
              food: '## 饮食记录',
              exercise: '## 运动记录',
              music: '## 本周旋律',
              thoughts: '## 随感',
            };

            expect(result).toContain(expectedHeadingByModule[moduleName]);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 7: Article Cover Image Rendering', () => {
    it('文章包含 coverImage 时，应在 AI 摘要之后渲染图片', async () => {
      // Feature: enhanced-weekly-template, Property 7: Article Cover Image Rendering
      await fc.assert(
        fc.asyncProperty(fc.webUrl(), fc.boolean(), async (coverImage, withReflection) => {
          const data = createBaseData();
          const aiSummary = 'AI_SUMMARY_TOKEN';
          const personalReflection = withReflection ? 'PERSONAL_REFLECTION_TOKEN' : undefined;

          data.content.reading = [
            {
              title: 'Article One',
              url: 'https://example.com/article',
              rating: 5,
              aiSummary,
              personalReflection,
              coverImage,
            },
          ];
          data.statistics.reading = 1;

          const result = await templateEngine.render(templatePath, data);
          const imageMarkdown = `![Article One](${coverImage})`;

          expect(result).toContain(imageMarkdown);
          expect(result.indexOf(aiSummary)).toBeGreaterThan(-1);
          expect(result.indexOf(imageMarkdown)).toBeGreaterThan(result.indexOf(aiSummary));

          if (withReflection) {
            expect(result.indexOf(personalReflection!)).toBeGreaterThan(result.indexOf(aiSummary));
            expect(result.indexOf(personalReflection!)).toBeGreaterThan(result.indexOf(imageMarkdown));
          }
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 8: Code Snippet Rendering', () => {
    it('工具包含 codeSnippet 时，应渲染为 Markdown 代码块', async () => {
      // Feature: enhanced-weekly-template, Property 8: Code Snippet Rendering
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 80 }).filter((s) => !s.includes('```')),
          fc.constantFrom('bash', 'typescript', 'javascript', 'python'),
          async (codeSnippet, language) => {
            const data = createBaseData();

            data.content.tech = [
              {
                title: 'Tool One',
                url: 'https://example.com/tool',
                rating: 5,
                category: '工具',
                codeSnippet,
                language,
              },
            ];
            data.statistics.tech = 1;

            const result = await templateEngine.render(templatePath, data);
            expect(result).toContain(`\`\`\`${language}\n${codeSnippet}\n\`\`\``);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
