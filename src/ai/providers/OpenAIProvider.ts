/**
 * OpenAI 提供者实现
 */

import { IAIProvider, SummaryOptions, AIProviderConfig, AIError, AIErrorType } from '../interfaces';

/**
 * OpenAI API 响应接口
 */
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * OpenAI 提供者
 */
export class OpenAIProvider implements IAIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new AIError(AIErrorType.AUTHENTICATION, 'OpenAI API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-3.5-turbo';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
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
  private async makeRequest(prompt: string, temperature: number): Promise<OpenAIResponse> {
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
        fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature,
            max_tokens: 500
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

      return await response.json() as OpenAIResponse;
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
  private extractSummary(response: OpenAIResponse): string {
    if (!response.choices || response.choices.length === 0) {
      throw new AIError(AIErrorType.MODEL_ERROR, 'No response from model');
    }

    const content = response.choices[0].message?.content;
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
