import * as fc from 'fast-check';
import { PlatformExporter } from './PlatformExporter';

function escapeForAttribute(url: string): string {
  return url
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const safeWebUrlArbitrary = fc
  .webUrl()
  .filter((url) => !/[)\s]/.test(url));

describe('PlatformExporter Property Tests', () => {
  let exporter: PlatformExporter;

  beforeEach(() => {
    exporter = new PlatformExporter();
  });

  describe('Property 15: WeChat HTML Export Preserves Images', () => {
    it('wechat 导出应保留所有图片 URL', async () => {
      // Feature: enhanced-weekly-template, Property 15: WeChat HTML Export Preserves Images
      await fc.assert(
        fc.asyncProperty(
          fc.array(safeWebUrlArbitrary, { minLength: 1, maxLength: 5 }),
          async (urls) => {
            const markdown = urls
              .map((url, index) => `![img${index}](${url})`)
              .join('\n\n');

            const result = await exporter.export(markdown, 'wechat', {
              includeStyles: true,
              validateImages: true,
            });

            for (const url of urls) {
              const escapedUrl = escapeForAttribute(url);
              expect(result.content).toContain(escapedUrl);
            }
            expect(result.content).toContain('<img');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 16: WeChat HTML Export Includes Styles', () => {
    it('wechat 导出应包含内联样式', async () => {
      // Feature: enhanced-weekly-template, Property 16: WeChat HTML Export Includes Styles
      await fc.assert(
        fc.asyncProperty(fc.string(), async (markdown) => {
          const result = await exporter.export(markdown, 'wechat', {
            includeStyles: true,
          });

          expect(result.content).toContain('<style>');
          expect(result.content).toContain('.wechat-article');
          expect(result.content).toContain('.cg-article');
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 17: WeChat Background Image Coverage', () => {
    it('wechat 导出应包含背景图覆盖样式', async () => {
      // Feature: enhanced-weekly-template, Property 17: WeChat Background Image Coverage
      await fc.assert(
        fc.asyncProperty(safeWebUrlArbitrary, async (backgroundImage) => {
          const result = await exporter.export('# Title', 'wechat', {
            includeStyles: true,
            backgroundImage,
          });

          expect(result.content).toContain(
            `background-image: url('${escapeForAttribute(backgroundImage)}')`
          );
          expect(result.content).toContain('background-size: cover;');
          expect(result.content).toContain('background-repeat: repeat-y;');
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 18: Markdown Export Format', () => {
    it('markdown 导出应保持内容一致', async () => {
      // Feature: enhanced-weekly-template, Property 18: Markdown Export Format
      await fc.assert(
        fc.asyncProperty(fc.string(), async (markdown) => {
          const result = await exporter.export(markdown, 'markdown');
          expect(result.content).toBe(markdown);
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 19: HTML Export with Inline Styles', () => {
    it('html 导出应包含内联样式和完整文档结构', async () => {
      // Feature: enhanced-weekly-template, Property 19: HTML Export with Inline Styles
      await fc.assert(
        fc.asyncProperty(fc.string(), async (markdown) => {
          const result = await exporter.export(markdown, 'html', {
            includeStyles: true,
          });

          expect(result.content).toContain('<!DOCTYPE html>');
          expect(result.content).toContain('<html lang="zh-CN">');
          expect(result.content).toContain('<style>');
          expect(result.content).toContain('<article class="cg-article">');
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 20: Local Image Path Warnings', () => {
    it('包含本地图片路径时应返回警告', async () => {
      // Feature: enhanced-weekly-template, Property 20: Local Image Path Warnings
      const safeName = fc
        .string({ minLength: 1, maxLength: 12 })
        .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s));
      const localPathArbitrary = fc.oneof(
        safeName.map((n) => `./${n}.png`),
        safeName.map((n) => `../${n}.jpg`),
        safeName.map((n) => `/tmp/${n}.webp`),
        safeName.map((n) => `images/${n}.jpeg`)
      );

      await fc.assert(
        fc.asyncProperty(
          fc.array(localPathArbitrary, { minLength: 1, maxLength: 4 }),
          fc.array(fc.webUrl(), { maxLength: 4 }),
          async (localPaths, remoteUrls) => {
            const markdown = [
              ...localPaths.map((src, i) => `![local${i}](${src})`),
              ...remoteUrls.map((src, i) => `![remote${i}](${src})`),
            ].join('\n\n');

            const result = await exporter.export(markdown, 'wechat', {
              validateImages: true,
            });

            for (const localPath of localPaths) {
              expect(result.warnings.some((w) => w.includes(localPath))).toBe(true);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 21: Code Block Syntax Highlighting', () => {
    it('代码块应携带语言类名并包含代码样式', async () => {
      // Feature: enhanced-weekly-template, Property 21: Code Block Syntax Highlighting
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('bash', 'typescript', 'javascript', 'python', 'go'),
          fc.string({ minLength: 1, maxLength: 80 }).filter((s) => !s.includes('```')),
          async (language, code) => {
            const markdown = `\`\`\`${language}\n${code}\n\`\`\``;

            const result = await exporter.export(markdown, 'html', {
              includeStyles: true,
            });

            expect(result.content).toContain(`pre class="code-block language-${language}"`);
            expect(result.content).toContain(`class="language-${language}"`);
            expect(result.content).toContain('pre.code-block');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 22: Quote Special Styling', () => {
    it('引用内容应渲染为 blockquote 并包含特殊样式', async () => {
      // Feature: enhanced-weekly-template, Property 22: Quote Special Styling
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 60 }).filter((s) => !s.includes('\n')),
          async (quote) => {
            const markdown = `> ${quote}`;
            const result = await exporter.export(markdown, 'wechat', {
              includeStyles: true,
            });

            expect(result.content).toContain('<blockquote');
            expect(result.content).toContain('blockquote');
            expect(result.content).toContain('.wechat-article blockquote');
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
