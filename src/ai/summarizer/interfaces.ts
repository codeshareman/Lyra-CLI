/**
 * AI 摘要器接口定义
 */

import { SummaryOptions } from '../interfaces';

/**
 * AI 摘要器接口
 */
export interface IAISummarizer {
  /**
   * 生成单个内容的摘要
   * @param content - 要生成摘要的内容
   * @param options - 摘要选项
   * @returns 生成的摘要
   */
  summarize(content: string, options?: SummaryOptions): Promise<string>;

  /**
   * 批量生成摘要
   * @param contents - 要生成摘要的内容数组
   * @param options - 摘要选项
   * @returns 生成的摘要数组
   */
  summarizeBatch(contents: string[], options?: SummaryOptions): Promise<string[]>;

  /**
   * 获取缓存的摘要
   * @param contentId - 内容ID
   * @returns 缓存的摘要，如果不存在则返回 null
   */
  getCachedSummary(contentId: string): Promise<string | null>;

  /**
   * 清空摘要缓存
   */
  clearCache(): Promise<void>;
}

/**
 * 摘要内容项
 */
export interface SummaryContentItem {
  /** 内容ID（用于缓存） */
  id: string;
  /** 内容文本 */
  content?: string;
  /** 文件路径（如果内容来自文件） */
  filePath?: string;
  /** 描述（作为回退） */
  description?: string;
  /** 标题 */
  title?: string;
}

/**
 * 摘要结果
 */
export interface SummaryResult {
  /** 内容ID */
  id: string;
  /** 生成的摘要 */
  summary: string;
  /** 是否来自缓存 */
  fromCache: boolean;
  /** 是否使用了回退（描述） */
  usedFallback: boolean;
  /** 错误信息（如果生成失败） */
  error?: string;
}

/**
 * 批量摘要选项
 */
export interface BatchSummaryOptions extends SummaryOptions {
  /** 并发数量 */
  concurrency?: number;
  /** 是否强制重新生成（忽略缓存） */
  forceRegenerate?: boolean;
  /** 批量处理时的延迟（毫秒） */
  batchDelay?: number;
}