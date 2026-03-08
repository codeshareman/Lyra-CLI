import { migrateOldConfig } from './configMigration';
import { TemplateConfig } from '../types/interfaces';

describe('Config Migration', () => {
  const baseLegacyConfig: TemplateConfig = {
    enabled: true,
    template: {
      path: './templates/weekly.hbs',
    },
    sources: {
      articles: './articles',
      tools: './tools',
      notes: './notes',
    },
    output: {
      path: './output',
      filename: 'weekly-{{issueNumber}}.md',
    },
    content: {
      articles: {
        topN: 10,
        minRating: 3,
      },
      tools: {
        perCategory: 2,
      },
      notes: {
        groupBy: 'none',
      },
    },
  };

  it('should migrate legacy config and add enhanced fields', () => {
    const migrated: any = migrateOldConfig(baseLegacyConfig);

    expect(migrated.modules).toBeDefined();
    expect(migrated.modules.reading).toBeDefined();
    expect(migrated.modules.reading.filter.minRating).toBe(3);
    expect(migrated.export.formats).toEqual(['markdown']);
    expect(migrated.visual).toBeDefined();
  });

  it('should gracefully handle missing enhanced fields', () => {
    const configWithoutExtras: TemplateConfig = {
      ...baseLegacyConfig,
      content: {},
    };

    const migrated: any = migrateOldConfig(configWithoutExtras);

    expect(migrated.modules.reading.enabled).toBe(true);
    expect(migrated.modules.tech.enabled).toBe(true);
    expect(migrated.export.wechat.validateImages).toBe(true);
    expect(migrated.export.wechat.backgroundPreset).toBe('grid');
    expect(migrated.export.wechat.theme).toBe('magazine-editorial');
    expect(migrated.visual.coverImage).toBeUndefined();
  });

  it('should keep legacy template usable when templateVersion is legacy', () => {
    const migrated: any = migrateOldConfig({
      ...baseLegacyConfig,
      template: { path: './templates/weekly.hbs' },
      ...( { templateVersion: 'legacy' } as any),
    });

    expect(migrated.templateVersion).toBe('legacy');
    expect(migrated.template.path).toContain('weekly.hbs');
  });

  it('should switch to enhanced template when templateVersion is enhanced', () => {
    const migrated: any = migrateOldConfig({
      ...baseLegacyConfig,
      ...( { templateVersion: 'enhanced' } as any),
    });

    expect(migrated.templateVersion).toBe('enhanced');
    expect(migrated.template.path).toContain('weekly.hbs');
  });

  it('should preserve explicit enhanced template path when templateVersion is enhanced', () => {
    const explicitPath = '/tmp/custom/weekly.hbs';
    const migrated: any = migrateOldConfig({
      ...baseLegacyConfig,
      template: { path: explicitPath },
      ...( { templateVersion: 'enhanced' } as any),
    });

    expect(migrated.templateVersion).toBe('enhanced');
    expect(migrated.template.path).toBe(explicitPath);
  });
});
