/**
 * 摘要缓存接口定义
 */

/**
 * 缓存的摘要数据
 */
export interface CachedSummary {
  /** 摘要内容 */
  summary: string;
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间 */
  expiresAt?: Date;
  /** 摘要选项的哈希值（用于验证缓存有效性） */
  optionsHash: string;
  /** 模型名称 */
  modelName: string;
}

/**
 * 摘要缓存接口
 */
export interface ISummaryCache {
  /**
   * 获取缓存的摘要
   * @param key - 缓存键
   * @returns 缓存的摘要，如果不存在或已过期则返回 null
   */
  get(key: string): Promise<CachedSummary | null>;

  /**
   * 设置缓存的摘要
   * @param key - 缓存键
   * @param summary - 摘要数据
   * @param ttl - 生存时间（秒），可选
   */
  set(key: string, summary: CachedSummary, ttl?: number): Promise<void>;

  /**
   * 删除缓存项
   * @param key - 缓存键
   */
  delete(key: string): Promise<void>;

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>;

  /**
   * 获取缓存统计信息
   */
  getStats(): Promise<CacheStats>;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 总缓存项数 */
  totalItems: number;
  /** 缓存命中次数 */
  hits: number;
  /** 缓存未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 缓存大小（字节） */
  sizeBytes: number;
}