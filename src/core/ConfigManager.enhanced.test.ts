import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ConfigManager } from './ConfigManager';

describe('ConfigManager Enhanced Config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-enhanced-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('should parse enhanced visual/modules/export fields', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const config = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly',
      },
      templates: {
        weekly: {
          enabled: true,
          template: { path: './templates/weekly.hbs' },
          sources: {
            articles: './articles',
            tools: './tools',
            notes: './notes',
          },
          output: {
            path: './output',
            filename: 'weekly-{{issueNumber}}.md',
          },
          content: {},
          visual: {
            coverImage: 'https://example.com/cover.jpg',
            backgroundImage: './assets/bg.png',
            goldenQuote: {
              content: 'quote',
              author: 'author',
            },
          },
          modules: {
            reading: {
              enabled: true,
              icon: '📚',
              filter: {
                minRating: 4,
                tags: ['ai'],
              },
            },
          },
          export: {
            formats: ['markdown', 'wechat'],
            wechat: {
              validateImages: false,
              imageProxyUrl: 'https://images.weserv.nl/?url={url}',
              inaccessibleImageDomains: ['images.unsplash.com'],
              imageOptimization: {
                maxWidth: 1200,
                quality: 82,
                format: 'webp',
              },
            },
          },
        },
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const manager = new ConfigManager();
    const loaded = await manager.load(configPath);
    const weekly: any = loaded.templates.weekly;

    expect(weekly.visual.coverImage).toBe('https://example.com/cover.jpg');
    expect(weekly.visual.goldenQuote.content).toBe('quote');

    expect(weekly.modules.reading.enabled).toBe(true);
    expect(weekly.modules.reading.filter.minRating).toBe(4);

    expect(weekly.export.formats).toEqual(['markdown', 'wechat']);
    expect(weekly.export.wechat.validateImages).toBe(false);
    expect(weekly.export.wechat.theme).toBe('magazine-editorial');
    expect(weekly.export.wechat.imageProxyUrl).toBe('https://images.weserv.nl/?url={url}');
    expect(weekly.export.wechat.inaccessibleImageDomains).toEqual(['images.unsplash.com']);
    expect(weekly.export.wechat.imageOptimization).toEqual({
      maxWidth: 1200,
      quality: 82,
      format: 'webp',
    });
  });

  it('should apply defaults for optional enhanced fields', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const config = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly',
      },
      templates: {
        weekly: {
          enabled: true,
          template: { path: './templates/weekly.hbs' },
          sources: {
            articles: './articles',
            tools: './tools',
            notes: './notes',
          },
          output: {
            path: './output',
            filename: 'weekly-{{issueNumber}}.md',
          },
          content: {},
        },
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const manager = new ConfigManager();
    const loaded = await manager.load(configPath);
    const weekly: any = loaded.templates.weekly;

    expect(weekly.modules.reading.enabled).toBe(true);
    expect(weekly.modules.tech.enabled).toBe(true);
    expect(weekly.export.formats).toEqual(['markdown']);
    expect(weekly.export.wechat.validateImages).toBe(true);
    expect(weekly.export.wechat.theme).toBe('magazine-editorial');
  });

  it('should provide detailed validation errors for invalid enhanced config', () => {
    const manager = new ConfigManager();

    const invalidConfig: any = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly',
      },
      templates: {
        weekly: {
          enabled: true,
          template: { path: './templates/weekly.hbs' },
          sources: {
            articles: './articles',
          },
          output: {
            path: './output',
            filename: 'weekly.md',
          },
          content: {},
          modules: {
            reading: {
              enabled: 'yes',
              filter: {
                minRating: 'high',
              },
            },
          },
          export: {
            formats: ['invalid-format'],
          },
        },
      },
    };

    const result = manager.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('modules.reading.enabled'))).toBe(true);
    expect(result.errors.some((e) => e.includes('modules.reading.filter.minRating'))).toBe(true);
    expect(result.errors.some((e) => e.includes('export.formats'))).toBe(true);
  });

  it('should validate wechat image optimization options', () => {
    const manager = new ConfigManager();

    const invalidConfig: any = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly',
      },
      templates: {
        weekly: {
          enabled: true,
          template: { path: './templates/weekly.hbs' },
          sources: {
            articles: './articles',
            tools: './tools',
            notes: './notes',
          },
          output: {
            path: './output',
            filename: 'weekly.md',
          },
          content: {},
          export: {
            formats: ['wechat'],
            wechat: {
              imageProxyUrl: 123,
              inaccessibleImageDomains: 'images.unsplash.com',
              imageOptimization: {
                maxWidth: 0,
                quality: 101,
                format: 'avif',
              },
            },
          },
        },
      },
    };

    const result = manager.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('export.wechat.imageProxyUrl'))).toBe(true);
    expect(result.errors.some((e) => e.includes('export.wechat.inaccessibleImageDomains'))).toBe(true);
    expect(result.errors.some((e) => e.includes('imageOptimization.maxWidth'))).toBe(true);
    expect(result.errors.some((e) => e.includes('imageOptimization.quality'))).toBe(true);
    expect(result.errors.some((e) => e.includes('imageOptimization.format'))).toBe(true);
  });

  it('should warn and continue when image path is invalid', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const configPath = path.join(tempDir, 'config.json');
    const config = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly',
      },
      templates: {
        weekly: {
          enabled: true,
          template: { path: './templates/weekly.hbs' },
          sources: {
            articles: './articles',
            tools: './tools',
            notes: './notes',
          },
          output: {
            path: './output',
            filename: 'weekly.md',
          },
          content: {},
          visual: {
            coverImage: 'invalid://not-a-valid-image-ref',
            backgroundImage: 'also-invalid-image-ref',
          },
        },
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const manager = new ConfigManager();
    await expect(manager.load(configPath)).resolves.toBeDefined();

    expect(warnSpy).toHaveBeenCalled();
  });
});
