import { glob } from 'glob';
import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import {
  IDataProvider,
  CollectOptions,
  TemplateData,
  ValidationResult,
  TemplateConfig,
  IHookManager,
  ContentItem,
  Article,
  Tool,
  DataSourceInput,
  DataSourceConfig,
  EnhancedTemplateConfig,
  EnhancedTemplateData,
  EnhancedArticle,
  EnhancedTool,
  LifeMoment,
  FoodRecord,
  ExerciseRecord,
  MusicRecommendation,
  FilterCriteria,
} from '../types/interfaces';
import { ArticleFilter } from '../filters/ArticleFilter';
import { ToolFilter } from '../filters/ToolFilter';
import { ContentAggregator } from '../aggregators/ContentAggregator';
import { MetadataManager } from '../metadata/MetadataManager';
import { EnhancedMetadataManager } from '../metadata/EnhancedMetadataManager';
import { EnhancedContentFilter } from '../filters/EnhancedContentFilter';
import { DataSourceManager } from '../core/DataSourceManager';
import { DataCollectionError, ErrorCode } from '../types/errors';
import { LocalModelProvider } from '../ai/providers/LocalModelProvider';
import { OpenAIProvider } from '../ai/providers/OpenAIProvider';
import { AnthropicProvider } from '../ai/providers/AnthropicProvider';
import { GeminiProvider } from '../ai/providers/GeminiProvider';
import type {
  IAIProvider as RuntimeAIProvider,
  AIProviderConfig,
  SummaryOptions as RuntimeAISummaryOptions,
} from '../ai/interfaces';

type EnhancedModuleName =
  | 'weeklyUpdates'
  | 'reading'
  | 'tech'
  | 'life'
  | 'products'
  | 'food'
  | 'exercise'
  | 'music'
  | 'thoughts';

type UnsplashAsset = {
  path: string;
  tags: string[];
  kinds: Array<'cover' | 'background'>;
};

/**
 * WeeklyDataProvider 负责收集 Weekly 模板所需的数据
 * 集成 ArticleFilter、ToolFilter、ContentAggregator 和 MetadataManager
 * 支持旧版 weekly 与增强版 enhanced-weekly 两种数据结构
 */
export class WeeklyDataProvider implements IDataProvider {
  private config: TemplateConfig;
  private articleFilter: ArticleFilter;
  private toolFilter: ToolFilter;
  private contentAggregator: ContentAggregator;
  private metadataManager: MetadataManager;
  private enhancedMetadataManager?: EnhancedMetadataManager;
  private enhancedContentFilter: EnhancedContentFilter;
  private configDir?: string;

  private static readonly CATEGORY_TO_MODULE: Record<string, EnhancedModuleName> = {
    // weeklyUpdates
    '本周动态': 'weeklyUpdates',
    'weeklyupdates': 'weeklyUpdates',
    'weekly-update': 'weeklyUpdates',
    '产品发布': 'weeklyUpdates',
    '发布日志': 'weeklyUpdates',
    '发布进展': 'weeklyUpdates',
    'release': 'weeklyUpdates',

    // reading
    '文章': 'reading',
    '书籍': 'reading',
    '阅读': 'reading',
    '读书': 'reading',
    'article': 'reading',
    'book': 'reading',
    '阅读笔记': 'reading',
    '文献': 'reading',

    // tech
    '工具': 'tech',
    '代码': 'tech',
    '技术': 'tech',
    '前端': 'tech',
    'frontend': 'tech',
    '前端工具': 'tech',
    '内容创作工具': 'tech',
    '工程效率': 'tech',
    '工作流': 'tech',
    'workflow': 'tech',
    '自媒体工具': 'tech',
    '开发工具': 'tech',
    'development': 'tech',
    'productivity': 'tech',
    'programming': 'tech',
    'tool': 'tech',
    'code': 'tech',
    'tech': 'tech',

    // life
    '摄影': 'life',
    '生活': 'life',
    '习惯': 'life',
    '时间管理': 'life',
    '追剧': 'life',
    '旅行': 'life',
    'photo': 'life',
    'life': 'life',

    // products
    '好物': 'products',
    'shopping': 'products',
    'buy': 'products',
    'wishlist': 'products',
    '购物': 'products',
    '购买': 'products',
    '好物推荐': 'products',
    'gear': 'products',

    // food
    '美食': 'food',
    '饮食': 'food',
    'food': 'food',

    // exercise
    '运动': 'exercise',
    '健身': 'exercise',
    '羽毛球': 'exercise',
    '跑步': 'exercise',
    'sports': 'exercise',
    'exercise': 'exercise',
    'fitness': 'exercise',

    // music
    '音乐': 'music',
    '听歌': 'music',
    '歌单': 'music',
    '歌曲': 'music',
    'music': 'music',

    // thoughts
    '随感': 'thoughts',
    '随笔': 'thoughts',
    '复盘': 'thoughts',
    '思考': 'thoughts',
    '反思': 'thoughts',
    'thoughts': 'thoughts',
    'reflection': 'thoughts',
  };

