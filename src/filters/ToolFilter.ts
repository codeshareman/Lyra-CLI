import { glob } from 'glob';
import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import {
  IToolFilter,
  ToolFilterOptions,
  Tool,
  DataSourceInput,
  DataSourceConfig,
  IHookManager,
} from '../types/interfaces';
import { DataSourceManager } from '../core/DataSourceManager';

/**
 * ToolFilter 负责从多个数据源筛选工具
 * 支持按分类筛选、评分排序和自定义钩子
 * 与 ArticleFilter 的关键区别：
 * - 工具按分类组织（从 frontmatter 或文件路径提取）
 * - 返回每个分类的前 N 个工具（不是总体前 N 个）
 * - 每个分类最多返回 perCategory 个工具
 */
export class ToolFilter implements IToolFilter {
  private dataSources: DataSourceConfig[];
  private hookManager: IHookManager;

  /**
   * 创建 ToolFilter 实例
   * @param dataSources - 数据源配置（字符串、对象或数组）
   * @param hookManager - 钩子管理器
   */
  constructor(dataSources: DataSourceInput, hookManager: IHookManager) {
    // 规范化数据源配置
    this.dataSources = DataSourceManager.normalize(dataSources);
    this.hookManager = hookManager;
  }

  /**
   * 筛选工具
   * @param options - 筛选选项
   * @returns 筛选后的工具列表（每个分类最多 perCategory 个）
   */
  async filter(options: ToolFilterOptions): Promise<Tool[]> {
    // 1. 从所有数据源扫描工具
    let tools = await this.scanMultipleSources(this.dataSources, options.configDir);

    // 2. 执行 beforeToolFilter 钩子
    if (this.hookManager.hasHook('beforeToolFilter')) {
      tools = await this.hookManager.executeHook('beforeToolFilter', {
        type: 'beforeToolFilter',
        data: tools,
        config: {},
        options,
      });
    }

    // 3. 执行自定义评分钩子
    if (this.hookManager.hasHook('customToolScore')) {
      tools = await this.hookManager.executeHook('customToolScore', {
        type: 'customToolScore',
        data: tools,
        config: {},
        options,
      });
    }

    // 3.5 过滤已推荐工具（可选）
    if (options.excludeRecommended) {
      tools = tools.filter((tool) => !tool.recommended);
    }

    // 4. 按分类分组工具
    const toolsByCategory = this.groupByCategory(tools);

    // 5. 从每个分类选择评分最高的工具
    const selectedTools: Tool[] = [];
    for (const [category, categoryTools] of Object.entries(toolsByCategory)) {
      // 按评分降序排序
      categoryTools.sort((a, b) => b.rating - a.rating);

      // 选择前 perCategory 个工具
      const topTools = categoryTools.slice(0, options.perCategory);
      selectedTools.push(...topTools);
    }

    // 6. 执行 afterToolFilter 钩子
    let result = selectedTools;
    if (this.hookManager.hasHook('afterToolFilter')) {
      result = await this.hookManager.executeHook('afterToolFilter', {
        type: 'afterToolFilter',
        data: result,
        config: {},
        options,
      });
    }

    return result;
  }

