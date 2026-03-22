/**
 * Core interfaces for the content generator system
 */
import type { WechatTheme } from '../constants/wechatThemes';

// ============================================================================
// Content Generator
// ============================================================================

export interface IContentGenerator {
  generate(templateType: string, options: GenerateOptions): Promise<GenerateResult>;
  listTemplates(): string[];
}

export interface GenerateOptions {
  config?: string;
  configDir?: string; // 配置文件目录，用于相对路径解析
  dryRun?: boolean;
  verbose?: boolean;
  [key: string]: any;
}

export interface GenerateResult {
  success: boolean;
  filePath?: string;
  message: string;
  statistics?: ContentStatistics;
}

export interface ContentStatistics {
  [key: string]: number;
}

// ============================================================================
// Template Registry
// ============================================================================

export interface ITemplateRegistry {
  registerTemplate(name: string, provider: DataProviderConstructor): void;
  getTemplate(name: string): IDataProvider | null;
  getTemplateConstructor(name: string): DataProviderConstructor | null;
  listTemplates(): TemplateInfo[];
  hasTemplate(name: string): boolean;
}

export interface TemplateInfo {
  name: string;
  description: string;
  version: string;
}

export type DataProviderConstructor = new (config: any, ...args: any[]) => IDataProvider;

// ============================================================================
// Data Provider
// ============================================================================

export interface IDataProvider {
  collectData(options: CollectOptions): Promise<TemplateData>;
  validateData(data: TemplateData): ValidationResult;
  getTemplatePath(): string;
}

export interface CollectOptions {
  date?: Date;
  config: TemplateConfig;
  configDir?: string; // 配置文件目录，用于相对路径解析
  [key: string]: any;
}

export interface TemplateData {
  metadata: Record<string, any>;
  content: Record<string, any>;
  statistics: ContentStatistics;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Config Manager
// ============================================================================

export interface IConfigManager {
  load(configPath?: string): Promise<SystemConfig>;
  getTemplateConfig(templateType: string): TemplateConfig | null;
  validate(config: SystemConfig): ValidationResult;
}

export interface SystemConfig {
  global: GlobalConfig;
  templates: {
    [templateType: string]: TemplateConfig;
  };
  modules?: Record<string, any>;
}

export interface GlobalConfig {
  logLevel: 'debug' | 'info' | 'warning' | 'error';
  defaultTemplate: string;
}

export interface TemplateConfig {
  enabled: boolean;
  templateVersion?: 'legacy' | 'enhanced';
  template: {
    path: string;
  };
  hooks?: {
    [hookType: string]: string;
  };
  sources: Record<string, DataSourceInput>;
  output: {
    path: string;
    filename: string;
  };
  content: Record<string, any>;
  branding?: {
    title?: string;
  };
  schedule?: {
    enabled: boolean;
    cron: string;
  };
  ai?: AIConfig;
}

export interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  /**
   * @deprecated 使用环境变量或 .env 文件提供 API Key
   */
  apiKey?: string;
  summaries?: {
    enabled: boolean;
    minLength?: number;
    maxLength?: number;
    language?: string;
    strategy?: SummaryStrategy;
    cacheDir?: string;
    batchSize?: number;
    rateLimit?: {
      requestsPerMinute: number;
      retryAttempts?: number;
      retryDelay?: number;
    };
    prompt?: string;
  };
}

// ============================================================================
// Template Engine
// ============================================================================

export interface ITemplateEngine {
  render(templatePath: string, data: TemplateData): Promise<string>;
  registerHelper(name: string, fn: Function): void;
}

// ============================================================================
// Filters and Aggregators
// ============================================================================

export interface IArticleFilter {
  filter(options: ArticleFilterOptions): Promise<Article[]>;
}

export interface ArticleFilterOptions {
  topN: number;
  minRating?: number;
  weekStart?: string;
  weekEnd?: string;
  configDir?: string; // 配置文件目录，用于相对路径解析
}

export interface Article {
  title: string;
  url: string;
  description?: string;
  rating: number;
  image?: string;
  images?: string[];
  coverImage?: string;
  tags?: string[];
  category?: string;
  aiSummary?: string;
  source?: string;
  path?: string;
  created?: string;
}

export interface IToolFilter {
  filter(options: ToolFilterOptions): Promise<Tool[]>;
}

export interface ToolFilterOptions {
  perCategory: number;
  excludeRecommended?: boolean;
  configDir?: string; // 配置文件目录，用于相对路径解析
}

export interface Tool {
  title: string;
  url: string;
  description?: string;
  rating: number;
  category: string;
  recommended?: boolean;
  recommendedAt?: string;
  image?: string;
  images?: string[];
  coverImage?: string;
  aiSummary?: string;
  source?: string;
  path?: string;
}

export interface IContentAggregator {
  aggregate(options: AggregateOptions): Promise<ContentItem[]>;
}

export interface AggregateOptions {
  startDate: Date;
  endDate?: Date;
  groupBy?: 'tags' | 'category' | 'none';
  configDir?: string; // 配置文件目录，用于相对路径解析
}

