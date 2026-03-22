import { cosmiconfig } from 'cosmiconfig';
import path from 'path';
import {
  IConfigManager,
  SystemConfig,
  TemplateConfig,
  ValidationResult,
  GlobalConfig,
  DataSourceInput,
  DataSourceConfig,
  IHookManager,
  HookType,
} from '../types/interfaces';
import {
  DEFAULT_WECHAT_THEME,
  WECHAT_THEMES,
} from '../constants/wechatThemes';
import { DataSourceManager } from './DataSourceManager';
import { migrateOldConfig } from './configMigration';

/**
 * ConfigManager 负责加载、验证和管理系统配置
 * 支持 cosmiconfig 进行灵活的配置发现
 */
export class ConfigManager implements IConfigManager {
  private explorer: ReturnType<typeof cosmiconfig>;
  private loadedConfig: SystemConfig | null = null;
  private hookManager: IHookManager | null = null;

  constructor(hookManager?: IHookManager) {
    this.explorer = cosmiconfig('lyra', {
      searchPlaces: [
        'package.json',
        '.lyrarc',
        '.lyrarc.json',
        '.lyrarc.yaml',
        '.lyrarc.yml',
        '.lyrarc.js',
        '.lyrarc.cjs',
        '.lyrarc.mjs',
        'lyra.config.json',
        'lyra.config.js',
        'lyra.config.cjs',
        'lyra.config.mjs',
      ],
    });
    this.hookManager = hookManager || null;
  }

