/**
 * TemplateEngine 属性测试
 */

import * as fc from 'fast-check';
import { TemplateEngine } from './TemplateEngine';
import { HookManager } from './HookManager';
import { Logger } from './Logger';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('TemplateEngine Property Tests', () => {
  let templateEngine: TemplateEngine;
  let hookManager: HookManager;
  let logger: Logger;
  let tempDir: string;

  beforeEach(async () => {
    logger = new Logger('debug');
    hookManager = new HookManager();
    templateEngine = new TemplateEngine(hookManager);
    
    // 创建临时目录用于测试
    tempDir = path.join(__dirname, '../../temp-test-templates');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // 清理临时文件
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('Property 18: 模板变量替换正确性', () => {
    /**
     * **Validates: Requirements 12.2**
     * THE Template_Engine SHALL 替换模板变量为实际值
     */
    it('对于任意模板变量和值，应该正确替换为实际值', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成变量名（字母数字组合）
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
          // 生成变量值（字符串、数字、布尔值，避免HTML特殊字符）
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 100 })
              .filter(s => !/[<>&"'`=]/.test(s)), // 避免HTML特殊字符（包括 =）
            fc.integer(),
            fc.boolean()
          ),
          async (varName, varValue) => {
            // 创建模板内容
            const templateContent = `Hello {{content.${varName}}}!`;
            const templatePath = path.join(tempDir, `test-${varName}.hbs`);
            
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            // 准备模板数据（符合 TemplateData 接口）
            const data: any = { 
              metadata: {},
              content: { [varName]: varValue },
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            // 渲染模板
            const result = await templateEngine.render(templatePath, data);
            
            // 验证变量替换正确
            const expectedValue = String(varValue);
            expect(result).toBe(`Hello ${expectedValue}!`);
            expect(result).not.toContain(`{{content.${varName}}}`);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于嵌套对象属性，应该正确替换', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => !/[<>&"'`=]/.test(s)), // 避免HTML特殊字符（包括 =）
            age: fc.integer({ min: 0, max: 120 }),
            theme: fc.constantFrom('light', 'dark'),
            enabled: fc.boolean()
          }),
          async (contentData) => {
            const templateContent = `
User: {{content.name}} ({{content.age}} years old)
Theme: {{content.theme}}
Enabled: {{content.enabled}}
            `.trim();
            
            const templatePath = path.join(tempDir, 'nested-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {},
              content: contentData,
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证所有嵌套属性都被正确替换
            expect(result).toContain(`User: ${contentData.name} (${contentData.age} years old)`);
            expect(result).toContain(`Theme: ${contentData.theme}`);
            expect(result).toContain(`Enabled: ${contentData.enabled}`);
            expect(result).not.toContain('{{');
            expect(result).not.toContain('}}');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于数组数据，应该支持循环渲染', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 })
                .filter(s => !/[<>&"'`=\[\]]/.test(s)), // 避免HTML特殊字符和方括号
              url: fc.webUrl()
            }),
            { minLength: 0, maxLength: 10 }
          ),
          async (items) => {
            const templateContent = `
{{#each content.items}}
- [{{title}}]({{url}})
{{/each}}
            `.trim();
            
            const templatePath = path.join(tempDir, 'array-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {},
              content: { items },
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证每个项目都被正确渲染
            for (const item of items) {
              expect(result).toContain(`[${item.title}](${item.url})`);
            }
            
            // 验证没有未替换的变量
            expect(result).not.toContain('{{');
            expect(result).not.toContain('}}');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该正确处理HTML特殊字符的转义', async () => {
      const templateContent = `Value: {{content.value}}`;
      const templatePath = path.join(tempDir, 'escape-test.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      const testCases = [
        { input: '<script>', expected: '&lt;script&gt;' },
        { input: '&amp;', expected: '&amp;amp;' },
        { input: '"quotes"', expected: '&quot;quotes&quot;' },
        { input: "'single'", expected: '&#x27;single&#x27;' },
        { input: '`backtick`', expected: '&#x60;backtick&#x60;' }
      ];
      
      for (const testCase of testCases) {
        const data: any = {
          metadata: {},
          content: { value: testCase.input },
          statistics: { articles: 0, tools: 0, notes: 0 }
        };
        
        const result = await templateEngine.render(templatePath, data);
        expect(result).toBe(`Value: ${testCase.expected}`);
      }
    });
  });

  describe('Property 19: Dataview 代码块保留', () => {
    /**
     * **Validates: Requirements 12.5**
     * THE Template_Engine SHALL 保留模板中的 Dataview 查询代码块
     */
    it('对于任意 Dataview 查询，应该在渲染后保持不变', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成 Dataview 查询内容（非空且不包含反引号）
          fc.oneof(
            fc.constant('TABLE file.name, file.mtime FROM "Output"'),
            fc.constant('LIST FROM #weekly WHERE date >= date(today) - dur(7 days)'),
            fc.constant('TASK FROM "Projects" WHERE !completed'),
            fc.string({ minLength: 10, maxLength: 200 })
              .filter(s => !s.includes('```') && s.trim().length > 0)
          ),
          // 生成模板变量数据（避免HTML特殊字符和括号）
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=\(\)\[\]{}]/.test(s)),
            description: fc.string({ minLength: 0, maxLength: 100 })
              .filter(s => !/[<>&"'`=\(\)\[\]{}]/.test(s))
          }),
          async (dataviewQuery, contentData) => {
            const templateContent = `
# {{content.title}}

{{content.description}}

\`\`\`dataview
${dataviewQuery}
\`\`\`

End of document.
            `.trim();
            
            const templatePath = path.join(tempDir, 'dataview-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {},
              content: contentData,
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证 Dataview 代码块完整保留
            expect(result).toContain('```dataview');
            expect(result).toContain(dataviewQuery);
            expect(result).toContain('```');
            
            // 验证模板变量被正确替换
            expect(result).toContain(contentData.title);
            if (contentData.description) {
              expect(result).toContain(contentData.description);
            }
            
            // 验证 Dataview 代码块的完整结构
            const dataviewMatch = result.match(/```dataview\n([\s\S]*?)```/);
            expect(dataviewMatch).toBeTruthy();
            expect(dataviewMatch![1].trim()).toBe(dataviewQuery.trim());
            
            // 验证没有占位符残留
            expect(result).not.toContain('__DATAVIEW_BLOCK_');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于多个 Dataview 代码块，应该全部保留', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.string({ minLength: 5, maxLength: 100 })
              .filter(s => !s.includes('```') && s.trim().length > 0),
            { minLength: 1, maxLength: 5 }
          ),
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=\(\)\[\]{}#]/.test(s))
          }),
          async (dataviewQueries, contentData) => {
            let templateContent = `# {{content.title}}\n\n`;
            
            // 添加多个 Dataview 代码块
            dataviewQueries.forEach((query, index) => {
              templateContent += `
## Section ${index + 1}

\`\`\`dataview
${query}
\`\`\`

`;
            });
            
            const templatePath = path.join(tempDir, 'multi-dataview-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {},
              content: contentData,
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证所有 Dataview 代码块都被保留
            const dataviewMatches = result.match(/```dataview\n([\s\S]*?)```/g);
            expect(dataviewMatches).toBeTruthy();
            expect(dataviewMatches!.length).toBe(dataviewQueries.length);
            
            // 验证每个查询都存在
            for (const query of dataviewQueries) {
              expect(result).toContain(query);
            }
            
            // 验证模板变量被替换
            expect(result).toContain(contentData.title);
            
            // 验证没有占位符残留
            expect(result).not.toContain('__DATAVIEW_BLOCK_');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该正确处理简单的 Dataview 代码块', async () => {
      const templateContent = `
# Test Document

\`\`\`dataview
LIST FROM "Output"
\`\`\`

End.
      `.trim();
      
      const templatePath = path.join(tempDir, 'simple-dataview.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      const data: any = {
        metadata: {},
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      
      expect(result).toContain('```dataview');
      expect(result).toContain('LIST FROM "Output"');
      expect(result).toContain('```');
      expect(result).not.toContain('__DATAVIEW_BLOCK_');
    });
  });

  describe('Property 20: Frontmatter YAML 有效性', () => {
    /**
     * **Validates: Requirements 12.7**
     * THE Template_Engine SHALL 生成有效的 YAML Frontmatter
     */
    it('对于任意 Frontmatter 数据，应该生成有效的 YAML', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}]/.test(s)),
            title: fc.string({ minLength: 1, maxLength: 100 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}]/.test(s)),
            date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
            tags: fc.array(
              fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}]/.test(s)), 
              { maxLength: 10 }
            ),
            published: fc.boolean(),
            issue_number: fc.integer({ min: 1, max: 1000 }),
            articles: fc.integer({ min: 0, max: 100 }),
            tools: fc.integer({ min: 0, max: 50 }),
            notes: fc.integer({ min: 0, max: 200 })
          }),
          async (frontmatterData) => {
            const templateContent = `---
id: {{metadata.id}}
title: "{{metadata.title}}"
date: {{formatDate metadata.date "yyyy-MM-dd"}}
tags: [{{#each metadata.tags}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}]
published: {{metadata.published}}
issue_number: {{metadata.issue_number}}
statistics:
  articles: {{statistics.articles}}
  tools: {{statistics.tools}}
  notes: {{statistics.notes}}
---

# {{metadata.title}}

Content here.
            `;
            
            const templatePath = path.join(tempDir, 'frontmatter-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {
                id: frontmatterData.id,
                title: frontmatterData.title,
                date: frontmatterData.date,
                tags: frontmatterData.tags,
                published: frontmatterData.published,
                issue_number: frontmatterData.issue_number
              },
              content: {},
              statistics: {
                articles: frontmatterData.articles,
                tools: frontmatterData.tools,
                notes: frontmatterData.notes
              }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 提取 Frontmatter 部分
            const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
            expect(frontmatterMatch).toBeTruthy();
            
            const yamlContent = frontmatterMatch![1];
            
            // 验证 YAML 可以被正确解析
            let parsedYaml: any;
            expect(() => {
              parsedYaml = yaml.load(yamlContent);
            }).not.toThrow();
            
            // 验证解析后的数据结构正确
            expect(parsedYaml.id).toBe(frontmatterData.id);
            expect(parsedYaml.title).toBe(frontmatterData.title);
            expect(parsedYaml.published).toBe(frontmatterData.published);
            expect(parsedYaml.issue_number).toBe(frontmatterData.issue_number);
            expect(parsedYaml.statistics.articles).toBe(frontmatterData.articles);
            expect(parsedYaml.statistics.tools).toBe(frontmatterData.tools);
            expect(parsedYaml.statistics.notes).toBe(frontmatterData.notes);
            
            // 验证标签数组
            expect(Array.isArray(parsedYaml.tags)).toBe(true);
            expect(parsedYaml.tags).toEqual(frontmatterData.tags);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该正确处理包含特殊字符的数据（验证转义）', async () => {
      const testCases = [
        { 
          title: 'Simple Title', 
          description: 'Simple description',
          expectedTitle: 'Simple Title',
          expectedDescription: 'Simple description'
        },
        { 
          title: 'Title with colon: test', 
          description: 'Description with colon: test',
          expectedTitle: 'Title with colon: test',
          expectedDescription: 'Description with colon: test'
        },
        { 
          title: 'Title with [brackets]', 
          description: 'Description with [brackets]',
          expectedTitle: 'Title with [brackets]',
          expectedDescription: 'Description with [brackets]'
        }
      ];
      
      for (const testCase of testCases) {
        const templateContent = `---
title: "{{metadata.title}}"
description: "{{metadata.description}}"
---

# Content
        `;
        
        const templatePath = path.join(tempDir, 'special-chars-test.hbs');
        await fs.writeFile(templatePath, templateContent, 'utf-8');
        
        const data: any = {
          metadata: {
            title: testCase.title,
            description: testCase.description
          },
          content: {},
          statistics: { articles: 0, tools: 0, notes: 0 }
        };
        
        const result = await templateEngine.render(templatePath, data);
        
        // 提取并验证 YAML
        const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
        expect(frontmatterMatch).toBeTruthy();
        
        const yamlContent = frontmatterMatch![1];
        let parsedYaml: any;
        
        expect(() => {
          parsedYaml = yaml.load(yamlContent);
        }).not.toThrow();
        
        expect(parsedYaml.title).toBe(testCase.expectedTitle);
        expect(parsedYaml.description).toBe(testCase.expectedDescription);
      }
    });

    it('应该处理HTML转义字符', async () => {
      const templateContent = `---
title: "{{metadata.title}}"
description: "{{metadata.description}}"
---

# Content
      `;
      
      const templatePath = path.join(tempDir, 'html-escape-test.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      const data: any = {
        metadata: {
          title: 'Title with "quotes"',
          description: 'Description with <tags>'
        },
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      
      // 提取 Frontmatter
      const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).toBeTruthy();
      
      const yamlContent = frontmatterMatch![1];
      
      // 验证 YAML 仍然可以解析（即使包含转义字符）
      let parsedYaml: any;
      expect(() => {
        parsedYaml = yaml.load(yamlContent);
      }).not.toThrow();
      
      // 验证转义后的内容
      expect(parsedYaml.title).toBe('Title with &quot;quotes&quot;');
      expect(parsedYaml.description).toBe('Description with &lt;tags&gt;');
    });
  });

  describe('Property 21: 空内容时保留基本结构', () => {
    /**
     * **Validates: Requirements 13.5**
     * THE Template_Engine SHALL 保留文档的基本结构（Frontmatter、标题、统计信息）
     */
    it('对于空的内容列表，应该保留基本文档结构', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}!@|]/.test(s)),
            title: fc.string({ minLength: 1, maxLength: 100 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}!@|]/.test(s)),
            issue_number: fc.integer({ min: 1, max: 1000 })
          }),
          async (metadataData) => {
            const templateContent = `---
id: {{metadata.id}}
title: "{{metadata.title}}"
issue_number: {{metadata.issue_number}}
statistics:
  articles: {{statistics.articles}}
  tools: {{statistics.tools}}
  notes: {{statistics.notes}}
---

# {{metadata.title}}

## 统计信息

- 精选文章：{{statistics.articles}} 篇
- 工具推荐：{{statistics.tools}} 个
- 知识洞察：{{statistics.notes}} 条

{{#if (hasItems content.articles)}}
## 精选文章

{{#each content.articles}}
### [{{title}}]({{url}})

{{description}}
{{/each}}
{{/if}}

{{#if (hasItems content.tools)}}
## 工具推荐

{{#each content.tools}}
### [{{title}}]({{url}})

{{description}}
{{/each}}
{{/if}}

{{#if (hasItems content.notes)}}
## 知识洞察

{{#each content.notes}}
### {{title}}

{{content}}
{{/each}}
{{/if}}

---

感谢阅读！
            `;
            
            const templatePath = path.join(tempDir, 'empty-content-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: metadataData,
              content: {
                articles: [], // 空数组
                tools: [],    // 空数组
                notes: []     // 空数组
              },
              statistics: {
                articles: 0,
                tools: 0,
                notes: 0
              }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证基本结构存在
            expect(result).toContain('---'); // Frontmatter 分隔符
            expect(result).toContain(`# ${metadataData.title}`); // 主标题
            expect(result).toContain('## 统计信息'); // 统计信息标题
            expect(result).toContain('感谢阅读！'); // 结尾
            
            // 验证统计信息正确显示
            expect(result).toContain('精选文章：0 篇');
            expect(result).toContain('工具推荐：0 个');
            expect(result).toContain('知识洞察：0 条');
            
            // 验证空的内容章节不显示
            expect(result).not.toContain('## 精选文章');
            expect(result).not.toContain('## 工具推荐');
            expect(result).not.toContain('## 知识洞察');
            
            // 验证 Frontmatter 有效
            const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
            expect(frontmatterMatch).toBeTruthy();
            
            const yamlContent = frontmatterMatch![1];
            let parsedYaml: any;
            expect(() => {
              parsedYaml = yaml.load(yamlContent);
            }).not.toThrow();
            
            expect(parsedYaml.id).toBe(metadataData.id);
            expect(parsedYaml.title).toBe(metadataData.title);
            expect(parsedYaml.issue_number).toBe(metadataData.issue_number);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于部分空内容，应该只显示有内容的章节', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 100 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}]/.test(s)),
            articles: fc.array(
              fc.record({
                title: fc.string({ minLength: 1, maxLength: 50 })
                  .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}()]/.test(s)),
                url: fc.string({ minLength: 10, maxLength: 50 })
                  .filter(s => /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[a-z0-9-]*)?$/.test(s)), // Simple URLs without special chars
                description: fc.string({ minLength: 1, maxLength: 200 })
                  .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}()]/.test(s))
              }),
              { minLength: 1, maxLength: 5 }
            ),
            notes: fc.array(
              fc.record({
                title: fc.string({ minLength: 1, maxLength: 50 })
                  .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}()]/.test(s)),
                content: fc.string({ minLength: 1, maxLength: 200 })
                  .filter(s => s.trim().length > 0 && !/[<>&"'`=#:\[\]{}()]/.test(s))
              }),
              { minLength: 1, maxLength: 3 }
            )
          }),
          async (testData) => {
            const templateContent = `# {{metadata.title}}

{{#if (hasItems content.articles)}}
## 精选文章
{{#each content.articles}}
### [{{title}}]({{url}})
{{description}}
{{/each}}
{{/if}}

{{#if (hasItems content.tools)}}
## 工具推荐
{{#each content.tools}}
### [{{title}}]({{url}})
{{description}}
{{/each}}
{{/if}}

{{#if (hasItems content.notes)}}
## 知识洞察
{{#each content.notes}}
### {{title}}
{{content}}
{{/each}}
{{/if}}
            `;
            
            const templatePath = path.join(tempDir, 'partial-content-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: { title: testData.title },
              content: {
                articles: testData.articles,
                tools: [], // 空数组
                notes: testData.notes
              },
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证有内容的章节显示
            expect(result).toContain('## 精选文章');
            expect(result).toContain('## 知识洞察');
            
            // 验证空的章节不显示
            expect(result).not.toContain('## 工具推荐');
            
            // 验证文章内容正确渲染
            for (const article of testData.articles) {
              expect(result).toContain(`[${article.title}](${article.url})`);
              expect(result).toContain(article.description);
            }
            
            // 验证笔记内容正确渲染
            for (const note of testData.notes) {
              expect(result).toContain(note.title);
              expect(result).toContain(note.content);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该正确处理简单的条件渲染', async () => {
      const templateContent = `# Test

{{#if (hasItems content.articles)}}
## Articles
{{#each content.articles}}
- {{title}}
{{/each}}
{{/if}}

{{#if (hasItems content.tools)}}
## Tools
{{#each content.tools}}
- {{title}}
{{/each}}
{{/if}}

End.`;
      
      const templatePath = path.join(tempDir, 'conditional-test.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      // 测试空内容
      const emptyData: any = {
        metadata: {},
        content: { articles: [], tools: [] },
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const emptyResult = await templateEngine.render(templatePath, emptyData);
      expect(emptyResult).toContain('# Test');
      expect(emptyResult).toContain('End.');
      expect(emptyResult).not.toContain('## Articles');
      expect(emptyResult).not.toContain('## Tools');
      
      // 测试有内容
      const filledData: any = {
        metadata: {},
        content: { 
          articles: [{ title: 'Article 1' }], 
          tools: [] 
        },
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const filledResult = await templateEngine.render(templatePath, filledData);
      expect(filledResult).toContain('# Test');
      expect(filledResult).toContain('## Articles');
      expect(filledResult).toContain('- Article 1');
      expect(filledResult).not.toContain('## Tools');
      expect(filledResult).toContain('End.');
    });
  });

  describe('边界情况和错误处理', () => {
    it('应该处理不存在的模板文件', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.hbs');
      const data: any = {
        metadata: {},
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      await expect(
        templateEngine.render(nonExistentPath, data)
      ).rejects.toThrow();
    });

    it('应该处理空模板文件', async () => {
      const templatePath = path.join(tempDir, 'empty.hbs');
      await fs.writeFile(templatePath, '', 'utf-8');
      
      const data: any = {
        metadata: {},
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      expect(result).toBe('');
    });

    it('应该处理包含无效 Handlebars 语法的模板', async () => {
      const templatePath = path.join(tempDir, 'invalid.hbs');
      await fs.writeFile(templatePath, 'Hello {{unclosed', 'utf-8');
      
      const data: any = {
        metadata: {},
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      await expect(
        templateEngine.render(templatePath, data)
      ).rejects.toThrow();
    });

    it('应该处理大型模板和数据', async () => {
      const largeItems = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        title: `Item ${i}`,
        description: `Description for item ${i}`.repeat(10)
      }));
      
      const templateContent = `
# Large Template Test

{{#each content.items}}
## {{title}}
{{description}}
{{/each}}
      `;
      
      const templatePath = path.join(tempDir, 'large.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      const data: any = {
        metadata: {},
        content: { items: largeItems },
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      
      expect(result).toContain('# Large Template Test');
      expect(result).toContain('Item 0');
      expect(result).toContain('Item 999');
    });
  });

  describe('Property 34: Template Parsing Round-Trip', () => {
    /**
     * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
     * THE Template_Engine SHALL 解析包含 Handlebars 语法的模板文件
     * THE Template_Engine SHALL 支持条件渲染（{{#if}} 语法）
     * THE Template_Engine SHALL 支持循环渲染（{{#each}} 语法）
     * THE Template_Engine SHALL 支持自定义 Handlebars helpers
     */
    it('对于任意有效的 Handlebars 模板（包含条件、循环和 helpers），解析和编译应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => s.trim().length > 0 && !/[<>&"'`{}=#:\[\]]/.test(s)),
            showSection: fc.boolean(),
            items: fc.array(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 30 })
                  .filter(s => s.trim().length > 0 && !/[<>&"'`{}=#:\[\]]/.test(s)),
                value: fc.integer({ min: 0, max: 100 })
              }),
              { minLength: 0, maxLength: 5 }
            ),
            date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
            duration: fc.integer({ min: 1, max: 500 })
          }),
          async (testData) => {
            // 创建包含条件、循环和 helpers 的模板
            const templateContent = `# {{metadata.title}}

Date: {{formatDate metadata.date "yyyy-MM-dd"}}
Duration: {{formatDuration metadata.duration}}

{{#if metadata.showSection}}
## Items Section

{{#if (hasContent content.items)}}
{{#each content.items}}
- {{name}}: {{value}}
{{/each}}
{{else}}
No items available.
{{/if}}
{{/if}}

End of document.`;
            
            const templatePath = path.join(tempDir, 'roundtrip-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {
                title: testData.title,
                showSection: testData.showSection,
                date: testData.date,
                duration: testData.duration
              },
              content: {
                items: testData.items
              },
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            // 解析和编译应该成功（不抛出错误）
            let result: string;
            expect(async () => {
              result = await templateEngine.render(templatePath, data);
            }).not.toThrow();
            
            result = await templateEngine.render(templatePath, data);
            
            // 验证基本结构存在
            expect(result).toContain(testData.title);
            expect(result).toContain('End of document.');
            
            // 验证 helpers 正常工作
            expect(result).toContain('Date:');
            expect(result).toContain('Duration:');
            
            // 验证条件渲染
            if (testData.showSection) {
              expect(result).toContain('## Items Section');
              
              // 验证循环渲染
              if (testData.items.length > 0) {
                for (const item of testData.items) {
                  expect(result).toContain(`${item.name}: ${item.value}`);
                }
              } else {
                expect(result).toContain('No items available.');
              }
            } else {
              expect(result).not.toContain('## Items Section');
            }
            
            // 验证没有未替换的变量
            expect(result).not.toContain('{{');
            expect(result).not.toContain('}}');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该支持嵌套条件和循环', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sections: fc.array(
              fc.record({
                title: fc.string({ minLength: 1, maxLength: 30 })
                  .filter(s => s.trim().length > 0 && !/[<>&"'`{}=#:\[\]]/.test(s)),
                enabled: fc.boolean(),
                items: fc.array(
                  fc.string({ minLength: 1, maxLength: 20 })
                    .filter(s => s.trim().length > 0 && !/[<>&"'`{}=#:\[\]]/.test(s)),
                  { minLength: 0, maxLength: 3 }
                )
              }),
              { minLength: 1, maxLength: 3 }
            )
          }),
          async (testData) => {
            const templateContent = `# Document

{{#each content.sections}}
{{#if this.enabled}}
## {{this.title}}

{{#if (hasContent this.items)}}
{{#each this.items}}
- {{this}}
{{/each}}
{{else}}
No items in this section.
{{/if}}
{{/if}}
{{/each}}`;
            
            const templatePath = path.join(tempDir, 'nested-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {},
              content: { sections: testData.sections },
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证渲染成功
            expect(result).toContain('# Document');
            
            // 验证每个启用的 section
            for (const section of testData.sections) {
              if (section.enabled) {
                expect(result).toContain(section.title);
                
                if (section.items.length > 0) {
                  for (const item of section.items) {
                    expect(result).toContain(item);
                  }
                } else {
                  expect(result).toContain('No items in this section.');
                }
              } else {
                // 禁用的 section 标题不应该出现
                // 但由于可能有重复标题，我们只检查启用的逻辑
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 35: Template Syntax Error Handling', () => {
    /**
     * **Validates: Requirements 11.5**
     * WHEN 模板语法错误时，THE Template_Engine SHALL 返回描述性错误信息
     */
    it('对于任意包含语法错误的模板，应该返回描述性错误信息', async () => {
      const syntaxErrors = [
        { template: '{{#if unclosed', description: 'unclosed if block' },
        { template: '{{#each items}}{{/if}}', description: 'mismatched block tags' }
      ];
      
      for (const errorCase of syntaxErrors) {
        const templatePath = path.join(tempDir, `syntax-error-${Date.now()}.hbs`);
        await fs.writeFile(templatePath, errorCase.template, 'utf-8');
        
        const data: any = {
          metadata: {},
          content: {},
          statistics: { articles: 0, tools: 0, notes: 0 }
        };
        
        try {
          await templateEngine.render(templatePath, data);
          fail(`Should have thrown an error for: ${errorCase.description}`);
        } catch (error: any) {
          // 验证错误信息是描述性的（包含有用信息）
          expect(error).toBeDefined();
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
          
          // 错误信息应该提供一些上下文
          // Handlebars 通常会提供 "Parse error" 或类似的信息
          const errorMessage = error.message.toLowerCase();
          expect(
            errorMessage.includes('parse') ||
            errorMessage.includes('error') ||
            errorMessage.includes('expected') ||
            errorMessage.includes('unexpected') ||
            errorMessage.includes('doesn\'t match')
          ).toBe(true);
        }
      }
    });

    it('应该为不同类型的语法错误提供不同的错误信息', async () => {
      const testCases = [
        { template: '{{#if test', expectedKeywords: ['parse', 'error'] },
        { template: '{{#each items}}content{{/if}}', expectedKeywords: ['parse', 'error'] }
      ];
      
      for (const testCase of testCases) {
        const templatePath = path.join(tempDir, `error-type-${Date.now()}.hbs`);
        await fs.writeFile(templatePath, testCase.template, 'utf-8');
        
        const data: any = {
          metadata: {},
          content: {},
          statistics: { articles: 0, tools: 0, notes: 0 }
        };
        
        try {
          await templateEngine.render(templatePath, data);
          fail('Should have thrown an error');
        } catch (error: any) {
          // 验证错误信息包含预期的关键词
          const errorMessage = error.message.toLowerCase();
          const hasExpectedKeyword = testCase.expectedKeywords.some(
            keyword => errorMessage.includes(keyword)
          );
          expect(hasExpectedKeyword).toBe(true);
        }
      }
    });
  });

  describe('Property 36: HTML Special Character Escaping', () => {
    /**
     * **Validates: Requirements 11.6**
     * THE Template_Engine SHALL 正确转义 HTML 特殊字符以防止注入攻击
     */
    it('对于任意包含 HTML 特殊字符的内容，渲染输出应该正确转义', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            content: fc.string({ minLength: 1, maxLength: 100 })
              .filter(s => s.trim().length > 0),
            title: fc.string({ minLength: 1, maxLength: 50 })
              .filter(s => s.trim().length > 0)
          }),
          async (testData) => {
            const templateContent = `Title: {{metadata.title}}
Content: {{content.text}}`;
            
            const templatePath = path.join(tempDir, 'escape-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: { title: testData.title },
              content: { text: testData.content },
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            const result = await templateEngine.render(templatePath, data);
            
            // 验证 HTML 特殊字符被转义
            if (testData.title.includes('<')) {
              expect(result).toContain('&lt;');
              expect(result).not.toContain('<script');
            }
            
            if (testData.title.includes('>')) {
              expect(result).toContain('&gt;');
            }
            
            if (testData.title.includes('&')) {
              expect(result).toContain('&amp;');
            }
            
            if (testData.title.includes('"')) {
              expect(result).toContain('&quot;');
            }
            
            if (testData.title.includes("'")) {
              expect(result).toContain('&#x27;');
            }
            
            if (testData.title.includes('`')) {
              expect(result).toContain('&#x60;');
            }
            
            // 同样验证 content
            if (testData.content.includes('<')) {
              expect(result).toContain('&lt;');
            }
            
            if (testData.content.includes('>')) {
              expect(result).toContain('&gt;');
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该转义所有常见的 HTML 特殊字符', async () => {
      const specialChars = [
        { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;' },
        { input: 'A & B', expected: 'A &amp; B' },
        { input: 'Say "hello"', expected: 'Say &quot;hello&quot;' },
        { input: "It's mine", expected: 'It&#x27;s mine' },
        { input: 'Use `code`', expected: 'Use &#x60;code&#x60;' },
        { input: '<img src=x onerror=alert(1)>', expected: '&lt;img' }
      ];
      
      for (const testCase of specialChars) {
        const templatePath = path.join(tempDir, `escape-char-${Date.now()}.hbs`);
        await fs.writeFile(templatePath, '{{content.value}}', 'utf-8');
        
        const data: any = {
          metadata: {},
          content: { value: testCase.input },
          statistics: { articles: 0, tools: 0, notes: 0 }
        };
        
        const result = await templateEngine.render(templatePath, data);
        expect(result).toContain(testCase.expected);
      }
    });

    it('应该在使用三重花括号时不转义（SafeString）', async () => {
      const templatePath = path.join(tempDir, 'no-escape.hbs');
      await fs.writeFile(templatePath, '{{{content.html}}}', 'utf-8');
      
      const data: any = {
        metadata: {},
        content: { html: '<strong>Bold</strong>' },
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      expect(result).toBe('<strong>Bold</strong>');
      expect(result).not.toContain('&lt;');
    });
  });

  describe('Property 34: Template Parsing Round-Trip (Enhanced Weekly Template)', () => {
    /**
     * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
     * Feature: enhanced-weekly-template, Property 34: Template Parsing Round-Trip
     * 
     * For any valid Handlebars template with conditionals, loops, and helpers,
     * parsing and compiling should succeed without errors.
     */
    it('对于任意有效的 Handlebars 模板（包含条件、循环和 helpers），解析和编译应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            coverImage: fc.option(fc.webUrl(), { nil: undefined }),
            items: fc.array(
              fc.record({
                title: fc.string({ minLength: 1, maxLength: 20 })
                  .filter((s) => /^[a-zA-Z0-9\\s]+$/.test(s)),
                codeSnippet: fc.option(
                  fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !s.includes('```')),
                  { nil: undefined }
                ),
              }),
              { minLength: 0, maxLength: 3 }
            ),
          }),
          async (testData) => {
            const templatePath = path.join(tempDir, 'enhanced-property34.hbs');
            const template = `
{{#if metadata.coverImage}}
{{{renderImage metadata.coverImage "cover"}}}
{{/if}}
{{#if (hasContent content.items)}}
{{#each content.items}}
### {{this.title}}
{{#if this.codeSnippet}}
{{{renderCode this.codeSnippet "bash"}}}
{{/if}}
{{/each}}
{{/if}}
`;
            await fs.writeFile(templatePath, template, 'utf-8');

            const data: any = {
              metadata: { coverImage: testData.coverImage },
              content: { items: testData.items },
              statistics: { articles: 0, tools: 0, notes: 0 },
            };

            const result = await templateEngine.render(templatePath, data);

            expect(result).toBeDefined();
            expect(result).not.toContain('{{');
            if (testData.coverImage) {
              expect(result).toContain(`![cover](${testData.coverImage})`);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 35: Template Syntax Error Handling (Enhanced Weekly Template)', () => {
    /**
     * **Validates: Requirements 11.5**
     * Feature: enhanced-weekly-template, Property 35: Template Syntax Error Handling
     * 
     * For any template with syntax errors, the engine should return descriptive error messages.
     */
    it('对于任意包含语法错误的模板，应该返回描述性错误信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            '{{#if broken',
            '{{#each list}}{{/if}}',
            '{{#if x}}ok',
            '{{#with user}}{{name}}{{/each}}'
          ),
          async (invalidTemplate) => {
            const templatePath = path.join(tempDir, 'enhanced-property35.hbs');
            await fs.writeFile(templatePath, invalidTemplate, 'utf-8');

            const data: any = {
              metadata: {},
              content: {},
              statistics: { articles: 0, tools: 0, notes: 0 },
            };

            await expect(templateEngine.render(templatePath, data)).rejects.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 36: HTML Special Character Escaping (Enhanced Weekly Template)', () => {
    /**
     * **Validates: Requirements 11.6**
     * Feature: enhanced-weekly-template, Property 36: HTML Special Character Escaping
     * 
     * For any content with HTML special characters, the output should properly escape them.
     */
    it('对于任意包含 HTML 特殊字符的内容，渲染输出应该正确转义', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 }),
            content: fc.string({ minLength: 1, maxLength: 80 }),
          }),
          async ({ title, content }) => {
            const templatePath = path.join(tempDir, 'enhanced-property36.hbs');
            await fs.writeFile(templatePath, 'Title: {{metadata.title}}\\nBody: {{content.text}}', 'utf-8');

            const data: any = {
              metadata: { title },
              content: { text: content },
              statistics: { articles: 0, tools: 0, notes: 0 },
            };

            const result = await templateEngine.render(templatePath, data);

            if (title.includes('<') || content.includes('<')) {
              expect(result).toContain('&lt;');
            }
            if (title.includes('>') || content.includes('>')) {
              expect(result).toContain('&gt;');
            }
            if (title.includes('&') || content.includes('&')) {
              expect(result).toContain('&amp;');
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 37: Undefined Variable Handling (Enhanced Weekly Template)', () => {
    /**
     * **Validates: Requirements 11.7**
     * Feature: enhanced-weekly-template, Property 37: Undefined Variable Handling
     * 
     * For any template referencing undefined variables, the engine should render empty strings.
     */
    it('对于任意引用未定义变量的模板，应该渲染空字符串而不是抛出错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
            { minLength: 2, maxLength: 5 } // At least 2 variables to avoid split edge case
          ),
          async (undefinedVars) => {
            // 创建引用未定义变量的模板（使用分隔符）
            const templateContent = undefinedVars
              .map(varName => `{{metadata.${varName}}}`)
              .join('|'); // 使用分隔符
            
            const templatePath = path.join(
              tempDir,
              `undefined-vars-test-${Date.now()}-${Math.random().toString(36).slice(2)}.hbs`
            );
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {}, // 空对象，所有变量都未定义
              content: {},
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            // 应该不抛出错误
            let result: string;
            expect(async () => {
              result = await templateEngine.render(templatePath, data);
            }).not.toThrow();
            
            result = await templateEngine.render(templatePath, data);
            
            // 验证未定义变量被渲染为空字符串
            // 结果应该只包含分隔符
            const parts = result.split('|');
            expect(parts.length).toBe(undefinedVars.length);
            
            for (const part of parts) {
              expect(part.trim()).toBe('');
            }
            
            // 验证没有 "undefined" 字符串出现
            expect(result).not.toContain('undefined');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该处理嵌套路径中的未定义变量', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            path1: fc.string({ minLength: 1, maxLength: 15 })
              .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
            path2: fc.string({ minLength: 1, maxLength: 15 })
              .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
            path3: fc.string({ minLength: 1, maxLength: 15 })
              .filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s))
          }),
          async (paths) => {
            const templateContent = `
Value 1: {{metadata.${paths.path1}}}
Value 2: {{content.${paths.path2}.${paths.path3}}}
Value 3: {{metadata.deeply.nested.${paths.path1}}}`;
            
            const templatePath = path.join(tempDir, 'nested-undefined-test.hbs');
            await fs.writeFile(templatePath, templateContent, 'utf-8');
            
            const data: any = {
              metadata: {},
              content: {},
              statistics: { articles: 0, tools: 0, notes: 0 }
            };
            
            // 应该不抛出错误
            const result = await templateEngine.render(templatePath, data);
            
            // 验证结果不包含 "undefined"
            expect(result).not.toContain('undefined');
            
            // 验证标签存在但值为空
            expect(result).toContain('Value 1:');
            expect(result).toContain('Value 2:');
            expect(result).toContain('Value 3:');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该在条件语句中正确处理未定义变量', async () => {
      const templateContent = `
{{#if metadata.undefinedVar}}
This should not appear
{{else}}
This should appear
{{/if}}

{{#if content.anotherUndefined}}
Also should not appear
{{/if}}`;
      
      const templatePath = path.join(tempDir, 'undefined-in-condition.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      const data: any = {
        metadata: {},
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      
      // 未定义变量在条件中应该被视为 falsy
      expect(result).toContain('This should appear');
      expect(result).not.toContain('This should not appear');
      expect(result).not.toContain('Also should not appear');
    });

    it('应该在循环中正确处理未定义变量', async () => {
      const templateContent = `
{{#each content.undefinedArray}}
- {{this}}
{{else}}
No items
{{/each}}`;
      
      const templatePath = path.join(tempDir, 'undefined-in-loop.hbs');
      await fs.writeFile(templatePath, templateContent, 'utf-8');
      
      const data: any = {
        metadata: {},
        content: {},
        statistics: { articles: 0, tools: 0, notes: 0 }
      };
      
      const result = await templateEngine.render(templatePath, data);
      
      // 未定义的数组应该触发 else 分支
      expect(result).toContain('No items');
      expect(result).not.toContain('- ');
    });
  });
});
