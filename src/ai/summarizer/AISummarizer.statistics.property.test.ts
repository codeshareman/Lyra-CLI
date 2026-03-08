import * as fc from 'fast-check';
import { AISummarizer } from './AISummarizer';
import { IAIProvider, SummaryOptions } from '../interfaces';
import { ISummaryCache, CachedSummary, CacheStats } from '../cache/interfaces';
import { IRateLimiter } from '../ratelimit/interfaces';
import { SummaryContentItem, SummaryResult, BatchSummaryOptions } from './interfaces';

/**
 * **Property 54: AI 摘要统计信息正确性**
 * **Validates: Requirements 25.17**
 * 
 * 验证 AI 摘要器的统计信息准确性，包括缓存命中率、
 * 回退使用率、批量处理统计等。
 */
describe('Property 54: AI 摘要统计信息正确性', () => {
  let mockProvider: IAIProvider;
  let mockCache: ISummaryCache;
  let mockRateLimiter: IRateLimiter;
  let summarizer: AISummarizer;

  // 统计信息跟踪
  let stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    fallbackUsed: 0,
    successfulGenerations: 0,
    failedGenerations: 0,
    totalCacheItems: 0
  };

  beforeEach(() => {
    // 重置统计信息
    stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      fallbackUsed: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      totalCacheItems: 0
    };

    // Mock AI Provider
    mockProvider = {
      async generateSummary(content: string, options?: SummaryOptions): Promise<string> {
        stats.successfulGenerations++;
        const maxLength = options?.maxLength || 200;
        return `AI摘要: ${content.substring(0, Math.min(50, maxLength))}...`;
      },
      getModelName(): string {
        return 'mock-model';
      }
    };

    // Mock Cache with statistics tracking
    const cacheData = new Map<string, CachedSummary>();
    mockCache = {
      async get(key: string): Promise<CachedSummary | null> {
        stats.totalRequests++;
        const cached = cacheData.get(key);
        if (cached) {
          stats.cacheHits++;
          return cached;
        } else {
          stats.cacheMisses++;
          return null;
        }
      },

      async set(key: string, summary: CachedSummary): Promise<void> {
        cacheData.set(key, summary);
        stats.totalCacheItems = cacheData.size;
      },

      async delete(key: string): Promise<void> {
        cacheData.delete(key);
        stats.totalCacheItems = cacheData.size;
      },

      async clear(): Promise<void> {
        cacheData.clear();
        stats.totalCacheItems = 0;
      },

      async getStats(): Promise<CacheStats> {
        const totalRequests = stats.cacheHits + stats.cacheMisses;
        return {
          totalItems: stats.totalCacheItems,
          hits: stats.cacheHits,
          misses: stats.cacheMisses,
          hitRate: totalRequests > 0 ? stats.cacheHits / totalRequests : 0,
          sizeBytes: stats.totalCacheItems * 100 // 模拟大小
        };
      }
    };

    // Mock Rate Limiter
    mockRateLimiter = {
      async waitForSlot(): Promise<void> {
        // 模拟等待
        await new Promise(resolve => setTimeout(resolve, 1));
      },
      recordRequest(): void {
        // 记录请求
      },
      getStatus() {
        return {
          currentRequests: 0,
          maxRequests: 60,
          windowSize: 60000,
          nextAvailableTime: new Date(),
          isLimited: false
        };
      },
      reset(): void {
        // 重置
      }
    };

    summarizer = new AISummarizer(mockProvider, mockCache, mockRateLimiter);
  });

  /**
   * 生成摘要内容项的生成器
   */
  const summaryContentItemGenerator = fc.record({
    id: fc.string({ minLength: 1 }),
    content: fc.option(fc.string({ minLength: 10, maxLength: 1000 }), { nil: undefined }),
    filePath: fc.constant(undefined),
    description: fc.option(fc.string({ minLength: 5, maxLength: 200 }), { nil: undefined }),
    title: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
  });

  /**
   * 批量摘要选项生成器
   */
  const batchOptionsGenerator = fc.record({
    maxLength: fc.option(fc.integer({ min: 50, max: 500 }), { nil: undefined }),
    language: fc.option(fc.constantFrom('zh', 'en'), { nil: undefined }),
    concurrency: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
    forceRegenerate: fc.option(fc.boolean(), { nil: undefined }),
    batchDelay: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined })
  });

  const resetCacheTracking = async (): Promise<void> => {
    await mockCache.clear();
    stats.totalRequests = 0;
    stats.cacheHits = 0;
    stats.cacheMisses = 0;
    stats.totalCacheItems = 0;
  };

  it('应该正确跟踪缓存命中率统计', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 5, maxLength: 20 }),
        fc.record({
          maxLength: fc.option(fc.integer({ min: 50, max: 200 }), { nil: undefined }),
          language: fc.option(fc.constantFrom('zh', 'en'), { nil: undefined })
        }),
        async (rawContents, options) => {
          const contents = Array.from(new Set(rawContents));
          fc.pre(contents.length > 0);
          // 重置统计
          await resetCacheTracking();

          // 第一次生成摘要（应该全部缓存未命中）
          const firstResults = await Promise.all(
            contents.map(content => summarizer.summarize(content, options))
          );

          // 验证第一次的统计
          let cacheStats = await mockCache.getStats();
          expect(cacheStats.misses).toBe(contents.length);
          expect(cacheStats.hits).toBe(0);
          expect(cacheStats.hitRate).toBe(0);
          expect(cacheStats.totalItems).toBe(contents.length);

          // 第二次生成相同内容（应该全部缓存命中）
          const secondResults = await Promise.all(
            contents.map(content => summarizer.summarize(content, options))
          );

          // 验证第二次的统计
          cacheStats = await mockCache.getStats();
          expect(cacheStats.hits).toBe(contents.length);
          expect(cacheStats.hitRate).toBeCloseTo(0.5, 1); // 50% 命中率
          expect(cacheStats.totalItems).toBe(contents.length);

          // 验证结果一致性
          expect(firstResults).toEqual(secondResults);
        }
      ),
      { numRuns: 8 }
    );
  });

  it('应该正确统计批量处理的成功和失败', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(summaryContentItemGenerator, { minLength: 3, maxLength: 10 }),
        batchOptionsGenerator,
        async (items, options) => {
          // 重置统计
          stats.successfulGenerations = 0;
          stats.fallbackUsed = 0;

          // 模拟可预测失败（避免随机行为导致用例不稳定）
          const originalGenerate = mockProvider.generateSummary;
          mockProvider.generateSummary = async (content: string, opts?: SummaryOptions) => {
            if (content.length % 3 === 0) {
              stats.failedGenerations++;
              throw new Error('AI generation failed');
            }
            return originalGenerate.call(mockProvider, content, opts);
          };

          // 执行批量摘要
          const results = await summarizer.summarizeContentItems(items, options);

          // 验证结果数量
          expect(results).toHaveLength(items.length);

          // 统计各种结果类型
          let successCount = 0;
          let fallbackCount = 0;
          let cacheHitCount = 0;

          for (const result of results) {
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('summary');
            expect(result).toHaveProperty('fromCache');
            expect(result).toHaveProperty('usedFallback');

            if (result.usedFallback) {
              fallbackCount++;
            } else if (!result.fromCache) {
              successCount++;
            } else {
              cacheHitCount++;
            }
          }

          // 验证统计一致性
          expect(successCount + fallbackCount + cacheHitCount).toBe(items.length);

          // 验证每个结果都有有效的摘要
          results.forEach(result => {
            expect(result.summary).toBeTruthy();
            expect(typeof result.summary).toBe('string');
            expect(result.summary.length).toBeGreaterThan(0);
          });

          // 恢复原始函数
          mockProvider.generateSummary = originalGenerate;
        }
      ),
      { numRuns: 8 }
    );
  });

  it('应该正确计算缓存大小和项目数统计', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 20, maxLength: 200 }), { minLength: 1, maxLength: 15 }),
        async (contents) => {
          const uniqueContents = Array.from(new Set(contents));
          fc.pre(uniqueContents.length > 0);
          // 清空缓存
          await mockCache.clear();

          // 生成摘要
          for (const content of uniqueContents) {
            await summarizer.summarize(content);
          }

          // 获取缓存统计
          const cacheStats = await mockCache.getStats();

          // 验证缓存项数量
          expect(cacheStats.totalItems).toBe(uniqueContents.length);

          // 验证缓存大小合理性
          expect(cacheStats.sizeBytes).toBeGreaterThan(0);
          expect(cacheStats.sizeBytes).toBe(uniqueContents.length * 100); // 模拟大小

          // 验证命中率计算
          expect(cacheStats.hitRate).toBeGreaterThanOrEqual(0);
          expect(cacheStats.hitRate).toBeLessThanOrEqual(1);

          // 验证命中和未命中次数
          expect(cacheStats.hits + cacheStats.misses).toBeGreaterThan(0);
        }
      ),
      { numRuns: 8 }
    );
  });

  it('应该正确统计回退机制的使用', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(summaryContentItemGenerator, { minLength: 2, maxLength: 8 }),
        async (items) => {
          await resetCacheTracking();

          const itemsWithUniqueId = items.map((item, index) => ({
            ...item,
            id: `${item.id}-${index}`
          }));

          // 模拟总是失败的 AI Provider
          mockProvider.generateSummary = async () => {
            throw new Error('AI service unavailable');
          };

          // 执行批量摘要
          const results = await summarizer.summarizeContentItems(itemsWithUniqueId);

          // 验证所有结果都使用了回退
          results.forEach(result => {
            expect(result.usedFallback).toBe(true);
            expect(result.fromCache).toBe(false);
            expect(result.error).toBeTruthy();

            // 验证回退摘要的来源
            const item = itemsWithUniqueId.find(i => i.id === result.id);
            if (item) {
              const preferredFallback = [item.description, item.title].find(
                value => typeof value === 'string' && value.trim().length > 0
              );
              const normalizedContent = (item.content || '').trim();

              if (preferredFallback) {
                expect(result.summary).toBe(preferredFallback);
              } else if (!normalizedContent) {
                expect(result.summary).toBe('无可用内容');
              } else {
                expect(result.summary).toBeTruthy();
              }
            }
          });

          // 验证没有缓存项被创建（因为生成失败）
          const cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(0);
        }
      ),
      { numRuns: 6 }
    );
  });

  it('应该正确处理并发统计', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 5, maxLength: 15 }),
        fc.integer({ min: 1, max: 5 }),
        async (rawContents, concurrency) => {
          const contents = Array.from(new Set(rawContents));
          fc.pre(contents.length > 0);
          // 重置统计
          await resetCacheTracking();
          stats.successfulGenerations = 0;

          // 执行并发摘要生成
          const options: SummaryOptions = { maxLength: 200 };
          const results = await summarizer.summarizeBatch(contents, options);

          // 验证结果数量
          expect(results).toHaveLength(contents.length);

          // 验证所有摘要都已生成
          results.forEach(summary => {
            expect(summary).toBeTruthy();
            expect(typeof summary).toBe('string');
          });

          // 验证缓存统计
          const cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(contents.length);

          // 验证生成统计
          expect(stats.successfulGenerations).toBe(contents.length);
        }
      ),
      { numRuns: 6 }
    );
  });

  it('应该正确统计强制重新生成的影响', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 15, maxLength: 80 }), { minLength: 3, maxLength: 8 }),
        async (rawContents) => {
          const contents = Array.from(new Set(rawContents));
          fc.pre(contents.length > 0);
          // 重置统计
          await resetCacheTracking();
          stats.successfulGenerations = 0;

          // 第一次生成（正常缓存）
          await Promise.all(contents.map(content => summarizer.summarize(content)));
          const firstGenerations = stats.successfulGenerations;

          // 第二次生成（使用缓存）
          await Promise.all(contents.map(content => summarizer.summarize(content)));
          const secondGenerations = stats.successfulGenerations;

          // 验证第二次没有新的生成
          expect(secondGenerations).toBe(firstGenerations);

          // 第三次生成（强制重新生成）
          const items: SummaryContentItem[] = contents.map((content, index) => ({
            id: `item-${index}`,
            content
          }));

          await summarizer.summarizeContentItems(items, { forceRegenerate: true });
          const thirdGenerations = stats.successfulGenerations;

          // 验证强制重新生成产生了新的生成
          expect(thirdGenerations).toBe(firstGenerations + contents.length);

          // 验证缓存统计
          const cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBeGreaterThan(0);
        }
      ),
      { numRuns: 6 }
    );
  });

  it('应该正确统计不同摘要长度的影响', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 200, maxLength: 1000 }),
        fc.uniqueArray(fc.integer({ min: 50, max: 300 }), { minLength: 2, maxLength: 5 }),
        async (content, maxLengths) => {
          // 重置统计
          await resetCacheTracking();

          // 为不同长度生成摘要
          const results: string[] = [];
          for (const maxLength of maxLengths) {
            const summary = await summarizer.summarize(content, { maxLength });
            results.push(summary);
          }

          // 验证每个长度都产生了不同的缓存项
          const cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(maxLengths.length);

          // 验证摘要长度的合理性
          results.forEach((summary, index) => {
            expect(summary).toBeTruthy();
            // 摘要应该相对较短（不超过原始内容）
            expect(summary.length).toBeLessThanOrEqual(content.length);
          });
        }
      ),
      { numRuns: 6 }
    );
  });

  it('应该正确统计清除缓存的影响', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 3, maxLength: 10 }),
        async (rawContents) => {
          const contents = Array.from(new Set(rawContents));
          fc.pre(contents.length > 0);
          await resetCacheTracking();

          // 生成一些摘要
          await Promise.all(contents.map(content => summarizer.summarize(content)));

          // 验证缓存有内容
          let cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(contents.length);
          expect(cacheStats.totalItems).toBeGreaterThan(0);

          // 清除缓存
          await summarizer.clearCache();

          // 验证缓存已清空
          cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(0);

          // 重新生成相同内容（应该重新创建缓存）
          await Promise.all(contents.map(content => summarizer.summarize(content)));

          // 验证缓存重新填充
          cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(contents.length);
        }
      ),
      { numRuns: 6 }
    );
  });

  it('应该正确统计批量延迟对性能的影响', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 3, maxLength: 6 }),
        fc.integer({ min: 0, max: 50 }),
        async (rawContents, batchDelay) => {
          const contents = Array.from(new Set(rawContents));
          fc.pre(contents.length > 0);
          await resetCacheTracking();

          const startTime = Date.now();

          // 执行批量处理
          const options: SummaryOptions = { 
            maxLength: 200,
            language: 'zh'
          };
          const results = await summarizer.summarizeBatch(contents, { ...(options as any), batchDelay } as any);

          const endTime = Date.now();
          const duration = endTime - startTime;

          // 验证结果
          expect(results).toHaveLength(contents.length);
          results.forEach(result => {
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
          });

          // 验证延迟的影响（如果有延迟，处理时间应该更长）
          if (batchDelay > 0 && contents.length > 2) {
            // 至少应该有一些延迟时间
            expect(duration).toBeGreaterThan(batchDelay * 0.5);
          }

          // 验证缓存统计
          const cacheStats = await mockCache.getStats();
          expect(cacheStats.totalItems).toBe(contents.length);
        }
      ),
      { numRuns: 6 }
    );
  });
});
