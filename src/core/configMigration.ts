import { EnhancedTemplateConfig, TemplateConfig } from '../types/interfaces';
import { DEFAULT_WECHAT_THEME } from '../constants/wechatThemes';

const DEFAULT_MODULES = {
  weeklyUpdates: { enabled: true, icon: '📅' },
  reading: { enabled: true, icon: '📚' },
  tech: { enabled: true, icon: '🛠️' },
  life: { enabled: true, icon: '🖼️' },
  products: { enabled: true, icon: '📦' },
  food: { enabled: true, icon: '🍴' },
  exercise: { enabled: true, icon: '🏸' },
  music: { enabled: true, icon: '🎵' },
  thoughts: { enabled: true, icon: '💬' },
};

/**
 * 将旧配置迁移为增强配置（保留向后兼容）
 */
export function migrateOldConfig(oldConfig: TemplateConfig): EnhancedTemplateConfig {
  const input: any = oldConfig;

  const explicitVersion = input.templateVersion;
  const inferredVersion: 'legacy' | 'enhanced' =
    explicitVersion === 'legacy' || explicitVersion === 'enhanced'
      ? explicitVersion
      : inferTemplateVersion(oldConfig);

  const legacyReadingMinRating =
    typeof oldConfig.content?.articles?.minRating === 'number'
      ? oldConfig.content.articles.minRating
      : undefined;

  const legacyTopN =
    typeof oldConfig.content?.articles?.topN === 'number'
      ? oldConfig.content.articles.topN
      : undefined;

  const mergedModules = {
    ...DEFAULT_MODULES,
    ...(input.modules || {}),
    reading: {
      ...DEFAULT_MODULES.reading,
      filter: {
        ...(legacyReadingMinRating !== undefined ? { minRating: legacyReadingMinRating } : {}),
        ...(legacyTopN !== undefined ? { topN: legacyTopN } : {}),
        categories: ['文章', '书籍'],
        ...(input.modules?.reading?.filter || {}),
      },
      ...(input.modules?.reading || {}),
    },
    tech: {
      ...DEFAULT_MODULES.tech,
      filter: {
        categories: ['工具', '代码'],
        ...(input.modules?.tech?.filter || {}),
      },
      ...(input.modules?.tech || {}),
    },
  };

  const migrated: EnhancedTemplateConfig = {
    ...oldConfig,
    template: {
      ...oldConfig.template,
      path: resolveTemplatePath(inferredVersion, oldConfig.template.path),
    },
    visual: {
      coverImage: input.visual?.coverImage,
      backgroundImage: input.visual?.backgroundImage,
      goldenQuote: input.visual?.goldenQuote,
    },
    modules: mergedModules,
    export: {
      formats: input.export?.formats || ['markdown'],
      wechat: {
        validateImages: input.export?.wechat?.validateImages ?? true,
        backgroundPreset: input.export?.wechat?.backgroundPreset ?? 'grid',
        theme: input.export?.wechat?.theme ?? DEFAULT_WECHAT_THEME,
        imageProxyUrl: input.export?.wechat?.imageProxyUrl,
        inaccessibleImageDomains: input.export?.wechat?.inaccessibleImageDomains,
        imageOptimization: input.export?.wechat?.imageOptimization,
      },
    },
  };

  (migrated as any).templateVersion = inferredVersion;
  return migrated;
}

function inferTemplateVersion(config: TemplateConfig): 'legacy' | 'enhanced' {
  const cfg: any = config;
  if (
    cfg.visual ||
    cfg.modules ||
    cfg.export ||
    config.template.path.includes('enhanced-weekly')
  ) {
    return 'enhanced';
  }
  return 'legacy';
}

function resolveTemplatePath(version: 'legacy' | 'enhanced', currentPath: string): string {
  const normalizedPath = currentPath || '';
  const normalizedPosix = normalizedPath.replace(/\\/g, '/');
  const isBuiltinTemplatePath =
    !normalizedPosix ||
    /^(?:\.\/)?templates\/(?:weekly|enhanced-weekly)\.hbs$/.test(normalizedPosix) ||
    /^(?:weekly|enhanced-weekly)\.hbs$/.test(normalizedPosix);

  if (version === 'enhanced') {
    // 单模板模式下，内置模板统一指向 weekly.hbs，保留自定义路径
    if (isBuiltinTemplatePath) {
      return './templates/weekly.hbs';
    }
    return normalizedPath;
  }

  if (isBuiltinTemplatePath) {
    return './templates/weekly.hbs';
  }

  return normalizedPath;
}
