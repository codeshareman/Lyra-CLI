import * as fc from 'fast-check';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { AISummarizer } from '../ai/summarizer/AISummarizer';
import { IAIProvider, SummaryOptions } from '../ai/interfaces';
import { ISummaryCache, CachedSummary } from '../ai/cache/interfaces';
import { IRateLimiter } from '../ai/ratelimit/interfaces';
import { TemplateEngine } from '../core/TemplateEngine';
import { TemplateData } from '../types/interfaces';

class CountingProvider implements IAIProvider {
  public callCount = 0;

  constructor(private delayMs = 0) {}

  async generateSummary(content: string, _options?: SummaryOptions): Promise<string> {
    this.callCount += 1;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return `summary:${content}`;
  }

  getModelName(): string {
    return 'counting-model';
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

describe('Optimization Property Tests', () => {
  describe('Property 38: AI Summary Caching', () => {
    it('should avoid duplicated provider calls for same content', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 200 }), async (content) => {
          const provider = new CountingProvider();
          const summarizer = new AISummarizer(provider, new MemoryCache(), new NoopRateLimiter());

          await summarizer.summarize(content);
          await summarizer.summarize(content);

          expect(provider.callCount).toBe(1);
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 39: Parallel AI Summary Processing', () => {
    it('should complete batch processing faster than strict sequential time bound', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 3, maxLength: 6 }),
          async (contents) => {
            const provider = new CountingProvider(80);
            const summarizer = new AISummarizer(provider, new MemoryCache(), new NoopRateLimiter());

            const start = Date.now();
            const summaries = await summarizer.summarizeBatch(contents, {
              ...( { concurrency: Math.min(contents.length, 3), batchDelay: 0 } as any),
            });
            const duration = Date.now() - start;

            expect(summaries).toHaveLength(contents.length);
            expect(duration).toBeLessThan(contents.length * 80);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property 40: Template Compilation Caching', () => {
    it('should keep using cached compiled template for same path', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }), async (value) => {
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-cache-prop-'));

          try {
            const templatePath = path.join(tempDir, 'sample.hbs');
            await fs.writeFile(templatePath, 'A: {{metadata.value}}', 'utf-8');

            const engine = new TemplateEngine();
            const data: TemplateData = {
              metadata: { value },
              content: {},
              statistics: {},
            };

            const first = await engine.render(templatePath, data);
            await fs.writeFile(templatePath, 'B: {{metadata.value}}', 'utf-8');
            const second = await engine.render(templatePath, data);

            expect(first.startsWith('A: ')).toBe(true);
            expect(second).toBe(first);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 20 }
      );
    });
  });
});
