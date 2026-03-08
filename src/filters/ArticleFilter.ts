import { glob } from 'glob';
import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import {
  IArticleFilter,
  ArticleFilterOptions,
  Article,
  DataSourceInput,
  DataSourceConfig,
  IHookManager,
} from '../types/interfaces';
import { DataSourceManager } from '../core/DataSourceManager';

/**
 * ArticleFilter 负责从多个数据源筛选高质量文章
 * 支持评分排序、最小评分阈值和自定义钩子
 */
export class ArticleFilter implements IArticleFilter {
  private dataSources: DataSourceConfig[];
  private hookManager: IHookManager;

  /**
   * 创建 ArticleFilter 实例
   * @param dataSources - 数据源配置（字符串、对象或数组）
   * @param hookManager - 钩子管理器
   */
  constructor(dataSources: DataSourceInput, hookManager: IHookManager) {
    // 规范化数据源配置
    this.dataSources = DataSourceManager.normalize(dataSources);
    this.hookManager = hookManager;
  }

  /**
   * 筛选文章
   * @param options - 筛选选项
   * @returns 筛选后的文章列表
   */
  async filter(options: ArticleFilterOptions): Promise<Article[]> {
    // 1. 从所有数据源扫描文章
    let articles = await this.scanMultipleSources(this.dataSources, options.configDir);

    // 2. 执行 beforeArticleFilter 钩子
    if (this.hookManager.hasHook('beforeArticleFilter')) {
      articles = await this.hookManager.executeHook('beforeArticleFilter', {
        type: 'beforeArticleFilter',
        data: articles,
        config: {},
        options,
      });
    }

    // 3. 执行自定义评分钩子
    if (this.hookManager.hasHook('customArticleScore')) {
      articles = await this.hookManager.executeHook('customArticleScore', {
        type: 'customArticleScore',
        data: articles,
        config: {},
        options,
      });
    }

    // 4. 计算当前周范围（如果提供了日期选项）
    let weekStart: Date | null = null;
    let weekEnd: Date | null = null;
    if (options.weekStart && options.weekEnd) {
      weekStart = new Date(options.weekStart);
      weekEnd = new Date(options.weekEnd);
    }

    // 5. 应用筛选条件：可配置最小评分 + 可选周范围
    const filtered = articles.filter((article) => {
      // 条件1：评分阈值
      if (article.rating < (options.minRating || 0)) {
        return false;
      }

      // 条件2：如果指定了周范围，检查文章创建日期是否在当前周内
      if (weekStart && weekEnd && article.created) {
        const createdDate = new Date(article.created);
        if (createdDate < weekStart || createdDate > weekEnd) {
          return false;
        }
      }

      return true;
    });

    // 6. 按评分降序排序
    filtered.sort((a, b) => b.rating - a.rating);

    // 7. 返回前 N 篇
    let result = filtered.slice(0, options.topN);

    // 8. 执行 afterArticleFilter 钩子
    if (this.hookManager.hasHook('afterArticleFilter')) {
      result = await this.hookManager.executeHook('afterArticleFilter', {
        type: 'afterArticleFilter',
        data: result,
        config: {},
        options,
      });
    }

    return result;
  }

  /**
   * 从多个数据源扫描文章
   * @param sources - 数据源配置数组
   * @param configDir - 配置文件目录，用于相对路径解析
   * @returns 所有数据源的文章列表（去重）
   */
  private async scanMultipleSources(
    sources: DataSourceConfig[],
    configDir?: string
  ): Promise<Article[]> {
    // 按优先级降序排序数据源
    const sortedSources = [...sources].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    const allArticles: Article[] = [];
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
            const article = await this.parseArticle(file);

            // 添加数据源信息
            if (source.alias) {
              article.source = source.alias;
            }

            allArticles.push(article);
          } catch (error) {
            // 解析单个文件失败时记录警告但继续处理其他文件
            console.warn(
              `解析文章失败: ${file}, 错误: ${
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

    return allArticles;
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
   * 解析文章文件
   * @param filePath - 文件路径
   * @returns 文章对象
   */
  private async parseArticle(filePath: string): Promise<Article> {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // 使用 gray-matter 解析 frontmatter
      const { data } = matter(fileContent);

      // 提取必需字段
      const title = data.title || path.basename(filePath, '.md');
      const url = data.url || data.source || '';

      // 提取评分字段（支持 rating 或 score，支持数字和字符串）
      let rating = 0;
      const ratingValue = data.rating || data.score;
      if (typeof ratingValue === 'number') {
        rating = ratingValue;
      } else if (typeof ratingValue === 'string') {
        const parsedRating = parseFloat(ratingValue);
        if (!isNaN(parsedRating)) {
          rating = parsedRating;
        }
      }

      // 提取创建日期字段
      const created = this.resolveCreated(data);

      // 提取可选字段
      const description = data.description || data.summary || '';
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const category = data.category || '';
      const images = this.extractImages(data);

      // 构建文章对象
      const article: Article = {
        title,
        url,
        rating,
        path: filePath,
      };

      // 添加可选字段（仅当存在时）
      if (description) {
        article.description = description;
      }
      if (tags.length > 0) {
        article.tags = tags;
      }
      if (category) {
        article.category = category;
      }
      if (images.length > 0) {
        article.images = images;
        article.image = images[0];
        article.coverImage = this.extractCoverImage(data) || images[0];
      }
      if (created) {
        article.created = created;
      }

      return article;
    } catch (error) {
      throw new Error(
        `解析文章文件失败: ${filePath}, 错误: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private resolveCreated(data: Record<string, any>): string | undefined {
    const candidates = [
      data.created,
      data.date,
      data.createdAt,
      data.published,
      data.published_date,
      data.clipped_date,
      data.modify,
      data.modified,
      data.updated,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return undefined;
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
