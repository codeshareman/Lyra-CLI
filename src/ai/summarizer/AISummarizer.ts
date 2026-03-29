/**
 * AI 摘要器实现
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { IAISummarizer, SummaryContentItem, SummaryResult, BatchSummaryOptions } from './interfaces';
import { IAIProvider, SummaryOptions } from '../interfaces';
import { ISummaryCache, CachedSummary } from '../cache/interfaces';
import { IRateLimiter } from '../ratelimit/interfaces';

/**
 * AI 摘要器
 */
export class AISummarizer implements IAISummarizer {
  private aiProvider: IAIProvider;
  private cache: ISummaryCache;
  private rateLimiter: IRateLimiter;

  constructor(
    aiProvider: IAIProvider,
    cache: ISummaryCache,
    rateLimiter: IRateLimiter
  ) {
    this.aiProvider = aiProvider;
    this.cache = cache;
    this.rateLimiter = rateLimiter;
  }

  /**
   * 生成单个内容的摘要
   */
  async summarize(content: string, options: SummaryOptions = {}): Promise<string> {
    const contentId = this.calculateContentHash(content, options);
    const forceRegenerate = (options as any).forceRegenerate === true;
    
    // 尝试从缓存获取
    if (!forceRegenerate) {
      const cached = await this.getCachedSummary(contentId);
      if (cached) {
        return cached;
      }
    }

    try {
      // 等待速率限制
      await this.rateLimiter.waitForSlot();
      
      // 生成摘要
      const summary = await this.aiProvider.generateSummary(content, options);
      
      // 记录请求
      this.rateLimiter.recordRequest();
      
      // 缓存结果
      await this.cacheSummary(contentId, summary, options);
      
      return summary;
    } catch (error) {
      // AI 生成失败，返回截断的原始内容作为回退
      const maxLength = options.maxLength || 200;
      return this.createFallbackSummary(content, maxLength);
    }
  }