  /**
   * 从文件加载配置或搜索配置文件
   * @param configPath - 配置文件路径（可选）
   * @returns 系统配置
   */
  async load(configPath?: string): Promise<SystemConfig> {
    let result;

    try {
      if (configPath) {
        // 从指定路径加载
        result = await this.explorer.load(path.resolve(configPath));
      } else {
        // 搜索配置文件
        result = await this.explorer.search();
      }

      if (!result || !result.config) {
        // 未找到配置，使用默认值
        this.loadedConfig = this.getDefaultConfig();
        return this.loadedConfig;
      }

      // 与默认配置合并
      const mergedConfig = this.mergeWithDefaults(result.config);
      const config = this.applyLegacyMigration(mergedConfig);

      // 验证配置
      const validation = this.validate(config);
      if (!validation.valid) {
        throw new Error(
          `Configuration validation failed:\n${validation.errors.join('\n')}`
        );
      }

      this.loadedConfig = config;

      // 加载并注册 hooks（如果提供了 HookManager）
      if (this.hookManager) {
        this.loadHooks(config);
      }

      return config;
    } catch (error) {
      if (error instanceof Error && error.message.includes('validation failed')) {
        throw error;
      }
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取特定模板类型的配置
   * @param templateType - 模板类型名称
   * @returns 模板配置，如果未找到则返回 null
   */
  getTemplateConfig(templateType: string): TemplateConfig | null {
    if (!this.loadedConfig) {
      return null;
    }

    const config = this.loadedConfig.templates[templateType];
    if (!config) {
      return null;
    }

    // Ensure the returned value is properly typed as TemplateConfig
    return config as TemplateConfig;
  }

  /**
   * 验证系统配置
   * @param config - 要验证的配置
   * @returns 验证结果，包含错误信息（如果有）
   */
  validate(config: SystemConfig): ValidationResult {
    const errors: string[] = [];

    // 验证全局配置
    if (!config.global) {
      errors.push('缺少全局配置');
    } else {
      if (!config.global.logLevel) {
        errors.push('缺少 global.logLevel');
      } else if (!['debug', 'info', 'warning', 'error'].includes(config.global.logLevel)) {
        errors.push(`无效的 global.logLevel: ${config.global.logLevel}`);
      }

      if (!config.global.defaultTemplate) {
        errors.push('缺少 global.defaultTemplate');
      }
    }

    // 验证模板配置
    if (!config.templates || typeof config.templates !== 'object') {
      errors.push('缺少或无效的模板配置');
    } else if (Object.keys(config.templates).length === 0) {
      errors.push('未配置任何模板');
    } else {
      // 验证每个模板
      for (const [templateType, templateConfig] of Object.entries(config.templates)) {
        const templateErrors = this.validateTemplateConfig(templateType, templateConfig);
        errors.push(...templateErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证单个模板配置
   * @param templateType - 模板类型名称
   * @param config - 模板配置
   * @returns 验证错误数组
   */
  private validateTemplateConfig(templateType: string, config: TemplateConfig): string[] {
    const errors: string[] = [];
    const enhancedConfig = config as any;

    if (typeof config.enabled !== 'boolean') {
      errors.push(`模板 ${templateType}: 缺少或无效的 'enabled' 字段`);
    }

    if (!config.template || !config.template.path) {
      errors.push(`模板 ${templateType}: 缺少 template.path`);
    }

    if (!config.sources || typeof config.sources !== 'object') {
      errors.push(`模板 ${templateType}: 缺少或无效的数据源配置`);
    } else {
      // 验证数据源
      for (const [sourceName, sourceConfig] of Object.entries(config.sources)) {
        const sourceErrors = this.validateDataSource(templateType, sourceName, sourceConfig);
        errors.push(...sourceErrors);
      }
    }

    if (!config.output || !config.output.path) {
      errors.push(`模板 ${templateType}: 缺少 output.path`);
    }

    if (!config.output || !config.output.filename) {
      errors.push(`模板 ${templateType}: 缺少 output.filename`);
    }

    if (!config.content || typeof config.content !== 'object') {
      errors.push(`模板 ${templateType}: 缺少或无效的内容配置`);
    }

    // 验证钩子（如果存在）
    if (config.hooks) {
      if (typeof config.hooks !== 'object') {
        errors.push(`模板 ${templateType}: 无效的钩子配置`);
      } else {
        for (const [hookType, hookPath] of Object.entries(config.hooks)) {
          if (!hookPath || typeof hookPath !== 'string') {
            errors.push(`模板 ${templateType}: ${hookType} 的钩子路径无效`);
          }
        }
      }
    }

    // 验证调度配置（如果存在）
    if (config.schedule) {
      if (typeof config.schedule.enabled !== 'boolean') {
        errors.push(`模板 ${templateType}: 无效的 schedule.enabled`);
      }
      if (config.schedule.enabled && !config.schedule.cron) {
        errors.push(`模板 ${templateType}: 缺少 schedule.cron`);
      }
    }

    // 验证增强视觉配置（如果存在）
    if (enhancedConfig.visual !== undefined) {
      errors.push(...this.validateVisualConfig(templateType, enhancedConfig.visual));
    }

    // 验证增强模块配置（如果存在）
    if (enhancedConfig.modules !== undefined) {
      errors.push(...this.validateModulesConfig(templateType, enhancedConfig.modules));
    }

    // 验证导出配置（如果存在）
    if (enhancedConfig.export !== undefined) {
      errors.push(...this.validateExportConfig(templateType, enhancedConfig.export));
    }

    return errors;
  }

  /**
   * 验证数据源配置
   * @param templateType - 模板类型名称
   * @param sourceName - 数据源名称
   * @param sourceConfig - 数据源配置
   * @returns 验证错误数组
   */
  private validateDataSource(
    templateType: string,
    sourceName: string,
    sourceConfig: DataSourceInput
  ): string[] {
    const errors: string[] = [];

    if (!sourceConfig) {
      errors.push(`模板 ${templateType}.${sourceName}: 缺少数据源配置`);
      return errors;
    }

    try {
      // 使用 DataSourceManager 规范化数据源配置
      const normalizedSources = DataSourceManager.normalize(sourceConfig);

      // 使用 DataSourceManager 验证规范化后的配置
      const validation = DataSourceManager.validate(normalizedSources);

      // 将验证错误添加到结果中，并添加模板和数据源上下文
      if (!validation.valid) {
        validation.errors.forEach(error => {
          errors.push(`模板 ${templateType}.${sourceName}: ${error}`);
        });
      }
    } catch (error) {
      errors.push(
        `模板 ${templateType}.${sourceName}: 数据源配置处理失败 - ${error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return errors;
  }

  /**
   * 获取默认系统配置
   * @returns 默认配置
   */
  private getDefaultConfig(): SystemConfig {
    return {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly',
      },
      templates: {
        weekly: {
          enabled: true,
          template: {
            path: './templates/weekly.hbs',
          },
          sources: {
            clippings: './Clippings',
            tools: './Tools',
            notes: './Permanent Notes',
          },
          output: {
            path: './Weekly',
            filename: 'Weekly-{{issueNumber}}.md',
          },
          content: {
            articles: {
              topN: 10,
              minRating: 3,
            },
            tools: {
              perCategory: 1,
            },
            notes: {
              groupBy: 'tags',
            },
          },
        },
      },
    };
  }

  /**
   * 将用户配置与默认配置合并
   * @param userConfig - 用户提供的配置
   * @returns 合并后的配置
   */
  private mergeWithDefaults(userConfig: Partial<SystemConfig>): SystemConfig {
    const defaults = this.getDefaultConfig();

    // 合并全局配置
    const global: GlobalConfig = {
      ...defaults.global,
      ...userConfig.global,
    };

    // 合并模板配置
    const templates: { [key: string]: TemplateConfig } = {};

    // 从默认模板开始
    for (const [key, value] of Object.entries(defaults.templates)) {
      templates[key] = value;
    }

    // 用用户模板覆盖
    if (userConfig.templates) {
      for (const [key, value] of Object.entries(userConfig.templates)) {
        if (templates[key]) {
          // 深度合并模板配置
          templates[key] = this.mergeTemplateConfig(templates[key], value as Partial<TemplateConfig>);
        } else {
          // 新模板 - 确保类型正确
          templates[key] = value as TemplateConfig;
        }
      }
    }

    return {
      global,
      templates,
      modules: userConfig.modules ? { ...userConfig.modules } : undefined,
    };
  }

  /**
   * 深度合并模板配置
   * @param defaultConfig - 默认模板配置
   * @param userConfig - 用户模板配置
   * @returns 合并后的模板配置
   */
  private mergeTemplateConfig(
    defaultConfig: TemplateConfig,
    userConfig: Partial<TemplateConfig>
  ): TemplateConfig {
    const enhancedDefaults = this.getEnhancedDefaults();
    const userEnhanced = userConfig as any;
    const defaultEnhanced = defaultConfig as any;

    const merged: any = {
      enabled: userConfig.enabled !== undefined ? userConfig.enabled : defaultConfig.enabled,
      template: {
        ...defaultConfig.template,
        ...userConfig.template,
      },
      hooks: {
        ...defaultConfig.hooks,
        ...userConfig.hooks,
      },
      sources: {
        ...defaultConfig.sources,
        ...userConfig.sources,
      },
      output: {
        ...defaultConfig.output,
        ...userConfig.output,
      },
      content: this.deepMerge(defaultConfig.content, userConfig.content || {}),
      branding: userConfig.branding
        ? {
          ...defaultConfig.branding,
          ...userConfig.branding,
        }
        : defaultConfig.branding,
      schedule: userConfig.schedule
        ? {
          ...defaultConfig.schedule,
          ...userConfig.schedule,
        }
        : defaultConfig.schedule,
      ai: userConfig.ai
        ? {
          ...defaultConfig.ai,
          ...userConfig.ai,
        }
        : defaultConfig.ai,
      templateVersion: this.resolveTemplateVersion(defaultConfig, userConfig),
    };

    // 增强配置：visual/modules/export
    merged.visual = {
      ...enhancedDefaults.visual,
      ...defaultEnhanced.visual,
      ...userEnhanced.visual,
    };

    merged.modules = this.mergeModuleConfig(
      enhancedDefaults.modules,
      defaultEnhanced.modules || {},
      userEnhanced.modules || {}
    );

    merged.export = {
      ...enhancedDefaults.export,
      ...defaultEnhanced.export,
      ...userEnhanced.export,
      wechat: {
        ...enhancedDefaults.export.wechat,
        ...(defaultEnhanced.export?.wechat || {}),
        ...(userEnhanced.export?.wechat || {}),
      },
    };

    return merged as TemplateConfig;
  }

  private applyLegacyMigration(config: SystemConfig): SystemConfig {
    const migratedTemplates: { [key: string]: TemplateConfig } = {};
    for (const [templateType, templateConfig] of Object.entries(config.templates)) {
      migratedTemplates[templateType] = migrateOldConfig(templateConfig as any) as TemplateConfig;
    }
    return {
      ...config,
      templates: migratedTemplates,
    };
  }

  private resolveTemplateVersion(defaultConfig: TemplateConfig, userConfig: Partial<TemplateConfig>): 'legacy' | 'enhanced' {
    const explicitVersion = (userConfig as any).templateVersion || (defaultConfig as any).templateVersion;
    if (explicitVersion === 'legacy' || explicitVersion === 'enhanced') {
      return explicitVersion;
    }

    const targetTemplatePath =
      userConfig.template?.path || defaultConfig.template.path || '';
    const hasEnhancedSignals = Boolean(
      (userConfig as any).visual ||
      (userConfig as any).modules ||
      (userConfig as any).export ||
      targetTemplatePath.includes('enhanced-weekly')
    );

    return hasEnhancedSignals ? 'enhanced' : 'legacy';
  }

  /**
   * 深度合并两个对象
   * @param target - 目标对象
   * @param source - 源对象
   * @returns 合并后的对象
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * 从配置中加载并注册 hooks
   * @param config - 系统配置
   */
  private loadHooks(config: SystemConfig): void {
    if (!this.hookManager) {
      return;
    }

    // 遍历所有模板配置
    for (const [templateType, templateConfig] of Object.entries(config.templates)) {
      // 检查模板是否有 hooks 配置
      if (!templateConfig.hooks) {
        continue;
      }

      // 注册每个 hook
      for (const [hookType, hookPath] of Object.entries(templateConfig.hooks)) {
        try {
          // 验证 hookType 是否有效
          const validHookTypes: HookType[] = [
            'beforeArticleFilter',
            'afterArticleFilter',
            'customArticleScore',
            'beforeToolFilter',
            'afterToolFilter',
            'customToolScore',
            'contentFilter',
            'beforeRender',
            'afterRender',
          ];

          if (!validHookTypes.includes(hookType as HookType)) {
            console.warn(
              `模板 ${templateType}: 无效的 hook 类型 '${hookType}'，已跳过`
            );
            continue;
          }

          // 注册 hook
          this.hookManager.registerHook(hookType as HookType, hookPath);
          console.log(`已注册 hook: ${templateType}.${hookType} -> ${hookPath}`);
        } catch (error) {
          // Hook 加载失败时记录警告但继续处理
          console.warn(
            `加载 hook 失败: ${templateType}.${hookType} (${hookPath}): ${error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }
  }

  private getEnhancedDefaults() {
    return {
      visual: {
        coverImage: undefined,
        backgroundImage: undefined,
        goldenQuote: undefined,
      },
      modules: {
        weeklyUpdates: { enabled: true, icon: '📅', showImages: false },
        reading: { enabled: true, icon: '📚', showImages: true },
        tech: { enabled: true, icon: '🛠️', showImages: true },
        life: { enabled: true, icon: '🖼️', showImages: true },
        products: { enabled: true, icon: '📦', showImages: true },
        food: { enabled: true, icon: '🍴', showImages: true },
        exercise: { enabled: true, icon: '🏸', showImages: false },
        music: { enabled: true, icon: '🎵', showImages: false },
        thoughts: { enabled: true, icon: '💬', showImages: true },
      } as Record<string, { enabled: boolean; icon?: string; showImages?: boolean; filter?: any }>,
      export: {
        formats: ['markdown'],
        wechat: {
          validateImages: true,
          backgroundPreset: 'grid',
          theme: DEFAULT_WECHAT_THEME,
        },
      },
    };
  }

  private mergeModuleConfig(
    ...moduleConfigs: Array<Record<string, { enabled: boolean; icon?: string; showImages?: boolean; filter?: any }>>
  ): Record<string, { enabled: boolean; icon?: string; showImages?: boolean; filter?: any }> {
    const result: Record<string, { enabled: boolean; icon?: string; showImages?: boolean; filter?: any }> = {};

    for (const config of moduleConfigs) {
      for (const [moduleName, moduleConfig] of Object.entries(config)) {
        result[moduleName] = {
          ...(result[moduleName] || {}),
          ...moduleConfig,
          filter: {
            ...(result[moduleName]?.filter || {}),
            ...(moduleConfig.filter || {}),
          },
        };
      }
    }

    return result;
  }

  private validateVisualConfig(templateType: string, visual: any): string[] {
    const errors: string[] = [];

    if (!visual || typeof visual !== 'object') {
      errors.push(`模板 ${templateType}: visual 必须是对象`);
      return errors;
    }

    if (visual.coverImage !== undefined && typeof visual.coverImage !== 'string') {
      errors.push(`模板 ${templateType}: visual.coverImage 必须是字符串`);
    } else if (typeof visual.coverImage === 'string' && !this.isValidImageReference(visual.coverImage)) {
      console.warn(`模板 ${templateType}: visual.coverImage 路径无效，将忽略: ${visual.coverImage}`);
    }

    if (visual.backgroundImage !== undefined && typeof visual.backgroundImage !== 'string') {
      errors.push(`模板 ${templateType}: visual.backgroundImage 必须是字符串`);
    } else if (typeof visual.backgroundImage === 'string' && !this.isValidImageReference(visual.backgroundImage)) {
      console.warn(
        `模板 ${templateType}: visual.backgroundImage 路径无效，将使用默认背景: ${visual.backgroundImage}`
      );
    }

    if (visual.goldenQuote !== undefined) {
      if (!visual.goldenQuote || typeof visual.goldenQuote !== 'object') {
        errors.push(`模板 ${templateType}: visual.goldenQuote 必须是对象`);
      } else {
        if (!visual.goldenQuote.content || typeof visual.goldenQuote.content !== 'string') {
          errors.push(`模板 ${templateType}: visual.goldenQuote.content 必须是非空字符串`);
        }
        if (!visual.goldenQuote.author || typeof visual.goldenQuote.author !== 'string') {
          errors.push(`模板 ${templateType}: visual.goldenQuote.author 必须是非空字符串`);
        }
      }
    }

    return errors;
  }

  private validateModulesConfig(templateType: string, modules: any): string[] {
    const errors: string[] = [];

    if (!modules || typeof modules !== 'object') {
      errors.push(`模板 ${templateType}: modules 必须是对象`);
      return errors;
    }

    for (const [moduleName, moduleConfig] of Object.entries(modules)) {
      if (!moduleConfig || typeof moduleConfig !== 'object') {
        errors.push(`模板 ${templateType}: modules.${moduleName} 必须是对象`);
        continue;
      }

      const cfg = moduleConfig as any;
      if (typeof cfg.enabled !== 'boolean') {
        errors.push(`模板 ${templateType}: modules.${moduleName}.enabled 必须是布尔值`);
      }

      if (cfg.icon !== undefined && typeof cfg.icon !== 'string') {
        errors.push(`模板 ${templateType}: modules.${moduleName}.icon 必须是字符串`);
      }

      if (cfg.showImages !== undefined && typeof cfg.showImages !== 'boolean') {
        errors.push(`模板 ${templateType}: modules.${moduleName}.showImages 必须是布尔值`);
      }

      if (cfg.filter !== undefined) {
        errors.push(...this.validateFilterConfig(templateType, moduleName, cfg.filter));
      }
    }

    return errors;
  }

  private validateFilterConfig(templateType: string, moduleName: string, filter: any): string[] {
    const errors: string[] = [];

    if (!filter || typeof filter !== 'object') {
      errors.push(`模板 ${templateType}: modules.${moduleName}.filter 必须是对象`);
      return errors;
    }

    if (filter.categories !== undefined) {
      if (!Array.isArray(filter.categories) || filter.categories.some((c: any) => typeof c !== 'string')) {
        errors.push(`模板 ${templateType}: modules.${moduleName}.filter.categories 必须是字符串数组`);
      }
    }

    if (filter.tags !== undefined) {
      if (!Array.isArray(filter.tags) || filter.tags.some((t: any) => typeof t !== 'string')) {
        errors.push(`模板 ${templateType}: modules.${moduleName}.filter.tags 必须是字符串数组`);
      }
    }

    if (filter.minRating !== undefined && typeof filter.minRating !== 'number') {
      errors.push(`模板 ${templateType}: modules.${moduleName}.filter.minRating 必须是数字`);
    }

    if (filter.dateRange !== undefined) {
      if (!filter.dateRange || typeof filter.dateRange !== 'object') {
        errors.push(`模板 ${templateType}: modules.${moduleName}.filter.dateRange 必须是对象`);
      } else {
        if (!filter.dateRange.start || !this.isValidDateLike(filter.dateRange.start)) {
          errors.push(`模板 ${templateType}: modules.${moduleName}.filter.dateRange.start 无效`);
        }
        if (!filter.dateRange.end || !this.isValidDateLike(filter.dateRange.end)) {
          errors.push(`模板 ${templateType}: modules.${moduleName}.filter.dateRange.end 无效`);
        }
      }
    }

    return errors;
  }

  private validateExportConfig(templateType: string, exportConfig: any): string[] {
    const errors: string[] = [];

    if (!exportConfig || typeof exportConfig !== 'object') {
      errors.push(`模板 ${templateType}: export 必须是对象`);
      return errors;
    }

    if (!Array.isArray(exportConfig.formats) || exportConfig.formats.length === 0) {
      errors.push(`模板 ${templateType}: export.formats 必须是非空数组`);
    } else {
      const supportedFormats = new Set(['markdown', 'html', 'wechat']);
      for (const format of exportConfig.formats) {
        if (!supportedFormats.has(format)) {
          errors.push(`模板 ${templateType}: export.formats 包含不支持的格式: ${format}`);
        }
      }
    }

    if (exportConfig.wechat !== undefined) {
      if (!exportConfig.wechat || typeof exportConfig.wechat !== 'object') {
        errors.push(`模板 ${templateType}: export.wechat 必须是对象`);
      } else {
        if (
          exportConfig.wechat.validateImages !== undefined &&
          typeof exportConfig.wechat.validateImages !== 'boolean'
        ) {
          errors.push(`模板 ${templateType}: export.wechat.validateImages 必须是布尔值`);
        }

        if (
          exportConfig.wechat.backgroundPreset !== undefined &&
          !['grid', 'warm', 'plain'].includes(exportConfig.wechat.backgroundPreset)
        ) {
          errors.push(`模板 ${templateType}: export.wechat.backgroundPreset 必须是 grid|warm|plain`);
        }

        if (
          exportConfig.wechat.theme !== undefined &&
          !WECHAT_THEMES.includes(exportConfig.wechat.theme)
        ) {
          errors.push(
            `模板 ${templateType}: export.wechat.theme 必须是 ${WECHAT_THEMES.join('|')}`
          );
        }

        if (
          exportConfig.wechat.imageProxyUrl !== undefined &&
          typeof exportConfig.wechat.imageProxyUrl !== 'string'
        ) {
          errors.push(`模板 ${templateType}: export.wechat.imageProxyUrl 必须是字符串`);
        }

        if (
          exportConfig.wechat.inaccessibleImageDomains !== undefined &&
          (
            !Array.isArray(exportConfig.wechat.inaccessibleImageDomains) ||
            exportConfig.wechat.inaccessibleImageDomains.some((domain: unknown) => typeof domain !== 'string')
          )
        ) {
          errors.push(`模板 ${templateType}: export.wechat.inaccessibleImageDomains 必须是字符串数组`);
        }

        if (exportConfig.wechat.imageOptimization !== undefined) {
          const imageOptimization = exportConfig.wechat.imageOptimization;
          if (!imageOptimization || typeof imageOptimization !== 'object') {
            errors.push(`模板 ${templateType}: export.wechat.imageOptimization 必须是对象`);
          } else {
            if (
              imageOptimization.maxWidth !== undefined &&
              (
                typeof imageOptimization.maxWidth !== 'number' ||
                !Number.isFinite(imageOptimization.maxWidth) ||
                imageOptimization.maxWidth <= 0
              )
            ) {
              errors.push(`模板 ${templateType}: export.wechat.imageOptimization.maxWidth 必须是正数`);
            }

            if (
              imageOptimization.quality !== undefined &&
              (
                typeof imageOptimization.quality !== 'number' ||
                !Number.isFinite(imageOptimization.quality) ||
                imageOptimization.quality < 1 ||
                imageOptimization.quality > 100
              )
            ) {
              errors.push(`模板 ${templateType}: export.wechat.imageOptimization.quality 必须在 1-100 之间`);
            }

            if (
              imageOptimization.format !== undefined &&
              !['auto', 'webp', 'jpeg', 'png'].includes(imageOptimization.format)
            ) {
              errors.push(`模板 ${templateType}: export.wechat.imageOptimization.format 必须是 auto|webp|jpeg|png`);
            }
          }
        }
      }
    }

    return errors;
  }

  private isValidDateLike(value: any): boolean {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }

  private isValidImageReference(value: string): boolean {
    const imageRef = value.trim();
    if (!imageRef) {
      return false;
    }

    // 动态 Unsplash 占位符，运行期会解析为真实 URL
    if (imageRef.toLowerCase().startsWith('unsplash:')) {
      return true;
    }

    if (this.isValidHttpUrl(imageRef)) {
      return true;
    }

    return (
      imageRef.startsWith('./') ||
      imageRef.startsWith('../') ||
      path.isAbsolute(imageRef)
    );
  }

  private isValidHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
