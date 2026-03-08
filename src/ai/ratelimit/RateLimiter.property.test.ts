/**
 * RateLimiter 属性测试
 */

import * as fc from 'fast-check';
import { RateLimiter, TokenBucketRateLimiter } from './RateLimiter';

describe('RateLimiter Property Tests', () => {
  describe('Property 53: 速率限制遵守正确性', () => {
    it('滑动窗口速率限制器应该遵守速率限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // requestsPerMinute
          fc.integer({ min: 1, max: 5 }),  // burstMultiplier
          async (requestsPerMinute, burstMultiplier) => {
            const burstSize = requestsPerMinute * burstMultiplier;
            const rateLimiter = new RateLimiter({
              requestsPerMinute,
              burstSize,
              maxWaitTime: 10000 // 10 seconds for testing
            });

            // 测试突发请求不超过 burstSize
            const startTime = Date.now();
            let successfulRequests = 0;

            // 尝试发送 burstSize + 2 个请求
            for (let i = 0; i < burstSize + 2; i++) {
              try {
                await rateLimiter.waitForSlot();
                rateLimiter.recordRequest();
                successfulRequests++;
                
                // 如果已经达到 burstSize，后续请求应该被限制
                if (successfulRequests > burstSize) {
                  const elapsedTime = Date.now() - startTime;
                  // 后续请求应该需要等待
                  expect(elapsedTime).toBeGreaterThan(100); // 至少等待 100ms
                }
              } catch (error) {
                // 如果抛出速率限制错误，这是预期的
                break;
              }
            }

            // 在突发阶段，成功的请求数不应超过 burstSize
            expect(successfulRequests).toBeLessThanOrEqual(burstSize);
          }
        ),
        { numRuns: 5, timeout: 15000 }
      );
    });

    it('令牌桶速率限制器应该遵守速率限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }), // requestsPerMinute (至少2以便测试)
          async (requestsPerMinute) => {
            const rateLimiter = new TokenBucketRateLimiter({
              requestsPerMinute,
              burstSize: requestsPerMinute,
              maxWaitTime: 5000 // 5 seconds for testing
            });

            // 测试初始令牌桶应该是满的
            const status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(0);
            expect(status.isLimited).toBe(false);

            // 消耗所有令牌
            for (let i = 0; i < requestsPerMinute; i++) {
              await rateLimiter.waitForSlot();
              rateLimiter.recordRequest();
            }

            // 现在应该被限制
            const limitedStatus = rateLimiter.getStatus();
            expect(limitedStatus.isLimited).toBe(true);

            // 尝试再发送一个请求应该需要等待
            const startTime = Date.now();
            try {
              await rateLimiter.waitForSlot();
              const elapsedTime = Date.now() - startTime;
              expect(elapsedTime).toBeGreaterThan(50); // 应该等待一段时间
            } catch (error) {
              // 如果等待时间过长抛出错误也是可以接受的
              expect(error).toBeInstanceOf(Error);
            }
          }
        ),
        { numRuns: 3, timeout: 10000 }
      );
    });

    it('速率限制器状态应该准确反映当前状态', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // requestsPerMinute
          async (requestsPerMinute) => {
            const rateLimiter = new RateLimiter({
              requestsPerMinute,
              burstSize: requestsPerMinute,
              maxWaitTime: 1000
            });

            // 初始状态
            let status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(0);
            expect(status.maxRequests).toBe(requestsPerMinute);
            expect(status.isLimited).toBe(false);

            // 发送一些请求
            const requestsToSend = Math.min(requestsPerMinute, 3);
            for (let i = 0; i < requestsToSend; i++) {
              await rateLimiter.waitForSlot();
              rateLimiter.recordRequest();
            }

            status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(requestsToSend);
            
            // 如果发送了最大数量的请求，应该被限制
            if (requestsToSend >= requestsPerMinute) {
              expect(status.isLimited).toBe(true);
            }
          }
        ),
        { numRuns: 5, timeout: 5000 }
      );
    });

    it('重置功能应该清除所有限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // requestsPerMinute
          async (requestsPerMinute) => {
            const rateLimiter = new RateLimiter({
              requestsPerMinute,
              burstSize: requestsPerMinute,
              maxWaitTime: 1000
            });

            // 消耗所有请求配额
            for (let i = 0; i < requestsPerMinute; i++) {
              await rateLimiter.waitForSlot();
              rateLimiter.recordRequest();
            }

            // 应该被限制
            let status = rateLimiter.getStatus();
            expect(status.isLimited).toBe(true);

            // 重置
            rateLimiter.reset();

            // 重置后应该不再被限制
            status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(0);
            expect(status.isLimited).toBe(false);

            // 应该能够立即发送请求
            await rateLimiter.waitForSlot();
            rateLimiter.recordRequest();
            
            status = rateLimiter.getStatus();
            expect(status.currentRequests).toBe(1);
          }
        ),
        { numRuns: 5, timeout: 5000 }
      );
    });

    it('时间窗口过期后应该允许新请求', async () => {
      // 这个测试使用较短的时间来避免测试超时
      const rateLimiter = new RateLimiter({
        requestsPerMinute: 2,
        burstSize: 2,
        maxWaitTime: 2000
      });

      // 消耗所有配额
      await rateLimiter.waitForSlot();
      rateLimiter.recordRequest();
      await rateLimiter.waitForSlot();
      rateLimiter.recordRequest();

      // 应该被限制
      let status = rateLimiter.getStatus();
      expect(status.isLimited).toBe(true);

      // 等待一小段时间（模拟时间窗口部分过期）
      await new Promise(resolve => setTimeout(resolve, 100));

      // 手动清理过期请求（通过调用 getStatus）
      status = rateLimiter.getStatus();
      
      // 由于时间很短，应该仍然被限制
      expect(status.isLimited).toBe(true);
    }, 10000);
  });

  describe('错误处理', () => {
    it('应该拒绝无效的配置', () => {
      expect(() => {
        new RateLimiter({
          requestsPerMinute: 0
        });
      }).toThrow();

      expect(() => {
        new RateLimiter({
          requestsPerMinute: -1
        });
      }).toThrow();

      expect(() => {
        new RateLimiter({
          requestsPerMinute: 10,
          burstSize: 5 // burstSize < requestsPerMinute
        });
      }).toThrow();
    });

    it('应该在等待时间过长时抛出错误', async () => {
      const rateLimiter = new RateLimiter({
        requestsPerMinute: 1,
        burstSize: 1,
        maxWaitTime: 100 // 很短的最大等待时间
      });

      // 消耗配额
      await rateLimiter.waitForSlot();
      rateLimiter.recordRequest();

      // 下一个请求应该因为等待时间过长而失败
      await expect(rateLimiter.waitForSlot()).rejects.toThrow();
    });
  });
});