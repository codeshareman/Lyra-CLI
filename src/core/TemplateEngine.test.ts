import { TemplateEngine } from './TemplateEngine';
import { HookManager } from './HookManager';
import { TemplateData, HookContext } from '../types/interfaces';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;
  let tempDir: string;

  beforeEach(async () => {
    engine = new TemplateEngine();
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-engine-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('render', () => {
    it('应该渲染简单的模板', async () => {
      // 创建测试模板
      const templatePath = path.join(tempDir, 'simple.hbs');
      await fs.writeFile(templatePath, 'Hello {{metadata.name}}!', 'utf-8');

      const data: TemplateData = {
        metadata: { name: 'World' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Hello World!');
    });

    it('应该支持条件渲染', async () => {
      const templatePath = path.join(tempDir, 'conditional.hbs');
      await fs.writeFile(
        templatePath,
        '{{#if metadata.showMessage}}Message: {{metadata.message}}{{/if}}',
        'utf-8'
      );

      const data: TemplateData = {
        metadata: {
          showMessage: true,
          message: 'Hello',
        },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Message: Hello');
    });

    it('应该支持循环渲染', async () => {
      const templatePath = path.join(tempDir, 'loop.hbs');
      await fs.writeFile(
        templatePath,
        '{{#each content.items}}{{this}}\n{{/each}}',
        'utf-8'
      );

      const data: TemplateData = {
        metadata: {},
        content: {
          items: ['Item 1', 'Item 2', 'Item 3'],
        },
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Item 1\nItem 2\nItem 3\n');
    });

    it('应该缓存编译后的模板', async () => {
      const templatePath = path.join(tempDir, 'cached.hbs');
      await fs.writeFile(templatePath, 'Cached: {{metadata.value}}', 'utf-8');

      const data: TemplateData = {
        metadata: { value: 'test' },
        content: {},
        statistics: {},
      };

      // 第一次渲染
      const result1 = await engine.render(templatePath, data);
      expect(result1).toBe('Cached: test');

      // 修改模板文件（但缓存应该仍然使用旧版本）
      await fs.writeFile(templatePath, 'Modified: {{metadata.value}}', 'utf-8');

      // 第二次渲染应该使用缓存
      const result2 = await engine.render(templatePath, data);
      expect(result2).toBe('Cached: test');
    });

    it('应该保留 Dataview 代码块', async () => {
      const templatePath = path.join(tempDir, 'dataview.hbs');
      const templateContent = `# Title

\`\`\`dataview
TABLE rating FROM "Clippings"
WHERE rating > 4
\`\`\`

Content: {{metadata.text}}`;

      await fs.writeFile(templatePath, templateContent, 'utf-8');

      const data: TemplateData = {
        metadata: { text: 'Test content' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      
      expect(result).toContain('```dataview');
      expect(result).toContain('TABLE rating FROM "Clippings"');
      expect(result).toContain('WHERE rating > 4');
      expect(result).toContain('Content: Test content');
    });

    it('应该保留多个 Dataview 代码块', async () => {
      const templatePath = path.join(tempDir, 'multiple-dataview.hbs');
      const templateContent = `# Section 1

\`\`\`dataview
LIST FROM "Notes"
\`\`\`

# Section 2

\`\`\`dataview
TABLE file.name FROM "Articles"
\`\`\``;

      await fs.writeFile(templatePath, templateContent, 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      
      const dataviewBlocks = result.match(/```dataview[\s\S]*?```/g);
      expect(dataviewBlocks).toHaveLength(2);
      expect(result).toContain('LIST FROM "Notes"');
      expect(result).toContain('TABLE file.name FROM "Articles"');
    });
  });

  describe('registerHelper', () => {
    it('应该注册自定义 Helper', async () => {
      engine.registerHelper('uppercase', (str: string) => {
        return str.toUpperCase();
      });

      const templatePath = path.join(tempDir, 'custom-helper.hbs');
      await fs.writeFile(templatePath, '{{uppercase metadata.text}}', 'utf-8');

      const data: TemplateData = {
        metadata: { text: 'hello' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('HELLO');
    });

    it('应该支持带参数的自定义 Helper', async () => {
      engine.registerHelper('repeat', (str: string, times: number) => {
        return str.repeat(times);
      });

      const templatePath = path.join(tempDir, 'helper-with-args.hbs');
      await fs.writeFile(templatePath, '{{repeat metadata.char 3}}', 'utf-8');

      const data: TemplateData = {
        metadata: { char: 'A' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('AAA');
    });
  });

  describe('内置 Helpers', () => {
    describe('formatDate', () => {
      it('应该格式化日期对象', async () => {
        const templatePath = path.join(tempDir, 'format-date.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDate metadata.date "yyyy-MM-dd"}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { date: new Date('2024-01-15') },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('2024-01-15');
      });

      it('应该格式化日期字符串', async () => {
        const templatePath = path.join(tempDir, 'format-date-string.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDate metadata.dateStr "yyyy/MM/dd"}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { dateStr: '2024-01-15' },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('2024/01/15');
      });

      it('应该使用默认格式', async () => {
        const templatePath = path.join(tempDir, 'format-date-default.hbs');
        await fs.writeFile(templatePath, '{{formatDate metadata.date}}', 'utf-8');

        const data: TemplateData = {
          metadata: { date: new Date('2024-01-15') },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('2024-01-15');
      });

      it('应该处理无效日期', async () => {
        const templatePath = path.join(tempDir, 'format-date-invalid.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDate metadata.invalidDate "yyyy-MM-dd"}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { invalidDate: 'not-a-date' },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理空日期', async () => {
        const templatePath = path.join(tempDir, 'format-date-empty.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDate metadata.emptyDate "yyyy-MM-dd"}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { emptyDate: null },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });
    });

    describe('hasItems', () => {
      it('应该检测非空数组', async () => {
        const templatePath = path.join(tempDir, 'has-items.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasItems content.items)}}Has items{{else}}No items{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { items: ['item1', 'item2'] },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('Has items');
      });

      it('应该检测空数组', async () => {
        const templatePath = path.join(tempDir, 'has-items-empty.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasItems content.items)}}Has items{{else}}No items{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { items: [] },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('No items');
      });

      it('应该处理非数组值', async () => {
        const templatePath = path.join(tempDir, 'has-items-not-array.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasItems content.notArray)}}Has items{{else}}No items{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { notArray: 'not an array' },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('No items');
      });

      it('应该处理 null 值', async () => {
        const templatePath = path.join(tempDir, 'has-items-null.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasItems content.nullValue)}}Has items{{else}}No items{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { nullValue: null },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('No items');
      });
    });

    describe('renderImage', () => {
      it('应该渲染带 alt 文本的图片', async () => {
        const templatePath = path.join(tempDir, 'render-image-with-alt.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImage metadata.imageUrl "Cover Image"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { imageUrl: 'https://example.com/image.jpg' },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('![Cover Image](https://example.com/image.jpg)');
      });

      it('应该渲染不带 alt 文本的图片', async () => {
        const templatePath = path.join(tempDir, 'render-image-no-alt.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImage metadata.imageUrl}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { imageUrl: 'https://example.com/image.jpg' },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('![](https://example.com/image.jpg)');
      });

      it('应该处理空 URL', async () => {
        const templatePath = path.join(tempDir, 'render-image-empty.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImage metadata.emptyUrl "Alt"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { emptyUrl: '' },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理 null URL', async () => {
        const templatePath = path.join(tempDir, 'render-image-null.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImage metadata.nullUrl "Alt"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { nullUrl: null },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });
    });

    describe('renderImages', () => {
      it('应该渲染图片数组', async () => {
        const templatePath = path.join(tempDir, 'render-images.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImages content.images}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: {
            images: [
              'https://example.com/image1.jpg',
              'https://example.com/image2.jpg',
              'https://example.com/image3.jpg',
            ],
          },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe(
          '![](https://example.com/image1.jpg)\n\n![](https://example.com/image2.jpg)\n\n![](https://example.com/image3.jpg)'
        );
      });

      it('应该处理单个图片', async () => {
        const templatePath = path.join(tempDir, 'render-images-single.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImages content.images}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: {
            images: ['https://example.com/image.jpg'],
          },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('![](https://example.com/image.jpg)');
      });

      it('应该处理空数组', async () => {
        const templatePath = path.join(tempDir, 'render-images-empty.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImages content.images}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { images: [] },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理 null 值', async () => {
        const templatePath = path.join(tempDir, 'render-images-null.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImages content.images}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { images: null },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理非数组值', async () => {
        const templatePath = path.join(tempDir, 'render-images-not-array.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderImages content.notArray}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { notArray: 'not an array' },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });
    });

    describe('renderCode', () => {
      it('应该渲染带语言的代码块', async () => {
        const templatePath = path.join(tempDir, 'render-code-with-lang.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderCode content.code "javascript"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { code: 'const x = 42;' },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('```javascript\nconst x = 42;\n```');
      });

      it('应该渲染不带语言的代码块', async () => {
        const templatePath = path.join(tempDir, 'render-code-no-lang.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderCode content.code}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { code: 'echo "Hello World"' },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('```\necho "Hello World"\n```');
      });

      it('应该处理多行代码', async () => {
        const templatePath = path.join(tempDir, 'render-code-multiline.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderCode content.code "python"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: {
            code: 'def hello():\n    print("Hello")\n    return True',
          },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe(
          '```python\ndef hello():\n    print("Hello")\n    return True\n```'
        );
      });

      it('应该处理空代码', async () => {
        const templatePath = path.join(tempDir, 'render-code-empty.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderCode content.emptyCode "javascript"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { emptyCode: '' },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理 null 代码', async () => {
        const templatePath = path.join(tempDir, 'render-code-null.hbs');
        await fs.writeFile(
          templatePath,
          '{{{renderCode content.nullCode "javascript"}}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { nullCode: null },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });
    });

    describe('hasContent', () => {
      it('应该检测非空数组', async () => {
        const templatePath = path.join(tempDir, 'has-content.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasContent content.items)}}Has content{{else}}No content{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { items: ['item1', 'item2'] },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('Has content');
      });

      it('应该检测空数组', async () => {
        const templatePath = path.join(tempDir, 'has-content-empty.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasContent content.items)}}Has content{{else}}No content{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { items: [] },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('No content');
      });

      it('应该处理非数组值', async () => {
        const templatePath = path.join(tempDir, 'has-content-not-array.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasContent content.notArray)}}Has content{{else}}No content{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { notArray: 'not an array' },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('No content');
      });

      it('应该处理 null 值', async () => {
        const templatePath = path.join(tempDir, 'has-content-null.hbs');
        await fs.writeFile(
          templatePath,
          '{{#if (hasContent content.nullValue)}}Has content{{else}}No content{{/if}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: {},
          content: { nullValue: null },
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('No content');
      });
    });

    describe('formatDuration', () => {
      it('应该格式化小时和分钟', async () => {
        const templatePath = path.join(tempDir, 'format-duration-hours.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: 125 }, // 2小时5分钟
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('2小时5分钟');
      });

      it('应该格式化整小时', async () => {
        const templatePath = path.join(tempDir, 'format-duration-exact-hours.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: 120 }, // 2小时
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('2小时');
      });

      it('应该格式化仅分钟', async () => {
        const templatePath = path.join(tempDir, 'format-duration-minutes.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: 45 }, // 45分钟
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('45分钟');
      });

      it('应该处理 0 分钟', async () => {
        const templatePath = path.join(tempDir, 'format-duration-zero.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: 0 },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理 null 值', async () => {
        const templatePath = path.join(tempDir, 'format-duration-null.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: null },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该处理非数字值', async () => {
        const templatePath = path.join(tempDir, 'format-duration-not-number.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: 'not a number' },
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('');
      });

      it('应该格式化大时长', async () => {
        const templatePath = path.join(tempDir, 'format-duration-large.hbs');
        await fs.writeFile(
          templatePath,
          '{{formatDuration metadata.duration}}',
          'utf-8'
        );

        const data: TemplateData = {
          metadata: { duration: 1439 }, // 23小时59分钟
          content: {},
          statistics: {},
        };

        const result = await engine.render(templatePath, data);
        expect(result).toBe('23小时59分钟');
      });
    });
  });

  describe('Hook 集成', () => {
    it('应该执行 beforeRender hook', async () => {
      const hookManager = new HookManager();
      const engine = new TemplateEngine(hookManager);

      // 注册 beforeRender hook（修改数据）
      const hookPath = path.join(tempDir, 'before-render-hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return {
            ...context.data,
            metadata: {
              ...context.data.metadata,
              message: 'Modified by hook'
            }
          };
        };
        `,
        'utf-8'
      );

      hookManager.registerHook('beforeRender', hookPath);

      const templatePath = path.join(tempDir, 'with-hook.hbs');
      await fs.writeFile(templatePath, '{{metadata.message}}', 'utf-8');

      const data: TemplateData = {
        metadata: { message: 'Original message' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Modified by hook');
    });

    it('应该执行 afterRender hook', async () => {
      const hookManager = new HookManager();
      const engine = new TemplateEngine(hookManager);

      // 注册 afterRender hook（修改渲染结果）
      const hookPath = path.join(tempDir, 'after-render-hook.js');
      await fs.writeFile(
        hookPath,
        `
        module.exports = function(context) {
          return context.data + ' [Modified]';
        };
        `,
        'utf-8'
      );

      hookManager.registerHook('afterRender', hookPath);

      const templatePath = path.join(tempDir, 'with-after-hook.hbs');
      await fs.writeFile(templatePath, 'Original content', 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Original content [Modified]');
    });

    it('应该在没有 hook 时正常渲染', async () => {
      const hookManager = new HookManager();
      const engine = new TemplateEngine(hookManager);

      const templatePath = path.join(tempDir, 'no-hook.hbs');
      await fs.writeFile(templatePath, '{{metadata.message}}', 'utf-8');

      const data: TemplateData = {
        metadata: { message: 'No hooks' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('No hooks');
    });
  });

  describe('复杂场景', () => {
    it('应该渲染包含 Frontmatter 的完整模板', async () => {
      const templatePath = path.join(tempDir, 'full-template.hbs');
      const templateContent = `---
id: {{metadata.id}}
title: {{metadata.title}}
date: {{formatDate metadata.date "yyyy-MM-dd"}}
---

# {{metadata.title}}

{{#if (hasItems content.articles)}}
## 精选文章

{{#each content.articles}}
### [{{this.title}}]({{this.url}})

{{this.description}}

{{/each}}
{{/if}}

\`\`\`dataview
TABLE rating FROM "Clippings"
\`\`\``;

      await fs.writeFile(templatePath, templateContent, 'utf-8');

      const data: TemplateData = {
        metadata: {
          id: 'weekly-001',
          title: 'Weekly #1',
          date: new Date('2024-01-15'),
        },
        content: {
          articles: [
            {
              title: 'Article 1',
              url: 'https://example.com/1',
              description: 'Description 1',
            },
            {
              title: 'Article 2',
              url: 'https://example.com/2',
              description: 'Description 2',
            },
          ],
        },
        statistics: {},
      };

      const result = await engine.render(templatePath, data);

      // 验证 Frontmatter
      expect(result).toContain('id: weekly-001');
      expect(result).toContain('title: Weekly #1');
      expect(result).toContain('date: 2024-01-15');

      // 验证内容
      expect(result).toContain('# Weekly #1');
      expect(result).toContain('## 精选文章');
      expect(result).toContain('[Article 1](https://example.com/1)');
      expect(result).toContain('Description 1');
      expect(result).toContain('[Article 2](https://example.com/2)');
      expect(result).toContain('Description 2');

      // 验证 Dataview 代码块
      expect(result).toContain('```dataview');
      expect(result).toContain('TABLE rating FROM "Clippings"');
    });

    it('应该处理空内容模块', async () => {
      const templatePath = path.join(tempDir, 'empty-sections.hbs');
      const templateContent = `# Title

{{#if (hasItems content.articles)}}
## Articles
{{#each content.articles}}
- {{this.title}}
{{/each}}
{{/if}}

{{#if (hasItems content.tools)}}
## Tools
{{#each content.tools}}
- {{this.title}}
{{/each}}
{{/if}}`;

      await fs.writeFile(templatePath, templateContent, 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {
          articles: [],
          tools: [],
        },
        statistics: {},
      };

      const result = await engine.render(templatePath, data);

      // 空模块不应该显示
      expect(result).not.toContain('## Articles');
      expect(result).not.toContain('## Tools');
      expect(result).toContain('# Title');
    });
  });

  describe('错误处理和边界情况', () => {
    it('应该处理不存在的模板文件', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.hbs');
      
      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      await expect(engine.render(nonExistentPath, data)).rejects.toThrow();
    });

    it('应该处理模板语法错误', async () => {
      const templatePath = path.join(tempDir, 'syntax-error.hbs');
      await fs.writeFile(templatePath, '{{#if unclosed', 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      await expect(engine.render(templatePath, data)).rejects.toThrow();
    });

    it('应该处理空模板文件', async () => {
      const templatePath = path.join(tempDir, 'empty.hbs');
      await fs.writeFile(templatePath, '', 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('');
    });

    it('应该处理只有空白字符的模板', async () => {
      const templatePath = path.join(tempDir, 'whitespace.hbs');
      await fs.writeFile(templatePath, '   \n\t  \n  ', 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('   \n\t  \n  ');
    });

    it('应该处理包含特殊字符的模板', async () => {
      const templatePath = path.join(tempDir, 'special-chars.hbs');
      await fs.writeFile(templatePath, '特殊字符: {{metadata.text}} 🎉 & < > " \'', 'utf-8');

      const data: TemplateData = {
        metadata: { text: '测试文本' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toContain('特殊字符: 测试文本');
      expect(result).toContain('🎉');
      expect(result).toContain('& < > " \'');
    });

    it('应该处理深层嵌套的数据结构', async () => {
      const templatePath = path.join(tempDir, 'nested-data.hbs');
      await fs.writeFile(
        templatePath,
        '{{content.level1.level2.level3.value}}',
        'utf-8'
      );

      const data: TemplateData = {
        metadata: {},
        content: {
          level1: {
            level2: {
              level3: {
                value: 'Deep nested value',
              },
            },
          },
        },
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Deep nested value');
    });

    it('应该处理缺失的数据属性', async () => {
      const templatePath = path.join(tempDir, 'missing-data.hbs');
      await fs.writeFile(
        templatePath,
        'Value: {{metadata.nonexistent.property}}',
        'utf-8'
      );

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toBe('Value: ');
    });

    it('应该处理循环中的复杂数据', async () => {
      const templatePath = path.join(tempDir, 'complex-loop.hbs');
      await fs.writeFile(
        templatePath,
        `{{#each content.items}}
{{@index}}: {{this.name}} ({{this.tags.length}} tags)
{{#each this.tags}}  - {{this}}
{{/each}}
{{/each}}`,
        'utf-8'
      );

      const data: TemplateData = {
        metadata: {},
        content: {
          items: [
            {
              name: 'Item 1',
              tags: ['tag1', 'tag2'],
            },
            {
              name: 'Item 2',
              tags: ['tag3'],
            },
          ],
        },
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toContain('0: Item 1 (2 tags)');
      expect(result).toContain('  - tag1');
      expect(result).toContain('  - tag2');
      expect(result).toContain('1: Item 2 (1 tags)');
      expect(result).toContain('  - tag3');
    });

    it('应该处理条件嵌套', async () => {
      const templatePath = path.join(tempDir, 'nested-conditions.hbs');
      await fs.writeFile(
        templatePath,
        `{{#if metadata.showSection}}
{{#if (hasItems content.items)}}
Items found:
{{#each content.items}}
{{#if this.visible}}
- {{this.name}}
{{/if}}
{{/each}}
{{else}}
No items available
{{/if}}
{{else}}
Section hidden
{{/if}}`,
        'utf-8'
      );

      const data: TemplateData = {
        metadata: { showSection: true },
        content: {
          items: [
            { name: 'Visible Item', visible: true },
            { name: 'Hidden Item', visible: false },
          ],
        },
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toContain('Items found:');
      expect(result).toContain('- Visible Item');
      expect(result).not.toContain('- Hidden Item');
    });

    it('应该处理 Helper 中的错误', async () => {
      engine.registerHelper('errorHelper', () => {
        throw new Error('Helper error');
      });

      const templatePath = path.join(tempDir, 'helper-error.hbs');
      await fs.writeFile(templatePath, '{{errorHelper}}', 'utf-8');

      const data: TemplateData = {
        metadata: {},
        content: {},
        statistics: {},
      };

      await expect(engine.render(templatePath, data)).rejects.toThrow();
    });

    it('应该处理大型模板文件', async () => {
      const templatePath = path.join(tempDir, 'large-template.hbs');
      
      // 创建一个大型模板（重复内容）
      let largeTemplate = '';
      for (let i = 0; i < 1000; i++) {
        largeTemplate += `Section ${i}: {{metadata.value}}\n`;
      }
      
      await fs.writeFile(templatePath, largeTemplate, 'utf-8');

      const data: TemplateData = {
        metadata: { value: 'test' },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toContain('Section 0: test');
      expect(result).toContain('Section 999: test');
      expect(result.split('\n')).toHaveLength(1001); // 1000 lines + 1 empty line
    });

    it('应该处理 Unicode 字符', async () => {
      const templatePath = path.join(tempDir, 'unicode.hbs');
      await fs.writeFile(
        templatePath,
        '中文: {{metadata.chinese}}\n日本語: {{metadata.japanese}}\n한국어: {{metadata.korean}}\nEmoji: {{metadata.emoji}}',
        'utf-8'
      );

      const data: TemplateData = {
        metadata: {
          chinese: '你好世界',
          japanese: 'こんにちは世界',
          korean: '안녕하세요 세계',
          emoji: '🌍🚀✨',
        },
        content: {},
        statistics: {},
      };

      const result = await engine.render(templatePath, data);
      expect(result).toContain('中文: 你好世界');
      expect(result).toContain('日本語: こんにちは世界');
      expect(result).toContain('한국어: 안녕하세요 세계');
      expect(result).toContain('Emoji: 🌍🚀✨');
    });
  });
});
