import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { CLIInterface } from './CLIInterface';
import { IContentGenerator, ITemplateRegistry, GenerateResult, TemplateInfo } from '../types/interfaces';

class MockContentGenerator implements IContentGenerator {
  async generate(): Promise<GenerateResult> {
    return {
      success: true,
      message: 'ok',
    };
  }

  listTemplates(): string[] {
    return ['weekly'];
  }
}

class MockTemplateRegistry implements ITemplateRegistry {
  private templates = new Set(['weekly']);

  registerTemplate(): void {
    // no-op
  }

  getTemplate(): any {
    return {};
  }

  getTemplateConstructor(): any {
    return class {};
  }

  listTemplates(): TemplateInfo[] {
    return [{ name: 'weekly', description: 'weekly 模板', version: '1.0.0' }];
  }

  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }
}

describe('CLIInterface prompt 命令', () => {
  let tempDir: string;
  let cli: CLIInterface;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-prompt-'));
    cli = new CLIInterface(new MockContentGenerator(), new MockTemplateRegistry());
    cli.init();

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`Process exited with code ${code}`);
      }) as any);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('应支持列出内置 prompt 主题', async () => {
    await cli.parse(['node', 'cli.js', 'prompt', '--list']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[prompt] 可用主题模板'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('生活志'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('应支持读取自定义 profiles 并渲染 prompt 到文件', async () => {
    const profilesPath = path.join(tempDir, 'profiles.json');
    const sourcePath = path.join(tempDir, 'source.md');
    const outPath = path.join(tempDir, 'rendered-prompt.txt');

    await fs.writeFile(
      profilesPath,
      JSON.stringify(
        {
          customTopic: {
            description: 'custom',
            system: '你是测试写作助手',
            template: '选题={{idea}}\\n要求={{requirements}}\\n素材={{source}}',
          },
        },
        null,
        2
      ),
      'utf-8'
    );
    await fs.writeFile(sourcePath, '今天我学了提示词工程。', 'utf-8');

    await cli.parse([
      'node',
      'cli.js',
      'prompt',
      '--profiles',
      profilesPath,
      '--topic',
      'customTopic',
      '--idea',
      '如何用最小阻力坚持输出',
      '--requirements',
      '900字以内，具体',
      '--source',
      sourcePath,
      '--out',
      outPath,
    ]);

    const rendered = await fs.readFile(outPath, 'utf-8');
    expect(rendered).toContain('选题=如何用最小阻力坚持输出');
    expect(rendered).toContain('要求=900字以内，具体');
    expect(rendered).toContain('今天我学了提示词工程。');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('-----BEGIN PROMPT-----'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('应支持从目录中提取议题建议', async () => {
    const areasDir = path.join(tempDir, 'Output', 'Areas');
    const inputDir = path.join(tempDir, 'Input');
    await fs.mkdir(areasDir, { recursive: true });
    await fs.mkdir(inputDir, { recursive: true });

    await fs.writeFile(
      path.join(areasDir, 'deliberate-practice.md'),
      `---
title: 刻意练习复盘
---
今天复盘了最近三周的学习策略，发现问题在于只看不练，缺少反馈闭环。`,
      'utf-8'
    );

    await cli.parse([
      'node',
      'cli.js',
      'prompt',
      '--suggest',
      '--from',
      `${areasDir},${inputDir}`,
      '--limit',
      '5',
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[prompt] 议题候选'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('刻意练习复盘'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('lyra article 在未提供 idea 时应隐式走建议模式', async () => {
    const areasDir = path.join(tempDir, 'Output', 'Areas');
    const inputDir = path.join(tempDir, 'Input');
    await fs.mkdir(areasDir, { recursive: true });
    await fs.mkdir(inputDir, { recursive: true });

    await fs.writeFile(
      path.join(inputDir, 'daily.md'),
      '# 通勤观察\n今天地铁上看见很多人都在刷短视频，我开始反思注意力被切碎的问题。',
      'utf-8'
    );

    await cli.parse([
      'node',
      'cli.js',
      'article',
      '--module',
      '生活志',
      '--from',
      `${areasDir},${inputDir}`,
      '--limit',
      '5',
    ]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[article] 未提供 --idea，已默认进入推荐模式（等价 --suggest）')
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[article] 议题候选'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('lyra article 在选择推荐议题后应继续生成 prompt', async () => {
    const areasDir = path.join(tempDir, 'Output', 'Areas');
    const inputDir = path.join(tempDir, 'Input');
    const outPath = path.join(tempDir, 'selected.prompt.md');
    await fs.mkdir(areasDir, { recursive: true });
    await fs.mkdir(inputDir, { recursive: true });

    const sourcePath = path.join(inputDir, 'daily.md');
    await fs.writeFile(
      sourcePath,
      '# 通勤观察\n今天下班时看到晚霞，突然不想再把生活切成待办事项。',
      'utf-8'
    );

    const selectionSpy = jest
      .spyOn(cli as any, 'selectTopicSuggestionInteractively')
      .mockResolvedValue({
        topic: '生活志',
        idea: '下班路上的晚霞',
        sourcePath,
      });

    await cli.parse([
      'node',
      'cli.js',
      'article',
      '--module',
      '生活志',
      '--from',
      `${areasDir},${inputDir}`,
      '--limit',
      '5',
      '--prompt-only',
      '--out',
      outPath,
    ]);

    const rendered = await fs.readFile(outPath, 'utf-8');
    expect(selectionSpy).toHaveBeenCalled();
    expect(rendered).toContain('下班路上的晚霞');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[article] 已选择议题'));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[article] 议题候选'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('lyra article 在未提供 --out 时应写入默认模块目录', async () => {
    const configPath = path.join(tempDir, '.lyrarc.json');
    const outputBaseDir = path.join(tempDir, 'Output', 'Z° North');

    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          global: {
            logLevel: 'info',
            defaultTemplate: 'article',
          },
          templates: {
            article: {
              enabled: true,
              template: { path: './templates/weekly.hbs' },
              sources: { notes: './Input' },
              output: {
                path: outputBaseDir,
                filename: '{{date}}-{{slug}}.prompt.md',
              },
              content: {
                articles: { topN: 1, minRating: 0 },
                tools: { perCategory: 1 },
                notes: { groupBy: 'none' },
              },
              ai: {
                prompting: {
                  defaultModule: 'life',
                  modules: {
                    life: {
                      label: '生活志',
                      publishDir: 'Z°N 生活志',
                    },
                  },
                  aliases: {
                    生活志: 'life',
                  },
                },
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    await cli.parse([
      'node',
      'cli.js',
      'article',
      '--config',
      configPath,
      '--module',
      '生活志',
      '--idea',
      '这周通勤观察',
      '--prompt-only',
    ]);

    const moduleOutputDir = path.join(outputBaseDir, 'Z°N 生活志');
    const files = await fs.readdir(moduleOutputDir);
    expect(files.length).toBeGreaterThan(0);
    const renderedPath = path.join(moduleOutputDir, files[0]);
    const rendered = await fs.readFile(renderedPath, 'utf-8');
    expect(rendered).toContain('这周通勤观察');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[article] 已写入:'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('lyra article --dry-run 应只预览不写文件', async () => {
    const configPath = path.join(tempDir, '.lyrarc.json');
    const outputBaseDir = path.join(tempDir, 'Output', 'Z° North');

    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          global: {
            logLevel: 'info',
            defaultTemplate: 'article',
          },
          templates: {
            article: {
              enabled: true,
              template: { path: './templates/weekly.hbs' },
              sources: { notes: './Input' },
              output: {
                path: outputBaseDir,
                filename: '{{date}}-{{slug}}.prompt.md',
              },
              content: {
                articles: { topN: 1, minRating: 0 },
                tools: { perCategory: 1 },
                notes: { groupBy: 'none' },
              },
              ai: {
                prompting: {
                  modules: {
                    life: {
                      label: '生活志',
                      publishDir: 'Z°N 生活志',
                    },
                  },
                  aliases: {
                    生活志: 'life',
                  },
                },
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    await cli.parse([
      'node',
      'cli.js',
      'article',
      '--config',
      configPath,
      '--module',
      '生活志',
      '--idea',
      '只做预览',
      '--dry-run',
    ]);

    const moduleOutputDir = path.join(outputBaseDir, 'Z°N 生活志');
    const dirExists = await fs
      .access(moduleOutputDir)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[article] dry-run: 将写入'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('应能解析最小字数约束（>900字）', () => {
    const constraint = (cli as any).extractLengthConstraintFromText(
      '写作要求：口语化，需>900字，避免空话'
    );
    expect(constraint.minChars).toBe(900);
    expect(constraint.maxChars).toBeUndefined();
  });

  it('文章低于最小字数时应触发扩写', async () => {
    const requestSpy = jest
      .spyOn(cli as any, 'requestModelCompletion')
      .mockResolvedValue(
        JSON.stringify({
          title: '扩写后标题',
          content: '测'.repeat(980),
          imagePromptNanobanaPro: 'test image prompt',
        })
      );

    const revised = await (cli as any).ensureArticleWithinLength({
      payload: {
        title: '原始标题',
        content: '这是一段偏短的正文。',
        imagePromptNanobanaPro: 'test',
      },
      constraint: {
        minChars: 900,
      },
      runtimeConfig: {
        articleAI: {
          enabled: true,
          provider: 'local',
          model: 'test',
          baseUrl: 'http://localhost:11434',
          maxRetries: 1,
        },
      } as any,
      idea: '测试议题',
      moduleName: '生活志',
      platform: 'wechat',
    });

    const length = (cli as any).estimateReadableLength(revised.content);
    expect(length).toBeGreaterThanOrEqual(900);
    expect(requestSpy).toHaveBeenCalled();
  });

  it('应从混合文本中提取 JSON 文章载荷', () => {
    const raw = [
      '# "title": "下班口的十五分钟：我如何用晚霞收回一天的注意力",',
      '{',
      '  "title": "下班口的十五分钟：我如何用晚霞收回一天的注意力",',
      '  "content": "第一段。\\n\\n第二段。",',
      '  "imagePromptNanobanaPro": "sunset street documentary photo"',
      '}',
    ].join('\n');

    const parsed = (cli as any).parseGeneratedArticlePayload(raw);

    expect(parsed).toBeTruthy();
    expect(parsed.title).toContain('下班口的十五分钟');
    expect(parsed.content).toContain('第一段');
  });

  it('article 输出应包含 frontmatter 与阅读提示', () => {
    const markdown = (cli as any).formatGeneratedArticleMarkdown(
      {
        title: '春节重刷《甄嬛传》：她们身不由己，我们主动选择',
        content: '# 春节重刷《甄嬛传》：她们身不由己，我们主动选择\n\n正文第一段。\n\n正文第二段。',
        imagePromptNanobanaPro: 'portrait, dramatic light',
      },
      {
        moduleName: '生活志',
        insertCoverImage: true,
      }
    );

    expect(markdown).toContain('---');
    expect(markdown).toContain('note_type: output_note');
    expect(markdown).toContain('category: "Z°N 生活志"');
    expect(markdown).toContain('✨ 温馨提示：本文约');
    expect(markdown).toContain('正文第一段。');
    expect(markdown).not.toContain('## Nanobana Pro 生图提示词');
  });

  it('应优先使用模块 coverPrompt 作为头图提示词', async () => {
    const moduleDir = path.join(tempDir, 'Z°N 声图志');
    await fs.mkdir(moduleDir, { recursive: true });

    const runtimeConfig = {
      configDir: tempDir,
      articleImage: {
        enabled: true,
        ratio: '16:9',
        insertCoverImage: true,
      },
    } as any;

    const moduleConfig = {
      key: 'audiovisual',
      label: '声图志',
      publishDir: moduleDir,
      promptFile: 'prompt.md',
      platformPromptFiles: {},
      sources: [],
      coverPrompt: '声图志头图提示词（配置内）',
    } as any;

    const prompt = await (cli as any).resolveCoverPrompt({
      runtimeConfig,
      moduleConfig,
      moduleName: '声图志',
      platform: 'wechat',
      fallbackPrompt: 'fallback',
    });

    expect(prompt).toContain('声图志头图提示词');
  });

  it('应从模块目录读取 cover.prompt.wechat.md', async () => {
    const moduleDir = path.join(tempDir, 'Z°N 生活志');
    await fs.mkdir(moduleDir, { recursive: true });
    await fs.writeFile(path.join(moduleDir, 'cover.prompt.wechat.md'), '生活志头图提示词', 'utf-8');

    const runtimeConfig = {
      configDir: tempDir,
      articleImage: {
        enabled: true,
        ratio: '16:9',
        insertCoverImage: true,
      },
    } as any;

    const moduleConfig = {
      key: 'life',
      label: '生活志',
      publishDir: moduleDir,
      promptFile: 'prompt.md',
      platformPromptFiles: {},
      sources: [],
    } as any;

    const prompt = await (cli as any).resolveCoverPrompt({
      runtimeConfig,
      moduleConfig,
      moduleName: '生活志',
      platform: 'wechat',
      fallbackPrompt: 'fallback',
    });

    expect(prompt).toContain('生活志头图提示词');
  });
});
