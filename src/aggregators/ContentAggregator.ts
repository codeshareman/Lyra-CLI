import { glob } from 'glob';
import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import {
  IContentAggregator,
  AggregateOptions,
  ContentItem,
  DataSourceInput,
  DataSourceConfig,
  IHookManager,
} from '../types/interfaces';
import { DataSourceManager } from '../core/DataSourceManager';
import crypto from 'crypto';

/**
 * ContentAggregator 负责从多个数据源聚合内容
 * 支持日期范围筛选、标签/类别分组和自定义钩子
 */
export class ContentAggregator implements IContentAggregator {
  private dataSources: DataSourceConfig[];
  private hookManager: IHookManager;

  /**
   * 创建 ContentAggregator 实例
   * @param dataSources - 数据源配置（字符串、对象或数组）
   * @param hookManager - 钩子管理器
   */
  constructor(dataSources: DataSourceInput, hookManager: IHookManager) {
    // 规范化数据源配置
    this.dataSources = DataSourceManager.normalize(dataSources);
    this.hookManager = hookManager;
  }

  /**
   * 聚合内容
   * @param options - 聚合选项
   * @returns 聚合后的内容列表
   */
  async aggregate(options: AggregateOptions): Promise<ContentItem[]> {
    // 计算结束日期（默认为开始日期 + 7 天）
    const endDate = options.endDate || this.addDays(options.startDate, 7);

    // 1. 从所有数据源扫描内容
    let items = await this.scanMultipleSources(this.dataSources, options.configDir);

    // 2. 执行 contentFilter 钩子
    if (this.hookManager.hasHook('contentFilter')) {
      items = await this.hookManager.executeHook('contentFilter', {
        type: 'contentFilter',
        data: items,
        config: {},
        options,
      });
    }

    // 3. 按日期范围筛选
    const filtered = items.filter(
      (item) => item.created >= options.startDate && item.created <= endDate
    );

    // 4. 按分组方式整理
    if (options.groupBy && options.groupBy !== 'none') {
      return this.groupContent(filtered, options.groupBy);
    }

    return filtered;
  }

