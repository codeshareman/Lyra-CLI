import matter from 'gray-matter';
import {
  EnhancedDocumentMetadata,
  EnhancedArticle,
  EnhancedTool,
  LifeMoment,
  FoodRecord,
  ExerciseRecord,
  MusicRecommendation,
  MetadataOptions,
  Article,
  Tool,
  ContentItem,
} from '../types/interfaces';
import { ContentGeneratorError, ErrorCode } from '../types/errors';
import { MetadataManager } from './MetadataManager';

/**
 * EnhancedMetadataManager 扩展 MetadataManager，支持增强元数据字段
 * 包括封面图、金句、代码片段、图片数组、运动记录、音乐推荐等
 */
export class EnhancedMetadataManager extends MetadataManager {
  /**
   * 生成增强的文档元数据
   * @param options - 生成选项
   * @param visualConfig - 视觉配置（封面图、背景图、金句）
   * @returns 增强的元数据对象
   */
  async generateEnhanced(
    options: MetadataOptions,
    visualConfig?: {
      coverImage?: string;
      backgroundImage?: string;
      goldenQuote?: { content: string; author: string };
    }
  ): Promise<EnhancedDocumentMetadata> {
    // 调用父类方法生成基础元数据
    const baseMetadata = await this.generate(options);

    // 添加增强字段
    const enhancedMetadata: EnhancedDocumentMetadata = {
      ...baseMetadata,
      coverImage: visualConfig?.coverImage,
      backgroundImage: visualConfig?.backgroundImage,
      goldenQuote: visualConfig?.goldenQuote,
    };

    return enhancedMetadata;
  }

  /**
   * 解析文章的增强元数据
   * @param article - 基础文章对象
   * @param frontmatter - 文件的 frontmatter 数据
   * @returns 增强的文章对象
   */
  parseEnhancedArticle(
    article: Article,
    frontmatter: Record<string, any>
  ): EnhancedArticle {
    const enhanced: EnhancedArticle = {
      ...article,
      coverImage: this.parseOptionalString(frontmatter.coverImage),
      personalReflection: this.parseOptionalString(
        frontmatter.personalReflection || frontmatter.personal_reflection
      ),
    };

    return enhanced;
  }

  /**
   * 解析工具的增强元数据
   * @param tool - 基础工具对象
   * @param frontmatter - 文件的 frontmatter 数据
   * @returns 增强的工具对象
   */
  parseEnhancedTool(
    tool: Tool,
    frontmatter: Record<string, any>
  ): EnhancedTool {
    const enhanced: EnhancedTool = {
      ...tool,
      codeSnippet: this.parseOptionalString(
        frontmatter.codeSnippet || frontmatter.code_snippet
      ),
      language: this.parseOptionalString(frontmatter.language),
    };

    return enhanced;
  }

  /**
   * 解析生活瞬间元数据
   * @param frontmatter - 文件的 frontmatter 数据
   * @param filePath - 文件路径
   * @returns 生活瞬间对象，如果验证失败则返回 null
   */
  parseLifeMoment(
    frontmatter: Record<string, any>,
    filePath: string
  ): LifeMoment | null {
    try {
      // 验证必需字段
      const title = this.parseRequiredString(frontmatter.title, 'title');
      const images = this.parseRequiredArray(frontmatter.images, 'images');
      const date = this.parseRequiredDate(
        frontmatter.date || frontmatter.created,
        'date'
      );

      const lifeMoment: LifeMoment = {
        title,
        description: this.parseOptionalString(frontmatter.description),
        url: this.parseOptionalString(frontmatter.url),
        images,
        date,
        tags: this.parseOptionalArray(frontmatter.tags),
        category: this.parseOptionalString(frontmatter.category),
        path: filePath,
      };

      return lifeMoment;
    } catch (error) {
      // 验证失败，返回 null
      return null;
    }
  }

