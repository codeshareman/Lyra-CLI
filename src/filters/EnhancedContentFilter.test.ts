import { EnhancedContentFilter } from './EnhancedContentFilter';
import { ContentItem, FilterCriteria } from '../types/interfaces';

describe('EnhancedContentFilter', () => {
  const filter = new EnhancedContentFilter();

  // 测试数据
  const testItems: ContentItem[] = [
    {
      title: 'Item 1',
      path: '/path/1',
      created: new Date('2024-01-15'),
      category: '文章',
      tags: ['JavaScript', '前端'],
      rating: 5,
    } as any,
    {
      title: 'Item 2',
      path: '/path/2',
      created: new Date('2024-01-20'),
      category: '工具',
      tags: ['开发工具'],
      rating: 4,
    } as any,
    {
      title: 'Item 3',
      path: '/path/3',
      created: new Date('2024-01-25'),
      category: '文章',
      tags: ['React', '前端'],
      rating: 3,
    } as any,
    {
      title: 'Item 4',
      path: '/path/4',
      created: new Date('2024-01-30'),
      // 没有 category
      tags: ['随感'],
      rating: 4,
    } as any,
    {
      title: 'Item 5',
      path: '/path/5',
      created: new Date('2024-02-05'),
      category: '好物',
      // 没有 tags
      rating: 5,
    } as any,
  ];

  describe('edge cases', () => {
    it('should return all items when no filter criteria specified', () => {
      const result = filter.filter(testItems, {});
      expect(result).toEqual(testItems);
    });

    it('should return empty array when filtering empty input', () => {
      const result = filter.filter([], { categories: ['文章'] });
      expect(result).toEqual([]);
    });

    it('should handle items with missing category field', () => {
      const result = filter.filter(testItems, { categories: ['文章'] });
      // 应该只返回有 category 字段且匹配的项
      expect(result).toHaveLength(2);
      expect(result.every(item => item.category === '文章')).toBe(true);
    });

    it('should handle items with missing tags field', () => {
      const result = filter.filter(testItems, { tags: ['前端'] });
      // 应该只返回有 tags 字段且匹配的项
      expect(result).toHaveLength(2);
      expect(result.every(item => item.tags?.includes('前端'))).toBe(true);
    });

    it('should handle items with missing rating field', () => {
      const itemsWithoutRating: ContentItem[] = [
        {
          title: 'No Rating',
          path: '/path/no-rating',
          created: new Date('2024-01-15'),
          category: '文章',
        },
      ];
      const result = filter.filter(itemsWithoutRating, { minRating: 4 });
      expect(result).toHaveLength(0);
    });
  });

  describe('category filtering', () => {
    it('should filter by single category', () => {
      const result = filter.filter(testItems, { categories: ['文章'] });
      expect(result).toHaveLength(2);
      expect(result.every(item => item.category === '文章')).toBe(true);
    });

    it('should filter by multiple categories (OR logic)', () => {
      const result = filter.filter(testItems, { categories: ['文章', '工具'] });
      expect(result).toHaveLength(3);
      expect(result.every(item => ['文章', '工具'].includes(item.category!))).toBe(true);
    });
  });

  describe('tag filtering', () => {
    it('should filter by single tag', () => {
      const result = filter.filter(testItems, { tags: ['前端'] });
      expect(result).toHaveLength(2);
      expect(result.every(item => item.tags?.includes('前端'))).toBe(true);
    });

    it('should filter by multiple tags (OR logic)', () => {
      const result = filter.filter(testItems, { tags: ['JavaScript', 'React'] });
      expect(result).toHaveLength(2);
    });
  });

  describe('date range filtering', () => {
    it('should filter by date range', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          start: new Date('2024-01-18'),
          end: new Date('2024-01-28'),
        },
      };
      const result = filter.filter(testItems, criteria);
      expect(result).toHaveLength(2);
      expect(result.map(item => item.title)).toEqual(['Item 2', 'Item 3']);
    });

    it('should include items on boundary dates', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          start: new Date('2024-01-15'),
          end: new Date('2024-01-15'),
        },
      };
      const result = filter.filter(testItems, criteria);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Item 1');
    });
  });

  describe('rating filtering', () => {
    it('should filter by minimum rating', () => {
      const result = filter.filter(testItems, { minRating: 4 });
      expect(result).toHaveLength(4);
      expect(result.every(item => (item as any).rating >= 4)).toBe(true);
    });

    it('should include items with exact minimum rating', () => {
      const result = filter.filter(testItems, { minRating: 5 });
      expect(result).toHaveLength(2);
      expect(result.every(item => (item as any).rating === 5)).toBe(true);
    });
  });

  describe('combined filtering (AND logic)', () => {
    it('should apply multiple criteria with AND logic', () => {
      const criteria: FilterCriteria = {
        categories: ['文章'],
        tags: ['前端'],
        minRating: 4,
      };
      const result = filter.filter(testItems, criteria);
      // 只有 Item 1 满足所有条件
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Item 1');
    });

    it('should return empty when no items match all criteria', () => {
      const criteria: FilterCriteria = {
        categories: ['工具'],
        tags: ['前端'],
      };
      const result = filter.filter(testItems, criteria);
      expect(result).toHaveLength(0);
    });

    it('should combine date range with other criteria', () => {
      const criteria: FilterCriteria = {
        categories: ['文章'],
        dateRange: {
          start: new Date('2024-01-20'),
          end: new Date('2024-01-31'),
        },
        minRating: 3,
      };
      const result = filter.filter(testItems, criteria);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Item 3');
    });
  });
});
