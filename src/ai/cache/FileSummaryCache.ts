/**
 * 基于文件的摘要缓存实现
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ISummaryCache, CachedSummary, CacheStats } from './interfaces';
import { CacheError, ErrorCode } from '../../types/errors';

/**
 * 缓存文件数据结构
 */
interface CacheFileData {
  version: string;
  data: Record<string, CachedSummary>;
  stats: {
    hits: number;
    misses: number;
  };
}

/**
 * 基于文件的摘要缓存
 */
export class FileSummaryCache implements ISummaryCache {
  private cacheFilePath: string;
  private cache: Map<string, CachedSummary> = new Map();
  private stats = {
    hits: 0,
    misses: 0
  };
  private isLoaded = false;
  private readonly version = '1.0.0';

  constructor(cacheDir: string = '.cache') {
    this.cacheFilePath = path.join(cacheDir, 'summary-cache.json');
  }

  /**
   * 获取缓存的摘要
   */
  async get(key: string): Promise<CachedSummary | null> {
    await this.ensureLoaded();

    const cached = this.cache.get(key);
    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (cached.expiresAt && cached.expiresAt < new Date()) {
      this.cache.delete(key);
      this.stats.misses++;
      await this.saveCache();
      return null;
    }

    this.stats.hits++;
    return cached;
  }

  /**
   * 设置缓存的摘要
   */
  async set(key: string, summary: CachedSummary, ttl?: number): Promise<void> {
    await this.ensureLoaded();

    // 设置过期时间
    if (ttl && ttl > 0) {
      summary.expiresAt = new Date(Date.now() + ttl * 1000);
    }

    this.cache.set(key, summary);
    await this.saveCache();
  }

  /**
   * 删除缓存项
   */
  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    
    if (this.cache.delete(key)) {
      await this.saveCache();
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
    await this.saveCache();
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats> {
    await this.ensureLoaded();

    const totalItems = this.cache.size;
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    // 计算缓存大小
    let sizeBytes = 0;
    for (const [key, value] of this.cache) {
      sizeBytes += Buffer.byteLength(key, 'utf8');
      sizeBytes += Buffer.byteLength(JSON.stringify(value), 'utf8');
    }

    return {
      totalItems,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      sizeBytes
    };
  }

  /**
   * 确保缓存已加载
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadCache();
      this.isLoaded = true;
    }
  }

  /**
   * 从文件加载缓存
   */
  private async loadCache(): Promise<void> {
    try {
      // 确保缓存目录存在
      const cacheDir = path.dirname(this.cacheFilePath);
      await fs.mkdir(cacheDir, { recursive: true });

      // 尝试读取缓存文件
      const data = await fs.readFile(this.cacheFilePath, 'utf-8');
      const cacheData: CacheFileData = JSON.parse(data);

      // 验证版本兼容性
      if (cacheData.version !== this.version) {
        console.warn(`缓存版本不匹配，清空缓存。期望: ${this.version}, 实际: ${cacheData.version}`);
        return;
      }

      // 加载缓存数据
      this.cache.clear();
      for (const [key, value] of Object.entries(cacheData.data)) {
        // 转换日期字符串为 Date 对象
        const cachedSummary: CachedSummary = {
          ...value,
          createdAt: new Date(value.createdAt),
          expiresAt: value.expiresAt ? new Date(value.expiresAt) : undefined
        };
        this.cache.set(key, cachedSummary);
      }

      // 加载统计信息
      this.stats = cacheData.stats || { hits: 0, misses: 0 };

      // 清理过期项
      await this.cleanupExpired();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // 文件不存在，这是正常的
        return;
      }
      
      // 其他错误，记录警告但不抛出异常
      console.warn(`加载缓存文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 保存缓存到文件
   */
  private async saveCache(): Promise<void> {
    try {
      // 确保缓存目录存在
      const cacheDir = path.dirname(this.cacheFilePath);
      await fs.mkdir(cacheDir, { recursive: true });

      // 准备缓存数据
      const cacheData: CacheFileData = {
        version: this.version,
        data: Object.fromEntries(this.cache),
        stats: this.stats
      };

      // 写入文件
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(cacheData, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new CacheError(
        ErrorCode.E018,
        `保存缓存文件失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清理过期的缓存项
   */
  private async cleanupExpired(): Promise<void> {
    const now = new Date();
    let hasExpired = false;

    for (const [key, value] of this.cache) {
      if (value.expiresAt && value.expiresAt < now) {
        this.cache.delete(key);
        hasExpired = true;
      }
    }

    // 如果有过期项被删除，保存缓存
    if (hasExpired) {
      await this.saveCache();
    }
  }
}