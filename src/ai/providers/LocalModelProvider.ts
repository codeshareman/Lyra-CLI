/**
 * 本地模型提供者实现（支持 Ollama）
 */

import { IAIProvider, SummaryOptions, AIProviderConfig, AIError, AIErrorType } from '../interfaces';

/**
 * Ollama API 响应接口
 */
interface OllamaResponse {
  response: string;
  done: boolean;
}

/**
 * 本地模型提供者
 */
export class LocalModelProvider implements IAIProvider {
  private model: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AIProviderConfig) {
    this.model = config.model || 'llama2';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.timeout = config.timeout || 60000; // 本地模型可能需要更长时间
    this.maxRetries = config.maxRetries || 2; // 本地模型重试次数较少
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

        // 本地模型重试间隔较短
        await this.delay(100);
      }
    }

    throw new AIError(AIErrorType.UNKNOWN, 'Failed to generate summary after retries');
  }

  /**
   * 获取模型名称
   */
  getModelName(): string {
    return `${this.model} (Local)`;
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
  private async makeRequest(prompt: string, temperature: number): Promise<OllamaResponse> {
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
      // 首先检查模型是否可用
      await this.checkModelAvailability();

      const response = await Promise.race([
        fetch(`${this.baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            prompt,
            stream: false,
            options: {
              temperature,
              num_predict: 500
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

      return await response.json() as OllamaResponse;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof AIError) {
        throw error; // Re-throw AIError as-is
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new AIError(AIErrorType.TIMEOUT, 'Request timeout');
        }

        if (this.isLikelyNetworkError(error.message)) {
          throw new AIError(
            AIErrorType.NETWORK,
            'Cannot connect to local model server. Please ensure Ollama is running.',
            error
          );
        }
      }

      throw new AIError(AIErrorType.UNKNOWN, 'Unknown error', error as Error);
    }
  }

  /**
   * 检查模型可用性
   */
  private async checkModelAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Cannot connect to Ollama');
      }

      const data = await response.json() as any;
      const models = data.models || [];
      const modelExists = models.some((m: any) => m.name.includes(this.model));

      if (!modelExists) {
        throw new AIError(
          AIErrorType.MODEL_ERROR,
          `Model '${this.model}' not found. Available models: ${models.map((m: any) => m.name).join(', ')}`
        );
      }
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw new AIError(
        AIErrorType.NETWORK,
        'Cannot connect to Ollama server. Please ensure Ollama is running and accessible.',
        error as Error
      );
    }
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const errorData = await response.json().catch(() => ({})) as any;
    const errorMessage = errorData.error || `HTTP ${response.status}`;

    switch (response.status) {
      case 400:
        throw new AIError(AIErrorType.INVALID_REQUEST, `Invalid request: ${errorMessage}`);
      case 404:
        throw new AIError(AIErrorType.MODEL_ERROR, `Model not found: ${errorMessage}`);
      case 500:
        throw new AIError(AIErrorType.MODEL_ERROR, `Model error: ${errorMessage}`);
      default:
        throw new AIError(AIErrorType.UNKNOWN, `API error: ${errorMessage}`);
    }
  }

  /**
   * 提取摘要内容
   */
  private extractSummary(response: OllamaResponse): string {
    if (!response.response) {
      throw new AIError(AIErrorType.MODEL_ERROR, 'Empty response from model');
    }

    return response.response.trim();
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