export interface ContentItem {
  title: string;
  path: string;
  description?: string;
  created: Date;
  url?: string;
  rating?: number;
  image?: string;
  images?: string[];
  coverImage?: string;
  tags?: string[];
  category?: string;
  aiSummary?: string;
  content?: string;
  contentHash?: string;
  source?: string;
}

// ============================================================================
// Metadata Manager
// ============================================================================

export interface IMetadataManager {
  generate(options: MetadataOptions): Promise<DocumentMetadata>;
  updatePreviousIssue(currentIssue: number, currentPath: string): Promise<void>;
}

export interface MetadataOptions {
  date: Date;
  outputPath: string;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  type: string;
  issueNumber: number;
  year: number;
  date: string;
  weekStart: string;
  weekEnd: string;
  created: string;
  modified: string;
  status: string;
  tags: string[];
  publishedPlatforms: string[];
  brandTitle?: string; // 可选的品牌标题
  showReferenceLinks?: boolean; // 是否输出文末引用链接
}

// ============================================================================
// Enhanced Weekly Template - 增强元数据
// ============================================================================

/**
 * 增强的文档元数据，支持封面图、金句和背景图
 */
export interface EnhancedDocumentMetadata extends DocumentMetadata {
  coverImage?: string;         // 封面图片 URL
  goldenQuote?: {              // 每周金句
    content: string;
    author: string;
  };
  backgroundImage?: string;    // 背景图片 URL
}

/**
 * 增强的文章元数据，支持封面图和个人回响
 */
export interface EnhancedArticle extends Article {
  coverImage?: string;         // 文章封面图片
  personalReflection?: string; // 个人回响
}

/**
 * 增强的工具元数据，支持代码片段
 */
export interface EnhancedTool extends Tool {
  codeSnippet?: string;        // 代码片段
  language?: string;           // 代码语言
}

/**
 * 生活瞬间记录
 */
export interface LifeMoment {
  title: string;
  description?: string;
  url?: string;
  images: string[];            // 图片数组
  date: Date;
  tags?: string[];
  category?: string;
  path?: string;
}

/**
 * 饮食记录
 */
export interface FoodRecord {
  title: string;
  description?: string;
  url?: string;
  images: string[];            // 图片数组
  date: Date;
  rating?: number;
  location?: string;          // 地点
  channel?: string;           // 渠道
  place?: string;             // 场所
  category?: string;
  path?: string;
}

/**
 * 运动记录
 */
export interface ExerciseRecord {
  type: string;                // 运动类型
  duration: number;            // 时长(分钟)
  url?: string;
  calories?: number;           // 消耗卡路里
  date: Date;
  notes?: string;
  category?: string;
  path?: string;
}

/**
 * 音乐推荐
 */
export interface MusicRecommendation {
  title: string;               // 歌曲名
  artist: string;              // 艺术家
  album?: string;              // 专辑
  feeling?: string;            // 听感
  url?: string;                // 链接
  date?: Date;
  category?: string;
  path?: string;
}

/**
 * 多维度筛选条件
 */
export interface FilterCriteria {
  categories?: string[];      // 分类筛选 (OR 逻辑)
  tags?: string[];            // 标签筛选 (OR 逻辑)
  dateRange?: {               // 时间范围筛选
    start: Date;
    end: Date;
  };
  minRating?: number;         // 最小评分
}

/**
 * 内容模块配置
 */
export interface ModuleConfig {
  enabled: boolean;            // 是否启用该模块
  icon?: string;               // 模块图标
  showImages?: boolean;        // 是否展示模块内图片
  filter?: FilterCriteria;     // 模块独立的筛选条件
}

/**
 * 增强的模板配置，支持视觉元素和模块配置
 */
export interface EnhancedTemplateConfig extends TemplateConfig {
  visual?: {
    coverImage?: string;       // 封面图片 URL 或路径
    backgroundImage?: string;  // 背景图片 URL 或路径
    goldenQuote?: {
      content: string;
      author: string;
    };
  };
  
  modules?: {
    [moduleName: string]: ModuleConfig;
  };
  
  export?: {
    formats: ExportFormat[];   // 支持的导出格式
    wechat?: {
      validateImages: boolean; // 是否验证图片路径
      backgroundPreset?: 'grid' | 'warm' | 'plain'; // 微信发布背景预设
      theme?: WechatTheme; // 微信主题
      imageProxyUrl?: string; // 图片代理 URL 模板，使用 {url} 占位
      inaccessibleImageDomains?: string[]; // 可能在受限网络不可访问的域名列表
      imageOptimization?: {
        maxWidth?: number; // 图片最大宽度（像素）
        quality?: number; // 图片质量（1-100）
        format?: 'auto' | 'webp' | 'jpeg' | 'png'; // 输出格式
      };
    };
  };
}

/**
 * 导出格式类型
 */
export type ExportFormat = 'markdown' | 'html' | 'wechat';

/**
 * 导出选项
 */