  private static readonly UNSPLASH_ASSETS: UnsplashAsset[] = [
    {
      path: 'photo-1487014679447-9f8336841d58',
      tags: ['minimal', 'clean', 'workspace', 'frontend', 'coding', 'desk', 'productivity'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1498050108023-c5249f4df085',
      tags: ['minimal', 'workspace', 'coding', 'tech', 'laptop', 'productivity'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1515879218367-8466d910aaa4',
      tags: ['coding', 'frontend', 'workspace', 'monitor', 'creative'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1461749280684-dccba630e2f6',
      tags: ['reading', 'books', 'notes', 'minimal', 'creative'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1455390582262-044cdead277a',
      tags: ['creative', 'workspace', 'desk', 'writing', 'notes'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1517248135467-4c7edcad34c4',
      tags: ['productivity', 'workspace', 'minimal', 'lifestyle', 'desk'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1500530855697-b586d89ba3ee',
      tags: ['music', 'lifestyle', 'creative', 'relax'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1511300636408-a63a89df3482',
      tags: ['background', 'light', 'texture', 'paper', 'minimal', 'clean'],
      kinds: ['background'],
    },
    {
      path: 'photo-1557683316-973673baf926',
      tags: ['background', 'light', 'texture', 'minimal', 'workspace'],
      kinds: ['background'],
    },
    {
      path: 'photo-1493246507139-91e8fad9978e',
      tags: ['background', 'light', 'texture', 'paper', 'clean'],
      kinds: ['background'],
    },
    {
      path: 'photo-1517817748493-49ec54a32465',
      tags: ['background', 'minimal', 'texture', 'creative'],
      kinds: ['background'],
    },
    {
      path: 'photo-1472141521881-95d0e87e2e39',
      tags: ['fitness', 'exercise', 'sports', 'lifestyle', 'light'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1519389950473-47ba0277781c',
      tags: ['food', 'lifestyle', 'minimal', 'clean'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1532938911079-1b06ac7ceec7',
      tags: ['badminton', 'sports', 'exercise', 'fitness'],
      kinds: ['cover', 'background'],
    },
    {
      path: 'photo-1514525253161-7a46d19cd819',
      tags: ['music', 'creative', 'lifestyle'],
      kinds: ['cover', 'background'],
    },
  ];

  private static readonly DEFAULT_IMAGE_PRIORITY: EnhancedModuleName[] = [
    'life',
    'food',
    'music',
    'products',
    'reading',
    'thoughts',
    'tech',
    'weeklyUpdates',
    'exercise',
  ];

  /**
   * 创建 WeeklyDataProvider 实例
   * @param config - Weekly 模板配置
   * @param hookManager - 钩子管理器
   * @param configDir - 配置文件目录，用于相对路径解析
   */
  constructor(config: TemplateConfig, hookManager: IHookManager, configDir?: string) {
    this.config = config;

    // 初始化各个组件
    const articleSources = config.sources.articles || config.sources.clippings;
    const toolSources = config.sources.tools;
    const noteSources = config.sources.notes || config.sources.permanentNotes;

    this.articleFilter = new ArticleFilter(articleSources, hookManager);
    this.toolFilter = new ToolFilter(toolSources, hookManager);
    this.contentAggregator = new ContentAggregator(noteSources, hookManager);
    this.metadataManager = new MetadataManager(config.output.path, configDir);
    this.enhancedContentFilter = new EnhancedContentFilter();

    this.configDir = configDir;
  }

  /**
   * 收集 Weekly 模板所需的数据
   * @param options - 收集选项
   * @returns 模板数据
   */
  async collectData(options: CollectOptions): Promise<TemplateData> {
    try {
      if (this.isEnhancedConfig(this.config)) {
        return await this.collectEnhancedData(options);
      }
      return await this.collectClassicData(options);
    } catch (error) {
      throw new DataCollectionError(
        ErrorCode.E007,
        `收集 Weekly 数据失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { options, error }
      );
    }
  }

  /**
   * 验证收集的数据
   * @param data - 模板数据
   * @returns 验证结果
   */
  validateData(data: TemplateData): ValidationResult {
    if (this.isEnhancedConfig(this.config)) {
      return this.validateEnhancedData(data as EnhancedTemplateData);
    }

    const errors: string[] = [];

    if (!data.metadata) {
      errors.push('缺少元数据');
    } else {
      if (!data.metadata.issueNumber) {
        errors.push('缺少期数 (issueNumber)');
      }
      if (!data.metadata.weekStart) {
        errors.push('缺少周开始日期 (weekStart)');
      }
      if (!data.metadata.weekEnd) {
        errors.push('缺少周结束日期 (weekEnd)');
      }
      if (!data.metadata.id) {
        errors.push('缺少文档 ID (id)');
      }
      if (!data.metadata.title) {
        errors.push('缺少标题 (title)');
      }
    }

    if (!data.content) {
      errors.push('缺少内容数据');
    } else {
      if (!Array.isArray(data.content.articles)) {
        errors.push('文章列表格式错误');
      }
      if (!Array.isArray(data.content.tools)) {
        errors.push('工具列表格式错误');
      }
      if (!Array.isArray(data.content.notes)) {
        errors.push('笔记列表格式错误');
      }
    }

    if (!data.statistics) {
      errors.push('缺少统计信息');
    } else {
      if (typeof data.statistics.articles !== 'number') {
        errors.push('文章统计信息格式错误');
      }
      if (typeof data.statistics.tools !== 'number') {
        errors.push('工具统计信息格式错误');
      }
      if (typeof data.statistics.notes !== 'number') {
        errors.push('笔记统计信息格式错误');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 获取模板文件路径
   * @returns 模板文件路径
   */
  getTemplatePath(): string {
    return this.config.template.path;
  }

  private async collectClassicData(options: CollectOptions): Promise<TemplateData> {
    const baseDate = options.date || new Date();
    const { weekStart, weekEnd } = this.calculateWeekRange(baseDate);

    const articleConfig = this.config.content.articles || {};
    const toolConfig = this.config.content.tools || {};
    await this.syncRecommendationFlagsFromHistory(weekStart, articleConfig, toolConfig, {
      dryRun: Boolean((options as any).dryRun),
    });

    const articleTopN = this.toNonNegativeInt(articleConfig.topN, 10);
    const articlePoolMultiplier = this.toPositiveInt(
      articleConfig.poolMultiplier,
      articleConfig.excludeIfInWeekly ? 3 : 1
    );
    const articleCandidates = await this.articleFilter.filter({
      topN: Math.max(articleTopN, articleTopN * articlePoolMultiplier),
      minRating: articleConfig.minRating || 0,
      weekStart: this.formatDate(weekStart),
      weekEnd: this.formatDate(weekEnd),
      configDir: this.configDir,
    });
    const articles = await this.filterArticlesByWeeklyHistory(
      articleCandidates,
      articleTopN,
      weekStart,
      articleConfig
    );

    const toolPerCategory = this.toNonNegativeInt(toolConfig.perCategory, 1);
    const toolPoolMultiplier = this.toPositiveInt(
      toolConfig.poolMultiplier,
      toolConfig.excludeIfInWeekly ? 3 : 1
    );
    const toolCandidates = await this.toolFilter.filter({
      perCategory: Math.max(toolPerCategory, toolPerCategory * toolPoolMultiplier),
      excludeRecommended: Boolean(toolConfig.excludeRecommended),
      configDir: this.configDir,
    });
    const tools = await this.filterToolsByWeeklyHistory(
      toolCandidates,
      toolPerCategory,
      weekStart,
      toolConfig
    );

    const noteConfig = this.config.content.notes || {};
    const notes = await this.contentAggregator.aggregate({
      startDate: weekStart,
      groupBy: noteConfig.groupBy || 'none',
      configDir: this.configDir,
    });

    const metadata = await this.metadataManager.generate({
      date: baseDate,
      outputPath: this.config.output.path,
    });

    if (this.config.branding?.title) {
      metadata.brandTitle = this.config.branding.title;
    }
    metadata.showReferenceLinks = this.resolveReferenceLinksSetting(this.config);

    return {
      metadata,
      content: {
        articles,
        tools,
        notes,
      },
      statistics: {
        articles: articles.length,
        tools: tools.length,
        notes: notes.length,
      },
    };
  }

  private async collectEnhancedData(options: CollectOptions): Promise<EnhancedTemplateData> {
    const baseDate = options.date || new Date();
    const { weekStart, weekEnd } = this.calculateWeekRange(baseDate);
    const enhancedConfig = this.config as EnhancedTemplateConfig;
    const metadataManager = this.getEnhancedMetadataManager();

    const articleConfig = this.config.content.articles || {};
    const toolConfig = this.config.content.tools || {};
    await this.syncRecommendationFlagsFromHistory(weekStart, articleConfig, toolConfig, {
      dryRun: Boolean((options as any).dryRun),
    });

    const articleTopN = this.toNonNegativeInt(articleConfig.topN, 20);
    const articlePoolMultiplier = this.toPositiveInt(
      articleConfig.poolMultiplier,
      articleConfig.excludeIfInWeekly ? 3 : 1
    );
    const articleCandidates = await this.articleFilter.filter({
      topN: Math.max(articleTopN, articleTopN * articlePoolMultiplier),
      minRating: articleConfig.minRating || 0,
      weekStart: this.formatDate(weekStart),
      weekEnd: this.formatDate(weekEnd),
      configDir: this.configDir,
    });
    const rawArticles = await this.filterArticlesByWeeklyHistory(
      articleCandidates,
      articleTopN,
      weekStart,
      articleConfig
    );

    const toolPerCategory = this.toNonNegativeInt(toolConfig.perCategory, 3);
    const toolPoolMultiplier = this.toPositiveInt(
      toolConfig.poolMultiplier,
      toolConfig.excludeIfInWeekly ? 3 : 1
    );
    const toolCandidates = await this.toolFilter.filter({
      perCategory: Math.max(toolPerCategory, toolPerCategory * toolPoolMultiplier),
      excludeRecommended: Boolean(toolConfig.excludeRecommended),
      configDir: this.configDir,
    });
    const rawTools = await this.filterToolsByWeeklyHistory(
      toolCandidates,
      toolPerCategory,
      weekStart,
      toolConfig
    );

    const noteConfig = this.config.content.notes || {};
    const rawNotes = await this.contentAggregator.aggregate({
      startDate: weekStart,
      endDate: weekEnd,
      groupBy: noteConfig.groupBy || 'none',
      configDir: this.configDir,
    });

    const articles = await Promise.all(
      rawArticles.map(async (article) => {
        const frontmatter = await this.readFrontmatter(article.path);
        return metadataManager.parseEnhancedArticle(article, frontmatter);
      })
    );

    const tools = await Promise.all(
      rawTools.map(async (tool) => {
        const frontmatter = await this.readFrontmatter(tool.path);
        return metadataManager.parseEnhancedTool(tool, frontmatter);
      })
    );

    const lifeFromSources = await this.collectEnhancedSourceRecords(
      enhancedConfig.sources.life,
      metadataManager.parseLifeMoment.bind(metadataManager),
      { startDate: weekStart, endDate: weekEnd }
    );
    const foodFromSources = await this.collectEnhancedSourceRecords(
      enhancedConfig.sources.food,
      metadataManager.parseFoodRecord.bind(metadataManager),
      { startDate: weekStart, endDate: weekEnd }
    );
    const exerciseFromSources = await this.collectEnhancedSourceRecords(
      enhancedConfig.sources.exercise,
      metadataManager.parseExerciseRecord.bind(metadataManager),
      { startDate: weekStart, endDate: weekEnd }
    );
    const musicFromSources = await this.collectEnhancedSourceRecords(
      enhancedConfig.sources.music,
      metadataManager.parseMusicRecommendation.bind(metadataManager),
      { startDate: weekStart, endDate: weekEnd }
    );

    const modules: EnhancedTemplateData['content'] = {
      weeklyUpdates: [],
      reading: [],
      tech: [],
      life: lifeFromSources,
      products: [],
      food: foodFromSources,
      exercise: exerciseFromSources,
      music: musicFromSources,
      thoughts: [],
    };

    for (const article of articles) {
      this.routeArticleToModule(article, modules);
    }
    for (const tool of tools) {
      this.routeToolToModule(tool, modules);
    }
    for (const note of rawNotes) {
      this.routeContentItemToModule(note, modules);
    }

    this.pruneWeeklyUpdates(modules);
    this.normalizeModuleImages(modules);

    this.applyModuleSettings(modules, enhancedConfig.modules || {});
    this.applyImageBudget(modules, (enhancedConfig.content as Record<string, any> | undefined)?.images);
    await this.applyAISummaries(modules);
    this.decorateReadingModules(modules);

    const statistics = {
      // 兼容 classic 模板统计字段，便于单模板渲染
      articles: rawArticles.length,
      tools: rawTools.length,
      notes: rawNotes.length,
      weeklyUpdates: modules.weeklyUpdates?.length || 0,
      reading: modules.reading?.length || 0,
      tech: modules.tech?.length || 0,
      life: modules.life?.length || 0,
      products: modules.products?.length || 0,
      food: modules.food?.length || 0,
      exercise: modules.exercise?.length || 0,
      music: modules.music?.length || 0,
      thoughts: modules.thoughts?.length || 0,
    };

    const visualConfig = await this.resolveVisualConfig(
      enhancedConfig.visual,
      modules,
      statistics,
      weekStart
    );

    const metadata = await metadataManager.generateEnhanced(
      {
        date: baseDate,
        outputPath: this.config.output.path,
      },
      visualConfig
    );

    if (this.config.branding?.title) {
      metadata.brandTitle = this.config.branding.title;
    }
    metadata.showReferenceLinks = this.resolveReferenceLinksSetting(enhancedConfig);

    return {
      metadata,
      content: modules,
      statistics,
    };
  }

  private validateEnhancedData(data: EnhancedTemplateData): ValidationResult {
    const errors: string[] = [];

    if (!data.metadata) {
      errors.push('缺少元数据');
    } else {
      if (!data.metadata.issueNumber) {
        errors.push('缺少期数 (issueNumber)');
      }
      if (!data.metadata.weekStart) {
        errors.push('缺少周开始日期 (weekStart)');
      }
      if (!data.metadata.weekEnd) {
        errors.push('缺少周结束日期 (weekEnd)');
      }
      if (!data.metadata.id) {
        errors.push('缺少文档 ID (id)');
      }
      if (!data.metadata.title) {
        errors.push('缺少标题 (title)');
      }
    }

    if (!data.content) {
      errors.push('缺少内容数据');
    } else {
      const moduleNames: EnhancedModuleName[] = [
        'weeklyUpdates',
        'reading',
        'tech',
        'life',
        'products',
        'food',
        'exercise',
        'music',
        'thoughts',
      ];

      for (const moduleName of moduleNames) {
        const moduleItems = data.content[moduleName];
        if (moduleItems !== undefined && !Array.isArray(moduleItems)) {
          errors.push(`模块 ${moduleName} 格式错误`);
        }
      }
    }

    if (!data.statistics) {
      errors.push('缺少统计信息');
    } else {
      for (const [key, value] of Object.entries(data.statistics)) {
        if (typeof value !== 'number') {
          errors.push(`统计信息 ${key} 格式错误`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private resolveReferenceLinksSetting(config: TemplateConfig): boolean {
    const exportConfig = (config as any)?.export;
    if (typeof exportConfig === 'boolean') {
      return exportConfig;
    }
    const referenceLinks = exportConfig?.referenceLinks;
    if (typeof referenceLinks === 'boolean') {
      return referenceLinks;
    }
    if (referenceLinks && typeof referenceLinks === 'object') {
      if (typeof referenceLinks.enabled === 'boolean') {
        return referenceLinks.enabled;
      }
    }
    return true;
  }

  private isEnhancedConfig(config: TemplateConfig): boolean {
    const version = (config as any).templateVersion;
    if (version === 'enhanced') {
      return true;
    }
    if (version === 'legacy') {
      return false;
    }
    const dynamicConfig = config as any;
    return Boolean(
      dynamicConfig.visual ||
      dynamicConfig.modules ||
      dynamicConfig.export ||
      config.template.path.includes('enhanced-weekly')
    );
  }

  private getEnhancedMetadataManager(): EnhancedMetadataManager {
    if (!this.enhancedMetadataManager) {
      this.enhancedMetadataManager = new EnhancedMetadataManager(
        this.config.output.path,
        this.configDir
      );
    }
    return this.enhancedMetadataManager;
  }

  private routeArticleToModule(
    article: EnhancedArticle,
    modules: EnhancedTemplateData['content']
  ): void {
    const moduleName = this.resolveModuleByCategory(article.category, 'reading');

    switch (moduleName) {
      case 'reading':
        modules.reading!.push(article);
        break;
      case 'weeklyUpdates':
        modules.weeklyUpdates!.push(this.toContentItemFromArticle(article));
        break;
      case 'tech':
        modules.tech!.push(this.toEnhancedToolFromArticle(article));
        break;
      case 'life':
        modules.life!.push(this.toLifeMomentFromArticle(article));
        break;
      case 'products':
        modules.products!.push(this.toContentItemFromArticle(article));
        break;
      case 'food':
        modules.food!.push(this.toFoodRecordFromArticle(article));
        break;
      case 'exercise':
        modules.exercise!.push(this.toExerciseRecordFromArticle(article));
        break;
      case 'music':
        modules.music!.push(this.toMusicFromArticle(article));
        break;
      case 'thoughts':
      default:
        modules.thoughts!.push(this.toContentItemFromArticle(article));
        break;
    }
  }

  private routeToolToModule(
    tool: EnhancedTool,
    modules: EnhancedTemplateData['content']
  ): void {
    const moduleName = this.resolveModuleByCategory(tool.category, 'tech');

    switch (moduleName) {
      case 'tech':
        modules.tech!.push(tool);
        break;
      case 'weeklyUpdates':
        modules.weeklyUpdates!.push(this.toContentItemFromTool(tool));
        break;
      case 'reading':
        modules.reading!.push(this.toEnhancedArticleFromTool(tool));
        break;
      case 'life':
        modules.life!.push(this.toLifeMomentFromTool(tool));
        break;
      case 'products':
        modules.tech!.push(tool);
        break;
      case 'food':
        modules.food!.push(this.toFoodRecordFromTool(tool));
        break;
      case 'exercise':
        modules.exercise!.push(this.toExerciseRecordFromTool(tool));
        break;
      case 'music':
        modules.music!.push(this.toMusicFromTool(tool));
        break;
      case 'thoughts':
      default:
        modules.thoughts!.push(this.toContentItemFromTool(tool));
        break;
    }
  }

  private routeContentItemToModule(
    item: ContentItem,
    modules: EnhancedTemplateData['content']
  ): void {
    const moduleName = this.resolveModuleByCategory(item.category, 'thoughts');

    switch (moduleName) {
      case 'weeklyUpdates':
        modules.weeklyUpdates!.push(item);
        break;
      case 'reading':
        modules.reading!.push(this.toEnhancedArticleFromContent(item));
        break;
      case 'tech':
        modules.tech!.push(this.toEnhancedToolFromContent(item));
        break;
      case 'life':
        modules.life!.push(this.toLifeMomentFromContent(item));
        break;
      case 'products':
        modules.products!.push(item);
        break;
      case 'food':
        modules.food!.push(this.toFoodRecordFromContent(item));
        break;
      case 'exercise':
        modules.exercise!.push(this.toExerciseRecordFromContent(item));
        break;
      case 'music':
        modules.music!.push(this.toMusicFromContent(item));
        break;
      case 'thoughts':
      default:
        modules.thoughts!.push(item);
        break;
    }
  }

  private resolveModuleByCategory(
    category: unknown,
    fallback: EnhancedModuleName
  ): EnhancedModuleName {
    if (category === null || category === undefined) {
      return fallback;
    }

    const rawCategory =
      typeof category === 'string' ? category : String(category);
    const normalized = rawCategory.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }

    return WeeklyDataProvider.CATEGORY_TO_MODULE[normalized] || fallback;
  }

  private applyModuleSettings(
    modules: EnhancedTemplateData['content'],
    moduleConfig: NonNullable<EnhancedTemplateConfig['modules']>
  ): void {
    const applyFilter = <T extends Record<string, any>>(
      items: T[],
      criteria?: FilterCriteria
    ): T[] => {
      if (!criteria || items.length === 0) {
        return items;
      }

      const mapped: Array<ContentItem & { __index: number }> = items.map((item, index) => ({
        title: String(item.title || item.type || `item-${index}`),
        path: String(item.path || `virtual-${index}`),
        created: this.extractItemDate(item),
        category: item.category,
        tags: item.tags,
        description: item.description,
        aiSummary: item.aiSummary,
        content: item.content,
        source: item.source,
        ...(typeof item.rating === 'number' ? { rating: item.rating } : {}),
        __index: index,
      }));

      const filtered = this.enhancedContentFilter.filter(mapped, criteria);
      const keep = new Set(filtered.map((item) => (item as any).__index as number));
      return items.filter((_, index) => keep.has(index));
    };

    const setIfDisabled = (moduleName: EnhancedModuleName): boolean => {
      if (moduleConfig[moduleName]?.enabled === false) {
        (modules[moduleName] as any[]) = [];
        return true;
      }
      return false;
    };

    const moduleNames: EnhancedModuleName[] = [
      'weeklyUpdates',
      'reading',
      'tech',
      'life',
      'products',
      'food',
      'exercise',
      'music',
      'thoughts',
    ];

    for (const moduleName of moduleNames) {
      if (setIfDisabled(moduleName)) {
        continue;
      }
      const criteria = moduleConfig[moduleName]?.filter;
      if (!criteria) {
        if (moduleConfig[moduleName]?.showImages === false) {
          this.stripModuleImages(modules[moduleName] as Array<Record<string, any>>);
        }
        continue;
      }
      (modules[moduleName] as any[]) = applyFilter(modules[moduleName] as any[], criteria);
      if (moduleConfig[moduleName]?.showImages === false) {
        this.stripModuleImages(modules[moduleName] as Array<Record<string, any>>);
      }
    }
  }

  private stripModuleImages(items: Array<Record<string, any>> | undefined): void {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    for (const item of items) {
      delete item.image;
      delete item.coverImage;
      delete item.images;
    }
  }

  private async collectEnhancedSourceRecords<T extends { date?: Date }>(
    sourceInput: DataSourceInput | undefined,
    parser: (frontmatter: Record<string, any>, filePath: string) => T | null,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<T[]> {
    if (!sourceInput) {
      return [];
    }

    const sources = DataSourceManager.normalize(sourceInput);
    const records: T[] = [];

    for (const source of sources) {
      let files: string[] = [];
      try {
        files = await this.scanDataSourceFiles(source);
      } catch (error) {
        console.warn(
          `扫描增强数据源失败: ${source.path}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        continue;
      }

      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const { data } = matter(content);
          const parsed = parser(data, filePath);
          if (
            parsed &&
            this.isWithinRange(parsed.date, options.startDate, options.endDate)
          ) {
            records.push(parsed);
          }
        } catch (error) {
          console.warn(
            `解析增强记录失败: ${filePath}, 错误: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    return records;
  }

  private async scanDataSourceFiles(source: DataSourceConfig): Promise<string[]> {
    const baseDir = this.configDir || process.cwd();
    const resolvedPath = path.resolve(baseDir, source.path);

    await fs.access(resolvedPath);

    const includePatterns = source.include || ['**/*.md'];
    const excludePatterns = source.exclude || [];
    const allFiles = new Set<string>();

    for (const pattern of includePatterns) {
      const files = await glob(pattern, {
        cwd: resolvedPath,
        absolute: true,
        ignore: excludePatterns,
        nodir: true,
      });
      files.forEach((filePath) => allFiles.add(filePath));
    }

    return Array.from(allFiles);
  }

  private isWithinRange(
    date: Date | undefined,
    startDate?: Date,
    endDate?: Date
  ): boolean {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return true;
    }

    if (startDate && date < startDate) {
      return false;
    }

    if (endDate && date > endDate) {
      return false;
    }

    return true;
  }

  private async readFrontmatter(filePath?: string): Promise<Record<string, any>> {
    if (!filePath) {
      return {};
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return matter(content).data;
    } catch {
      return {};
    }
  }

  private extractItemDate(item: Record<string, any>): Date {
    if (item.created instanceof Date) {
      return item.created;
    }
    if (item.date instanceof Date) {
      return item.date;
    }
    if (typeof item.created === 'string') {
      const parsed = new Date(item.created);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    if (typeof item.date === 'string') {
      const parsed = new Date(item.date);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date(0);
  }

  private toContentItemFromArticle(article: EnhancedArticle): ContentItem {
    return {
      title: article.title,
      path: article.path || '',
      created: this.extractItemDate(article as any),
      description: article.description || article.aiSummary,
      url: article.url,
      rating: article.rating,
      tags: article.tags,
      category: article.category,
      source: article.source,
    };
  }

  private toContentItemFromTool(tool: EnhancedTool): ContentItem {
    return {
      title: tool.title,
      path: tool.path || '',
      created: this.extractItemDate(tool as any),
      description: tool.description || tool.aiSummary,
      url: tool.url,
      rating: tool.rating,
      category: tool.category,
      source: tool.source,
    };
  }

  private toEnhancedToolFromArticle(article: EnhancedArticle): EnhancedTool {
    return {
      title: article.title,
      url: article.url,
      rating: article.rating,
      category: article.category || '文章',
      description: article.description,
      path: article.path,
      source: article.source,
    };
  }

  private toEnhancedArticleFromTool(tool: EnhancedTool): EnhancedArticle {
    return {
      title: tool.title,
      url: tool.url,
      rating: tool.rating,
      description: tool.description,
      category: tool.category,
      path: tool.path,
      source: tool.source,
      aiSummary: tool.aiSummary,
    };
  }

  private toEnhancedArticleFromContent(item: ContentItem): EnhancedArticle {
    return {
      title: item.title,
      url: item.url || '',
      rating: item.rating || 0,
      description: item.description,
      category: item.category,
      path: item.path,
      source: item.source,
      tags: item.tags,
      aiSummary: item.aiSummary,
    };
  }

  private toEnhancedToolFromContent(item: ContentItem): EnhancedTool {
    return {
      title: item.title,
      url: item.url || '',
      rating: item.rating || 0,
      category: item.category || '未分类',
      description: item.description,
      path: item.path,
      source: item.source,
      aiSummary: item.aiSummary,
    };
  }

  private toLifeMomentFromArticle(article: EnhancedArticle): LifeMoment {
    return {
      title: article.title,
      description: article.description,
      url: article.url,
      images: article.coverImage ? [article.coverImage] : [],
      date: this.extractItemDate(article as any),
      tags: article.tags,
      category: article.category,
      path: article.path,
    };
  }

  private toLifeMomentFromTool(tool: EnhancedTool): LifeMoment {
    return {
      title: tool.title,
      description: tool.description,
      url: tool.url,
      images: [],
      date: this.extractItemDate(tool as any),
      category: tool.category,
      path: tool.path,
    };
  }

  private toLifeMomentFromContent(item: ContentItem): LifeMoment {
    return {
      title: item.title,
      description: item.description,
      url: item.url,
      images: [],
      date: this.extractItemDate(item as any),
      tags: item.tags,
      category: item.category,
      path: item.path,
    };
  }

  private toFoodRecordFromArticle(article: EnhancedArticle): FoodRecord {
    return {
      title: article.title,
      description: article.description,
      url: article.url,
      images: article.coverImage ? [article.coverImage] : [],
      date: this.extractItemDate(article as any),
      rating: article.rating,
      category: article.category,
      path: article.path,
    };
  }

  private toFoodRecordFromTool(tool: EnhancedTool): FoodRecord {
    return {
      title: tool.title,
      description: tool.description,
      url: tool.url,
      images: [],
      date: this.extractItemDate(tool as any),
      rating: tool.rating,
      category: tool.category,
      path: tool.path,
    };
  }

  private toFoodRecordFromContent(item: ContentItem): FoodRecord {
    return {
      title: item.title,
      description: item.description,
      url: item.url,
      images: [],
      date: this.extractItemDate(item as any),
      rating: item.rating,
      category: item.category,
      path: item.path,
    };
  }

  private toExerciseRecordFromArticle(article: EnhancedArticle): ExerciseRecord {
    return {
      type: article.title,
      duration: 0,
      url: article.url,
      date: this.extractItemDate(article as any),
      notes: article.description,
      category: article.category,
      path: article.path,
    };
  }

  private toExerciseRecordFromTool(tool: EnhancedTool): ExerciseRecord {
    return {
      type: tool.title,
      duration: 0,
      url: tool.url,
      date: this.extractItemDate(tool as any),
      notes: tool.description,
      category: tool.category,
      path: tool.path,
    };
  }

  private toExerciseRecordFromContent(item: ContentItem): ExerciseRecord {
    return {
      type: item.title,
      duration: Number((item as any).duration || 0),
      url: item.url,
      calories: (item as any).calories,
      date: this.extractItemDate(item as any),
      notes: item.description,
      category: item.category,
      path: item.path,
    };
  }

  private toMusicFromArticle(article: EnhancedArticle): MusicRecommendation {
    return {
      title: article.title,
      artist: 'Unknown Artist',
      feeling: article.description,
      url: article.url,
      date: this.extractItemDate(article as any),
      category: article.category,
      path: article.path,
    };
  }

  private toMusicFromTool(tool: EnhancedTool): MusicRecommendation {
    return {
      title: tool.title,
      artist: 'Unknown Artist',
      feeling: tool.description,
      url: tool.url,
      date: this.extractItemDate(tool as any),
      category: tool.category,
      path: tool.path,
    };
  }

  private toMusicFromContent(item: ContentItem): MusicRecommendation {
    return {
      title: item.title,
      artist: (item as any).artist || 'Unknown Artist',
      album: (item as any).album,
      feeling: item.description,
      url: (item as any).url,
      date: this.extractItemDate(item as any),
      category: item.category,
      path: item.path,
    };
  }

  private async applyAISummaries(modules: EnhancedTemplateData['content']): Promise<void> {
    const aiConfig = this.config.ai as any;
    const summariesEnabled = aiConfig?.summaries?.enabled ?? true;
    if (!summariesEnabled) {
      return;
    }

    const forceAI = aiConfig?.summaries?.forceAI ?? false;
    const configuredMax = Number(aiConfig?.summaries?.maxLength || aiConfig?.maxLength || 180);
    const configuredMin = Number(aiConfig?.summaries?.minLength || 20);
    const maxLength = this.clampNumber(configuredMax, 20, 280, 180);
    const minLength = this.clampNumber(configuredMin, 20, maxLength, 20);
    const aiProvider = this.createAIProvider('summaries');
    const readingItems = modules.reading || [];

    for (const article of readingItems) {
      if (!forceAI && article.aiSummary && article.aiSummary.trim()) {
        const normalized = this.normalizeSummaryLength(
          article.aiSummary,
          minLength,
          maxLength,
          article.title
        );
        if (!this.isLikelyEnglish(normalized)) {
          article.aiSummary = normalized;
          continue;
        }

        try {
          const sourceContent = await this.getSummarySource(article);
          if (sourceContent && aiProvider) {
            try {
              const aiPrompt = this.buildAISummaryPrompt(article, sourceContent, minLength, maxLength);
              const generated = await aiProvider.generateSummary(aiPrompt, {
                maxLength,
                language: 'zh-CN',
                style: 'detailed',
                temperature: 0.35,
              });
              const regenerated = this.normalizeSummaryLength(
                generated,
                minLength,
                maxLength,
                article.title
              );
              if (regenerated && !this.isLikelyEnglish(regenerated)) {
                article.aiSummary = regenerated;
                continue;
              }
            } catch (error) {
              console.warn(
                `[weekly] 摘要重生成失败，回退个人总结: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }
          article.aiSummary = this.buildPersonalReflectionFallback(article, minLength, maxLength);
        } catch {
          article.aiSummary = this.buildPersonalReflectionFallback(article, minLength, maxLength);
        }
        continue;
      }

      try {
        const sourceContent = await this.getSummarySource(article);
        if (sourceContent && aiProvider) {
          const generated = await this.generateAIReflectionSummary(
            article,
            sourceContent,
            minLength,
            maxLength,
            aiProvider
          );
          if (generated) {
            article.aiSummary = generated;
            continue;
          }
        }

        if (forceAI) {
          article.aiSummary = '';
          continue;
        }

        if (sourceContent) {
          article.aiSummary = this.createSummaryFallback(
            sourceContent,
            minLength,
            maxLength,
            article.title,
            article
          );
        } else {
          article.aiSummary = this.buildPersonalReflectionFallback(article, minLength, maxLength);
        }
      } catch {
        article.aiSummary = forceAI ? '' : this.buildPersonalReflectionFallback(article, minLength, maxLength);
      }
    }
  }

  private async getSummarySource(article: EnhancedArticle): Promise<string> {
    if (!article.path) {
      return '';
    }

    try {
      const raw = await fs.readFile(article.path, 'utf-8');
      const parsed = matter(raw);
      const body = parsed.content.replace(/\s+/g, ' ').trim();
      if (body) {
        return body;
      }
    } catch {
      // ignore and fallback
    }

    if (article.description && article.description.trim()) {
      return article.description;
    }

    return '';
  }

  private createSummaryFallback(
    content: string,
    minLength: number,
    maxLength: number,
    seedText?: string,
    article?: EnhancedArticle
  ): string {
    const compact = this.stripMarkdownForSummary(content);
    if (!compact) {
      const fallback = article
        ? this.buildPersonalReflectionFallback(article, minLength, maxLength)
        : '暂无可提取正文，建议打开原文快速浏览核心观点。';
      return this.normalizeSummaryLength(fallback, minLength, maxLength, seedText);
    }

    const deepSummary = this.composeDeepSummary(compact);
    const normalized = this.normalizeSummaryLength(deepSummary || compact, minLength, maxLength, seedText);
    if (this.isLikelyEnglish(normalized) && article) {
      return this.buildPersonalReflectionFallback(article, minLength, maxLength, compact);
    }
    if (article) {
      return this.buildPersonalReflectionFallback(article, minLength, maxLength, normalized);
    }
    return normalized;
  }

  private normalizeSummaryLength(
    summary: string,
    minLength: number,
    maxLength: number,
    seedText?: string
  ): string {
    let compact = summary.replace(/\s+/g, ' ').trim();
    compact = compact.replace(/^(摘要|总结|Summary|TL;DR)[:：\-\s]+/i, '').trim();
    if (!compact) {
      compact = '暂无可提取摘要。';
    }

    compact = this.truncateSummaryAtBoundary(compact, maxLength);

    if (!/[。！？.!?]$/.test(compact)) {
      compact = this.truncateSummaryAtBoundary(`${compact}。`, maxLength);
    }

    return compact;
  }

  private truncateSummaryAtBoundary(text: string, maxLength: number): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) {
      return compact;
    }

    const sliced = compact.slice(0, maxLength);
    const punctuation = ['。', '！', '？', '；', '.', '!', '?', ';'];
    let boundary = -1;

    for (const mark of punctuation) {
      boundary = Math.max(boundary, sliced.lastIndexOf(mark));
    }

    if (boundary >= Math.floor(maxLength * 0.55)) {
      return sliced.slice(0, boundary + 1).trim();
    }

    const spaceBoundary = sliced.lastIndexOf(' ');
    if (spaceBoundary >= Math.floor(maxLength * 0.6)) {
      return sliced.slice(0, spaceBoundary).trim();
    }

    return sliced.trim();
  }

  private buildLinkAwareSummary(
    article: EnhancedArticle,
    minLength: number,
    maxLength: number
  ): string {
    const title = (article.title || '本条内容').replace(/\s+/g, ' ').trim();
    const host = this.extractHost(article.url) || '来源链接';
    const fallback = `围绕《${title}》，建议先提炼问题定义、核心方法与可迁移做法，再结合自身场景整理 2-3 条可执行动作；原文可在 ${host} 查看。`;
    return this.normalizeSummaryLength(fallback, minLength, maxLength, title);
  }

  private clampNumber(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, value));
  }

  private stripMarkdownForSummary(content: string): string {
    return content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/^>\s?/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private composeDeepSummary(content: string): string {
    const sentences = content
      .split(/(?<=[。！？!?；;])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 10);

    if (sentences.length === 0) {
      return content;
    }

    if (sentences.length <= 2) {
      return sentences.join(' ');
    }

    const total = sentences.length;
    const scored = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: this.scoreSummarySentence(sentence, index, total),
    }));

    const topByScore = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .sort((a, b) => a.index - b.index);

    const selected: typeof topByScore = [];
    if (topByScore.length > 0) {
      selected.push(topByScore[0]);
    }

    const midCandidate = topByScore.find(
      (item) =>
        item.index > Math.floor(total * 0.2) &&
        item.index < Math.ceil(total * 0.8)
    );
    if (midCandidate && !selected.some((item) => item.index === midCandidate.index)) {
      selected.push(midCandidate);
    }

    const tailCandidate = [...topByScore]
      .reverse()
      .find((item) => item.index >= Math.floor(total * 0.6));
    if (tailCandidate && !selected.some((item) => item.index === tailCandidate.index)) {
      selected.push(tailCandidate);
    }

    if (selected.length < 2) {
      const fallback = scored[Math.min(total - 1, 1)];
      if (fallback && !selected.some((item) => item.index === fallback.index)) {
        selected.push(fallback);
      }
    }

    return selected
      .sort((a, b) => a.index - b.index)
      .map((item) => item.sentence)
      .join(' ');
  }

  private buildAISummaryPrompt(
    article: EnhancedArticle,
    sourceContent: string,
    minLength: number,
    maxLength: number
  ): string {
    const title = (article.title || '未命名内容').replace(/\s+/g, ' ').trim();
    const compact = sourceContent.replace(/\s+/g, ' ').trim();
    const clipped = compact.length > 3200 ? compact.slice(0, 3200) : compact;

    return [
      `请生成一段 ${minLength}-${maxLength} 字的中文摘要。`,
      '要求：概括问题背景、核心观点、关键方法和结论，信息密度高、语义完整，客观表述，不使用第一人称。',
      '限制：不要分点，不要空话，不要出现文章标题或“本文/作者”等模板句；必须是中文，不要夹杂英文原句。',
      `标题：${title}`,
      `正文：${clipped}`,
    ].join('\n');
  }

  private async generateAIReflectionSummary(
    article: EnhancedArticle,
    sourceContent: string,
    minLength: number,
    maxLength: number,
    aiProvider: RuntimeAIProvider
  ): Promise<string> {
    const tryGenerate = async (prompt: string): Promise<string> => {
      const generated = await aiProvider.generateSummary(prompt, {
        maxLength,
        language: 'zh-CN',
        style: 'detailed',
        temperature: 0.35,
      });
      return this.normalizeSummaryLength(generated, minLength, maxLength, article.title);
    };

    try {
      const basePrompt = this.buildAISummaryPrompt(article, sourceContent, minLength, maxLength);
      let summary = await tryGenerate(basePrompt);
      if (summary && !this.isLikelyEnglish(summary) && summary.length >= minLength) {
        return summary;
      }

      const expandPrompt = [
        `请把以下内容扩写成 ${minLength}-${maxLength} 字的中文摘要。`,
        '要求：信息密度高，客观表述，不使用第一人称。',
        `原内容：${summary || ''}`,
        `原文：${sourceContent.slice(0, 2400)}`,
      ].join('\n');
      summary = await tryGenerate(expandPrompt);
      if (summary && !this.isLikelyEnglish(summary) && summary.length >= minLength) {
        return summary;
      }

      const rewritePrompt = [
        `请将以下英文内容改写为 ${minLength}-${maxLength} 字的中文摘要。`,
        '要求：客观表述，不使用第一人称，不要出现标题或“本文/作者”，不要夹杂英文。',
        `英文内容：${sourceContent.slice(0, 2400)}`,
      ].join('\n');
      summary = await tryGenerate(rewritePrompt);
      if (summary && !this.isLikelyEnglish(summary) && summary.length >= minLength) {
        return summary;
      }
    } catch (error) {
      console.warn(
        `[weekly] AI 摘要生成失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return '';
  }

  private buildPersonalReflectionFallback(
    article: EnhancedArticle,
    minLength: number,
    maxLength: number,
    sourceContent?: string
  ): string {
    const compact = sourceContent ? this.stripMarkdownForSummary(sourceContent) : '';
    const keyPoints = compact ? this.pickKeyPhrases(compact, 3) : [];
    const seed = this.hashTextToInt(`${article.title || ''}|${article.url || ''}`);
    const introPool = [
      '这次我更在意的是',
      '这篇最戳我的是',
      '这次读下来，我更关注的是',
      '真正让我停下来想一想的是',
      '我最想带走的是',
    ];
    const actionPool = [
      '我会把关键点拆成 2-3 个动作，先在手头项目里小范围试一轮，再根据反馈调节奏和方法。',
      '接下来我会先做一个小实验，把观点落地，再看效果决定要不要放大。',
      '我打算先选一个最能落地的点试一周，验证后再补足细节。',
      '我会先把它转成可执行清单，做完一轮再回头修正。',
      '下一步就是先做小步验证，别急着下结论。',
    ];
    const genericInsights = [
      '它提醒我把判断拆小、把行动落地。',
      '它让我意识到方法比结论更重要。',
      '它让我重新审视优先级和取舍。',
      '它提醒我别急着求快，而是先把基础打稳。',
      '它让我看到一些被我忽略的隐性成本。',
    ];
    const intro = introPool[seed % introPool.length];
    const action = actionPool[seed % actionPool.length];
    const insightBody = keyPoints.length > 0 ? keyPoints.join('，') : genericInsights[seed % genericInsights.length];
    const base = `${intro}${insightBody}。${action}`;
    return this.normalizeSummaryLength(base, minLength, maxLength, article.title);
  }

  private pickKeyPhrases(content: string, limit: number): string[] {
    const sentences = content
      .split(/(?<=[。！？!?；;])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 8)
      .slice(0, 10);

    if (sentences.length === 0) {
      return [];
    }

    const scored = sentences.map((sentence) => ({
      sentence,
      score: this.scoreSummarySentence(sentence, 0, sentences.length),
    }));

    const picked = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.sentence.replace(/[。！？!?；;]+$/g, ''))
      .map((item) => item.length > 30 ? `${item.slice(0, 28)}…` : item);

    const chineseOnly = picked.filter((item) => /[\u4e00-\u9fff]/.test(item));
    return chineseOnly.length > 0 ? chineseOnly : [];
  }

  private isLikelyEnglish(text: string): boolean {
    const compact = text.replace(/\s+/g, '');
    if (!compact) {
      return false;
    }
    const cjkCount = (compact.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinCount = (compact.match(/[A-Za-z]/g) || []).length;
    if (cjkCount >= 6) {
      return false;
    }
    const ratio = latinCount / Math.max(compact.length, 1);
    return ratio >= 0.55;
  }

  private scoreSummarySentence(sentence: string, index: number, total: number): number {
    const keywords = ['核心', '关键', '问题', '方法', '结论', '价值', '建议', '实践', '策略', '思路'];
    const normalized = sentence.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        score += 2;
      }
    }

    const lengthBonus = Math.min(sentence.length, 90) / 45;
    score += lengthBonus;

    if (index === 0) {
      score += 1.2;
    }
    if (index >= Math.floor(total * 0.35) && index <= Math.ceil(total * 0.7)) {
      score += 1;
    }
    if (/[；;，,]/.test(sentence)) {
      score += 0.4;
    }

    return score;
  }

  private decorateReadingModules(modules: EnhancedTemplateData['content']): void {
    const reading = (modules.reading || []) as EnhancedArticle[];
    const readingBooks = reading.filter((item) => this.isBookLikeReadingItem(item));
    const readingArticles = reading.filter((item) => !this.isBookLikeReadingItem(item));

    modules.readingBooks = readingBooks;
    modules.readingArticles = readingArticles;
  }

  private isBookLikeReadingItem(item: EnhancedArticle): boolean {
    const category = String(item.category || '').toLowerCase();
    const title = String(item.title || '').toLowerCase();
    const tags = Array.isArray(item.tags)
      ? item.tags.map((tag) => String(tag).toLowerCase())
      : [];

    const bookKeywords = ['书', '书籍', '读书'];
    const articleKeywords = ['文章', 'clipping', '博客', 'blog', 'paper', '论文'];
    const bookPattern = /\b(book|books|ebook|e-book|kindle|isbn)\b/i;
    const articlePattern = /\b(article|articles|clipping|blog|paper|papers)\b/i;

    const hasBookKeyword = (text: string): boolean => {
      if (!text) {
        return false;
      }
      if (bookKeywords.some((keyword) => text.includes(keyword))) {
        return true;
      }
      return bookPattern.test(text);
    };

    const hasArticleKeyword = (text: string): boolean => {
      if (!text) {
        return false;
      }
      if (articleKeywords.some((keyword) => text.includes(keyword))) {
        return true;
      }
      return articlePattern.test(text);
    };

    if (hasBookKeyword(category)) {
      return true;
    }
    if (hasArticleKeyword(category)) {
      return false;
    }

    const tagHasBook = tags.some((tag) => hasBookKeyword(tag));
    if (tagHasBook) {
      return true;
    }
    const tagHasArticle = tags.some((tag) => hasArticleKeyword(tag));
    if (tagHasArticle) {
      return false;
    }

    if (hasBookKeyword(title)) {
      return true;
    }
    if (hasArticleKeyword(title)) {
      return false;
    }

    return false;
  }

  private async resolveVisualConfig(
    visualConfig: EnhancedTemplateConfig['visual'] | undefined,
    modules: EnhancedTemplateData['content'],
    statistics: EnhancedTemplateData['statistics'],
    weekStart: Date
  ): Promise<EnhancedTemplateConfig['visual'] | undefined> {
    if (!visualConfig) {
      return visualConfig;
    }

    const coverImage = this.resolveUnsplashImage(
      visualConfig.coverImage,
      'cover',
      statistics,
      weekStart
    );
    const backgroundImage = this.resolveUnsplashImage(
      visualConfig.backgroundImage,
      'background',
      statistics,
      weekStart
    );
    const goldenQuote = await this.resolveGoldenQuote(
      visualConfig.goldenQuote,
      modules,
      statistics
    );

    return {
      ...visualConfig,
      coverImage,
      backgroundImage,
      goldenQuote,
    };
  }

  private resolveUnsplashImage(
    value: string | undefined,
    kind: 'cover' | 'background',
    statistics: EnhancedTemplateData['statistics'],
    weekStart: Date
  ): string | undefined {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    const lowered = trimmed.toLowerCase();
    if (!lowered.startsWith('unsplash:')) {
      return value;
    }

    const token = trimmed.slice('unsplash:'.length).trim();
    const query = token && token.toLowerCase() !== 'auto'
      ? token
      : this.buildDefaultUnsplashQuery(kind, statistics);

    return this.buildUnsplashUrl(kind, query, weekStart);
  }

  private buildDefaultUnsplashQuery(
    kind: 'cover' | 'background',
    statistics: EnhancedTemplateData['statistics']
  ): string {
    const shared = ['minimal', 'clean', 'creative'];
    const weighted: string[] = [];

    if ((statistics.tech || 0) > 0) {
      weighted.push('frontend', 'coding', 'workspace');
    }
    if ((statistics.reading || 0) > 0) {
      weighted.push('reading', 'books');
    }
    if ((statistics.life || 0) > 0) {
      weighted.push('lifestyle');
    }
    if ((statistics.food || 0) > 0) {
      weighted.push('food');
    }
    if ((statistics.exercise || 0) > 0) {
      weighted.push('fitness', 'badminton');
    }
    if ((statistics.music || 0) > 0) {
      weighted.push('music');
    }

    const selected = weighted.length > 0 ? weighted.slice(0, 3) : ['productivity', 'desk'];
    const topic = kind === 'cover' ? selected : ['background', 'light', ...selected.slice(0, 1)];
    return [...shared, ...topic].join(',');
  }

  private buildUnsplashUrl(
    kind: 'cover' | 'background',
    query: string,
    weekStart: Date
  ): string {
    const size = kind === 'cover'
      ? { width: 1600, height: 900 }
      : { width: 1920, height: 1080 };
    const keywords = query
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => part.toLowerCase());

    const fallbackKeywords = keywords.length > 0 ? keywords : ['minimal', 'creative'];
    const selectedAsset = this.selectUnsplashAsset(kind, fallbackKeywords, weekStart);

    return `https://images.unsplash.com/${selectedAsset.path}?auto=format&fit=crop&w=${size.width}&h=${size.height}&q=80`;
  }

  private selectUnsplashAsset(
    kind: 'cover' | 'background',
    keywords: string[],
    weekStart: Date
  ): UnsplashAsset {
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
    const candidates = WeeklyDataProvider.UNSPLASH_ASSETS
      .filter((asset) => asset.kinds.includes(kind))
      .map((asset) => ({
        asset,
        score: asset.tags.reduce((acc, tag) => {
          return acc + (lowerKeywords.includes(tag.toLowerCase()) ? 1 : 0);
        }, 0),
      }));

    const matched = candidates.filter((candidate) => candidate.score > 0);
    const pool = (matched.length > 0 ? matched : candidates).map((candidate) => candidate.asset);
    const seedInput = `${this.formatDate(weekStart)}|${kind}|${lowerKeywords.join(',')}`;
    const seed = this.hashTextToInt(seedInput);
    return pool[seed % pool.length];
  }

  private async resolveGoldenQuote(
    quote: { content: string; author: string } | undefined,
    modules: EnhancedTemplateData['content'],
    statistics: EnhancedTemplateData['statistics']
  ): Promise<{ content: string; author: string } | undefined> {
    if (!quote) {
      return quote;
    }

    const content = typeof quote.content === 'string' ? quote.content.trim() : '';
    const author = typeof quote.author === 'string' ? quote.author.trim() : '';
    const contentAuto = this.isAutoToken(content);
    const authorAuto = this.isAutoToken(author);

    if (!contentAuto && !authorAuto) {
      return quote;
    }

    const aiQuote = contentAuto
      ? await this.generateGoldenQuoteWithAI(modules, statistics)
      : null;

    return {
      content: contentAuto
        ? (aiQuote || this.generateGoldenQuote(modules, statistics))
        : quote.content,
      author: authorAuto || !author ? 'Z°N' : quote.author,
    };
  }

  private isAutoToken(value: string): boolean {
    const lowered = value.toLowerCase();
    return lowered === 'auto' || lowered === '自动' || lowered === 'ai' || lowered === '自动生成';
  }

  private generateGoldenQuote(
    modules: EnhancedTemplateData['content'],
    statistics: EnhancedTemplateData['statistics']
  ): string {
    const reading = statistics.reading || 0;
    const thoughts = statistics.thoughts || 0;
    const tech = statistics.tech || 0;
    const life = statistics.life || 0;
    const food = statistics.food || 0;
    const music = statistics.music || 0;
    const exercise = statistics.exercise || 0;
    const hasLifestyle = life + food + music > 0;

    const coreCandidates = [
      '把复杂留给系统，把轻松还给生活。',
      '真正的成长，是把偶然灵感变成稳定节奏。',
      '慢一点不是退后，而是给长期主义让路。',
      '输入见世界，输出见自己，复盘见方向。',
      '把热爱做成日常，日常就会长出作品。',
    ];

    const lifestyleCandidates = [
      '灯下写代码，路上看风景，都是同一场修行。',
      '会生活的人，做事也更有章法。',
      '把一天过得有层次，才有余力谈远方。',
      '心绪有序，世界就会按节奏发光。',
      '把日子过成作品，不靠热闹，靠打磨。',
    ];

    const fitnessCandidates = [
      '身体先有节奏，脑子才有锋利。',
      '耐力是创作最被低估的生产力。',
    ];

    const candidates = [
      ...coreCandidates,
      ...(hasLifestyle ? lifestyleCandidates : []),
      ...(exercise > 0 ? fitnessCandidates : []),
    ];

    const updates = modules.weeklyUpdates || [];
    const seed = this.hashTextToInt([
      String(reading),
      String(thoughts),
      String(tech),
      String(life),
      String(food),
      String(music),
      String(exercise),
      updates.slice(0, 2).map((item) => item.title || '').join('|'),
    ].join('|'));
    return candidates[seed % candidates.length];
  }

  private normalizeModuleImages(modules: EnhancedTemplateData['content']): void {
    const moduleNames: EnhancedModuleName[] = [
      'weeklyUpdates',
      'reading',
      'tech',
      'life',
      'products',
      'food',
      'exercise',
      'music',
      'thoughts',
    ];

    for (const moduleName of moduleNames) {
      const items = modules[moduleName] as Array<Record<string, any>> | undefined;
      if (!Array.isArray(items) || items.length === 0) {
        continue;
      }

      const allowFallbackIcon = moduleName === 'tech' || moduleName === 'products';

      for (const item of items) {
        const itemUrl = typeof item.url === 'string' ? item.url : undefined;
        const normalizedImage = this.normalizeImageUrl(item.image, itemUrl);
        const normalizedCover = this.normalizeImageUrl(item.coverImage, itemUrl);
        const normalizedImages = Array.isArray(item.images)
          ? Array.from(
              new Set(
                item.images
                  .map((img: unknown) => this.normalizeImageUrl(img, itemUrl))
                  .filter((img): img is string => Boolean(img))
              )
            )
          : [];

        const fallbackDomainIcon = allowFallbackIcon ? this.buildDomainIconUrl(itemUrl) : undefined;
        item.image = normalizedImage || normalizedCover || normalizedImages[0] || fallbackDomainIcon;
        item.coverImage = normalizedCover || normalizedImage || normalizedImages[0] || fallbackDomainIcon;

        const mergedImages = [
          ...(normalizedImages || []),
          item.coverImage,
          item.image,
        ].filter((img): img is string => typeof img === 'string' && img.trim().length > 0);
        item.images = Array.from(new Set(mergedImages));
      }
    }
  }

  private applyImageBudget(
    modules: EnhancedTemplateData['content'],
    imageConfig?: Record<string, any>
  ): void {
    if (imageConfig?.enabled === false) {
      return;
    }

    const maxBodyImages = this.toNonNegativeInt(imageConfig?.maxBodyImages, 5);
    if (maxBodyImages <= 0) {
      const moduleNames: EnhancedModuleName[] = [
        'weeklyUpdates',
        'reading',
        'tech',
        'life',
        'products',
        'food',
        'exercise',
        'music',
        'thoughts',
      ];
      for (const moduleName of moduleNames) {
        this.stripModuleImages(modules[moduleName] as Array<Record<string, any>>);
      }
      return;
    }

    const maxPerModule = this.toPositiveInt(imageConfig?.maxPerModule, 2);
    const priorityModules = this.resolveImagePriority(imageConfig?.keepPriority);
    const allModuleNames: EnhancedModuleName[] = [
      'weeklyUpdates',
      'reading',
      'tech',
      'life',
      'products',
      'food',
      'exercise',
      'music',
      'thoughts',
    ];
    const remainingModules = allModuleNames.filter(
      (moduleName) => !priorityModules.includes(moduleName)
    );
    const selectedKeys = new Set<string>();
    const selectedPerModule = new Map<EnhancedModuleName, number>();
    let selectedCount = 0;

    const selectFromModule = (moduleName: EnhancedModuleName): void => {
      if (selectedCount >= maxBodyImages) {
        return;
      }
      const items = modules[moduleName] as Array<Record<string, any>> | undefined;
      if (!Array.isArray(items) || items.length === 0) {
        return;
      }
      const moduleCount = selectedPerModule.get(moduleName) || 0;
      if (moduleCount >= maxPerModule) {
        return;
      }

      for (let index = 0; index < items.length; index += 1) {
        if (selectedCount >= maxBodyImages) {
          break;
        }

        if ((selectedPerModule.get(moduleName) || 0) >= maxPerModule) {
          break;
        }

        const item = items[index];
        if (!this.hasRenderableImage(item)) {
          continue;
        }
        const key = `${moduleName}:${index}`;
        if (selectedKeys.has(key)) {
          continue;
        }

        selectedKeys.add(key);
        selectedPerModule.set(moduleName, (selectedPerModule.get(moduleName) || 0) + 1);
        selectedCount += 1;
      }
    };

    for (const moduleName of priorityModules) {
      selectFromModule(moduleName);
      if (selectedCount >= maxBodyImages) {
        break;
      }
    }

    if (selectedCount < maxBodyImages) {
      for (const moduleName of remainingModules) {
        selectFromModule(moduleName);
        if (selectedCount >= maxBodyImages) {
          break;
        }
      }
    }

    for (const moduleName of allModuleNames) {
      const items = modules[moduleName] as Array<Record<string, any>> | undefined;
      if (!Array.isArray(items) || items.length === 0) {
        continue;
      }
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!this.hasRenderableImage(item)) {
          continue;
        }
        const key = `${moduleName}:${index}`;
        if (selectedKeys.has(key)) {
          continue;
        }
        delete item.image;
        delete item.coverImage;
        delete item.images;
      }
    }
  }

  private resolveImagePriority(rawPriority: unknown): EnhancedModuleName[] {
    const allowed: EnhancedModuleName[] = [
      'weeklyUpdates',
      'reading',
      'tech',
      'life',
      'products',
      'food',
      'exercise',
      'music',
      'thoughts',
    ];

    if (!Array.isArray(rawPriority)) {
      return [...WeeklyDataProvider.DEFAULT_IMAGE_PRIORITY];
    }

    const normalized = rawPriority
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item): item is string => item.length > 0)
      .filter((item): item is EnhancedModuleName =>
        allowed.includes(item as EnhancedModuleName)
      );

