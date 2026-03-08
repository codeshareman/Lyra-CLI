/**
 * EnhancedContentFilter 属性测试
 * 
 * Feature: enhanced-weekly-template
 * 验证多维度内容筛选的正确性属性
 */

import * as fc from 'fast-check';
import { EnhancedContentFilter } from './EnhancedContentFilter';
import { ContentItem, FilterCriteria } from '../types/interfaces';

describe('EnhancedContentFilter Property Tests', () => {
  const filter = new EnhancedContentFilter();

  // ============================================================================
  // Arbitraries (生成器)
  // ============================================================================

  /**
   * 生成随机的 ContentItem
   */
  const arbitraryContentItem = (): fc.Arbitrary<ContentItem> => {
    return fc.record({
      title: fc.string({ minLength: 1, maxLength: 50 }),
      path: fc.string({ minLength: 1, maxLength: 100 }),
      created: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
      category: fc.option(
        fc.constantFrom(
          '本周动态', '文章', '书籍', '工具', '代码',
          '摄影', '生活', '好物', '美食', '运动', '音乐', '随感', '思考'
        )
      ),
      tags: fc.option(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 })
      ),
      rating: fc.option(fc.integer({ min: 1, max: 5 })),
      description: fc.option(fc.string({ maxLength: 200 })),
      content: fc.option(fc.string({ maxLength: 500 })),
    }) as fc.Arbitrary<ContentItem>;
  };

  /**
   * 生成随机的 FilterCriteria
   */
  const arbitraryFilterCriteria = (): fc.Arbitrary<FilterCriteria> => {
    return fc.record({
      categories: fc.option(
        fc.array(
          fc.constantFrom(
            '本周动态', '文章', '书籍', '工具', '代码',
            '摄影', '生活', '好物', '美食', '运动', '音乐', '随感', '思考'
          ),
          { minLength: 1, maxLength: 5 }
        )
      ),
      tags: fc.option(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
      ),
      dateRange: fc.option(
        fc.record({
          start: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
          end: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
        }).filter(range => range.start <= range.end)
      ),
      minRating: fc.option(fc.integer({ min: 1, max: 5 })),
    });
  };

  // ============================================================================
  // Property 9: Category Filter
  // ============================================================================

  describe('Property 9: Category Filter', () => {
    it('对于任意内容集合和分类筛选条件，筛选结果应该只包含匹配指定分类的项', () => {
      // Feature: enhanced-weekly-template, Property 9: Category Filter
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 0, maxLength: 50 }),
          fc.array(
            fc.constantFrom('文章', '工具', '生活', '美食', '运动'),
            { minLength: 1, maxLength: 3 }
          ),
          (items, categories) => {
            const filtered = filter.filter(items, { categories });

            // 所有筛选后的项都应该有 category 字段
            filtered.forEach(item => {
              expect(item.category).toBeDefined();
            });

            // 所有筛选后的项的 category 都应该在筛选条件中
            filtered.forEach(item => {
              expect(categories).toContain(item.category!);
            });

            // 原始数据中所有匹配的项都应该在结果中
            const expectedItems = items.filter(
              item => item.category && categories.includes(item.category)
            );
            expect(filtered.length).toBe(expectedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于空分类筛选条件，应该返回所有内容', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 1, maxLength: 30 }),
          (items) => {
            const filtered = filter.filter(items, { categories: [] });
            expect(filtered.length).toBe(items.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于没有 category 字段的项，应该被排除', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1 }),
              path: fc.string({ minLength: 1 }),
              created: fc.date(),
              // 故意不包含 category
            }) as fc.Arbitrary<ContentItem>,
            { minLength: 1, maxLength: 20 }
          ),
          fc.array(fc.constantFrom('文章', '工具'), { minLength: 1, maxLength: 2 }),
          (items, categories) => {
            const filtered = filter.filter(items, { categories });
            // 所有项都没有 category，应该返回空数组
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================================
  // Property 10: Tag Filter with OR Logic
  // ============================================================================

  describe('Property 10: Tag Filter with OR Logic', () => {
    it('对于任意内容集合和标签筛选条件，筛选结果应该包含至少匹配一个标签的项', () => {
      // Feature: enhanced-weekly-template, Property 10: Tag Filter with OR Logic
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 0, maxLength: 50 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
          (items, tags) => {
            const filtered = filter.filter(items, { tags });

            // 所有筛选后的项都应该有 tags 字段
            filtered.forEach(item => {
              expect(item.tags).toBeDefined();
              expect(Array.isArray(item.tags)).toBe(true);
              expect(item.tags!.length).toBeGreaterThan(0);
            });

            // 所有筛选后的项至少匹配一个标签 (OR 逻辑)
            filtered.forEach(item => {
              const hasMatchingTag = tags.some(tag => item.tags!.includes(tag));
              expect(hasMatchingTag).toBe(true);
            });

            // 验证没有遗漏符合条件的项
            const expectedItems = items.filter(
              item => item.tags && item.tags.length > 0 && tags.some(tag => item.tags!.includes(tag))
            );
            expect(filtered.length).toBe(expectedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于空标签筛选条件，应该返回所有内容', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 1, maxLength: 30 }),
          (items) => {
            const filtered = filter.filter(items, { tags: [] });
            expect(filtered.length).toBe(items.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于没有 tags 字段或空 tags 的项，应该被排除', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1 }),
              path: fc.string({ minLength: 1 }),
              created: fc.date(),
              tags: fc.constantFrom(undefined, []), // 没有 tags 或空数组
            }) as fc.Arbitrary<ContentItem>,
            { minLength: 1, maxLength: 20 }
          ),
          fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
          (items, tags) => {
            const filtered = filter.filter(items, { tags });
            // 所有项都没有有效的 tags，应该返回空数组
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================================
  // Property 11: Date Range Filter
  // ============================================================================

  describe('Property 11: Date Range Filter', () => {
    it('对于任意内容集合和时间范围，筛选结果应该只包含在范围内的项', () => {
      // Feature: enhanced-weekly-template, Property 11: Date Range Filter
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 0, maxLength: 50 }),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2024-06-30') }),
          fc.date({ min: new Date('2024-07-01'), max: new Date('2025-12-31') }),
          (items, start, end) => {
            // 确保 start <= end
            if (start > end) {
              [start, end] = [end, start];
            }

            const filtered = filter.filter(items, { dateRange: { start, end } });

            // 所有筛选后的项都应该有 created 字段
            filtered.forEach(item => {
              expect(item.created).toBeDefined();
            });

            // 所有筛选后的项的日期都应该在范围内 (包含边界)
            filtered.forEach(item => {
              const itemDate = new Date(item.created);
              expect(itemDate.getTime()).toBeGreaterThanOrEqual(start.getTime());
              expect(itemDate.getTime()).toBeLessThanOrEqual(end.getTime());
            });

            // 验证没有遗漏符合条件的项
            const expectedItems = items.filter(item => {
              if (!item.created) return false;
              const itemDate = new Date(item.created);
              return itemDate >= start && itemDate <= end;
            });
            expect(filtered.length).toBe(expectedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('边界日期应该被包含在筛选结果中', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),
          (boundaryDate) => {
            const items: ContentItem[] = [
              {
                title: 'Boundary Item',
                path: '/boundary',
                created: boundaryDate,
              },
            ];

            const filtered = filter.filter(items, {
              dateRange: { start: boundaryDate, end: boundaryDate },
            });

            expect(filtered.length).toBe(1);
            expect(filtered[0].title).toBe('Boundary Item');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于没有 created 字段的项，应该被排除', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1 }),
              path: fc.string({ minLength: 1 }),
              // 故意不包含 created
            }) as fc.Arbitrary<ContentItem>,
            { minLength: 1, maxLength: 20 }
          ),
          fc.date(),
          fc.date(),
          (items, start, end) => {
            if (start > end) {
              [start, end] = [end, start];
            }
            const filtered = filter.filter(items, { dateRange: { start, end } });
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================================
  // Property 12: Rating Filter
  // ============================================================================

  describe('Property 12: Rating Filter', () => {
    it('对于任意内容集合和最小评分，筛选结果应该只包含评分 >= 阈值的项', () => {
      // Feature: enhanced-weekly-template, Property 12: Rating Filter
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 0, maxLength: 50 }),
          fc.integer({ min: 1, max: 5 }),
          (items, minRating) => {
            const filtered = filter.filter(items, { minRating });

            // 所有筛选后的项都应该有 rating 字段
            filtered.forEach(item => {
              expect((item as any).rating).toBeDefined();
            });

            // 所有筛选后的项的评分都应该 >= 阈值
            filtered.forEach(item => {
              expect((item as any).rating).toBeGreaterThanOrEqual(minRating);
            });

            // 验证没有遗漏符合条件的项
            const expectedItems = items.filter(
              item => (item as any).rating !== undefined && (item as any).rating >= minRating
            );
            expect(filtered.length).toBe(expectedItems.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于 minRating = 1，应该包含所有有评分的项', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1 }),
              path: fc.string({ minLength: 1 }),
              created: fc.date(),
              rating: fc.integer({ min: 1, max: 5 }),
            }) as fc.Arbitrary<ContentItem>,
            { minLength: 1, maxLength: 30 }
          ),
          (items) => {
            const filtered = filter.filter(items, { minRating: 1 });
            expect(filtered.length).toBe(items.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于没有 rating 字段的项，应该被排除', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1 }),
              path: fc.string({ minLength: 1 }),
              created: fc.date(),
              // 故意不包含 rating
            }) as fc.Arbitrary<ContentItem>,
            { minLength: 1, maxLength: 20 }
          ),
          fc.integer({ min: 1, max: 5 }),
          (items, minRating) => {
            const filtered = filter.filter(items, { minRating });
            expect(filtered.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================================
  // Property 13: Combined Filter AND Logic
  // ============================================================================

  describe('Property 13: Combined Filter AND Logic', () => {
    it('对于任意内容集合和多个筛选条件，筛选结果应该满足所有条件 (AND 逻辑)', () => {
      // Feature: enhanced-weekly-template, Property 13: Combined Filter AND Logic
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 0, maxLength: 50 }),
          arbitraryFilterCriteria(),
          (items, criteria) => {
            const filtered = filter.filter(items, criteria);

            // 验证每个筛选后的项都满足所有条件
            filtered.forEach(item => {
              // 验证分类条件
              if (criteria.categories && criteria.categories.length > 0) {
                expect(item.category).toBeDefined();
                expect(criteria.categories).toContain(item.category!);
              }

              // 验证标签条件
              if (criteria.tags && criteria.tags.length > 0) {
                expect(item.tags).toBeDefined();
                expect(item.tags!.length).toBeGreaterThan(0);
                const hasMatchingTag = criteria.tags.some(tag => item.tags!.includes(tag));
                expect(hasMatchingTag).toBe(true);
              }

              // 验证时间范围条件
              if (criteria.dateRange) {
                expect(item.created).toBeDefined();
                const itemDate = new Date(item.created);
                expect(itemDate.getTime()).toBeGreaterThanOrEqual(criteria.dateRange.start.getTime());
                expect(itemDate.getTime()).toBeLessThanOrEqual(criteria.dateRange.end.getTime());
              }

              // 验证评分条件
              if (criteria.minRating !== undefined && criteria.minRating !== null) {
                expect((item as any).rating).toBeDefined();
                expect((item as any).rating).not.toBeNull();
                expect((item as any).rating).toBeGreaterThanOrEqual(criteria.minRating);
              }
            });
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于严格的组合条件，筛选结果应该是各个条件结果的交集', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 10, maxLength: 50 }),
          fc.constantFrom('文章', '工具'),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 3, max: 5 }),
          (items, category, tag, minRating) => {
            // 分别应用每个条件
            const categoryFiltered = filter.filter(items, { categories: [category] });
            const tagFiltered = filter.filter(items, { tags: [tag] });
            const ratingFiltered = filter.filter(items, { minRating });

            // 应用组合条件
            const combinedFiltered = filter.filter(items, {
              categories: [category],
              tags: [tag],
              minRating,
            });

            // 组合结果应该 <= 任何单个条件的结果
            expect(combinedFiltered.length).toBeLessThanOrEqual(categoryFiltered.length);
            expect(combinedFiltered.length).toBeLessThanOrEqual(tagFiltered.length);
            expect(combinedFiltered.length).toBeLessThanOrEqual(ratingFiltered.length);

            // 组合结果中的每一项都应该在各个单独筛选的结果中
            combinedFiltered.forEach(item => {
              expect(categoryFiltered.some(c => c.path === item.path)).toBe(true);
              expect(tagFiltered.some(t => t.path === item.path)).toBe(true);
              expect(ratingFiltered.some(r => r.path === item.path)).toBe(true);
            });
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于空的组合条件，应该返回所有内容', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 1, maxLength: 30 }),
          (items) => {
            const filtered = filter.filter(items, {});
            expect(filtered.length).toBe(items.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================================
  // Property 14: Independent Module Filters
  // ============================================================================

  describe('Property 14: Independent Module Filters', () => {
    it('对于相同的内容集合，不同模块的筛选条件应该产生独立的结果', () => {
      // Feature: enhanced-weekly-template, Property 14: Independent Module Filters
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 10, maxLength: 50 }),
          arbitraryFilterCriteria(),
          arbitraryFilterCriteria(),
          (items, criteria1, criteria2) => {
            // 应用两个不同的筛选条件
            const filtered1 = filter.filter(items, criteria1);
            const filtered2 = filter.filter(items, criteria2);

            // 两次筛选不应该相互影响
            // 再次应用第一个条件，结果应该相同
            const filtered1Again = filter.filter(items, criteria1);
            expect(filtered1Again.length).toBe(filtered1.length);
            expect(filtered1Again.map(i => i.path).sort()).toEqual(
              filtered1.map(i => i.path).sort()
            );

            // 再次应用第二个条件，结果应该相同
            const filtered2Again = filter.filter(items, criteria2);
            expect(filtered2Again.length).toBe(filtered2.length);
            expect(filtered2Again.map(i => i.path).sort()).toEqual(
              filtered2.map(i => i.path).sort()
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于不同模块的筛选，原始数据不应该被修改', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 5, maxLength: 30 }),
          arbitraryFilterCriteria(),
          (items, criteria) => {
            // 保存原始数据的深拷贝（处理 Date 对象）
            const originalItems = items.map(item => ({
              ...item,
              created: item.created ? new Date(item.created) : item.created,
            }));

            // 应用筛选
            filter.filter(items, criteria);

            // 验证原始数据没有被修改（比较关键字段）
            expect(items.length).toBe(originalItems.length);
            items.forEach((item, index) => {
              expect(item.title).toBe(originalItems[index].title);
              expect(item.path).toBe(originalItems[index].path);
              expect(item.category).toBe(originalItems[index].category);
              expect(item.tags).toEqual(originalItems[index].tags);
              expect((item as any).rating).toBe((originalItems[index] as any).rating);
              // 比较日期时间戳
              if (item.created && originalItems[index].created) {
                expect(new Date(item.created).getTime()).toBe(
                  new Date(originalItems[index].created).getTime()
                );
              } else {
                expect(item.created).toBe(originalItems[index].created);
              }
            });
          }
        ),
        { numRuns: 20 }
      );
    });

    it('多次筛选相同数据应该产生相同结果 (幂等性)', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 5, maxLength: 30 }),
          arbitraryFilterCriteria(),
          (items, criteria) => {
            const result1 = filter.filter(items, criteria);
            const result2 = filter.filter(items, criteria);
            const result3 = filter.filter(items, criteria);

            // 所有结果应该相同
            expect(result1.length).toBe(result2.length);
            expect(result2.length).toBe(result3.length);

            expect(result1.map(i => i.path).sort()).toEqual(
              result2.map(i => i.path).sort()
            );
            expect(result2.map(i => i.path).sort()).toEqual(
              result3.map(i => i.path).sort()
            );
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================================
  // 额外的边界情况和不变量测试
  // ============================================================================

  describe('额外的不变量测试', () => {
    it('筛选结果的长度不应该超过输入长度', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 0, maxLength: 50 }),
          arbitraryFilterCriteria(),
          (items, criteria) => {
            const filtered = filter.filter(items, criteria);
            expect(filtered.length).toBeLessThanOrEqual(items.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('筛选结果应该保持输入的顺序', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryContentItem(), { minLength: 2, maxLength: 30 }),
          arbitraryFilterCriteria(),
          (items, criteria) => {
            const filtered = filter.filter(items, criteria);

            // 验证筛选结果在原始数组中的相对顺序
            const filteredPaths = filtered.map(i => i.path);
            const originalPaths = items.map(i => i.path);

            let lastIndex = -1;
            for (const path of filteredPaths) {
              const currentIndex = originalPaths.indexOf(path);
              expect(currentIndex).toBeGreaterThan(lastIndex);
              lastIndex = currentIndex;
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于空输入数组，应该返回空数组', () => {
      fc.assert(
        fc.property(arbitraryFilterCriteria(), (criteria) => {
          const filtered = filter.filter([], criteria);
          expect(filtered).toEqual([]);
          expect(Array.isArray(filtered)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });
});
