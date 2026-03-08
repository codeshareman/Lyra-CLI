import {
  IEnhancedContentFilter,
  ContentItem,
  FilterCriteria,
} from '../types/interfaces';

/**
 * EnhancedContentFilter 实现多维度内容筛选
 * 支持分类、标签、时间范围和评分的组合筛选
 */
export class EnhancedContentFilter implements IEnhancedContentFilter {
  /**
   * 筛选内容项
   * @param items - 待筛选的内容项数组
   * @param criteria - 筛选条件
   * @returns 筛选后的内容项数组
   */
  filter(items: ContentItem[], criteria: FilterCriteria): ContentItem[] {
    // 如果没有筛选条件，返回所有内容
    if (!criteria || Object.keys(criteria).length === 0) {
      return items;
    }

    return items.filter(item => {
      // 应用 AND 逻辑：所有条件都必须满足
      return (
        this.matchesCategories(item, criteria.categories) &&
        this.matchesTags(item, criteria.tags) &&
        this.matchesDateRange(item, criteria.dateRange) &&
        this.matchesRating(item, criteria.minRating)
      );
    });
  }

  /**
   * 检查内容项是否匹配分类条件（OR 逻辑）
   */
  private matchesCategories(item: ContentItem, categories?: string[]): boolean {
    if (!categories || categories.length === 0) {
      return true;
    }

    // 如果内容项没有 category 字段，不匹配
    if (!item.category) {
      return false;
    }

    // OR 逻辑：匹配任意一个分类即可
    return categories.includes(item.category);
  }

  /**
   * 检查内容项是否匹配标签条件（OR 逻辑）
   */
  private matchesTags(item: ContentItem, tags?: string[]): boolean {
    if (!tags || tags.length === 0) {
      return true;
    }

    // 如果内容项没有 tags 字段，不匹配
    if (!item.tags || item.tags.length === 0) {
      return false;
    }

    // OR 逻辑：匹配任意一个标签即可
    return tags.some(tag => item.tags!.includes(tag));
  }

  /**
   * 检查内容项是否在时间范围内
   */
  private matchesDateRange(
    item: ContentItem,
    dateRange?: { start: Date; end: Date }
  ): boolean {
    if (!dateRange) {
      return true;
    }

    // 如果内容项没有 created 字段，不匹配
    if (!item.created) {
      return false;
    }

    const itemDate = new Date(item.created);
    return itemDate >= dateRange.start && itemDate <= dateRange.end;
  }

  /**
   * 检查内容项是否满足最小评分要求
   */
  private matchesRating(item: ContentItem, minRating?: number): boolean {
    if (minRating === undefined) {
      return true;
    }

    // 如果内容项没有 rating 字段，视为不满足评分要求
    const rating = (item as any).rating;
    if (rating === undefined) {
      return false;
    }

    return rating >= minRating;
  }
}
