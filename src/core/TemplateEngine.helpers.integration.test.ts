import { TemplateEngine } from './TemplateEngine';
import { TemplateData } from '../types/interfaces';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('TemplateEngine - Enhanced Helpers Integration', () => {
  let engine: TemplateEngine;
  let tempDir: string;

  beforeEach(async () => {
    engine = new TemplateEngine();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-helpers-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('应该在完整模板中使用所有新增的 helpers', async () => {
    const templatePath = path.join(tempDir, 'weekly.hbs');
    const templateContent = `# Weekly Report

## Cover
{{{renderImage metadata.coverImage "Weekly Cover"}}}

{{#if metadata.goldenQuote}}
> {{metadata.goldenQuote.content}}
> — {{metadata.goldenQuote.author}}
{{/if}}

{{#if (hasContent content.reading)}}
## 📚 精读与输入

{{#each content.reading}}
### {{this.title}}

{{#if this.coverImage}}
{{{renderImage this.coverImage this.title}}}
{{/if}}

{{this.summary}}

{{/each}}
{{/if}}

{{#if (hasContent content.tech)}}
## 🛠️ 技术与生产力

{{#each content.tech}}
### {{this.title}}

{{this.description}}

{{#if this.codeSnippet}}
{{{renderCode this.codeSnippet this.language}}}
{{/if}}

{{/each}}
{{/if}}

{{#if (hasContent content.life)}}
## 🖼️ 生活瞬间

{{#each content.life}}
### {{this.title}}

{{this.description}}

{{{renderImages this.images}}}

{{/each}}
{{/if}}

{{#if (hasContent content.exercise)}}
## 🏸 运动记录

{{#each content.exercise}}
- **{{this.type}}**: {{formatDuration this.duration}}{{#if this.calories}} (消耗 {{this.calories}} 卡路里){{/if}}
{{/each}}
{{/if}}`;

    await fs.writeFile(templatePath, templateContent, 'utf-8');

    const data: TemplateData = {
      metadata: {
        coverImage: 'https://example.com/cover.jpg',
        goldenQuote: {
          content: '生活不止眼前的苟且,还有诗和远方',
          author: '高晓松',
        },
      },
      content: {
        reading: [
          {
            title: '深入理解 React Hooks',
            coverImage: 'https://example.com/react-cover.jpg',
            summary: '这篇文章深入探讨了 React Hooks 的设计哲学和最佳实践。',
          },
        ],
        tech: [
          {
            title: 'Vite 快速入门',
            description: '下一代前端构建工具',
            codeSnippet: 'npm create vite@latest',
            language: 'bash',
          },
        ],
        life: [
          {
            title: '周末郊游',
            description: '阳光明媚的周末,去郊外散心',
            images: [
              'https://example.com/photo1.jpg',
              'https://example.com/photo2.jpg',
            ],
          },
        ],
        exercise: [
          {
            type: '跑步',
            duration: 45,
            calories: 350,
          },
          {
            type: '游泳',
            duration: 90,
            calories: 500,
          },
        ],
      },
      statistics: {},
    };

    const result = await engine.render(templatePath, data);

    // 验证封面图片
    expect(result).toContain('![Weekly Cover](https://example.com/cover.jpg)');

    // 验证金句
    expect(result).toContain('> 生活不止眼前的苟且,还有诗和远方');
    expect(result).toContain('> — 高晓松');

    // 验证文章封面
    expect(result).toContain('![深入理解 React Hooks](https://example.com/react-cover.jpg)');

    // 验证代码块
    expect(result).toContain('```bash\nnpm create vite@latest\n```');

    // 验证图片数组
    expect(result).toContain('![](https://example.com/photo1.jpg)');
    expect(result).toContain('![](https://example.com/photo2.jpg)');

    // 验证时长格式化
    expect(result).toContain('**跑步**: 45分钟');
    expect(result).toContain('**游泳**: 1小时30分钟');
  });

  it('应该正确处理空模块', async () => {
    const templatePath = path.join(tempDir, 'empty-modules.hbs');
    const templateContent = `# Weekly Report

{{#if (hasContent content.reading)}}
## 📚 精读与输入
{{#each content.reading}}
- {{this.title}}
{{/each}}
{{/if}}

{{#if (hasContent content.tech)}}
## 🛠️ 技术与生产力
{{#each content.tech}}
- {{this.title}}
{{/each}}
{{/if}}

{{#if (hasContent content.life)}}
## 🖼️ 生活瞬间
{{#each content.life}}
- {{this.title}}
{{/each}}
{{/if}}`;

    await fs.writeFile(templatePath, templateContent, 'utf-8');

    const data: TemplateData = {
      metadata: {},
      content: {
        reading: [],
        tech: [],
        life: [],
      },
      statistics: {},
    };

    const result = await engine.render(templatePath, data);

    // 空模块不应该显示
    expect(result).not.toContain('## 📚 精读与输入');
    expect(result).not.toContain('## 🛠️ 技术与生产力');
    expect(result).not.toContain('## 🖼️ 生活瞬间');
    expect(result).toContain('# Weekly Report');
  });

  it('应该处理缺失的可选字段', async () => {
    const templatePath = path.join(tempDir, 'optional-fields.hbs');
    const templateContent = `# Content

{{#if (hasContent content.items)}}
{{#each content.items}}
## {{this.title}}

{{#if this.coverImage}}
{{{renderImage this.coverImage}}}
{{/if}}

{{#if this.codeSnippet}}
{{{renderCode this.codeSnippet this.language}}}
{{/if}}

{{#if this.images}}
{{{renderImages this.images}}}
{{/if}}

{{#if this.duration}}
Duration: {{formatDuration this.duration}}
{{/if}}

{{/each}}
{{/if}}`;

    await fs.writeFile(templatePath, templateContent, 'utf-8');

    const data: TemplateData = {
      metadata: {},
      content: {
        items: [
          {
            title: 'Item with all fields',
            coverImage: 'https://example.com/cover.jpg',
            codeSnippet: 'console.log("hello");',
            language: 'javascript',
            images: ['https://example.com/img1.jpg'],
            duration: 60,
          },
          {
            title: 'Item with no optional fields',
          },
        ],
      },
      statistics: {},
    };

    const result = await engine.render(templatePath, data);

    // 第一个项目应该显示所有字段
    expect(result).toContain('![](https://example.com/cover.jpg)');
    expect(result).toContain('```javascript\nconsole.log("hello");\n```');
    expect(result).toContain('![](https://example.com/img1.jpg)');
    expect(result).toContain('Duration: 1小时');

    // 第二个项目应该只显示标题
    expect(result).toContain('## Item with no optional fields');
  });

  it('应该处理复杂的嵌套结构', async () => {
    const templatePath = path.join(tempDir, 'nested-structure.hbs');
    const templateContent = `# Modules

{{#each content.modules}}
## {{this.name}}

{{#if (hasContent this.items)}}
{{#each this.items}}
### {{this.title}}

{{#if this.images}}
{{{renderImages this.images}}}
{{/if}}

{{#if this.code}}
{{{renderCode this.code.snippet this.code.language}}}
{{/if}}

{{/each}}
{{else}}
No items in this module.
{{/if}}

{{/each}}`;

    await fs.writeFile(templatePath, templateContent, 'utf-8');

    const data: TemplateData = {
      metadata: {},
      content: {
        modules: [
          {
            name: 'Module 1',
            items: [
              {
                title: 'Item 1',
                images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
              },
              {
                title: 'Item 2',
                code: {
                  snippet: 'const x = 1;',
                  language: 'javascript',
                },
              },
            ],
          },
          {
            name: 'Module 2',
            items: [],
          },
        ],
      },
      statistics: {},
    };

    const result = await engine.render(templatePath, data);

    // 验证 Module 1 的内容
    expect(result).toContain('## Module 1');
    expect(result).toContain('### Item 1');
    expect(result).toContain('![](https://example.com/img1.jpg)');
    expect(result).toContain('![](https://example.com/img2.jpg)');
    expect(result).toContain('### Item 2');
    expect(result).toContain('```javascript\nconst x = 1;\n```');

    // 验证 Module 2 显示空状态
    expect(result).toContain('## Module 2');
    expect(result).toContain('No items in this module.');
  });
});
