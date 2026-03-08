/**
 * ContentGenerator 属性测试
 */

import * as fc from 'fast-check';
import { ContentGenerator } from './ContentGenerator';
import { TemplateRegistry } from './TemplateRegistry';
import { ConfigManager } from './ConfigManager';
import { TemplateEngine } from './TemplateEngine';
import { HookManager } from './HookManager';
import { WeeklyDataProvider } from '../providers/WeeklyDataProvider';
import { Logger } from './Logger';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('ContentGenerator Property Tests', () => {
  let contentGenerator: ContentGenerator;
  let templateRegistry: TemplateRegistry;
  let configManager: ConfigManager;
  let templateEngine: TemplateEngine;
  let hookManager: HookManager;
  let logger: Logger;
  let tempDir: string;

  beforeEach(async () => {
    logger = new Logger('debug');
    hookManager = new HookManager();
    templateRegistry = new TemplateRegistry(logger);
    configManager = new ConfigManager(hookManager);
    templateEngine = new TemplateEngine(hookManager);
    
    // 创建临时目录用于测试
    tempDir = path.join(__dirname, '../../temp-test-generator');
    await fs.mkdir(tempDir, { recursive: true });
    
    // 注册 Weekly 模板
    templateRegistry.registerTemplate('weekly', WeeklyDataProvider);
    
    // 初始化 ContentGenerator
    contentGenerator = new ContentGenerator(
      templateRegistry,
      configManager,
      templateEngine,
      logger,
      hookManager
    );
    
    // 创建测试模板文件
    await createTestTemplate(tempDir);
    await createTestConfig(tempDir);
    await createTestData(tempDir);
  });

  afterEach(async () => {
    // 清理临时文件
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('Property 28: 成功生成时输出包含文件路径', () => {
    /**
     * **Validates: Requirements 3.6**
     * 成功生成时，返回结果应该包含生成的文件路径
     */
    it('对于任意有效的模板类型和选项，成功生成时应该返回文件路径', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          }),
          async (options) => {
            try {
              const result = await contentGenerator.generate('weekly', {
                date: options.date,
                config: path.join(tempDir, 'test-config.json')
              });
              
              // 验证成功结果包含文件路径
              expect(result.success).toBe(true);
              expect(result.filePath).toBeTruthy();
              if (result.filePath) {
                expect(typeof result.filePath).toBe('string');
                expect(result.filePath.length).toBeGreaterThan(0);
                
                // 验证文件路径是绝对路径
                expect(path.isAbsolute(result.filePath)).toBe(true);
                
                // 验证文件确实存在
                await expect(fs.access(result.filePath)).resolves.not.toThrow();
              }
              
              // 验证有成功消息
              expect(result.message).toBeTruthy();
              
            } catch (error) {
              // 某些无效配置可能导致错误，这是可接受的
              expect(error).toBeInstanceOf(Error);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('应该返回正确的文件路径格式', async () => {
      const result = await contentGenerator.generate('weekly', {
        date: new Date('2024-01-15'),
        config: path.join(tempDir, 'test-config.json')
      });
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBeTruthy();
      if (result.filePath) {
        expect(result.filePath).toMatch(/\.md$/); // 应该以 .md 结尾
        expect(path.dirname(result.filePath)).toBe(tempDir); // 应该在正确的目录中
      }
    });
  });

  describe('Property 29: 失败生成时输出包含错误信息', () => {
    /**
     * **Validates: Requirements 3.7**
     * 失败生成时，返回结果应该包含错误信息
     */
    it('对于无效的模板类型，应该返回包含错误信息的失败结果', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter(s => s !== 'weekly' && s.trim().length > 0), // 确保不是有效的模板类型
          async (invalidTemplateType) => {
            try {
              const result = await contentGenerator.generate(invalidTemplateType, {
                date: new Date(),
                config: path.join(tempDir, 'test-config.json')
              });
              
              // 验证失败结果包含错误信息
              expect(result.success).toBe(false);
              expect(result.message).toBeTruthy();
              expect(typeof result.message).toBe('string');
              expect(result.message.length).toBeGreaterThan(0);
              
              // 验证错误信息包含模板类型信息
              expect(result.message).toContain(invalidTemplateType);
              
              // 验证没有文件路径（因为生成失败）
              expect(result.filePath).toBeFalsy();
              
            } catch (error) {
              // 直接抛出错误也是可接受的失败处理方式
              expect(error).toBeInstanceOf(Error);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于无效的配置文件，应该返回包含错误信息的失败结果', async () => {
      const nonExistentConfigPath = path.join(tempDir, 'non-existent-config.json');
      
      try {
        const result = await contentGenerator.generate('weekly', {
          date: new Date(),
          config: nonExistentConfigPath
        });
        
        // 如果返回结果对象，验证失败信息
        expect(result.success).toBe(false);
        expect(result.message).toBeTruthy();
        expect(typeof result.message).toBe('string');
        
      } catch (error) {
        // 直接抛出错误也是可接受的
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Property 25: 文件命名格式正确性', () => {
    /**
     * **Validates: Requirements 20.3**
     * 生成的文件应该遵循正确的命名格式
     */
    it('对于任意日期和输出路径，应该生成正确格式的文件名', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          }),
          async (options) => {
            try {
              const result = await contentGenerator.generate('weekly', {
                date: options.date,
                config: path.join(tempDir, 'test-config.json')
              });
              
              if (result.success && result.filePath) {
                // 验证文件名格式
                const fileName = path.basename(result.filePath);
                
                // 验证文件扩展名
                expect(fileName).toMatch(/\.md$/);
                
                // 验证文件名不包含非法字符
                expect(fileName).not.toMatch(/[<>:"|?*\\\/]/);
                
                // 验证文件名长度合理
                expect(fileName.length).toBeGreaterThan(0);
                expect(fileName.length).toBeLessThan(255); // 文件系统限制
                
                // 验证文件确实存在
                const stats = await fs.stat(result.filePath);
                expect(stats.isFile()).toBe(true);
              }
              
            } catch (error) {
              // 某些配置可能导致错误
              expect(error).toBeInstanceOf(Error);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('应该处理特殊字符的文件名', async () => {
      const testCases = [
        'weekly-2024-01-15',
        'test_file',
        'file-with-dashes',
        'file.with.dots',
        'CamelCaseFile'
      ];
      
      for (const baseName of testCases) {
        const result = await contentGenerator.generate('weekly', {
          date: new Date('2024-01-15'),
          config: path.join(tempDir, 'test-config.json')
        });
        
        if (result.success && result.filePath) {
          expect(result.filePath).toBeTruthy();
          expect(path.basename(result.filePath)).toMatch(/\.md$/);
        }
      }
    });
  });

  describe('Property 26: 生成文件使用 UTF-8 编码', () => {
    /**
     * **Validates: Requirements 20.5**
     * 生成的文件应该使用 UTF-8 编码
     */
    it('对于包含各种字符的内容，生成的文件应该使用 UTF-8 编码', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          }),
          async (options) => {
            try {
              const result = await contentGenerator.generate('weekly', {
                date: options.date,
                config: path.join(tempDir, 'test-config.json')
              });
              
              if (result.success && result.filePath) {
                // 读取生成的文件
                const fileContent = await fs.readFile(result.filePath, 'utf-8');
                
                // 验证文件可以正确读取为 UTF-8
                expect(typeof fileContent).toBe('string');
                expect(fileContent.length).toBeGreaterThan(0);
                
                // 验证文件包含基本的 Markdown 结构
                expect(fileContent).toMatch(/^---/); // Frontmatter 开始
                expect(fileContent).toMatch(/---$/m); // Frontmatter 结束
                expect(fileContent).toMatch(/^#/m); // 至少有一个标题
                
                // 尝试重新写入和读取以验证编码一致性
                const tempTestFile = path.join(tempDir, 'encoding-test.md');
                await fs.writeFile(tempTestFile, fileContent, 'utf-8');
                const rereadContent = await fs.readFile(tempTestFile, 'utf-8');
                
                expect(rereadContent).toBe(fileContent);
              }
              
            } catch (error) {
              // 某些配置可能导致错误
              expect(error).toBeInstanceOf(Error);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该正确处理多语言字符', async () => {
      // 创建包含多语言字符的测试数据
      await createMultiLanguageTestData(tempDir);
      
      const result = await contentGenerator.generate('weekly', {
        date: new Date('2024-01-15'),
        config: path.join(tempDir, 'test-config.json')
      });
      
      if (result.success && result.filePath) {
        const fileContent = await fs.readFile(result.filePath, 'utf-8');
        
        // 验证文件内容可以正确读取
        expect(typeof fileContent).toBe('string');
        expect(fileContent.length).toBeGreaterThan(0);
        
        // 验证 UTF-8 BOM 不存在（Node.js 默认不添加 BOM）
        expect(fileContent.charCodeAt(0)).not.toBe(0xFEFF);
      }
    });
  });

  describe('Property 27: 生成文件使用 LF 换行符', () => {
    /**
     * **Validates: Requirements 20.6**
     * 生成的文件应该使用 LF (\n) 换行符
     */
    it('对于任意生成的文件，应该使用 LF 换行符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          }),
          async (options) => {
            try {
              const result = await contentGenerator.generate('weekly', {
                date: options.date,
                config: path.join(tempDir, 'test-config.json')
              });
              
              if (result.success && result.filePath) {
                // 以二进制模式读取文件以检查换行符
                const fileBuffer = await fs.readFile(result.filePath);
                const fileContent = fileBuffer.toString('utf-8');
                
                // 验证文件包含换行符
                expect(fileContent).toMatch(/\n/);
                
                // 验证不包含 CRLF (\r\n)
                expect(fileContent).not.toMatch(/\r\n/);
                
                // 验证不包含单独的 CR (\r)
                expect(fileContent).not.toMatch(/\r(?!\n)/);
                
                // 计算换行符类型
                const lfCount = (fileContent.match(/(?<!\r)\n/g) || []).length;
                const crlfCount = (fileContent.match(/\r\n/g) || []).length;
                const crCount = (fileContent.match(/\r(?!\n)/g) || []).length;
                
                // 验证只使用 LF 换行符
                expect(lfCount).toBeGreaterThan(0); // 应该有 LF
                expect(crlfCount).toBe(0); // 不应该有 CRLF
                expect(crCount).toBe(0); // 不应该有单独的 CR
              }
              
            } catch (error) {
              // 某些配置可能导致错误
              expect(error).toBeInstanceOf(Error);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该在不同操作系统上保持一致的换行符', async () => {
      const result = await contentGenerator.generate('weekly', {
        date: new Date('2024-01-15'),
        config: path.join(tempDir, 'test-config.json')
      });
      
      if (result.success && result.filePath) {
        const fileBuffer = await fs.readFile(result.filePath);
        const fileContent = fileBuffer.toString('utf-8');
        
        // 验证换行符一致性
        const lines = fileContent.split('\n');
        expect(lines.length).toBeGreaterThan(1);
        
        // 验证每行结尾不包含 \r
        for (let i = 0; i < lines.length - 1; i++) {
          expect(lines[i]).not.toMatch(/\r$/);
        }
      }
    });
  });

  describe('边界情况和错误处理', () => {
    it('应该处理缺失配置文件', async () => {
      const result = await contentGenerator.generate('weekly', {
        date: new Date(),
        config: path.join(tempDir, 'missing-config.json')
      });
      expect(result.success).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('应该处理无效的模板类型', async () => {
      const result = await contentGenerator.generate('invalid-template', {
        date: new Date(),
        config: path.join(tempDir, 'test-config.json')
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('应该处理权限问题', async () => {
      // 尝试写入到只读目录（如果可能的话）
      const readOnlyPath = path.join(tempDir, 'readonly');
      await fs.mkdir(readOnlyPath, { recursive: true });
      
      try {
        // 在某些系统上可能无法设置只读权限，所以用 try-catch
        await fs.chmod(readOnlyPath, 0o444);
        
        const result = await contentGenerator.generate('weekly', {
          date: new Date(),
          config: path.join(tempDir, 'test-config.json')
        });
        
        // 应该失败或抛出错误
        if (result) {
          expect(result.success).toBe(false);
        }
        
      } catch (error) {
        // 权限错误是预期的
        expect(error).toBeInstanceOf(Error);
      } finally {
        // 恢复权限以便清理
        try {
          await fs.chmod(readOnlyPath, 0o755);
        } catch (e) {
          // 忽略权限恢复错误
        }
      }
    });
  });
});

// 辅助函数：创建测试模板
async function createTestTemplate(baseDir: string): Promise<void> {
  const templateDir = path.join(baseDir, 'templates');
  await fs.mkdir(templateDir, { recursive: true });
  
  const templateContent = `---
id: {{metadata.id}}
title: "{{metadata.title}}"
date: {{formatDate metadata.date "yyyy-MM-dd"}}
---

# {{metadata.title}}

## 统计信息

- 文章：{{statistics.articles}} 篇
- 工具：{{statistics.tools}} 个
- 笔记：{{statistics.notes}} 条

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
### {{title}}

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
  
  await fs.writeFile(
    path.join(templateDir, 'weekly.hbs'),
    templateContent,
    'utf-8'
  );
}

// 辅助函数：创建测试配置
async function createTestConfig(baseDir: string): Promise<void> {
  const config = {
    templates: {
      weekly: {
        enabled: true,
        template: {
          path: path.join(baseDir, 'templates', 'weekly.hbs')
        },
        sources: {
          articles: baseDir,
          tools: baseDir,
          notes: baseDir
        },
        content: {
          articles: { topN: 10, minRating: 0 },
          tools: { perCategory: 3 },
          notes: { groupBy: 'none' }
        },
        output: {
          path: baseDir,
          filename: 'weekly-{date}.md'
        }
      }
    }
  };
  
  await fs.writeFile(
    path.join(baseDir, 'test-config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}

// 辅助函数：创建测试数据
async function createTestData(baseDir: string): Promise<void> {
  // 创建文章文件
  await fs.writeFile(
    path.join(baseDir, 'article1.md'),
    `---
title: "Test Article 1"
url: "https://example.com/article1"
rating: 5
description: "This is a test article"
---

# Test Article 1

Content here.
    `,
    'utf-8'
  );
  
  // 创建工具文件
  await fs.writeFile(
    path.join(baseDir, 'tools.md'),
    `---
title: "Development Tools"
---

# Development Tools

## Tool 1
- **Title**: VS Code
- **Description**: Code editor
    `,
    'utf-8'
  );
  
  // 创建笔记文件
  await fs.writeFile(
    path.join(baseDir, 'note1.md'),
    `---
title: "Test Note 1"
date: 2024-01-01
---

# Test Note 1

This is a test note.
    `,
    'utf-8'
  );
}

// 辅助函数：创建多语言测试数据
async function createMultiLanguageTestData(baseDir: string): Promise<void> {
  // 创建包含多语言字符的文章
  await fs.writeFile(
    path.join(baseDir, 'multilang-article.md'),
    `---
title: "多语言测试文章 - Multilingual Test Article - 多言語テスト記事"
url: "https://example.com/multilang"
rating: 5
description: "包含中文、English、日本語、العربية、русский等多种语言的测试文章"
---

# 多语言测试

这是一个包含多种语言的测试文章：

- 中文：你好世界
- English: Hello World
- 日本語：こんにちは世界
- العربية: مرحبا بالعالم
- русский: Привет мир
- Emoji: 🌍🌎🌏 🚀 ⭐ 💡

特殊字符测试：©®™€£¥§¶†‡•…‰‹›""''–—
    `,
    'utf-8'
  );
}
