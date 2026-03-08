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

describe('CLIInterface check-images 命令', () => {
  let tempDir: string;
  let cli: CLIInterface;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-check-images-'));
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

  it('应在图片域名都命中白名单时通过', async () => {
    const markdownPath = path.join(tempDir, 'ok.md');
    await fs.writeFile(
      markdownPath,
      '![ok](https://znorth-1300857483.cos.ap-chengdu.myqcloud.com/a.png)',
      'utf-8'
    );

    await cli.parse(['node', 'cli.js', 'check-images', '--dir', tempDir]);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[check:image-hosts] 通过')
    );
  });

  it('应在出现非白名单域名时返回退出码 1', async () => {
    const markdownPath = path.join(tempDir, 'bad.md');
    await fs.writeFile(
      markdownPath,
      '![bad](https://images.unsplash.com/photo-1.jpg)',
      'utf-8'
    );

    await expect(
      cli.parse([
        'node',
        'cli.js',
        'check-images',
        '--dir',
        tempDir,
        '--allow',
        'znorth-1300857483.cos.ap-chengdu.myqcloud.com',
      ])
    ).rejects.toThrow('Process exited with code 1');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[check:image-hosts] 发现')
    );
  });
});