  /**
   * 解析饮食记录元数据
   * @param frontmatter - 文件的 frontmatter 数据
   * @param filePath - 文件路径
   * @returns 饮食记录对象，如果验证失败则返回 null
   */
  parseFoodRecord(
    frontmatter: Record<string, any>,
    filePath: string
  ): FoodRecord | null {
    try {
      // 验证必需字段
      const title = this.parseRequiredString(frontmatter.title, 'title');
      const images = this.parseRequiredArray(frontmatter.images, 'images');
      const date = this.parseRequiredDate(
        frontmatter.date || frontmatter.created,
        'date'
      );

      const foodRecord: FoodRecord = {
        title,
        description: this.parseOptionalString(frontmatter.description),
        url: this.parseOptionalString(frontmatter.url),
        images,
        date,
        rating: this.parseOptionalNumber(frontmatter.rating),
        category: this.parseOptionalString(frontmatter.category),
        path: filePath,
      };

      return foodRecord;
    } catch (error) {
      // 验证失败，返回 null
      return null;
    }
  }

  /**
   * 解析运动记录元数据
   * @param frontmatter - 文件的 frontmatter 数据
   * @param filePath - 文件路径
   * @returns 运动记录对象，如果验证失败则返回 null
   */
  parseExerciseRecord(
    frontmatter: Record<string, any>,
    filePath: string
  ): ExerciseRecord | null {
    try {
      // 验证必需字段
      const type = this.parseRequiredString(frontmatter.type, 'type');
      const duration = this.parseRequiredNumber(
        frontmatter.duration,
        'duration'
      );
      const date = this.parseRequiredDate(
        frontmatter.date || frontmatter.created,
        'date'
      );

      const exerciseRecord: ExerciseRecord = {
        type,
        duration,
        url: this.parseOptionalString(frontmatter.url),
        calories: this.parseOptionalNumber(frontmatter.calories),
        date,
        notes: this.parseOptionalString(frontmatter.notes),
        category: this.parseOptionalString(frontmatter.category),
        path: filePath,
      };

      return exerciseRecord;
    } catch (error) {
      // 验证失败，返回 null
      return null;
    }
  }

  /**
   * 解析音乐推荐元数据
   * @param frontmatter - 文件的 frontmatter 数据
   * @param filePath - 文件路径
   * @returns 音乐推荐对象，如果验证失败则返回 null
   */
  parseMusicRecommendation(
    frontmatter: Record<string, any>,
    filePath: string
  ): MusicRecommendation | null {
    try {
      // 验证必需字段
      const title = this.parseRequiredString(frontmatter.title, 'title');
      const artist = this.parseRequiredString(frontmatter.artist, 'artist');

      const musicRecommendation: MusicRecommendation = {
        title,
        artist,
        album: this.parseOptionalString(frontmatter.album),
        feeling: this.parseOptionalString(frontmatter.feeling),
        url: this.parseOptionalString(frontmatter.url),
        date: this.parseOptionalDate(frontmatter.date || frontmatter.created),
        category: this.parseOptionalString(frontmatter.category),
        path: filePath,
      };

      return musicRecommendation;
    } catch (error) {
      // 验证失败，返回 null
      return null;
    }
  }

  /**
   * 验证增强元数据的完整性
   * @param metadata - 元数据对象
   * @returns 验证结果
   */
  validateEnhancedMetadata(metadata: any): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 验证封面图片 URL 格式（如果提供）
    if (metadata.coverImage && !this.isValidImagePath(metadata.coverImage)) {
      errors.push(`Invalid coverImage path: ${metadata.coverImage}`);
    }

    // 验证背景图片 URL 格式（如果提供）
    if (
      metadata.backgroundImage &&
      !this.isValidImagePath(metadata.backgroundImage)
    ) {
      errors.push(`Invalid backgroundImage path: ${metadata.backgroundImage}`);
    }