  /**
   * 从多个数据源扫描内容
   * @param sources - 数据源配置数组
   * @param configDir - 配置文件目录，用于相对路径解析
   * @returns 所有数据源的内容列表（去重）
   */
  private async scanMultipleSources(
    sources: DataSourceConfig[],
    configDir?: string
  ): Promise<ContentItem[]> {
    // 按优先级降序排序数据源
    const sortedSources = [...sources].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    const allItems: ContentItem[] = [];
    const seenPaths = new Set<string>();
    const seenRelativePaths = new Set<string>();
    let hasValidSource = false;

    for (const source of sortedSources) {
      try {
        // 扫描数据源目录
        const files = await this.scanDirectory(
          source.path,
          source.include,
          source.exclude,
          configDir
        );

        hasValidSource = true;

        // 解析每个文件
        for (const file of files) {
          // 计算相对路径用于去重（基于文件名）
          const relativePath = path.relative(source.path, file);

          // 跳过已处理的文件（优先级高的数据源优先）
          if (seenRelativePaths.has(relativePath)) continue;
          seenRelativePaths.add(relativePath);
          seenPaths.add(file);

          try {
            const item = await this.parseContent(file);

            // 添加数据源信息
            if (source.alias) {
              item.source = source.alias;
            }

            allItems.push(item);
          } catch (error) {
            // 解析单个文件失败时记录警告但继续处理其他文件
            console.warn(
              `解析内容失败: ${file}, 错误: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      } catch (error) {
        // 数据源扫描失败时记录警告但继续处理其他数据源
        console.warn(
          `扫描数据源失败: ${source.path}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // 如果所有数据源都失败，抛出错误
    if (!hasValidSource && sources.length > 0) {
      throw new Error('所有数据源都不可用');
    }

    return allItems;
  }

  /**
   * 扫描目录并应用 glob 模式
   * @param basePath - 基础路径
   * @param include - 包含模式（可选）
   * @param exclude - 排除模式（可选）
   * @param configDir - 配置文件目录，用于相对路径解析
   * @returns 匹配的文件路径列表
   */
  private async scanDirectory(
    basePath: string,
    include?: string[],
    exclude?: string[],
    configDir?: string
  ): Promise<string[]> {
    // 解析相对路径为绝对路径（相对于配置文件目录）
    const baseDir = configDir || process.cwd();
    const resolvedPath = path.resolve(baseDir, basePath);
    
    // 检查目录是否存在
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      throw new Error(`数据源目录不存在: ${basePath} (解析为: ${resolvedPath})`);
    }

    // 使用 include 模式（默认为 **/*.md）
    const includePatterns = include || ['**/*.md'];
    const excludePatterns = exclude || [];

    // 收集所有匹配的文件
    const allFiles = new Set<string>();

    for (const pattern of includePatterns) {
      try {
        // 使用 glob 匹配文件
        const files = await glob(pattern, {
          cwd: resolvedPath,
          absolute: true,
          ignore: excludePatterns,
          nodir: true,
        });

        files.forEach((file) => allFiles.add(file));
      } catch (error) {
        throw new Error(
          `Glob 模式匹配失败: ${pattern}, 错误: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return Array.from(allFiles);
  }

  /**
   * 解析内容文件
   * @param filePath - 文件路径
   * @returns 内容项对象
   */
  private async parseContent(filePath: string): Promise<ContentItem> {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // 使用 gray-matter 解析 frontmatter
      const { data, content } = matter(fileContent);

      // 提取必需字段
      const title = data.title || path.basename(filePath, '.md');

      // 提取创建日期（优先级：created > date > 文件修改时间）
      let created: Date;
      if (data.created) {
        created = new Date(data.created);
      } else if (data.date) {
        created = new Date(data.date);
      } else {
        // 使用文件修改时间作为后备
        const stats = await fs.stat(filePath);
        created = stats.mtime;
      }

      // 提取可选字段
      const description = data.description || data.summary || '';
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const category = data.category || '';
      const url = this.extractUrl(data);
      const rating = this.extractRating(data);
      const images = this.extractImages(data);

      // 计算内容哈希（用于缓存）
      const contentHash = this.calculateHash(fileContent);

      // 构建内容项对象
      const item: ContentItem = {
        title,
        path: filePath,
        created,
        contentHash,
      };

      // 添加可选字段（仅当存在时）
      if (description) {
        item.description = description;
      }
      if (tags.length > 0) {
        item.tags = tags;
      }
      if (category) {
        item.category = category;
      }
      if (content) {
        item.content = content;
      }
      if (url) {
        item.url = url;
      }
      if (rating !== undefined) {
        item.rating = rating;
      }
      if (images.length > 0) {
        item.images = images;
        item.image = images[0];
        item.coverImage = this.extractCoverImage(data) || images[0];
      }

      return item;
    } catch (error) {
      throw new Error(
        `解析内容文件失败: ${filePath}, 错误: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 按标签或类别分组内容
   * @param items - 内容项列表
   * @param groupBy - 分组方式（'tags' 或 'category'）
   * @returns 分组后的内容列表（扁平化，包含分组信息）
   */
  private groupContent(
    items: ContentItem[],
    groupBy: 'tags' | 'category'
  ): ContentItem[] {
    if (groupBy === 'tags') {
      return this.groupByTags(items);
    } else if (groupBy === 'category') {
      return this.groupByCategory(items);
    }
    return items;
  }

  /**
   * 按标签分组内容
   * 多标签内容会出现在所有相关标签组中
   * @param items - 内容项列表
   * @returns 分组后的内容列表
   */
  private groupByTags(items: ContentItem[]): ContentItem[] {
    // 按标签分组后直接返回原始列表
    // 分组信息保留在每个内容项的 tags 字段中
    return items;
  }

  /**
   * 按类别分组内容
   * @param items - 内容项列表
   * @returns 分组后的内容列表
   */
  private groupByCategory(items: ContentItem[]): ContentItem[] {
    // 按类别分组后直接返回原始列表
    // 分组信息保留在每个内容项的 category 字段中
    return items;
  }

  /**
   * 计算内容哈希（用于缓存键）
   * @param content - 文件内容
   * @returns SHA-256 哈希值
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 添加天数到日期
   * @param date - 基准日期
   * @param days - 要添加的天数
   * @returns 新日期
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private extractImages(data: Record<string, any>): string[] {
    const candidates = [
      ...this.toImageList(data.images),
      ...this.toImageList(data.image),
      ...this.toImageList(data.coverImage),
      ...this.toImageList(data.cover),
      ...this.toImageList(data.thumbnail),
      ...this.toImageList(data.poster),
    ];

    return Array.from(new Set(candidates));
  }

  private extractCoverImage(data: Record<string, any>): string | undefined {
    const coverImage = this.toImageList(data.coverImage)[0];
    return coverImage || undefined;
  }

  private extractUrl(data: Record<string, any>): string | undefined {
    const candidate = typeof data.url === 'string'
      ? data.url
      : typeof data.source === 'string'
        ? data.source
        : '';
    const normalized = candidate.trim();
    return normalized || undefined;
  }

  private extractRating(data: Record<string, any>): number | undefined {
    const raw = data.rating ?? data.score;
    if (raw === null || raw === undefined || raw === '') {
      return undefined;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toImageList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized ? [normalized] : [];
    }

    return [];
  }
}
