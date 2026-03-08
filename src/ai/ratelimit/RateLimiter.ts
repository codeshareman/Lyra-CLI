/**
 * 速率限制器实现
 */

import { IRateLimiter, RateLimitStatus, RateLimitConfig } from './interfaces';
import { RateLimitError, ErrorCode } from '../../types/errors';

/**
 * 请求记录
 */
interface RequestRecord {
  timestamp: Date;
}

/**
 * 滑动窗口速率限制器
 */
export class RateLimiter implements IRateLimiter {
  private requests: RequestRecord[] = [];
  private readonly requestsPerMinute: number;
  private readonly burstSize: number;
  private readonly maxWaitTime: number;
  private readonly windowSize: number = 60 * 1000; // 1 分钟

  constructor(config: RateLimitConfig) {
    this.requestsPerMinute = config.requestsPerMinute;
    this.burstSize = config.burstSize || config.requestsPerMinute;
    this.maxWaitTime = config.maxWaitTime || 5 * 60 * 1000; // 默认最大等待 5 分钟

    if (this.requestsPerMinute <= 0) {
      throw new Error('requestsPerMinute must be greater than 0');
    }

    if (this.burstSize < this.requestsPerMinute) {
      throw new Error('burstSize cannot be less than requestsPerMinute');
    }
  }

  /**
   * 等待可用的请求槽位
   */
  async waitForSlot(): Promise<void> {
    const status = this.getStatus();
    
    if (!status.isLimited) {
      return;
    }

    const waitTime = status.nextAvailableTime.getTime() - Date.now();
    
    if (waitTime > this.maxWaitTime) {
      throw new RateLimitError(
        ErrorCode.E019,
        `等待时间 ${Math.round(waitTime / 1000)} 秒超过最大等待时间 ${Math.round(this.maxWaitTime / 1000)} 秒`
      );
    }

    if (waitTime > 0) {
      await this.delay(waitTime);
    }
  }

  /**
   * 记录一次请求
   */
  recordRequest(timestamp: Date = new Date()): void {
    this.requests.push({ timestamp });
    this.cleanupOldRequests();
  }

  /**
   * 获取当前速率限制状态
   */
  getStatus(): RateLimitStatus {
    this.cleanupOldRequests();

    const now = new Date();
    const currentRequests = this.requests.length;
    const isLimited = currentRequests >= this.burstSize;

    let nextAvailableTime = now;
    
    if (isLimited && this.requests.length > 0) {
      // 计算最早的请求何时会过期
      const oldestRequest = this.requests[0];
      nextAvailableTime = new Date(oldestRequest.timestamp.getTime() + this.windowSize);
      
      // 如果需要等待多个请求过期，计算更精确的时间
      const excessRequests = currentRequests - this.burstSize + 1;
      if (excessRequests > 1 && this.requests.length >= excessRequests) {
        const targetRequest = this.requests[excessRequests - 1];
        nextAvailableTime = new Date(targetRequest.timestamp.getTime() + this.windowSize);
      }
    }

    return {
      currentRequests,
      maxRequests: this.burstSize,
      windowSize: this.windowSize,
      nextAvailableTime,
      isLimited
    };
  }

  /**
   * 重置速率限制器
   */
  reset(): void {
    this.requests = [];
  }

  /**
   * 清理过期的请求记录
   */
  private cleanupOldRequests(): void {
    const cutoff = new Date(Date.now() - this.windowSize);
    this.requests = this.requests.filter(req => req.timestamp > cutoff);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 令牌桶速率限制器
 */
export class TokenBucketRateLimiter implements IRateLimiter {
  private tokens: number;
  private lastRefill: Date;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second
  private readonly maxWaitTime: number;

  constructor(config: RateLimitConfig) {
    this.capacity = config.burstSize || config.requestsPerMinute;
    this.refillRate = config.requestsPerMinute / 60; // convert to per second
    this.maxWaitTime = config.maxWaitTime || 5 * 60 * 1000;
    this.tokens = this.capacity;
    this.lastRefill = new Date();

    if (config.requestsPerMinute <= 0) {
      throw new Error('requestsPerMinute must be greater than 0');
    }
  }

  /**
   * 等待可用的请求槽位
   */
  async waitForSlot(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      return;
    }

    // 计算需要等待多长时间才能获得一个令牌
    const waitTime = (1 - this.tokens) / this.refillRate * 1000;

    if (waitTime > this.maxWaitTime) {
      throw new RateLimitError(
        ErrorCode.E019,
        `等待时间 ${Math.round(waitTime / 1000)} 秒超过最大等待时间 ${Math.round(this.maxWaitTime / 1000)} 秒`
      );
    }

    if (waitTime > 0) {
      await this.delay(waitTime);
      this.refillTokens();
    }
  }

  /**
   * 记录一次请求
   */
  recordRequest(timestamp: Date = new Date()): void {
    this.refillTokens();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
    } else {
      throw new RateLimitError(ErrorCode.E019, '没有可用的令牌');
    }
  }

  /**
   * 获取当前速率限制状态
   */
  getStatus(): RateLimitStatus {
    this.refillTokens();

    const now = new Date();
    const currentRequests = this.capacity - Math.floor(this.tokens);
    const isLimited = this.tokens < 1;

    let nextAvailableTime = now;
    if (isLimited) {
      const waitTime = (1 - this.tokens) / this.refillRate * 1000;
      nextAvailableTime = new Date(now.getTime() + waitTime);
    }

    return {
      currentRequests,
      maxRequests: this.capacity,
      windowSize: 60 * 1000, // 1 minute window for display
      nextAvailableTime,
      isLimited
    };
  }

  /**
   * 重置速率限制器
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = new Date();
  }

  /**
   * 补充令牌
   */
  private refillTokens(): void {
    const now = new Date();
    const timePassed = (now.getTime() - this.lastRefill.getTime()) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}