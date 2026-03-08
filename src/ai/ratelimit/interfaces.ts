/**
 * 速率限制接口定义
 */

/**
 * 速率限制器接口
 */
export interface IRateLimiter {
  /**
   * 等待可用的请求槽位
   * @returns Promise，在可以发送请求时 resolve
   */
  waitForSlot(): Promise<void>;

  /**
   * 记录一次请求
   * @param timestamp - 请求时间戳，可选，默认为当前时间
   */
  recordRequest(timestamp?: Date): void;

  /**
   * 获取当前速率限制状态
   */
  getStatus(): RateLimitStatus;

  /**
   * 重置速率限制器
   */
  reset(): void;
}

/**
 * 速率限制状态
 */
export interface RateLimitStatus {
  /** 当前时间窗口内的请求数 */
  currentRequests: number;
  /** 最大允许请求数 */
  maxRequests: number;
  /** 时间窗口大小（毫秒） */
  windowSize: number;
  /** 下次可以发送请求的时间 */
  nextAvailableTime: Date;
  /** 是否被限制 */
  isLimited: boolean;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /** 每分钟最大请求数 */
  requestsPerMinute: number;
  /** 突发请求数（可选，默认等于 requestsPerMinute） */
  burstSize?: number;
  /** 最大等待时间（毫秒），超过此时间将抛出错误 */
  maxWaitTime?: number;
}