  /**
   * 从多个数据源扫描工具
   * @param sources - 数据源配置数组
   * @param configDir - 配置文件目录，用于相对路径解析
   * @returns 所有数据源的工具列表（去重）
   */
  private async scanMultipleSources(
    sources: DataSourceConfig[],
    configDir?: string
  ): Promise<Tool[]> {
    // 按优先级降序排序数据源
    const sortedSources = [...sources].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    const allTools: Tool[] = [];
    const seenUrls = new Map<string, number>(); // URL -> priority
    let hasValidSource = false;

    for (const source of sortedSources) {
      try {
        // 扫描数据源目录中的分类文件
        const categoryFiles = await this.scanCategoryFiles(
          source.path,
          source.include,
          source.exclude,
          configDir
        );

        hasValidSource = true;

        // 解析每个分类文件
        for (const file of categoryFiles) {
          try {
            const tools = await this.parseCategory(file);

            // 添加数据源信息并处理去重
            for (const tool of tools) {
              // 添加数据源信息
              if (source.alias) {
                tool.source = source.alias;
              }

              // 基于 URL 去重（优先级高的数据源优先）
              // 跳过空 URL 的去重检查
              if (tool.url) {
                const currentPriority = source.priority || 0;
                const existingPriority = seenUrls.get(tool.url);

                if (
                  existingPriority === undefined ||
                  currentPriority > existingPriority
                ) {
                  // 如果是新 URL 或当前优先级更高，则添加/替换
                  if (existingPriority !== undefined) {
                    // 移除旧的工具
                    const index = allTools.findIndex((t) => t.url === tool.url);
                    if (index !== -1) {
                      allTools.splice(index, 1);
                    }
                  }
                  allTools.push(tool);
                  seenUrls.set(tool.url, currentPriority);
                }
              } else {
                // 空 URL 的工具直接添加，不进行去重
                allTools.push(tool);
              }
            }
          } catch (error) {
            // 解析单个文件失败时记录警告但继续处理其他文件
            console.warn(
              `解析分类文件失败: ${file}, 错误: ${
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

    return allTools;
  }

  /**
   * 扫描分类文件并应用 glob 模式
   * @param basePath - 基础路径
   * @param include - 包含模式（可选）
   * @param exclude - 排除模式（可选）
   * @param configDir - 配置文件目录，用于相对路径解析
   * @returns 匹配的分类文件路径列表
   */
  private async scanCategoryFiles(
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
   * 解析分类文件，提取所有工具
   * @param filePath - 分类文件路径
   * @returns 该分类的工具列表
   */
  private async parseCategory(filePath: string): Promise<Tool[]> {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // 使用 gray-matter 解析 frontmatter
      const { data, content } = matter(fileContent);

      // 从文件路径或 frontmatter 提取分类名称
      const category =
        data.category || path.basename(filePath, path.extname(filePath));

      const tools: Tool[] = [];

      // 解析 frontmatter 中的工具列表（如果存在）
      if (Array.isArray(data.tools)) {
        for (const toolData of data.tools) {
          if (typeof toolData === 'object') {
            const tool = this.createToolFromData(toolData, category, filePath);
            tools.push(tool);
          }
        }
      }

      // 如果 frontmatter 中没有工具列表，尝试从内容中解析
      // 这里假设工具以 Markdown 列表或标题的形式组织
      // 为了简化，我们主要依赖 frontmatter 中的 tools 数组
      // 如果需要从内容解析，可以在这里添加逻辑

      return tools;
    } catch (error) {
      throw new Error(
        `解析分类文件失败: ${filePath}, 错误: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 从数据对象创建工具对象
   * @param data - 工具数据
   * @param category - 分类名称
   * @param filePath - 文件路径
   * @returns 工具对象
   */
  private createToolFromData(
    data: Record<string, any>,
    category: string,
    filePath: string
  ): Tool {
    // 提取必需字段
    const title = data.title || data.name || 'Untitled Tool';
    const url = data.url || '';

    // 提取评分字段（支持 rating 或 score）
    let rating = 0;
    if (typeof data.rating === 'number') {
      rating = data.rating;
    } else if (typeof data.score === 'number') {
      rating = data.score;
    }

    // 提取可选字段
    const description = data.description || data.summary || '';
    const images = this.extractImages(data);
    const recommended = this.toBoolean(
      data.recommended ?? data.is_recommended ?? data.recommendation_done
    );
    const recommendedAt = this.toDateString(
      data.recommended_at ?? data.recommendedAt ?? data.last_recommended_at
    );

    // 构建工具对象
    const tool: Tool = {
      title,
      url,
      rating,
      category,
      path: filePath,
    };

    // 添加可选字段（仅当存在时）
    if (description) {
      tool.description = description;
    }
    if (images.length > 0) {
      tool.images = images;
      tool.image = images[0];
      tool.coverImage = this.extractCoverImage(data) || images[0];
    }
    if (recommended) {
      tool.recommended = true;
    }
    if (recommendedAt) {
      tool.recommendedAt = recommendedAt;
      tool.recommended = true;
    }

    return tool;
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

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', 'yes', 'y', '1'].includes(normalized);
    }
    return false;
  }

  private toDateString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const raw = String(value).trim();
    if (!raw) {
      return undefined;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 按分类分组工具
   * @param tools - 工具列表
   * @returns 按分类分组的工具映射
   */
  private groupByCategory(tools: Tool[]): Record<string, Tool[]> {
    const grouped: Record<string, Tool[]> = {};

    for (const tool of tools) {
      const category = tool.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tool);
    }

    return grouped;
  }
}