    if (normalized.length === 0) {
      return [...WeeklyDataProvider.DEFAULT_IMAGE_PRIORITY];
    }

    return Array.from(new Set(normalized));
  }

  private hasRenderableImage(item: Record<string, any>): boolean {
    if (typeof item.image === 'string' && item.image.trim().length > 0) {
      return true;
    }
    if (typeof item.coverImage === 'string' && item.coverImage.trim().length > 0) {
      return true;
    }
    if (
      Array.isArray(item.images) &&
      item.images.some((img) => typeof img === 'string' && img.trim().length > 0)
    ) {
      return true;
    }
    return false;
  }

  private pruneWeeklyUpdates(modules: EnhancedTemplateData['content']): void {
    const updates = modules.weeklyUpdates || [];
    if (updates.length === 0) {
      return;
    }
    modules.weeklyUpdates = updates.filter((item) => !this.isPublishingRecord(item as Record<string, any>));
  }

  private isPublishingRecord(item: Record<string, any>): boolean {
    const source = String(item.source || '').trim().toLowerCase();
    const title = String(item.title || '').trim().toLowerCase();
    const tags = Array.isArray(item.tags)
      ? item.tags.map((tag: unknown) => String(tag).trim().toLowerCase())
      : [];

    const publishingTag = tags.some(
      (tag) => tag === 'topic/publishing' || tag.startsWith('topic/publish')
    );
    if (publishingTag) {
      return true;
    }

    if (source.includes('publishing')) {
      return true;
    }

    return title.includes('发布记录') || title.includes('publish');
  }

  private normalizeImageUrl(raw: unknown, itemUrl?: string): string | undefined {
    if (typeof raw !== 'string') {
      return undefined;
    }
    const value = raw.trim();
    if (!value) {
      return undefined;
    }

    const parsed = this.parseHttpUrl(value);
    if (!parsed) {
      return undefined;
    }

    // Clearbit 在部分网络环境下稳定性较差，优先替换为 DuckDuckGo icon 服务
    if (parsed.hostname.toLowerCase() === 'logo.clearbit.com') {
      const pathHost = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      const domainFromPath = pathHost && this.looksLikeDomain(pathHost) ? pathHost : undefined;
      const iconDomain = domainFromPath || this.extractHost(itemUrl);
      if (iconDomain) {
        return this.buildFaviconUrl(iconDomain);
      }
    }

    if (parsed.hostname.toLowerCase() === 'source.unsplash.com') {
      return this.buildUnsplashUrl('cover', 'minimal,creative,workspace', new Date());
    }

    return value;
  }

  private buildDomainIconUrl(rawUrl?: string): string | undefined {
    const host = this.extractHost(rawUrl);
    if (!host) {
      return undefined;
    }
    return this.buildFaviconUrl(host);
  }

  private buildFaviconUrl(host: string): string {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  }

  private extractHost(rawUrl?: string): string | undefined {
    const parsed = this.parseHttpUrl(rawUrl);
    if (!parsed) {
      return undefined;
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return this.looksLikeDomain(host) ? host : undefined;
  }

  private parseHttpUrl(raw?: string): URL | undefined {
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  private looksLikeDomain(host: string): boolean {
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host);
  }

  private hashTextToInt(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private async generateGoldenQuoteWithAI(
    modules: EnhancedTemplateData['content'],
    statistics: EnhancedTemplateData['statistics']
  ): Promise<string | null> {
    const aiProvider = this.createAIProvider('goldenQuote');
    if (!aiProvider) {
      return null;
    }

    const aiConfig = this.config.ai as any;
    const source = this.buildGoldenQuotePromptSource(modules, statistics);
    const maxLength = this.clampNumber(
      Number(aiConfig?.goldenQuote?.maxLength || 40),
      18,
      80,
      40
    );
    const temperatureRaw = Number(aiConfig?.goldenQuote?.temperature ?? 0.7);
    const temperature = Number.isFinite(temperatureRaw)
      ? Math.min(1, Math.max(0, temperatureRaw))
      : 0.7;
    const options: RuntimeAISummaryOptions = {
      maxLength,
      language: 'zh-CN',
      style: 'concise',
      temperature,
    };

    try {
      const generated = await aiProvider.generateSummary(source, options);
      const normalized = this.normalizeGoldenQuote(generated, maxLength);
      return normalized || null;
    } catch (error) {
      console.warn(
        `[weekly] AI 金句生成失败，回退规则金句: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private createAIProvider(
    purpose: 'goldenQuote' | 'summaries'
  ): RuntimeAIProvider | null {
    const aiConfig = this.config.ai as any;
    const aiEnabled = Boolean(aiConfig?.enabled ?? aiConfig?.summaries?.enabled ?? aiConfig?.goldenQuote?.enabled);
    const quoteEnabled = Boolean(aiConfig?.goldenQuote?.enabled);
    const shouldEnableForPurpose = purpose === 'summaries' ? aiEnabled : (aiEnabled || quoteEnabled);
    if (!shouldEnableForPurpose || !aiConfig?.provider) {
      if (purpose === 'summaries' && aiConfig?.summaries?.enabled) {
        console.warn('[weekly] summaries 已启用，但未开启 ai.enabled 或 provider，已跳过 AI 摘要生成。');
      }
      return null;
    }

    const providerRaw = String(aiConfig.provider || process.env.AI_PROVIDER || '').toLowerCase();
    const provider = providerRaw === 'google' ? 'gemini' : providerRaw;
    const supported = ['local', 'openai', 'anthropic', 'gemini'];
    if (!supported.includes(provider)) {
      console.warn(`[weekly] 当前不支持 provider=${providerRaw}，已忽略。支持: ${supported.join(', ')}`);
      return null;
    }

    const apiKey = this.resolveAIKey(provider);

    const providerConfig: AIProviderConfig = {
      provider: provider as AIProviderConfig['provider'],
      model: typeof aiConfig.model === 'string' ? aiConfig.model : process.env.AI_MODEL,
      baseUrl: typeof aiConfig.baseUrl === 'string' ? aiConfig.baseUrl : process.env.AI_BASE_URL,
      apiKey,
      timeout: typeof aiConfig.timeout === 'number' ? aiConfig.timeout : undefined,
      maxRetries:
        typeof aiConfig.maxRetries === 'number' ? aiConfig.maxRetries : undefined,
    };

    try {
      if (provider === 'local') {
        return new LocalModelProvider(providerConfig);
      }
      if (provider === 'openai') {
        return new OpenAIProvider(providerConfig);
      }
      if (provider === 'anthropic') {
        return new AnthropicProvider(providerConfig);
      }
      return new GeminiProvider(providerConfig);
    } catch (error) {
      console.warn(
        `[weekly] 初始化 AI provider 失败，回退规则金句: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private buildGoldenQuotePromptSource(
    modules: EnhancedTemplateData['content'],
    statistics: EnhancedTemplateData['statistics']
  ): string {
    const updates = (modules.weeklyUpdates || [])
      .slice(0, 2)
      .map((item) => `${item.title}${item.description ? `：${item.description}` : ''}`);
    const life = (modules.life || [])
      .slice(0, 2)
      .map((item) => `${item.title}${item.description ? `：${item.description}` : ''}`);
    const food = (modules.food || [])
      .slice(0, 1)
      .map((item) => `${item.title}${item.description ? `：${item.description}` : ''}`);
    const exercise = (modules.exercise || [])
      .slice(0, 1)
      .map((item) => `${item.type}${item.notes ? `：${item.notes}` : ''}`);
    const music = (modules.music || [])
      .slice(0, 1)
      .map((item) => `${item.title} - ${item.artist}${item.feeling ? `：${item.feeling}` : ''}`);

    const lines = [
      '任务：请基于以下周度生活与创作记录，写一句可单独传播的中文金句。',
      '风格：可使用箴言、比喻、诗句、谚语中的任一风格，要求深刻但不晦涩。',
      '限制：不要写“本周做了什么”的总结句；不要出现“本周/这周/完成了/发布了/记录了”等复盘口吻。',
      '长度：18-40字，语义完整，克制不鸡汤，有画面感。',
      '输出：只输出一句正文，不要引号、作者名、序号或解释。',
      '',
      `统计：reading=${statistics.reading || 0}, tech=${statistics.tech || 0}, life=${statistics.life || 0}, food=${statistics.food || 0}, exercise=${statistics.exercise || 0}, music=${statistics.music || 0}`,
      updates.length > 0 ? `本周动态：${updates.join('；')}` : '本周动态：无',
      life.length > 0 ? `生活记录：${life.join('；')}` : '生活记录：无',
      food.length > 0 ? `饮食记录：${food.join('；')}` : '饮食记录：无',
      exercise.length > 0 ? `运动记录：${exercise.join('；')}` : '运动记录：无',
      music.length > 0 ? `音乐记录：${music.join('；')}` : '音乐记录：无',
    ];

    return lines.join('\n');
  }

  private normalizeGoldenQuote(raw: string, maxLength: number): string {
    const compact = raw
      .replace(/^\s*["“”'`]+|["“”'`]+\s*$/g, '')
      .replace(/^[-*]+\s*/gm, '')
      .replace(/^摘要[:：]\s*/i, '')
      .replace(/^金句[:：]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!compact) {
      return '';
    }

    if (compact.length <= maxLength) {
      return compact;
    }

    const sliced = compact.slice(0, maxLength);
    const sentenceEnd = Math.max(
      sliced.lastIndexOf('。'),
      sliced.lastIndexOf('！'),
      sliced.lastIndexOf('？'),
      sliced.lastIndexOf('.'),
      sliced.lastIndexOf('!'),
      sliced.lastIndexOf('?')
    );

    if (sentenceEnd > Math.floor(maxLength * 0.6)) {
      return sliced.slice(0, sentenceEnd + 1).trim();
    }

    return sliced.trim();
  }

  private resolveAIKey(provider: string): string | undefined {
    if (process.env.AI_API_KEY) {
      return process.env.AI_API_KEY;
    }
    return undefined;
  }

  private async syncRecommendationFlagsFromHistory(
    weekStart: Date,
    articleConfig: Record<string, any>,
    toolConfig: Record<string, any>,
    options: { dryRun?: boolean } = {}
  ): Promise<void> {
    if (options.dryRun) {
      return;
    }

    const syncArticles = Boolean(articleConfig.syncRecommendedFromHistory);
    const syncTools = Boolean(toolConfig.syncRecommendedFromHistory);
    const contentConfig = (this.config.content || {}) as Record<string, any>;
    const lifeConfig = (contentConfig.life || {}) as Record<string, any>;
    const foodConfig = (contentConfig.food || {}) as Record<string, any>;
    const exerciseConfig = (contentConfig.exercise || {}) as Record<string, any>;
    const musicConfig = (contentConfig.music || {}) as Record<string, any>;
    const isEnhanced = this.isEnhancedConfig(this.config);
    const syncLife = isEnhanced && Boolean(lifeConfig.syncRecommendedFromHistory);
    const syncFood = isEnhanced && Boolean(foodConfig.syncRecommendedFromHistory);
    const syncExercise = isEnhanced && Boolean(exerciseConfig.syncRecommendedFromHistory);
    const syncMusic = isEnhanced && Boolean(musicConfig.syncRecommendedFromHistory);
    if (!syncArticles && !syncTools && !syncLife && !syncFood && !syncExercise && !syncMusic) {
      return;
    }

    console.log('[weekly] 正在同步上一周推荐元数据...');

    const articleHistoryDays = syncArticles
      ? this.toNonNegativeInt(articleConfig.historyDays, 0)
      : 0;
    const toolHistoryDays = syncTools
      ? this.toNonNegativeInt(toolConfig.historyDays, 0)
      : 0;
    const lifeHistoryDays = syncLife
      ? this.toNonNegativeInt(lifeConfig.historyDays, 0)
      : 0;
    const foodHistoryDays = syncFood
      ? this.toNonNegativeInt(foodConfig.historyDays, 0)
      : 0;
    const exerciseHistoryDays = syncExercise
      ? this.toNonNegativeInt(exerciseConfig.historyDays, 0)
      : 0;
    const musicHistoryDays = syncMusic
      ? this.toNonNegativeInt(musicConfig.historyDays, 0)
      : 0;
    const historyDays = Math.max(
      articleHistoryDays,
      toolHistoryDays,
      lifeHistoryDays,
      foodHistoryDays,
      exerciseHistoryDays,
      musicHistoryDays
    );
    const historyUrls = await this.collectWeeklyHistoryUrls(weekStart, historyDays);
    if (historyUrls.size === 0) {
      console.log('[weekly] 未检测到上一周推荐记录，跳过标记同步，直接生成本周 weekly 内容...');
      return;
    }

    let articleStats = { updatedFiles: 0, updatedEntries: 0 };
    let toolStats = { updatedFiles: 0, updatedEntries: 0 };
    let lifeStats = { updatedFiles: 0, updatedEntries: 0 };
    let foodStats = { updatedFiles: 0, updatedEntries: 0 };
    let exerciseStats = { updatedFiles: 0, updatedEntries: 0 };
    let musicStats = { updatedFiles: 0, updatedEntries: 0 };
    if (syncArticles) {
      articleStats = await this.syncArticleRecommendedFlags(historyUrls);
    }
    if (syncTools) {
      toolStats = await this.syncToolRecommendedFlags(historyUrls);
    }
    const enhancedConfig = this.config as EnhancedTemplateConfig;
    if (syncLife) {
      lifeStats = await this.syncLogRecommendedFlags(
        historyUrls,
        enhancedConfig.sources?.life,
        'life'
      );
    }
    if (syncFood) {
      foodStats = await this.syncLogRecommendedFlags(
        historyUrls,
        enhancedConfig.sources?.food,
        'food'
      );
    }
    if (syncExercise) {
      exerciseStats = await this.syncLogRecommendedFlags(
        historyUrls,
        enhancedConfig.sources?.exercise,
        'exercise'
      );
    }
    if (syncMusic) {
      musicStats = await this.syncLogRecommendedFlags(
        historyUrls,
        enhancedConfig.sources?.music,
        'music'
      );
    }

    if (
      articleStats.updatedEntries > 0 ||
      toolStats.updatedEntries > 0 ||
      lifeStats.updatedEntries > 0 ||
      foodStats.updatedEntries > 0 ||
      exerciseStats.updatedEntries > 0 ||
      musicStats.updatedEntries > 0
    ) {
      const parts = [
        `articles=${articleStats.updatedEntries} (files=${articleStats.updatedFiles})`,
        `tools=${toolStats.updatedEntries} (files=${toolStats.updatedFiles})`,
      ];
      if (syncLife) {
        parts.push(`life=${lifeStats.updatedEntries} (files=${lifeStats.updatedFiles})`);
      }
      if (syncFood) {
        parts.push(`food=${foodStats.updatedEntries} (files=${foodStats.updatedFiles})`);
      }
      if (syncExercise) {
        parts.push(
          `exercise=${exerciseStats.updatedEntries} (files=${exerciseStats.updatedFiles})`
        );
      }
      if (syncMusic) {
        parts.push(`music=${musicStats.updatedEntries} (files=${musicStats.updatedFiles})`);
      }
      console.log(`[weekly] 推荐标记已同步: ${parts.join(', ')}`);
    } else {
      console.log('[weekly] 上一周推荐元数据无需变更 (0 changes)');
    }

    console.log('[weekly] 元数据同步完成，开始生成本周 weekly 内容...');
  }

  private async syncArticleRecommendedFlags(
    historyUrls: Set<string>
  ): Promise<{ updatedFiles: number; updatedEntries: number }> {
    const articleSources = this.config.sources.articles || this.config.sources.clippings;
    const files = await this.collectFilesFromSources(articleSources);
    let updatedFiles = 0;
    let updatedEntries = 0;

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = matter(raw);
        const data = parsed.data as Record<string, any>;
        const normalizedUrl = this.normalizeUrl(
          typeof data.url === 'string' ? data.url : undefined
        );
        if (!normalizedUrl) {
          continue;
        }

        const nextRecommended = historyUrls.has(normalizedUrl);
        const currentRecommended = Boolean(data.weekly_recommended);
        if (currentRecommended === nextRecommended) {
          continue;
        }

        data.weekly_recommended = nextRecommended;
        const output = matter.stringify(parsed.content, data);
        await fs.writeFile(filePath, output, 'utf-8');
        updatedFiles += 1;
        updatedEntries += 1;
      } catch (error) {
        console.warn(
          `同步文章推荐标记失败: ${filePath}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return { updatedFiles, updatedEntries };
  }

  private async syncToolRecommendedFlags(
    historyUrls: Set<string>
  ): Promise<{ updatedFiles: number; updatedEntries: number }> {
    const toolSources = this.config.sources.tools;
    const files = await this.collectFilesFromSources(toolSources);
    let updatedFiles = 0;
    let updatedEntries = 0;

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = matter(raw);
        const data = parsed.data as Record<string, any>;
        if (!Array.isArray(data.tools)) {
          continue;
        }

        let changed = false;
        data.tools = data.tools.map((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return entry;
          }

          const toolData = { ...(entry as Record<string, any>) };
          const url = typeof toolData.url === 'string' ? toolData.url : undefined;
          const nextRecommended = this.hasBeenRecommendedByUrl(url, historyUrls);
          const currentRecommended = Boolean(toolData.recommended);

          if (currentRecommended === nextRecommended) {
            return entry;
          }

          changed = true;
          updatedEntries += 1;
          toolData.recommended = nextRecommended;
          if (!nextRecommended) {
            delete toolData.recommended_at;
            delete toolData.recommendedAt;
          }
          return toolData;
        });

        if (!changed) {
          continue;
        }

        const output = matter.stringify(parsed.content, data);
        await fs.writeFile(filePath, output, 'utf-8');
        updatedFiles += 1;
      } catch (error) {
        console.warn(
          `同步工具推荐标记失败: ${filePath}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return { updatedFiles, updatedEntries };
  }

  private async syncLogRecommendedFlags(
    historyUrls: Set<string>,
    sourceInput: DataSourceInput | undefined,
    label: string
  ): Promise<{ updatedFiles: number; updatedEntries: number }> {
    const files = await this.collectFilesFromSources(sourceInput);
    let updatedFiles = 0;
    let updatedEntries = 0;

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = matter(raw);
        const data = parsed.data as Record<string, any>;
        const normalizedUrl = this.normalizeUrl(
          typeof data.url === 'string' ? data.url : undefined
        );
        if (!normalizedUrl) {
          continue;
        }

        const nextRecommended = historyUrls.has(normalizedUrl);
        const currentRecommended = Boolean(data.weekly_recommended);
        if (currentRecommended === nextRecommended) {
          continue;
        }

        data.weekly_recommended = nextRecommended;
        const output = matter.stringify(parsed.content, data);
        await fs.writeFile(filePath, output, 'utf-8');
        updatedFiles += 1;
        updatedEntries += 1;
      } catch (error) {
        console.warn(
          `同步${label}推荐标记失败: ${filePath}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return { updatedFiles, updatedEntries };
  }

  private async collectFilesFromSources(sourceInput: DataSourceInput | undefined): Promise<string[]> {
    if (!sourceInput) {
      return [];
    }

    const sources = DataSourceManager.normalize(sourceInput);
    const fileSet = new Set<string>();
    for (const source of sources) {
      try {
        const files = await this.scanDataSourceFiles(source);
        files.forEach((filePath) => fileSet.add(filePath));
      } catch (error) {
        console.warn(
          `扫描推荐同步数据源失败: ${source.path}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return Array.from(fileSet);
  }

  private async filterArticlesByWeeklyHistory(
    candidates: Article[],
    topN: number,
    weekStart: Date,
    articleConfig: Record<string, any>
  ): Promise<Article[]> {
    if (topN <= 0) {
      return [];
    }

    if (!articleConfig.excludeIfInWeekly) {
      return candidates.slice(0, topN);
    }

    const historyDays = this.toNonNegativeInt(articleConfig.historyDays, 0);
    const seenUrls = await this.collectWeeklyHistoryUrls(weekStart, historyDays);
    if (seenUrls.size === 0) {
      return candidates.slice(0, topN);
    }

    const fresh: Article[] = [];
    const repeated: Article[] = [];
    for (const article of candidates) {
      if (this.hasBeenRecommendedByUrl(article.url, seenUrls)) {
        repeated.push(article);
      } else {
        fresh.push(article);
      }
    }

    const result = fresh.slice(0, topN);
    if (result.length < topN) {
      result.push(...repeated.slice(0, topN - result.length));
    }
    return result;
  }

  private async filterToolsByWeeklyHistory(
    candidates: Tool[],
    perCategory: number,
    weekStart: Date,
    toolConfig: Record<string, any>
  ): Promise<Tool[]> {
    if (perCategory <= 0) {
      return [];
    }

    if (!toolConfig.excludeIfInWeekly) {
      return this.limitToolsPerCategory(candidates, perCategory);
    }

    const historyDays = this.toNonNegativeInt(toolConfig.historyDays, 0);
    const seenUrls = await this.collectWeeklyHistoryUrls(weekStart, historyDays);
    if (seenUrls.size === 0) {
      return this.limitToolsPerCategory(candidates, perCategory);
    }

    const fresh: Tool[] = [];
    const repeated: Tool[] = [];
    for (const tool of candidates) {
      if (this.hasBeenRecommendedByUrl(tool.url, seenUrls)) {
        repeated.push(tool);
      } else {
        fresh.push(tool);
      }
    }

    const result: Tool[] = [];
    const counts = new Map<string, number>();
    const append = (items: Tool[]) => {
      for (const tool of items) {
        const category = tool.category || 'Uncategorized';
        const used = counts.get(category) || 0;
        if (used >= perCategory) {
          continue;
        }
        result.push(tool);
        counts.set(category, used + 1);
      }
    };

    append(fresh);
    append(repeated);
    return result;
  }

  private limitToolsPerCategory(candidates: Tool[], perCategory: number): Tool[] {
    if (perCategory <= 0) {
      return [];
    }

    const result: Tool[] = [];
    const counts = new Map<string, number>();
    for (const tool of candidates) {
      const category = tool.category || 'Uncategorized';
      const used = counts.get(category) || 0;
      if (used >= perCategory) {
        continue;
      }
      result.push(tool);
      counts.set(category, used + 1);
    }

    return result;
  }

  private async collectWeeklyHistoryUrls(
    weekStart: Date,
    historyDays: number
  ): Promise<Set<string>> {
    const result = new Set<string>();
    const baseDir = this.configDir || process.cwd();
    const historyRoot = path.resolve(baseDir, this.config.output.path);

    try {
      await fs.access(historyRoot);
    } catch {
      return result;
    }

    const files = await glob('**/*.md', {
      cwd: historyRoot,
      absolute: true,
      ignore: ['**/_Index.md'],
      nodir: true,
    });

    const weekStartTs = weekStart.getTime();
    const lowerBound = historyDays > 0
      ? weekStartTs - historyDays * 24 * 60 * 60 * 1000
      : undefined;

    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = matter(content);
        const data = parsed.data as Record<string, any>;
        const frontmatterDate = this.parseHistoryDate(
          data.week_end ?? data.weekEnd ?? data.date ?? data.modified ?? data.created
        );
        const compareTs = frontmatterDate
          ? frontmatterDate.getTime()
          : stat.mtimeMs;

        // 同一周反复生成不应触发“已推荐”过滤，只看当前周之前的历史输出。
        if (compareTs >= weekStartTs) {
          continue;
        }
        if (lowerBound !== undefined && compareTs < lowerBound) {
          continue;
        }

        for (const url of this.extractUrls(content)) {
          result.add(url);
        }
      } catch {
        // ignore broken history files
      }
    }

    return result;
  }

  private extractUrls(content: string): string[] {
    const regex = /https?:\/\/[^\s<>"')\]]+/g;
    const matches = content.match(regex) || [];
    const normalized = matches
      .map((url) => this.normalizeUrl(url))
      .filter((url): url is string => Boolean(url));
    return Array.from(new Set(normalized));
  }

  private parseHistoryDate(raw: unknown): Date | undefined {
    if (!raw) {
      return undefined;
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw;
    }
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    const normalized = trimmed.includes('T')
      ? trimmed
      : trimmed.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  }

  private hasBeenRecommendedByUrl(
    rawUrl: string | undefined,
    historyUrls: Set<string>
  ): boolean {
    const normalized = this.normalizeUrl(rawUrl);
    if (!normalized) {
      return false;
    }
    return historyUrls.has(normalized);
  }

  private normalizeUrl(rawUrl: string | undefined): string | undefined {
    if (!rawUrl) {
      return undefined;
    }
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return undefined;
    }
    const cleaned = trimmed
      .replace(/[),.;]+$/g, '')
      .replace(/\/+$/g, '')
      .toLowerCase();
    return cleaned || undefined;
  }

  private toNonNegativeInt(value: unknown, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return fallback;
    }
    return Math.floor(num);
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return fallback;
    }
    return Math.floor(num);
  }

  /**
   * 计算周范围（周一到周日）
   * 使用 ISO 周定义：周一是一周的第一天
   * @param date - 基准日期
   * @returns 周一和周日的日期
   */
  private calculateWeekRange(date: Date): {
    weekStart: Date;
    weekEnd: Date;
  } {
    const dayOfWeek = date.getDay();
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() + offsetToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  }

  /**
   * 格式化日期为 YYYY-MM-DD 格式
   * @param date - 日期对象
   * @returns 格式化的日期字符串
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