export interface ExportOptions {
  includeStyles?: boolean;     // 是否包含内联样式
  backgroundImage?: string;    // 背景图片 URL
  backgroundPreset?: 'grid' | 'warm' | 'plain'; // 背景预设
  wechatTheme?: WechatTheme; // 微信主题
  validateImages?: boolean;    // 是否验证图片路径
  imageProxyUrl?: string; // 图片代理 URL 模板，使用 {url} 占位
  inaccessibleImageDomains?: string[]; // 可能不可访问的图片域名列表
  imageOptimization?: {
    maxWidth?: number; // 图片最大宽度（像素）
    quality?: number; // 图片质量（1-100）
    format?: 'auto' | 'webp' | 'jpeg' | 'png'; // 输出格式
  };
}

/**
 * 导出结果
 */
export interface ExportResult {
  content: string;
  warnings: string[];          // 警告信息(如本地图片路径)
}

/**
 * 增强的模板数据，支持多个内容模块
 */
export interface EnhancedTemplateData extends TemplateData {
  metadata: EnhancedDocumentMetadata;
  content: {
    weeklyUpdates?: ContentItem[];
    readingArticles?: EnhancedArticle[];
    readingBooks?: EnhancedArticle[];
    reading?: EnhancedArticle[];
    tech?: EnhancedTool[];
    life?: LifeMoment[];
    products?: ContentItem[];
    food?: FoodRecord[];
    exercise?: ExerciseRecord[];
    music?: MusicRecommendation[];
    thoughts?: ContentItem[];
  };
  statistics: {
    [moduleName: string]: number;
  };
}

// ============================================================================
// Enhanced Content Filter - 增强内容筛选器
// ============================================================================

/**
 * 增强内容筛选器接口
 */
export interface IEnhancedContentFilter {
  filter(items: ContentItem[], criteria: FilterCriteria): ContentItem[];
}

// ============================================================================
// Platform Exporter - 平台导出器
// ============================================================================

/**
 * 平台导出器接口
 */
export interface IPlatformExporter {
  export(content: string, format: ExportFormat, options: ExportOptions): Promise<ExportResult>;
}

// ============================================================================
// Scheduler
// ============================================================================

export interface IScheduler {
  start(): void;
  stop(): void;
  addTask(templateType: string, cronExpression: string, options: GenerateOptions): void;
  removeTask(templateType: string): void;
  getNextRunTime(templateType: string): Date | null;
}

// ============================================================================
// Hook Manager
// ============================================================================

export interface IHookManager {
  registerHook(hookType: HookType, hookPath: string): void;
  executeHook(hookType: HookType, context: HookContext): Promise<any>;
  hasHook(hookType: HookType): boolean;
  clearHooks(): void;
}

export type HookType =
  | 'beforeArticleFilter'
  | 'afterArticleFilter'
  | 'customArticleScore'
  | 'beforeToolFilter'
  | 'afterToolFilter'
  | 'customToolScore'
  | 'contentFilter'
  | 'beforeRender'
  | 'afterRender';

export interface HookContext {
  type: HookType;
  data: any;
  config: any;
  options: any;
}

export interface HookFunction {
  (context: HookContext): Promise<any> | any;
}

// ============================================================================
// Data Source
// ============================================================================

export interface DataSourceConfig {
  path: string;
  include?: string[];
  exclude?: string[];
  priority?: number;
  alias?: string;
}

export type DataSourceInput = string | DataSourceConfig | DataSourceConfig[];

// ============================================================================
// AI Summarizer
// ============================================================================

export interface IAISummarizer {
  summarize(content: ContentItem, options: SummaryOptions): Promise<string>;
  summarizeBatch(contents: ContentItem[], options: SummaryOptions): Promise<string[]>;
  getCachedSummary(contentId: string): Promise<string | null>;
  clearCache(): Promise<void>;
}

export interface SummaryOptions {
  maxLength?: number;
  language?: string;
  strategy?: SummaryStrategy;
  forceRegenerate?: boolean;
}

export type SummaryStrategy = 'realtime' | 'cache' | 'batch' | 'manual';

// ============================================================================
// AI Provider
// ============================================================================

export interface IAIProvider {
  generateSummary(prompt: string, content: string, options: AIOptions): Promise<string>;
  getModelName(): string;
}

export interface AIOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// ============================================================================
// Summary Cache
// ============================================================================

export interface ISummaryCache {
  get(key: string): Promise<CachedSummary | null>;
  set(key: string, summary: CachedSummary): Promise<void>;
  clear(): Promise<void>;
}

export interface CachedSummary {
  summary: string;
  generatedAt: string;
  model: string;
  language: string;
  contentHash: string;
}

// ============================================================================
// Rate Limiter
// ============================================================================

export interface IRateLimiter {
  waitForSlot(): Promise<void>;
  recordRequest(): void;
}

// ============================================================================
// CLI Interface
// ============================================================================

export interface ICLIInterface {
  init(): void;
  parse(args: string[]): void;
}

// ============================================================================
// Logger
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export interface ILogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string | Error): void;
  setLevel(level: LogLevel): void;
}
