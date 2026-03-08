/**
 * AISummarizer 属性测试
 */

import * as fc from 'fast-check';
import { AISummarizer } from './AISummarizer';
import { IAIProvider, SummaryOptions } from '../interfaces';
import { ISummaryCache, CachedSummary } from '../cache/interfaces';
import { IRateLimiter } from '../ratelimit/interfaces';

// Mock implementations
class MockAIProvider implements IAIProvider {
  constructor(private shouldFail = false, private delay = 0) {}

  async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
    
    if (this.shouldFail) {
      throw new Error('AI generation failed');
    }

    const maxLength = options?.maxLength || 200;
    const summary = `AI摘要: ${content.substring(0, Math.min(50, maxLength))}...`;
    return summary;
  }

  getModelName(): string {
    return 'mock-model';
  }
}

class MockSummaryCache implements ISummaryCache {
  private cache = new Map<string, CachedSummary>();
  private stats = { hits: 0, misses: 0 };

  async get(key: string): Promise<CachedSummary | null> {
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    return null;
  }

  async set(key: string, summary: CachedSummary): Promise<void> {
    this.cache.set(key, summary);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  async getStats() {
    return {
      totalItems: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      sizeBytes: 0
    };
  }
}

class MockRateLimiter implements IRateLimiter {
  private requestCount = 0;
  private shouldLimit = false;

  async waitForSlot(): Promise<void> {
    if (this.shouldLimit && this.requestCount >= 3) {
      throw new Error('Rate limit exceeded');
    }
  }

  recordRequest(): void {
    this.requestCount++;
  }

  getStatus() {
    return {
      currentRequests: this.requestCount,
      maxRequests: 3,
      windowSize: 60000,
      nextAvailableTime: new Date(),
      isLimited: this.shouldLimit && this.requestCount >= 3
    };
  }

  reset(): void {
    this.requestCount = 0;
  }

  enableLimiting(): void {
    this.shouldLimit = true;
  }
}

describe('AISummarizer Property Tests', () => {
  let mockProvider: MockAIProvider;
  let mockCache: MockSummaryCache;
  let mockRateLimiter: MockRateLimiter;
  let summarizer: AISummarizer;

  beforeEach(() => {
    mockProvider = new MockAIProvider();
    mockCache = new MockSummaryCache();
    mockRateLimiter = new MockRateLimiter();
    summarizer = new AISummarizer(mockProvider, mockCache, mockRateLimiter);
  });

  describe('Property 47: AI 摘要生成成功性', () => {
    it('应该为任何非空内容生成摘要', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (content) => {
            const summary = await summarizer.summarize(content);
            
            // 摘要应该是非空字符串
            expect(typeof summary).toBe('string');
            expect(summary.length).toBeGreaterThan(0);
            
            // 摘要应该包含一些有意义的内容
            expect(summary.trim()).not.toBe('');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('应该在 AI 失败时提供回退摘要', async () => {
      const failingProvider = new MockAIProvider(true); // 设置为失败
      const failingSummarizer = new AISummarizer(failingProvider, mockCache, mockRateLimiter);

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (content) => {
            const summary = await failingSummarizer.summarize(content);
            
            // 即使 AI 失败，也应该返回回退摘要
            expect(typeof summary).toBe('string');
            expect(summary.length).toBeGreaterThan(0);
            
            // 回退摘要应该基于原始内容
            expect(summary.length).toBeLessThanOrEqual(content.length + 10); // 允许一些额外字符如 "..."
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Property 48: AI 摘要长度限制', () => {
    it('应该遵守最大长度限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 100, maxLength: 1000 }),
          fc.integer({ min: 50, max: 300 }),
          async (content, maxLength) => {
            const options: SummaryOptions = { maxLength };
            const summary = await summarizer.summarize(content, options);
            
            // 摘要长度应该不超过指定的最大长度（允许一些容差）
            expect(summary.length).toBeLessThanOrEqual(maxLength + 20); // 允许20字符的容差
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property 49: AI 摘要缓存命中正确性', () => {
    it('应该正确使用缓存', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 100 }),
          async (content) => {
            // 第一次调用
            const summary1 = await summarizer.summarize(content);
            
            // 第二次调用相同内容
            const summary2 = await summarizer.summarize(content);
            
            // 应该返回相同的摘要（来自缓存）
            expect(summary2).toBe(summary1);
            
            // 验证缓存统计
            const stats = await mockCache.getStats();
            expect(stats.hits).toBeGreaterThan(0);
          }
        ),
        { numRuns: 5 }
      );
    });

    it('应该为不同内容生成不同摘要', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (content1, content2) => {
            fc.pre(content1 !== content2); // 确保内容不同
            
            const summary1 = await summarizer.summarize(content1);
            const summary2 = await summarizer.summarize(content2);
            
            // 不同内容应该产生不同摘要
            expect(summary1).not.toBe(summary2);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Property 50: AI 摘要批量处理完整性', () => {
    it('应该为批量内容生成对应数量的摘要', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
          async (contents) => {
            const summaries = await summarizer.summarizeBatch(contents);
            
            // 摘要数量应该等于输入内容数量
            expect(summaries.length).toBe(contents.length);
            
            // 每个摘要都应该是非空字符串
            summaries.forEach(summary => {
              expect(typeof summary).toBe('string');
              expect(summary.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 5 }
      );
    });

    it('应该保持批量处理的顺序', async () => {
      const contents = ['内容A', '内容B', '内容C'];
      const summaries = await summarizer.summarizeBatch(contents);
      
      expect(summaries.length).toBe(3);
      
      // 验证顺序（通过检查摘要内容）
      expect(summaries[0]).toContain('内容A');
      expect(summaries[1]).toContain('内容B');
      expect(summaries[2]).toContain('内容C');
    });
  });

  describe('Property 51: AI 摘要回退机制正确性', () => {
    it('应该在各种错误情况下提供回退', async () => {
      const failingProvider = new MockAIProvider(true);
      const failingSummarizer = new AISummarizer(failingProvider, mockCache, mockRateLimiter);

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (content) => {
            const summary = await failingSummarizer.summarize(content);
            
            // 应该始终返回有效摘要
            expect(typeof summary).toBe('string');
            expect(summary.length).toBeGreaterThan(0);
            
            // 回退摘要应该基于原始内容或合理的默认值
            expect(summary).toBeTruthy();
          }
        ),
        { numRuns: 5 }
      );
    });

    it('应该在速率限制时提供回退', async () => {
      mockRateLimiter.enableLimiting();
      
      // 先消耗速率限制配额
      for (let i = 0; i < 3; i++) {
        await summarizer.summarize(`内容${i}`);
      }
      
      // 下一个请求应该触发速率限制，但仍应返回摘要
      const summary = await summarizer.summarize('被限制的内容');
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  describe('缓存清理功能', () => {
    it('应该能够清空缓存', async () => {
      // 生成一些摘要以填充缓存
      await summarizer.summarize('测试内容1');
      await summarizer.summarize('测试内容2');
      
      let stats = await mockCache.getStats();
      expect(stats.totalItems).toBeGreaterThan(0);
      
      // 清空缓存
      await summarizer.clearCache();
      
      stats = await mockCache.getStats();
      expect(stats.totalItems).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该处理空内容', async () => {
      const summary = await summarizer.summarize('');
      expect(typeof summary).toBe('string');
      // 空内容应该返回某种默认摘要
    });

    it('应该处理极长内容', async () => {
      const longContent = 'A'.repeat(10000);
      const summary = await summarizer.summarize(longContent, { maxLength: 100 });
      
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeLessThanOrEqual(120); // 允许一些容差
    });
  });
});