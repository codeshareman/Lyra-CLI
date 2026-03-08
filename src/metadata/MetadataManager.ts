import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import {
  IMetadataManager,
  MetadataOptions,
  DocumentMetadata,
} from '../types/interfaces';
import { ContentGeneratorError, ErrorCode } from '../types/errors';

/**
 * MetadataManager 负责管理文档元数据、期数计算和文件命名
 * 支持周范围计算、文档 ID 生成、期数自动递增和上期文档链接更新
 */
export class MetadataManager implements IMetadataManager {
  private outputPath: string;
  private configDir?: string;

  /**
   * 创建 MetadataManager 实例
   * @param outputPath - 输出目录路径
   * @param configDir - 配置文件目录，用于相对路径解析
   */
  constructor(outputPath: string, configDir?: string) {
    this.outputPath = outputPath;
    this.configDir = configDir;
  }

  /**
   * 生成文档元数据
   * @param options - 生成选项
   * @returns 元数据对象
   */
  async generate(options: MetadataOptions): Promise<DocumentMetadata> {
    try {
      // 1. 计算周范围（周一到周日）
      const { weekStart, weekEnd } = this.calculateWeekRange(options.date);

      // 2. 生成文档 ID（YYYYMMDDHHmmss 格式）
      const id = this.generateDocumentId();

      // 3. 计算期数（扫描已存在文档，最大期数 + 1）
      const issueNumber = await this.calculateIssueNumber(options.outputPath);

      // 4. 生成完整的 Frontmatter 元数据
      const now = new Date();
      const metadata: DocumentMetadata = {
        id,
        title: `Weekly Issue #${issueNumber}`,
        type: 'weekly',
        issueNumber,
        year: options.date.getFullYear(),
        date: this.formatDate(options.date),
        weekStart: this.formatDate(weekStart),
        weekEnd: this.formatDate(weekEnd),
        created: this.formatDateTime(now),
        modified: this.formatDateTime(now),
        status: 'published',
        tags: ['weekly', 'newsletter'],
        publishedPlatforms: [],
      };

      return metadata;
    } catch (error) {
      throw new ContentGeneratorError(
        ErrorCode.E009,
        `生成元数据失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { options, error }
      );
    }
  }

  /**
   * 更新上期文档的 frontmatter，添加 next 字段指向当前期
   * @param currentIssue - 当前期数
   * @param currentPath - 当前文档路径
   */
  async updatePreviousIssue(
    currentIssue: number,
    currentPath: string
  ): Promise<void> {
    try {
      // 如果是第一期，无需更新
      if (currentIssue <= 1) {
        return;
      }

      // 查找上期文档
      const previousIssue = currentIssue - 1;
      const previousFile = await this.findIssueFile(previousIssue);

      if (!previousFile) {
        // 上期文档不存在，记录警告但不抛出错误
        console.warn(`未找到上期文档 (期数: ${previousIssue})`);
        return;
      }

      // 读取上期文档内容
      const fileContent = await fs.readFile(previousFile, 'utf-8');
      const parsed = matter(fileContent);

      // 更新 frontmatter，添加 next 字段
      parsed.data.next = path.basename(currentPath);
      parsed.data.modified = this.formatDateTime(new Date());

      // 重新生成文档内容
      const updatedContent = matter.stringify(parsed.content, parsed.data);

      // 写回文件
      await fs.writeFile(previousFile, updatedContent, 'utf-8');
    } catch (error) {
      // 更新上期文档失败时记录警告但不中断流程
      console.warn(
        `更新上期文档失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
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
    // 获取当前日期是星期几（0 = 周日, 1 = 周一, ..., 6 = 周六）
    const dayOfWeek = date.getDay();

    // 计算到周一的偏移量
    // 如果是周日（0），偏移量为 -6；否则为 1 - dayOfWeek
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    // 计算周一日期
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() + offsetToMonday);
    weekStart.setHours(0, 0, 0, 0);

    // 计算周日日期（周一 + 6 天）
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  }

  /**
   * 生成唯一的文档 ID（YYYYMMDDHHmmss 格式）
   * @returns 文档 ID 字符串
   */
  private generateDocumentId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * 计算下一期期数
   * 基于周期的期数管理：同一周内多次生成保持相同期数，新周期自动递增
   * @param outputPath - 输出目录路径
   * @returns 当前周期的期数
   */
  private async calculateIssueNumber(outputPath: string): Promise<number> {
    try {
      // 解析相对路径为绝对路径（相对于配置文件目录）
      const baseDir = this.configDir || process.cwd();
      const resolvedPath = path.resolve(baseDir, outputPath);
      
      // 检查输出目录是否存在
      try {
        await fs.access(resolvedPath);
      } catch {
        // 目录不存在，返回期数 1
        return 1;
      }

      // 扫描输出目录中的所有 Markdown 文件
      const files = await glob('**/*.md', {
        cwd: resolvedPath,
        absolute: true,
        nodir: true,
      });

      if (files.length === 0) {
        // 目录为空，返回期数 1
        return 1;
      }

      // 计算当前周的周范围
      const currentDate = new Date();
      const { weekStart: currentWeekStart, weekEnd: currentWeekEnd } = this.calculateWeekRange(currentDate);

      // 解析所有文件的 frontmatter，查找当前周期的文档
      let currentWeekIssue: number | null = null;
      let maxIssueNumber = 0;

      for (const file of files) {
        try {
          const fileContent = await fs.readFile(file, 'utf-8');
          const { data } = matter(fileContent);

          // 提取期数
          const issueNumber = data.issueNumber || data.issue_number || data.issue;
          if (typeof issueNumber === 'number' && issueNumber > 0) {
            maxIssueNumber = Math.max(maxIssueNumber, issueNumber);

            // 检查文档的周范围是否与当前周重叠
            const docWeekStart = data.weekStart || data.week_start;
            const docWeekEnd = data.weekEnd || data.week_end;

            if (docWeekStart && docWeekEnd) {
              const docStart = new Date(docWeekStart);
              const docEnd = new Date(docWeekEnd);

              // 检查周期是否重叠
              if (this.isWeekOverlap(currentWeekStart, currentWeekEnd, docStart, docEnd)) {
                currentWeekIssue = issueNumber;
                break; // 找到当前周期的文档，直接返回
              }
            }
          }
        } catch {
          // 解析单个文件失败时跳过
          continue;
        }
      }

      // 如果找到当前周期的文档，返回相同期数
      if (currentWeekIssue !== null) {
        return currentWeekIssue;
      }

      // 如果没有找到当前周期的文档，返回最大期数 + 1
      return maxIssueNumber + 1;
    } catch (error) {
      throw new Error(
        `计算期数失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 检查两个周期是否重叠
   * @param week1Start - 第一个周期的开始日期
   * @param week1End - 第一个周期的结束日期
   * @param week2Start - 第二个周期的开始日期
   * @param week2End - 第二个周期的结束日期
   * @returns 是否重叠
   */
  private isWeekOverlap(
    week1Start: Date,
    week1End: Date,
    week2Start: Date,
    week2End: Date
  ): boolean {
    // 两个时间段重叠的条件：
    // week1Start <= week2End && week2Start <= week1End
    return week1Start <= week2End && week2Start <= week1End;
  }

  /**
   * 查找指定期数的文档文件
   * @param issueNumber - 期数
   * @returns 文件路径，如果未找到则返回 null
   */
  private async findIssueFile(issueNumber: number): Promise<string | null> {
    try {
      // 解析相对路径为绝对路径（相对于配置文件目录）
      const baseDir = this.configDir || process.cwd();
      const resolvedPath = path.resolve(baseDir, this.outputPath);
      
      // 检查输出目录是否存在
      try {
        await fs.access(resolvedPath);
      } catch {
        return null;
      }

      // 扫描输出目录中的所有 Markdown 文件
      const files = await glob('**/*.md', {
        cwd: resolvedPath,
        absolute: true,
        nodir: true,
      });

      // 查找匹配期数的文件
      for (const file of files) {
        try {
          const fileContent = await fs.readFile(file, 'utf-8');
          const { data } = matter(fileContent);

          const fileIssueNumber =
            data.issueNumber || data.issue_number || data.issue;

          if (fileIssueNumber === issueNumber) {
            return file;
          }
        } catch {
          // 解析单个文件失败时跳过
          continue;
        }
      }

      return null;
    } catch (error) {
      console.warn(
        `查找期数文件失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
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

  /**
   * 格式化日期时间为 ISO 8601 格式
   * @param date - 日期对象
   * @returns 格式化的日期时间字符串
   */
  private formatDateTime(date: Date): string {
    return date.toISOString();
  }
}
