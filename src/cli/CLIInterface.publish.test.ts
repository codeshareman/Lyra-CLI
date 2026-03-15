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

describe('CLIInterface publish 命令', () => {
  let tempDir: string;
  let cli: CLIInterface;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-publish-'));
    cli = new CLIInterface(new MockContentGenerator(), new MockTemplateRegistry());
    cli.init();

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    delete process.env.LYRA_PUBLISH_MARKER;
    jest.restoreAllMocks();
  });

  it('应支持 dry-run 发布并调用脚本', async () => {
    const contentPath = path.join(tempDir, 'article.html');
    await fs.writeFile(contentPath, '<p>hello</p>', 'utf-8');

    const markerPath = path.join(tempDir, 'marker.txt');
    const scriptPath = path.join(tempDir, 'publish.py');
    await fs.writeFile(
      scriptPath,
      [
        'import sys',
        `marker = r"""${markerPath}"""`,
        'with open(marker, "w", encoding="utf-8") as f:',
        '  f.write(" ".join(sys.argv))',
        'sys.exit(0)',
        '',
      ].join('\n'),
      'utf-8'
    );

    const configPath = path.join(tempDir, 'lyra.config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          publish: {
            outputDir: './publish',
            wechat: {
              apiScript: './publish.py',
              contentFile: './article.html',
              configFile: './lyra.config.json',
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
      'publish',
      '--file',
      configPath,
      '--dry-run',
    ]);

    const marker = await fs.readFile(markerPath, 'utf-8');
    expect(marker).toContain('--dry-run');
    expect(marker).toContain('--mode draft');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🛰️ 开始发布'));
  });

  it('应支持 API 内置 dry-run（无脚本）', async () => {
    const contentPath = path.join(tempDir, 'article.html');
    await fs.writeFile(contentPath, '<p>hello</p>', 'utf-8');

    const wechatConfigPath = path.join(tempDir, 'wechat_publish.json');
    await fs.writeFile(
      wechatConfigPath,
      JSON.stringify(
        {
          title: '测试标题',
          author: 'Tester',
          digest: 'digest',
          cover_source_order: ['placeholder'],
        },
        null,
        2
      ),
      'utf-8'
    );

    const configPath = path.join(tempDir, 'lyra.config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          publish: {
            wechat: {
              mode: 'draft',
              contentFile: './article.html',
              configFile: './wechat_publish.json',
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
      'publish',
      '--file',
      configPath,
      '--dry-run',
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"draftPayload"'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('__AUTO_PLACEHOLDER__'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('AI/Unsplash 失败时应降级到占位图', async () => {
    const cliAny = cli as any;
    cliAny.tryGenerateCoverFromAI = jest.fn().mockRejectedValue(new Error('ai failed'));
    cliAny.tryFetchCoverFromUnsplash = jest.fn().mockRejectedValue(new Error('unsplash timeout'));

    const source = await cliAny.resolveAutoCoverSource({
      config: {
        title: '测试文章',
        cover_source_order: ['ai', 'unsplash', 'placeholder'],
        cover_ratio: '16:9',
      },
      html: '<p>hello</p>',
    });

    expect(source).toBeTruthy();
    expect(source.type).toBe('path');
  });

  it('未配置 AI 时应直接降级到下一个来源', async () => {
    const cliAny = cli as any;
    const source = await cliAny.resolveAutoCoverSource({
      config: {
        title: '测试文章',
        cover_source_order: ['ai', 'placeholder'],
        cover_ratio: '16:9',
      },
      html: '<p>hello</p>',
    });

    expect(source).toBeTruthy();
    expect(source.type).toBe('path');
  });
});
