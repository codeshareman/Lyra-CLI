import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import matter from 'gray-matter';
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

describe('CLIInterface check-metadata 命令', () => {
  let tempDir: string;
  let cli: CLIInterface;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-check-metadata-'));
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

  it('目录模式下应检测到重复 tags 并返回退出码 1', async () => {
    const markdownPath = path.join(tempDir, 'dup.md');
    await fs.writeFile(
      markdownPath,
      `---\ntitle: 重复标签测试\ntags: [AI, ai, " AI ", 效率]\n---\n\n今天记录了一个 AI 工具使用体验。`,
      'utf-8'
    );

    await expect(
      cli.parse(['node', 'cli.js', 'check-metadata', '--path', tempDir])
    ).rejects.toThrow('Process exited with code 1');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[check:metadata] 问题统计')
    );
  });

  it('单文件模式 + --fix-tags 应写回去重后的 tags', async () => {
    const markdownPath = path.join(tempDir, 'single.md');
    await fs.writeFile(
      markdownPath,
      `---\ntitle: 标签整理\ntags: [AI, " 产品 ", ai, "", "效率"]\n---\n\n我在做内容创作流程的优化。`,
      'utf-8'
    );

    await cli.parse([
      'node',
      'cli.js',
      'check-metadata',
      '--path',
      markdownPath,
      '--fix-tags',
      '--min-tags',
      '1',
      '--max-tags',
      '8',
    ]);

    const updated = await fs.readFile(markdownPath, 'utf-8');
    const parsed = matter(updated);
    expect(parsed.data.tags).toEqual(['ai', '产品', '效率']);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('已修改文件数: 1'));
  });
});
