/**
 * AI 相关接口定义
 */

/**
 * AI 提供者接口
 */
export interface IAIProvider {
  /**
   * 生成摘要
   * @param content - 要生成摘要的内容
   * @param options - 生成选项
   * @returns 生成的摘要
   */
  generateSummary(content: string, options?: SummaryOptions): Promise<string>;

  /**
   * 获取模型名称
   * @returns 模型名称
   */
  getModelName(): string;
}

/**
 * 摘要生成选项
 */
export interface SummaryOptions {
  /** 最大长度（字符数） */
  maxLength?: number;
  /** 语言 */
  language?: string;
  /** 摘要风格 */
  style?: 'concise' | 'detailed' | 'bullet-points';
  /** 温度参数（0-1，控制创造性） */
  temperature?: number;
}

/**
 * AI 提供者配置
 */
export interface AIProviderConfig {
  /** 提供者类型 */
  provider: 'openai' | 'anthropic' | 'local' | 'gemini' | 'google';
  /** API 密钥 */
  apiKey?: string;
  /** 模型名称 */
  model?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * AI 错误类型
 */
export enum AIErrorType {
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MODEL_ERROR = 'MODEL_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

/**
 * AI 错误
 */
export class AIError extends Error {
  constructor(
    public type: AIErrorType,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AIError';
  }
}
