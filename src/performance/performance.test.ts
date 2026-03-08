import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ContentGenerator } from '../core/ContentGenerator';
import { TemplateRegistry } from '../core/TemplateRegistry';
import { ConfigManager } from '../core/ConfigManager';
import { TemplateEngine } from '../core/TemplateEngine';
import { WeeklyDataProvider } from '../providers/WeeklyDataProvider';
import { Logger } from '../core/Logger';
import { HookManager } from '../core/HookManager';

/**
 * **Performance Tests**
 * **Validates: Requirements 19.1**
 * 
 * 验证系统在大量文件情况下的性能表现，
 * 确保生成时间在可接受范围内（< 5秒）。
 */
describe('性能测试', () => {
  let tempDir: string;
  let tempFiles: string[] = [];
  let contentGenerator: ContentGenerator;
  const weeklyTemplatePath = path.join(__dirname, '../../templates/weekly.hbs');

  beforeAll(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-test-'));

    // 初始化组件
    const logger = new Logger('error');
    const registry = new TemplateRegistry(logger);
    const configManager = new ConfigManager();
    const templateEngine = new TemplateEngine();
    const hookManager = new HookManager();

    // 注册 Weekly 模板
    registry.registerTemplate('weekly', WeeklyDataProvider);

    contentGenerator = new ContentGenerator(registry, configManager, templateEngine, logger, hookManager);
  });

  afterAll(async () => {
    // 清理临时文件
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // 忽略删除错误
      }
    }

    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略删除错误
    }
  });

  function createWeeklyConfig(
    sources: {
      articles: any;
      tools: any;
      notes: any;
    },
    filename: string
  ) {
    return {
      global: {
        logLevel: 'error',
        defaultTemplate: 'weekly'
      },
      templates: {
        weekly: {
          enabled: true,
          template: {
            path: weeklyTemplatePath
          },
          sources: {
            articles: sources.articles,
            clippings: sources.articles,
            tools: sources.tools,
            notes: sources.notes,
            permanentNotes: sources.notes
          },
          content: {
            articles: {
              topN: 100,
              minRating: 0
            },
            tools: {
              perCategory: 10
            },
            notes: {
              groupBy: 'none'
            }
          },
          output: {
            path: tempDir,
            filename
          },
          ai: {
            enabled: false
          }
        }
      }
    };
  }

  /**
   * 创建测试文件
   */
  async function createTestFiles(count: number): Promise<string[]> {
    const files: string[] = [];
    
    // 创建文章目录
    const articlesDir = path.join(tempDir, 'articles');
    await fs.mkdir(articlesDir, { recursive: true });

    // 创建工具目录
    const toolsDir = path.join(tempDir, 'tools');
    await fs.mkdir(toolsDir, { recursive: true });

    // 创建笔记目录
    const notesDir = path.join(tempDir, 'notes');
    await fs.mkdir(notesDir, { recursive: true });

    // 创建文章文件
    const articleCount = Math.floor(count * 0.4);
    for (let i = 0; i < articleCount; i++) {
      const fileName = `article-${i}.md`;
      const filePath = path.join(articlesDir, fileName);
      const content = `---
title: 测试文章 ${i}
rating: ${Math.floor(Math.random() * 10) + 1}
url: https://example.com/article-${i}
description: 这是第 ${i} 篇测试文章的描述
tags: [技术, 测试]
date: 2024-01-${String(i % 28 + 1).padStart(2, '0')}
---

# 测试文章 ${i}

这是一篇用于性能测试的文章内容。文章包含了足够的文本来模拟真实的文章长度。

## 主要内容

文章的主要内容包括：
- 技术介绍
- 实现细节
- 使用示例
- 最佳实践

## 结论

这篇文章展示了如何进行性能测试，确保系统在大量数据下仍能保持良好的性能表现。

内容长度：${Math.random().toString(36).repeat(50)}
`;

      await fs.writeFile(filePath, content, 'utf8');
      files.push(filePath);
      tempFiles.push(filePath);
    }

    // 创建工具文件
    const toolCount = Math.floor(count * 0.3);
    for (let i = 0; i < toolCount; i++) {
      const category = ['开发工具', '设计工具', '效率工具'][i % 3];
      const categoryDir = path.join(toolsDir, category);
      await fs.mkdir(categoryDir, { recursive: true });

      const fileName = `tool-${i}.md`;
      const filePath = path.join(categoryDir, fileName);
      const content = `---
title: 测试工具 ${i}
rating: ${Math.floor(Math.random() * 10) + 1}
url: https://example.com/tool-${i}
description: 这是第 ${i} 个测试工具的描述
category: ${category}
tags: [工具, 测试]
---

# 测试工具 ${i}

这是一个用于性能测试的工具介绍。

## 功能特性

- 功能 1：高性能处理
- 功能 2：易于使用
- 功能 3：跨平台支持

## 使用方法

\`\`\`bash
npm install test-tool-${i}
\`\`\`

工具描述：${Math.random().toString(36).repeat(30)}
`;

      await fs.writeFile(filePath, content, 'utf8');
      files.push(filePath);
      tempFiles.push(filePath);
    }

    // 创建笔记文件
    const noteCount = Math.floor(count * 0.3);
    for (let i = 0; i < noteCount; i++) {
      const fileName = `note-${i}.md`;
      const filePath = path.join(notesDir, fileName);
      const content = `---
title: 测试笔记 ${i}
tags: [笔记, 测试]
date: 2024-01-${String(i % 28 + 1).padStart(2, '0')}
category: 学习笔记
---

# 测试笔记 ${i}

这是第 ${i} 篇测试笔记。

## 学习要点

1. 要点一：性能优化的重要性
2. 要点二：测试驱动开发
3. 要点三：代码质量保证

## 思考

通过这次学习，我了解到了性能测试的重要性。

笔记内容：${Math.random().toString(36).repeat(40)}
`;

      await fs.writeFile(filePath, content, 'utf8');
      files.push(filePath);
      tempFiles.push(filePath);
    }

    return files;
  }

  /**
   * 创建测试配置
   */
  async function createTestConfig(): Promise<string> {
    const configPath = path.join(tempDir, '.content-generator.json');
    const config = createWeeklyConfig(
      {
        articles: {
          path: path.join(tempDir, 'articles'),
          include: ['**/*.md'],
          exclude: []
        },
        tools: {
          path: path.join(tempDir, 'tools'),
          include: ['**/*.md'],
          exclude: []
        },
        notes: {
          path: path.join(tempDir, 'notes'),
          include: ['**/*.md'],
          exclude: []
        }
      },
      'weekly-{date}.md'
    );

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    tempFiles.push(configPath);
    return configPath;
  }

  it('应该在 5 秒内处理 1000 个文件', async () => {
    // 创建 1000 个测试文件
    console.log('创建 1000 个测试文件...');
    const files = await createTestFiles(1000);
    expect(files.length).toBeGreaterThanOrEqual(1000);

    // 创建配置文件
    const configPath = await createTestConfig();

    // 记录开始时间
    const startTime = Date.now();

    // 执行生成
    console.log('开始性能测试...');
    const result = await contentGenerator.generate('weekly', {
      config: configPath,
      date: new Date('2024-01-15'),
      dryRun: false
    });

    // 记录结束时间
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`性能测试完成，耗时: ${duration}ms`);

    // 验证结果
    expect(result.success).toBe(true);
    expect(result.statistics).toBeDefined();

    // 验证性能要求：< 5 秒 (5000ms)
    expect(duration).toBeLessThan(5000);

    // 验证处理了预期数量的文件
    if (result.statistics) {
      const totalProcessed = 
        (result.statistics.articles || 0) + 
        (result.statistics.tools || 0) + 
        (result.statistics.notes || 0);
      
      expect(totalProcessed).toBeGreaterThan(0);
      console.log(`处理的文件数量: ${totalProcessed}`);
    }
  }, 10000); // 10秒超时

  it('应该在处理大量文件时保持内存使用合理', async () => {
    // 创建 500 个测试文件
    console.log('创建 500 个测试文件进行内存测试...');
    const files = await createTestFiles(500);

    // 创建配置文件
    const configPath = await createTestConfig();

    // 记录初始内存使用
    const initialMemory = process.memoryUsage();

    // 执行生成
    const result = await contentGenerator.generate('weekly', {
      config: configPath,
      date: new Date('2024-01-15'),
      dryRun: false
    });

    // 记录最终内存使用
    const finalMemory = process.memoryUsage();

    // 计算内存增长
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryGrowthMB = memoryGrowth / (1024 * 1024);

    console.log(`内存增长: ${memoryGrowthMB.toFixed(2)} MB`);

    // 验证结果
    expect(result.success).toBe(true);

    // 验证内存使用合理（不超过 100MB 增长）
    expect(memoryGrowthMB).toBeLessThan(100);
  }, 8000);

  it('应该支持并发文件扫描以提高性能', async () => {
    // 创建多个目录结构
    const dirs = ['dir1', 'dir2', 'dir3', 'dir4'];
    const filesPerDir = 50;

    for (const dir of dirs) {
      const dirPath = path.join(tempDir, dir);
      await fs.mkdir(dirPath, { recursive: true });

      for (let i = 0; i < filesPerDir; i++) {
        const fileName = `file-${i}.md`;
        const filePath = path.join(dirPath, fileName);
        const content = `---
title: 并发测试文件 ${dir}-${i}
rating: ${Math.floor(Math.random() * 10) + 1}
---

# 并发测试文件 ${dir}-${i}

这是用于测试并发文件扫描性能的文件。

内容: ${Math.random().toString(36).repeat(20)}
`;

        await fs.writeFile(filePath, content, 'utf8');
        tempFiles.push(filePath);
      }
    }

    // 创建配置文件
    const configPath = path.join(tempDir, 'concurrent-config.json');
    const articleSources = dirs.map(dir => ({
      path: path.join(tempDir, dir),
      include: ['**/*.md'],
      priority: Math.random()
    }));
    const fallbackSource = {
      path: path.join(tempDir, dirs[0]),
      include: ['**/*.md']
    };
    const config = createWeeklyConfig(
      {
        articles: articleSources,
        tools: fallbackSource,
        notes: fallbackSource
      },
      'concurrent-test.md'
    );

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    tempFiles.push(configPath);

    // 测试并发扫描性能
    const startTime = Date.now();

    const result = await contentGenerator.generate('weekly', {
      config: configPath,
      date: new Date('2024-01-15'),
      dryRun: false
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`并发扫描耗时: ${duration}ms`);

    // 验证结果
    expect(result.success).toBe(true);

    // 验证并发扫描性能（应该比顺序扫描快）
    // 200 个文件应该在 2 秒内完成
    expect(duration).toBeLessThan(2000);
  }, 6000);

  it('应该在大量小文件情况下保持性能', async () => {
    // 创建大量小文件
    const smallFileCount = 2000;
    const smallFilesDir = path.join(tempDir, 'small-files');
    await fs.mkdir(smallFilesDir, { recursive: true });

    console.log(`创建 ${smallFileCount} 个小文件...`);

    for (let i = 0; i < smallFileCount; i++) {
      const fileName = `small-${i}.md`;
      const filePath = path.join(smallFilesDir, fileName);
      const content = `---
title: 小文件 ${i}
rating: ${i % 10 + 1}
---

# 小文件 ${i}

简短内容 ${i}
`;

      await fs.writeFile(filePath, content, 'utf8');
      tempFiles.push(filePath);
    }

    // 创建配置
    const configPath = path.join(tempDir, 'small-files-config.json');
    const smallToolsDir = path.join(tempDir, 'small-files-tools');
    const smallNotesDir = path.join(tempDir, 'small-files-notes');
    await fs.mkdir(smallToolsDir, { recursive: true });
    await fs.mkdir(smallNotesDir, { recursive: true });
    const config = createWeeklyConfig(
      {
        articles: {
          path: smallFilesDir,
          include: ['**/*.md']
        },
        tools: {
          path: smallToolsDir,
          include: ['**/*.md']
        },
        notes: {
          path: smallNotesDir,
          include: ['**/*.md']
        }
      },
      'small-files-test.md'
    );

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    tempFiles.push(configPath);

    // 测试小文件处理性能
    const startTime = Date.now();

    const result = await contentGenerator.generate('weekly', {
      config: configPath,
      date: new Date('2024-01-15'),
      dryRun: false
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`小文件处理耗时: ${duration}ms`);

    // 验证结果
    expect(result.success).toBe(true);

    // 验证小文件处理性能（2000 个小文件应该在 3 秒内完成）
    expect(duration).toBeLessThan(3000);
  }, 8000);

  it('应该在深层目录结构下保持性能', async () => {
    // 创建深层目录结构
    const maxDepth = 5;
    const filesPerLevel = 20;

    async function createDeepStructure(basePath: string, depth: number): Promise<void> {
      if (depth > maxDepth) return;

      for (let i = 0; i < filesPerLevel; i++) {
        const fileName = `deep-${depth}-${i}.md`;
        const filePath = path.join(basePath, fileName);
        const content = `---
title: 深层文件 ${depth}-${i}
rating: ${Math.floor(Math.random() * 10) + 1}
depth: ${depth}
---

# 深层文件 ${depth}-${i}

这是位于第 ${depth} 层的文件 ${i}。

内容: ${Math.random().toString(36).repeat(15)}
`;

        await fs.writeFile(filePath, content, 'utf8');
        tempFiles.push(filePath);
      }

      // 创建下一层目录
      if (depth < maxDepth) {
        for (let i = 0; i < 3; i++) {
          const subDir = path.join(basePath, `level-${depth + 1}-${i}`);
          await fs.mkdir(subDir, { recursive: true });
          await createDeepStructure(subDir, depth + 1);
        }
      }
    }

    const deepDir = path.join(tempDir, 'deep-structure');
    await fs.mkdir(deepDir, { recursive: true });
    await createDeepStructure(deepDir, 1);

    // 创建配置
    const configPath = path.join(tempDir, 'deep-config.json');
    const deepToolsDir = path.join(tempDir, 'deep-tools');
    const deepNotesDir = path.join(tempDir, 'deep-notes');
    await fs.mkdir(deepToolsDir, { recursive: true });
    await fs.mkdir(deepNotesDir, { recursive: true });
    const config = createWeeklyConfig(
      {
        articles: {
          path: deepDir,
          include: ['**/*.md']
        },
        tools: {
          path: deepToolsDir,
          include: ['**/*.md']
        },
        notes: {
          path: deepNotesDir,
          include: ['**/*.md']
        }
      },
      'deep-structure-test.md'
    );

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    tempFiles.push(configPath);

    // 测试深层结构处理性能
    const startTime = Date.now();

    const result = await contentGenerator.generate('weekly', {
      config: configPath,
      date: new Date('2024-01-15'),
      dryRun: false
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`深层结构处理耗时: ${duration}ms`);

    // 验证结果
    expect(result.success).toBe(true);

    // 验证深层结构处理性能（应该在 4 秒内完成）
    expect(duration).toBeLessThan(4000);
  }, 10000);
});
