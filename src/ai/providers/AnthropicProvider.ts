/**
 * Anthropic (Claude) 提供者实现
 */

import { IAIProvider, SummaryOptions, AIProviderConfig, AIError, AIErrorType } from '../interfaces';

/**
 * Anthropic API 响应接口
 */
interface AnthropicResponse {
  content: Array<{
    text: string;
  }>;
}

/**
 * Anthropic 提供者
 */
export class AnthropicProvider implements IAIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIError(AIErrorType.AUTHENTICATION, 'Anthropic API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-3-haiku-20240307';
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
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
        
        // 指数退避重试
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
  private async makeRequest(prompt: string, temperature: number): Promise<AnthropicResponse> {
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

    try {
      const response = await Promise.race([
        fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 500,
            temperature,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
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

      return await response.json() as AnthropicResponse;
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
      case 401:
        throw new AIError(AIErrorType.AUTHENTICATION, `Authentication failed: ${errorMessage}`);
      case 429:
        throw new AIError(AIErrorType.RATE_LIMIT, `Rate limit exceeded: ${errorMessage}`);
      case 400:
        throw new AIError(AIErrorType.INVALID_REQUEST, `Invalid request: ${errorMessage}`);
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
  private extractSummary(response: AnthropicResponse): string {
    if (!response.content || response.content.length === 0) {
      throw new AIError(AIErrorType.MODEL_ERROR, 'No response from model');
    }

    const content = response.content[0]?.text;
    if (!content) {
      throw new AIError(AIErrorType.MODEL_ERROR, 'Empty response from model');
    }

    return content.trim();
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown): boolean {
    return error instanceof AIError && error.type === AIErrorType.NETWORK;
  }

  private isLikelyNetworkError(message: string): boolean {
    return /fetch|network|econn|enotfound|timed out|socket/i.test(message);
  }
}