    // 验证金句格式（如果提供）
    if (metadata.goldenQuote !== undefined && metadata.goldenQuote !== null) {
      if (
        typeof metadata.goldenQuote !== 'object' ||
        typeof metadata.goldenQuote.content !== 'string' ||
        typeof metadata.goldenQuote.author !== 'string' ||
        !metadata.goldenQuote.content.trim() ||
        !metadata.goldenQuote.author.trim()
      ) {
        errors.push(
          'Invalid goldenQuote format: must have content and author fields'
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * 解析必需的字符串字段
   * @param value - 字段值
   * @param fieldName - 字段名称
   * @returns 字符串值
   * @throws 如果字段缺失或类型错误
   */
  private parseRequiredString(value: any, fieldName: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing or invalid required field: ${fieldName}`);
    }
    return value.trim();
  }

  /**
   * 解析可选的字符串字段
   * @param value - 字段值
   * @returns 字符串值或 undefined
   */
  private parseOptionalString(value: any): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value.trim() || undefined;
    }
    return undefined;
  }

  /**
   * 解析必需的数字字段
   * @param value - 字段值
   * @param fieldName - 字段名称
   * @returns 数字值
   * @throws 如果字段缺失或类型错误
   */
  private parseRequiredNumber(value: any, fieldName: string): number {
    // 检查 null 和 undefined
    if (value === null || value === undefined) {
      throw new Error(`Missing or invalid required field: ${fieldName}`);
    }
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Missing or invalid required field: ${fieldName}`);
    }
    return num;
  }

  /**
   * 解析可选的数字字段
   * @param value - 字段值
   * @returns 数字值或 undefined
   */
  private parseOptionalNumber(value: any): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  /**
   * 解析必需的数组字段
   * @param value - 字段值
   * @param fieldName - 字段名称
   * @returns 字符串数组
   * @throws 如果字段缺失或类型错误
   */
  private parseRequiredArray(value: any, fieldName: string): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`Missing or invalid required field: ${fieldName}`);
    }
    const filtered = value.filter((item) => typeof item === 'string' && item.trim() !== '');
    if (filtered.length === 0) {
      throw new Error(`Missing or invalid required field: ${fieldName}`);
    }
    return filtered;
  }

  /**
   * 解析可选的数组字段
   * @param value - 字段值
   * @returns 字符串数组或 undefined
   */
  private parseOptionalArray(value: any): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const filtered = value.filter(
      (item) => typeof item === 'string' && item.trim() !== ''
    );
    return filtered.length > 0 ? filtered : undefined;
  }

  /**
   * 解析必需的日期字段
   * @param value - 字段值
   * @param fieldName - 字段名称
   * @returns Date 对象
   * @throws 如果字段缺失或类型错误
   */
  private parseRequiredDate(value: any, fieldName: string): Date {
    const date = this.parseDate(value);
    if (!date) {
      throw new Error(`Missing or invalid required field: ${fieldName}`);
    }
    return date;
  }

  /**
   * 解析可选的日期字段
   * @param value - 字段值
   * @returns Date 对象或 undefined
   */
  private parseOptionalDate(value: any): Date | undefined {
    return this.parseDate(value);
  }

  /**
   * 解析日期值
   * @param value - 字段值
   * @returns Date 对象或 undefined
   */
  private parseDate(value: any): Date | undefined {
    if (!value) {
      return undefined;
    }

    // 如果已经是 Date 对象
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? undefined : value;
    }

    // 尝试解析字符串或数字
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * 验证图片路径格式
   * @param path - 图片路径
   * @returns 是否有效
   */
  private isValidImagePath(path: string): boolean {
    if (!path || typeof path !== 'string') {
      return false;
    }

    // 允许 HTTP/HTTPS URL
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return true;
    }

    // 允许相对路径和绝对路径
    if (path.startsWith('./') || path.startsWith('../') || path.startsWith('/')) {
      return true;
    }

    // 允许不带前缀的相对路径
    return true;
  }
}
