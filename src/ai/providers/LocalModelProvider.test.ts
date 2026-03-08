/**
 * Local Model Provider 单元测试
 */

import { LocalModelProvider } from './LocalModelProvider';
import { AIError, AIErrorType } from '../interfaces';

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('LocalModelProvider', () => {
  let provider: LocalModelProvider;

  beforeEach(() => {
    provider = new LocalModelProvider({
      provider: 'local',
      model: 'llama2',
      baseUrl: 'http://localhost:11434'
    });
    mockFetch.mockClear();
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const provider = new LocalModelProvider({
        provider: 'local'
      });
      
      expect(provider.getModelName()).toBe('llama2 (Local)');
    });

    it('应该使用自定义配置', () => {
      const provider = new LocalModelProvider({
        provider: 'local',
        model: 'mistral',
        baseUrl: 'http://custom:11434'
      });
      
      expect(provider.getModelName()).toBe('mistral (Local)');
    });
  });

  describe('generateSummary', () => {
    beforeEach(() => {
      // Mock 模型可用性检查
      mockFetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [
                { name: 'llama2:latest' },
                { name: 'mistral:latest' }
              ]
            })
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: '这是一个测试摘要',
            done: true
          })
        } as Response);
      });
    });

    it('应该成功生成摘要', async () => {
      const result = await provider.generateSummary('测试内容');
      expect(result).toBe('这是一个测试摘要');
    });

    it('应该处理连接错误', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.NETWORK });
    });

    it('应该处理模型不存在错误', async () => {
      // Mock 模型列表不包含请求的模型
      mockFetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [
                { name: 'other-model:latest' }
              ]
            })
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        } as Response);
      });

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.MODEL_ERROR });
    });

    it('应该处理服务器错误', async () => {
      mockFetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2:latest' }]
            })
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            error: 'Internal server error'
          })
        } as Response);
      });

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.MODEL_ERROR });
    });

    it('应该处理超时错误', async () => {
      // 创建一个短超时的提供者
      const shortTimeoutProvider = new LocalModelProvider({
        provider: 'local',
        model: 'llama2',
        timeout: 100
      });

      // Mock 模型检查成功，但生成请求超时
      mockFetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2:latest' }]
            })
          } as Response);
        }
        // 生成请求永远不会 resolve，触发超时
        return new Promise(() => {});
      });

      await expect(shortTimeoutProvider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.TIMEOUT });
    }, 5000);

    it('应该处理空响应', async () => {
      mockFetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2:latest' }]
            })
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: '',
            done: true
          })
        } as Response);
      });

      await expect(provider.generateSummary('测试内容'))
        .rejects
        .toMatchObject({ type: AIErrorType.MODEL_ERROR });
    });

    it('应该支持重试机制', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2:latest' }]
            })
          } as Response);
        }
        
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: '重试成功的摘要',
            done: true
          })
        } as Response);
      });

      const result = await provider.generateSummary('测试内容');
      expect(result).toBe('重试成功的摘要');
    });
  });

  describe('getModelName', () => {
    it('应该返回正确的模型名称', () => {
      expect(provider.getModelName()).toBe('llama2 (Local)');
    });
  });
});
