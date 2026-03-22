/**
 * Gemini 提供者实现
 */

import { IAIProvider, SummaryOptions, AIProviderConfig, AIError, AIErrorType } from '../interfaces';

/**
 * Gemini API 响应接口
 */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
}

/**
 * Gemini 提供者
 */
export class GeminiProvider implements IAIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIError(AIErrorType.AUTHENTICATION, 'Gemini API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-1.5-flash';
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * 生成摘要
   */
  async generateSummary(content: string, options: SummaryOptions = {}): Promise<string> {
    const {
      maxLength = 200,
      language = 'zh-CN',
      style = 'concise',
      temperature = 0.3
    } = options;

    const prompt = this.buildPrompt(content, maxLength, language, style);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(prompt, temperature);
        return this.extractSummary(response);
      } catch (error) {
        if (attempt === this.maxRetries || !this.shouldRetry(error)) {
          throw error;
        }

        await this.delay(Math.pow(2, attempt - 1) * 100);
      }
    }

    throw new AIError(AIErrorType.UNKNOWN, 'Failed to generate summary after retries');
  }

  /**
   * 获取模型名称
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * 构建提示词
   */
  private buildPrompt(content: string, maxLength: number, language: string, style: string): string {
    const styleInstructions = {
      concise: '简洁明了',
      detailed: '详细全面',
      'bullet-points': '要点列表形式'
    };

    const languageInstructions = {
      'zh-CN': '中文',
      'en': 'English',
      'ja': '日本語'
    };

    const lang = languageInstructions[language as keyof typeof languageInstructions] || '中文';
    const styleDesc = styleInstructions[style as keyof typeof styleInstructions] || '简洁明了';

    return `请为以下内容生成一个${styleDesc}的摘要，使用${lang}，长度不超过${maxLength}个字符：

${content}

摘要：`;
  }

  /**
   * 发送 API 请求
   */
  private async makeRequest(prompt: string, temperature: number): Promise<GeminiResponse> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise: Promise<never> = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const timeoutError = new Error('Request timeout');
        timeoutError.name = 'AbortError';
        reject(timeoutError);
      }, this.timeout);
    });

    const base = this.baseUrl.replace(/\/$/, '');
    const url = `${base}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    try {
      const response = await Promise.race([
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt }
                ]
              }
            ],
            generationConfig: {
              temperature,
              maxOutputTokens: 512
            }
          }),
          signal: controller.signal
        }),
        timeoutPromise,
      ]);

      if (!response || typeof response.ok !== 'boolean') {
        throw new AIError(AIErrorType.NETWORK, 'Invalid response from fetch');
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return await response.json() as GeminiResponse;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof AIError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new AIError(AIErrorType.TIMEOUT, 'Request timeout');
        }

        if (this.isLikelyNetworkError(error.message)) {
          throw new AIError(AIErrorType.NETWORK, 'Network error', error);
        }
      }

      throw new AIError(AIErrorType.UNKNOWN, 'Unknown error', error as Error);
    }
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const errorData = await response.json().catch(() => ({})) as any;
    const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

    switch (response.status) {
      case 400:
        throw new AIError(AIErrorType.INVALID_REQUEST, `Invalid request: ${errorMessage}`);
      case 401:
      case 403:
        throw new AIError(AIErrorType.AUTHENTICATION, `Authentication failed: ${errorMessage}`);
      case 429:
        throw new AIError(AIErrorType.RATE_LIMIT, `Rate limit exceeded: ${errorMessage}`);
      case 500:
      case 502:
      case 503:
        throw new AIError(AIErrorType.MODEL_ERROR, `Model error: ${errorMessage}`);
      default:
        throw new AIError(AIErrorType.UNKNOWN, `API error: ${errorMessage}`);
    }
  }

  /**
   * 提取摘要内容
   */
  private extractSummary(response: GeminiResponse): string {
    if (response.promptFeedback?.blockReason) {
      const message = response.promptFeedback.blockReasonMessage || response.promptFeedback.blockReason;
      throw new AIError(AIErrorType.INVALID_REQUEST, `Prompt blocked: ${message}`);
    }

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map((part) => part.text || '').join('').trim();

    if (!text) {
      throw new AIError(AIErrorType.MODEL_ERROR, 'Empty response from model');
    }

    return text;
  }

  /**
   * 判断是否应重试
   */
  private shouldRetry(error: unknown): boolean {
    if (error instanceof AIError) {
      return [
        AIErrorType.RATE_LIMIT,
        AIErrorType.NETWORK,
        AIErrorType.MODEL_ERROR,
        AIErrorType.TIMEOUT
      ].includes(error.type);
    }

    return false;
  }

  /**
   * 判断是否可能是网络错误
   */
  private isLikelyNetworkError(message: string): boolean {
    const networkErrors = [
      'fetch failed',
      'network error',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];

    return networkErrors.some((error) => message.toLowerCase().includes(error.toLowerCase()));
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
