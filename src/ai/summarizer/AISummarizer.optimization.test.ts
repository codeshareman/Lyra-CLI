import { AISummarizer } from './AISummarizer';
import { IAIProvider, SummaryOptions } from '../interfaces';
import { ISummaryCache, CachedSummary } from '../cache/interfaces';
import { IRateLimiter } from '../ratelimit/interfaces';

class DelayProvider implements IAIProvider {
  public callCount = 0;

  constructor(private delayMs: number) {}

  async generateSummary(content: string, _options?: SummaryOptions): Promise<string> {
    this.callCount += 1;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return `summary:${content}`;
  }

  getModelName(): string {
    return 'delay-model';
  }
}

class MemoryCache implements ISummaryCache {
  private store = new Map<string, CachedSummary>();

  async get(key: string): Promise<CachedSummary | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, summary: CachedSummary): Promise<void> {
    this.store.set(key, summary);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getStats() {
    return {
      totalItems: this.store.size,
      hits: 0,
      misses: 0,
      hitRate: 0,
      sizeBytes: 0,
    };
  }
}

class NoopRateLimiter implements IRateLimiter {
  async waitForSlot(): Promise<void> {
    return;
  }

  recordRequest(): void {
    return;
  }

  getStatus() {
    return {
      currentRequests: 0,
      maxRequests: 100,
      windowSize: 60000,
      nextAvailableTime: new Date(),
      isLimited: false,
    };
  }

  reset(): void {
    return;
  }
}

describe('AISummarizer Optimization Unit Tests', () => {
  it('should process batch summaries in parallel', async () => {
    const provider = new DelayProvider(120);
    const summarizer = new AISummarizer(provider, new MemoryCache(), new NoopRateLimiter());

    const contents = ['a', 'b', 'c', 'd'];

    const start = Date.now();
    const results = await summarizer.summarizeBatch(contents, {
      maxLength: 200,
      ...( { concurrency: 4, batchDelay: 0 } as any),
    });
    const duration = Date.now() - start;

    expect(results).toHaveLength(4);
    expect(duration).toBeLessThan(350);
  });

  it('should hit cache for repeated summaries', async () => {
    const provider = new DelayProvider(20);
    const summarizer = new AISummarizer(provider, new MemoryCache(), new NoopRateLimiter());

    const first = await summarizer.summarize('same-content');
    const second = await summarizer.summarize('same-content');

    expect(first).toBe(second);
    expect(provider.callCount).toBe(1);
  });
});