  /**
   * 批量生成摘要
   */
  async summarizeBatch(contents: string[], options: SummaryOptions = {}): Promise<string[]> {
    const batchOptions: BatchSummaryOptions = {
      concurrency: 3,
      batchDelay: 0,
      ...options
    };

    const results: string[] = [];
    const batches = this.createBatches(contents, batchOptions.concurrency!);

    for (const batch of batches) {
      const batchPromises = batch.map(async (content, index) => {
        try {
          return await this.summarize(content, options);
        } catch (error) {
          // 返回回退摘要
          const maxLength = options.maxLength || 200;
          return this.createFallbackSummary(content, maxLength);
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 批次间延迟
      if (batchOptions.batchDelay && batchOptions.batchDelay > 0) {
        await this.delay(batchOptions.batchDelay);
      }
    }

    return results;
  }

  /**
   * 批量处理内容项
   */
  async summarizeContentItems(
    items: SummaryContentItem[],
    options: BatchSummaryOptions = {}
  ): Promise<SummaryResult[]> {
    const results: SummaryResult[] = [];
    const batches = this.createBatches(items, options.concurrency || 3);

    for (const batch of batches) {
      const batchPromises = batch.map(async (item) => {
        return await this.processSummaryItem(item, options);
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 批次间延迟
      if (options.batchDelay && options.batchDelay > 0) {
        await this.delay(options.batchDelay);
      }
    }

    return results;
  }

  /**
   * 获取缓存的摘要
   */
  async getCachedSummary(contentId: string): Promise<string | null> {
    const cached = await this.cache.get(contentId);
    return cached ? cached.summary : null;
  }

  /**
   * 清空摘要缓存
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * 处理单个摘要项
   */
  private async processSummaryItem(
    item: SummaryContentItem,
    options: BatchSummaryOptions
  ): Promise<SummaryResult> {
    let normalizedContent = '';

    try {
      // 获取内容
      const content = await this.extractContent(item);
      normalizedContent = content?.trim() || '';
      if (!normalizedContent) {
        return {
          id: item.id,
          summary: this.getPreferredFallbackText(item.description, item.title) || '无可用内容',
          fromCache: false,
          usedFallback: true,
          error: '无可用内容'
        };
      }

      // 计算内容哈希
      const contentHash = this.calculateContentHash(normalizedContent, options);
      
      // 检查缓存（除非强制重新生成）
      if (!options.forceRegenerate) {
        const cached = await this.getCachedSummary(contentHash);
        if (cached) {
          return {
            id: item.id,
            summary: cached,
            fromCache: true,
            usedFallback: false
          };
        }
      }

      // 生成摘要（这里直接调用 provider 以便精确记录回退状态）
      await this.rateLimiter.waitForSlot();
      const summary = await this.aiProvider.generateSummary(normalizedContent, options);
      this.rateLimiter.recordRequest();
      await this.cacheSummary(contentHash, summary, options);
      
      return {
        id: item.id,
        summary,
        fromCache: false,
        usedFallback: false
      };
    } catch (error) {
      // 使用回退策略
      const fallbackSummary =
        this.getPreferredFallbackText(item.description, item.title) ||
        (normalizedContent ? this.createFallbackSummary(normalizedContent, options.maxLength || 200) : '无可用内容');
      
      return {
        id: item.id,
        summary: fallbackSummary,
        fromCache: false,
        usedFallback: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private getPreferredFallbackText(
    ...candidates: Array<string | null | undefined>
  ): string | null {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * 提取内容
   */
  private async extractContent(item: SummaryContentItem): Promise<string | null> {
    // 优先使用直接提供的内容
    if (item.content) {
      return item.content;
    }

    // 尝试从文件读取
    if (item.filePath) {
      try {
        const fileContent = await fs.readFile(item.filePath, 'utf-8');
        // 移除 frontmatter
        const contentWithoutFrontmatter = this.removeFrontmatter(fileContent);
        return contentWithoutFrontmatter;
      } catch (error) {
        console.warn(`读取文件失败: ${item.filePath}, 错误: ${error}`);
      }
    }

    // 使用描述作为回退
    return item.description || null;
  }

  /**
   * 移除 frontmatter
   */
  private removeFrontmatter(content: string): string {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    return content.replace(frontmatterRegex, '').trim();
  }

  /**
   * 计算内容哈希
   */
  private calculateContentHash(content: string, options: SummaryOptions): string {
    const optionsString = JSON.stringify({
      maxLength: options.maxLength,
      language: options.language,
      style: options.style,
      temperature: options.temperature,
      model: this.aiProvider.getModelName()
    });
    
    const combined = content + optionsString;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * 缓存摘要
   */
  private async cacheSummary(
    contentId: string,
    summary: string,
    options: SummaryOptions
  ): Promise<void> {
    const optionsHash = this.calculateOptionsHash(options);
    const cachedSummary: CachedSummary = {
      summary,
      createdAt: new Date(),
      optionsHash,
      modelName: this.aiProvider.getModelName()
    };

    // 设置 7 天的 TTL
    await this.cache.set(contentId, cachedSummary, 7 * 24 * 60 * 60);
  }

  /**
   * 计算选项哈希
   */
  private calculateOptionsHash(options: SummaryOptions): string {
    const optionsString = JSON.stringify({
      maxLength: options.maxLength,
      language: options.language,
      style: options.style,
      temperature: options.temperature
    });
    
    return crypto.createHash('md5').update(optionsString).digest('hex');
  }

  /**
   * 创建回退摘要
   */
  private createFallbackSummary(content: string, maxLength: number): string {
    // 移除 frontmatter 和多余的空白
    const cleanContent = this.removeFrontmatter(content)
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanContent.length <= maxLength) {
      return cleanContent;
    }

    // 截断到最大长度，但尝试在句子边界截断
    const truncated = cleanContent.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('；'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?'),
      truncated.lastIndexOf(';')
    );

    if (lastSentenceEnd > maxLength * 0.5) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    return truncated.substring(0, maxLength - 3).trim() + '...';
  }

  /**
   * 创建批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
