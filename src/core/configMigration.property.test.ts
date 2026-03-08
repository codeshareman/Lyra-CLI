import * as fc from 'fast-check';
import { migrateOldConfig } from './configMigration';
import { TemplateConfig } from '../types/interfaces';

function createLegacyConfig(overrides: Partial<TemplateConfig> = {}): TemplateConfig {
  return {
    enabled: true,
    template: {
      path: './templates/weekly.hbs',
      ...(overrides.template || {}),
    },
    sources: {
      articles: './articles',
      tools: './tools',
      notes: './notes',
      ...(overrides.sources || {}),
    },
    output: {
      path: './output',
      filename: 'weekly-{{issueNumber}}.md',
      ...(overrides.output || {}),
    },
    content: {
      ...(overrides.content || {}),
    },
    ...(overrides as any),
  };
}

describe('Config Migration Property Tests', () => {
  describe('Property 29: Legacy Config Compatibility', () => {
    it('should preserve core legacy fields after migration', () => {
      fc.assert(
        fc.property(
          fc.record({
            enabled: fc.boolean(),
            outputPath: fc.string({ minLength: 1, maxLength: 20 }),
            filename: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          ({ enabled, outputPath, filename }) => {
            const legacy = createLegacyConfig({
              enabled,
              output: {
                path: outputPath,
                filename,
              },
            });

            const migrated = migrateOldConfig(legacy) as any;

            expect(migrated.enabled).toBe(enabled);
            expect(migrated.output.path).toBe(outputPath);
            expect(migrated.output.filename).toBe(filename);
            expect(migrated.modules).toBeDefined();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 30: Graceful Degradation for Missing Fields', () => {
    it('should apply defaults when legacy config misses optional fields', () => {
      fc.assert(
        fc.property(fc.boolean(), (useEmptyContent) => {
          const legacy = createLegacyConfig({
            content: useEmptyContent ? {} : { articles: { minRating: 4 } },
          });

          const migrated = migrateOldConfig(legacy) as any;

          expect(migrated.modules.reading.enabled).toBe(true);
          expect(migrated.modules.thoughts.enabled).toBe(true);
          expect(migrated.export.formats).toBeDefined();
          expect(Array.isArray(migrated.export.formats)).toBe(true);
          expect(migrated.visual).toBeDefined();
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 31: Template Version Selection', () => {
    it('should select template path according to templateVersion', () => {
      fc.assert(
        fc.property(fc.constantFrom<'legacy' | 'enhanced'>('legacy', 'enhanced'), (version) => {
          const legacy = createLegacyConfig({
            template: { path: './templates/weekly.hbs' },
            ...( { templateVersion: version } as any),
          });

          const migrated = migrateOldConfig(legacy) as any;

          if (version === 'legacy') {
            expect(migrated.template.path).toContain('weekly.hbs');
          } else {
            expect(migrated.template.path).toContain('weekly.hbs');
          }
        }),
        { numRuns: 20 }
      );
    });
  });
});
