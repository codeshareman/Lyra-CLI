import * as fc from 'fast-check';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ConfigManager } from './ConfigManager';

describe('ConfigManager Enhanced Property Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-enhanced-prop-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('Property 3: Config Parsing Round-Trip', () => {
    it('should preserve enhanced fields after load', async () => {
      const manager = new ConfigManager();

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            coverImage: fc.option(fc.webUrl(), { nil: undefined }),
            backgroundImage: fc.option(fc.constantFrom('./bg.png', '../bg.jpg', '/tmp/bg.png'), {
              nil: undefined,
            }),
            minRating: fc.integer({ min: 0, max: 5 }),
          }),
          async ({ coverImage, backgroundImage, minRating }) => {
            const configPath = path.join(tempDir, `cfg-${Date.now()}-${Math.random()}.json`);
            const config = {
              global: { logLevel: 'info', defaultTemplate: 'weekly' },
              templates: {
                weekly: {
                  enabled: true,
                  template: { path: './templates/weekly.hbs' },
                  sources: { articles: './articles', tools: './tools', notes: './notes' },
                  output: { path: './output', filename: 'weekly.md' },
                  content: {},
                  visual: {
                    ...(coverImage ? { coverImage } : {}),
                    ...(backgroundImage ? { backgroundImage } : {}),
                  },
                  modules: {
                    reading: {
                      enabled: true,
                      filter: {
                        minRating,
                      },
                    },
                  },
                  export: {
                    formats: ['markdown', 'html'],
                  },
                },
              },
            };

            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

            const loaded = await manager.load(configPath);
            const weekly: any = loaded.templates.weekly;

            expect(weekly.modules.reading.filter.minRating).toBe(minRating);
            expect(weekly.export.formats).toEqual(['markdown', 'html']);

            if (coverImage) {
              expect(weekly.visual.coverImage).toBe(coverImage);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 4: Config Default Values', () => {
    it('should fill defaults when optional enhanced fields are missing', async () => {
      const manager = new ConfigManager();

      await fc.assert(
        fc.asyncProperty(fc.boolean(), async (enabled) => {
          const configPath = path.join(tempDir, `defaults-${Date.now()}-${Math.random()}.json`);
          const config = {
            global: { logLevel: 'info', defaultTemplate: 'weekly' },
            templates: {
              weekly: {
                enabled,
                template: { path: './templates/weekly.hbs' },
                sources: { articles: './articles', tools: './tools', notes: './notes' },
                output: { path: './output', filename: 'weekly.md' },
                content: {},
              },
            },
          };

          await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

          const loaded = await manager.load(configPath);
          const weekly: any = loaded.templates.weekly;

          expect(weekly.modules.reading.enabled).toBe(true);
          expect(weekly.modules.thoughts.enabled).toBe(true);
          expect(weekly.export.formats).toEqual(['markdown']);
          expect(weekly.export.wechat.validateImages).toBe(true);
          expect(weekly.export.wechat.theme).toBe('magazine-editorial');
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 32: Config Validation Error Messages', () => {
    it('should return descriptive validation errors for invalid enhanced configs', async () => {
      const manager = new ConfigManager();

      await fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ modules: { reading: { enabled: 'invalid' } } }),
            fc.constant({ modules: { reading: { enabled: true, filter: { minRating: 'x' } } } }),
            fc.constant({ export: { formats: ['bad-format'] } }),
            fc.constant({ visual: { goldenQuote: { content: 123, author: '' } } })
          ),
          (invalidPart) => {
            const config: any = {
              global: { logLevel: 'info', defaultTemplate: 'weekly' },
              templates: {
                weekly: {
                  enabled: true,
                  template: { path: './templates/weekly.hbs' },
                  sources: { articles: './articles' },
                  output: { path: './output', filename: 'weekly.md' },
                  content: {},
                  ...invalidPart,
                },
              },
            };

            const result = manager.validate(config);
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            result.errors.forEach((error) => {
              expect(typeof error).toBe('string');
              expect(error.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 33: Invalid Image Path Recovery', () => {
    it('should recover from invalid image paths with warning', async () => {
      const manager = new ConfigManager();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.startsWith('./') && !s.startsWith('../') && !s.startsWith('/')),
          async (invalidPath) => {
            const configPath = path.join(tempDir, `invalid-image-${Date.now()}-${Math.random()}.json`);
            const config = {
              global: { logLevel: 'info', defaultTemplate: 'weekly' },
              templates: {
                weekly: {
                  enabled: true,
                  template: { path: './templates/weekly.hbs' },
                  sources: { articles: './articles', tools: './tools', notes: './notes' },
                  output: { path: './output', filename: 'weekly.md' },
                  content: {},
                  visual: {
                    coverImage: invalidPath,
                  },
                },
              },
            };

            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

            await expect(manager.load(configPath)).resolves.toBeDefined();
          }
        ),
        { numRuns: 20 }
      );

      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
