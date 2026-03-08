/**
 * Anthropic Provider 单元测试
 */

import { AnthropicProvider } from './AnthropicProvider';
import { AIError, AIErrorType } from '../interfaces';

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider({
      provider: 'anthropic',
      apiKey: 'test-api-key',
      model: 'claude-3-haiku-20240307'
    });
    mockFetch.mockClear();
  });

  describe('构造函数', () => {
    it('应该要求 API 密钥', () => {
      expect(() => {
        new AnthropicProvider({
          provider: 'anthropic'
        });
      }).toThrow(AIError);
    });

    it('应该使用默认配置', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-key'
      });
      
      expect(provider.getModelName()).toBe('claude-3-haiku-20240307');
    });

    it('应该使用自定义配置', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-sonnet-20240229'
      });
      
      expect(provider.getModelName()).toBe('claude-3-sonnet-20240229');
    });
  });

  describe('generateSummary', () => {
    it('应该成功生成摘要', async () => {
      const mockResponse = {
        content: [
          {
            text: '这是一个测试摘要'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await provider.generateSummary('测试内容');
      expect(result).toBe('这是一个测试摘要');
    });

    it('应该处理认证错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid API key' }
        })
      } as Response);

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.AUTHENTICATION });
    });

    it('应该处理速率限制错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: { message: 'Rate limit exceeded' }
        })
      } as Response);

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.RATE_LIMIT });
    });

    it('应该处理网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.NETWORK });
    });

    it('应该处理超时错误', async () => {
      // 创建一个短超时的提供者
      const shortTimeoutProvider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-key',
        timeout: 100
      });

      // Mock 一个永远不会 resolve 的 Promise
      mockFetch.mockImplementationOnce(() => 
        new Promise(() => {}) // 永远不会 resolve
      );

      await expect(shortTimeoutProvider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.TIMEOUT });
    }, 10000); // 增加测试超时到 10 秒

    it('应该处理空响应', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: []
        })
      } as Response);

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.MODEL_ERROR });
    });

    it('应该支持重试机制', async () => {
      // 第一次失败，第二次成功
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            content: [
              {
                text: '重试成功的摘要'
              }
            ]
          })
        } as Response);

      const result = await provider.generateSummary('测试内容');
      expect(result).toBe('重试成功的摘要');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 10000); // 增加测试超时到 10 秒

    it('应该在最大重试次数后失败', async () => {
      // 所有请求都失败
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toThrow(AIError);

      // 应该重试 3 次（默认值）
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15000); // 增加测试超时到 15 秒，因为需要多次重试
  });

  describe('getModelName', () => {
    it('应该返回正确的模型名称', () => {
      expect(provider.getModelName()).toBe('claude-3-haiku-20240307');
    });
  });
});
