/**
 * FileSummaryCache 单元测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSummaryCache } from './FileSummaryCache';
import { CachedSummary } from './interfaces';

describe('FileSummaryCache', () => {
  let cache: FileSummaryCache;
  let testCacheDir: string;

  beforeEach(async () => {
    testCacheDir = path.join(__dirname, '../../../test-cache');
    cache = new FileSummaryCache(testCacheDir);
    
    // 清理测试目录
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('基本缓存操作', () => {
    it('应该能够设置和获取缓存项', async () => {
      const key = 'test-key';
      const summary: CachedSummary = {
        summary: '这是一个测试摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set(key, summary);
      const retrieved = await cache.get(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.summary).toBe(summary.summary);
      expect(retrieved!.optionsHash).toBe(summary.optionsHash);
      expect(retrieved!.modelName).toBe(summary.modelName);
    });

    it('应该在键不存在时返回 null', async () => {
      const result = await cache.get('nonexistent-key');
      expect(result).toBeNull();
    });

    it('应该能够删除缓存项', async () => {
      const key = 'test-key';
      const summary: CachedSummary = {
        summary: '测试摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set(key, summary);
      expect(await cache.get(key)).not.toBeNull();

      await cache.delete(key);
      expect(await cache.get(key)).toBeNull();
    });

    it('应该能够清空所有缓存', async () => {
      const summary: CachedSummary = {
        summary: '测试摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set('key1', summary);
      await cache.set('key2', summary);

      expect(await cache.get('key1')).not.toBeNull();
      expect(await cache.get('key2')).not.toBeNull();

      await cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('TTL 过期处理', () => {
    it('应该支持 TTL 过期', async () => {
      const key = 'expiring-key';
      const summary: CachedSummary = {
        summary: '会过期的摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      // 设置 1 秒 TTL
      await cache.set(key, summary, 1);

      // 立即获取应该成功
      expect(await cache.get(key)).not.toBeNull();

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 过期后应该返回 null
      expect(await cache.get(key)).toBeNull();
    });

    it('应该在没有 TTL 时永不过期', async () => {
      const key = 'permanent-key';
      const summary: CachedSummary = {
        summary: '永久摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set(key, summary);

      // 多次获取都应该成功
      expect(await cache.get(key)).not.toBeNull();
      expect(await cache.get(key)).not.toBeNull();
    });
  });

  describe('缓存持久化', () => {
    it('应该能够持久化缓存到文件', async () => {
      const key = 'persistent-key';
      const summary: CachedSummary = {
        summary: '持久化摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set(key, summary);

      // 创建新的缓存实例（模拟重启）
      const newCache = new FileSummaryCache(testCacheDir);
      const retrieved = await newCache.get(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.summary).toBe(summary.summary);
    });

    it('应该在缓存文件不存在时正常工作', async () => {
      // 确保缓存文件不存在
      const newCache = new FileSummaryCache(path.join(testCacheDir, 'nonexistent'));
      
      // 应该能够正常操作
      expect(await newCache.get('any-key')).toBeNull();
      
      const summary: CachedSummary = {
        summary: '新摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };
      
      await newCache.set('new-key', summary);
      expect(await newCache.get('new-key')).not.toBeNull();
    });

    it('应该处理损坏的缓存文件', async () => {
      // 创建损坏的缓存文件
      const cacheFilePath = path.join(testCacheDir, 'summary-cache.json');
      await fs.mkdir(testCacheDir, { recursive: true });
      await fs.writeFile(cacheFilePath, 'invalid json content', 'utf-8');

      // 应该能够处理损坏的文件并继续工作
      const newCache = new FileSummaryCache(testCacheDir);
      expect(await newCache.get('any-key')).toBeNull();

      const summary: CachedSummary = {
        summary: '新摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await newCache.set('new-key', summary);
      expect(await newCache.get('new-key')).not.toBeNull();
    });
  });

  describe('缓存统计', () => {
    it('应该正确跟踪缓存命中和未命中', async () => {
      const summary: CachedSummary = {
        summary: '统计测试摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set('existing-key', summary);

      // 命中
      await cache.get('existing-key');
      await cache.get('existing-key');

      // 未命中
      await cache.get('nonexistent-key');

      const stats = await cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2/3);
      expect(stats.totalItems).toBe(1);
    });

    it('应该计算缓存大小', async () => {
      const summary: CachedSummary = {
        summary: '大小测试摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set('size-test-key', summary);

      const stats = await cache.getStats();
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });

    it('应该在清空缓存后重置统计', async () => {
      const summary: CachedSummary = {
        summary: '清空测试摘要',
        createdAt: new Date(),
        optionsHash: 'hash123',
        modelName: 'gpt-3.5-turbo'
      };

      await cache.set('clear-test-key', summary);
      await cache.get('clear-test-key');
      await cache.get('nonexistent-key');

      let stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);

      await cache.clear();

      stats = await cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalItems).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该处理文件系统错误', async () => {
      // 创建一个指向只读目录的缓存（如果可能的话）
      const readOnlyDir = path.join(testCacheDir, 'readonly');
      await fs.mkdir(readOnlyDir, { recursive: true });
      
      try {
        // 尝试使缓存目录只读（在某些系统上可能不起作用）
        await fs.chmod(readOnlyDir, 0o444);
        
        const readOnlyCache = new FileSummaryCache(readOnlyDir);
        const summary: CachedSummary = {
          summary: '错误测试摘要',
          createdAt: new Date(),
          optionsHash: 'hash123',
          modelName: 'gpt-3.5-turbo'
        };

        // 设置缓存可能会失败，但不应该崩溃应用
        await expect(readOnlyCache.set('error-key', summary))
          .rejects
          .toThrow();
      } finally {
        // 恢复权限以便清理
        try {
          await fs.chmod(readOnlyDir, 0o755);
        } catch (error) {
          // 忽略权限恢复错误
        }
      }
    });
  });
});