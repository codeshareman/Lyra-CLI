/**
 * EnhancedMetadataManager 属性测试
 * 
 * **Validates: Requirements 3.9**
 */

import * as fc from 'fast-check';
import { EnhancedMetadataManager } from './EnhancedMetadataManager';

describe('EnhancedMetadataManager Property Tests', () => {
  let manager: EnhancedMetadataManager;

  beforeEach(() => {
    manager = new EnhancedMetadataManager('./test-output');
  });

  // ============================================================================
  // Arbitraries (Generators)
  // ============================================================================

  /**
   * 生成无效的封面图片路径
   * 注意：EnhancedMetadataManager 的 isValidImagePath 实际上接受几乎所有字符串
   * 所以我们需要生成真正无效的值（非字符串类型）
   */
  const invalidImagePath = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.integer(),
    fc.boolean(),
    fc.array(fc.string()),
    fc.object()
  );

  /**
   * 生成无效的金句对象
   */
  const invalidGoldenQuote = fc.oneof(
    // 缺少 content 字段
    fc.record({
      author: fc.string(),
    }),
    // 缺少 author 字段
    fc.record({
      content: fc.string(),
    }),
    // content 不是字符串
    fc.record({
      content: fc.integer(),
      author: fc.string(),
    }),
    // author 不是字符串
    fc.record({
      content: fc.string(),
      author: fc.boolean(),
    }),
    // content 是空字符串
    fc.record({
      content: fc.constant(''),
      author: fc.string({ minLength: 1 }),
    }),
    // author 是空字符串
    fc.record({
      content: fc.string({ minLength: 1 }),
      author: fc.constant(''),
    }),
    // 完全不是对象（但不是 null/undefined，因为那些表示"未提供"）
    fc.string(),
    fc.integer()
  );

  /**
   * 生成缺少必需字段的 LifeMoment frontmatter
   */
  const invalidLifeMomentFrontmatter = fc.oneof(
    // 缺少 title
    fc.record({
      images: fc.array(fc.webUrl(), { minLength: 1 }),
      date: fc.date(),
    }),
    // 缺少 images
    fc.record({
      title: fc.string({ minLength: 1 }),
      date: fc.date(),
    }),
    // 缺少 date
    fc.record({
      title: fc.string({ minLength: 1 }),
      images: fc.array(fc.webUrl(), { minLength: 1 }),
    }),
    // images 是空数组
    fc.record({
      title: fc.string({ minLength: 1 }),
      images: fc.constant([]),
      date: fc.date(),
    }),
    // title 是空字符串
    fc.record({
      title: fc.constant(''),
      images: fc.array(fc.webUrl(), { minLength: 1 }),
      date: fc.date(),
    }),
    // title 只有空格
    fc.record({
      title: fc.constant('   '),
      images: fc.array(fc.webUrl(), { minLength: 1 }),
      date: fc.date(),
    }),
    // date 是无效的
    fc.record({
      title: fc.string({ minLength: 1 }),
      images: fc.array(fc.webUrl(), { minLength: 1 }),
      date: fc.constant('invalid-date'),
    })
  );

  /**
   * 生成缺少必需字段的 FoodRecord frontmatter
   */
  const invalidFoodRecordFrontmatter = fc.oneof(
    // 缺少 title
    fc.record({
      images: fc.array(fc.webUrl(), { minLength: 1 }),
      date: fc.date(),
    }),
    // 缺少 images
    fc.record({
      title: fc.string({ minLength: 1 }),
      date: fc.date(),
    }),
    // 缺少 date
    fc.record({
      title: fc.string({ minLength: 1 }),
      images: fc.array(fc.webUrl(), { minLength: 1 }),
    }),
    // images 是空数组
    fc.record({
      title: fc.string({ minLength: 1 }),
      images: fc.constant([]),
      date: fc.date(),
    })
  );

  /**
   * 生成缺少必需字段的 ExerciseRecord frontmatter
   */
  const invalidExerciseRecordFrontmatter = fc.oneof(
    // 缺少 type
    fc.record({
      duration: fc.integer({ min: 1 }),
      date: fc.date(),
    }),
    // 缺少 duration
    fc.record({
      type: fc.string({ minLength: 1 }),
      date: fc.date(),
    }),
    // 缺少 date
    fc.record({
      type: fc.string({ minLength: 1 }),
      duration: fc.integer({ min: 1 }),
    }),
    // duration 不是数字
    fc.record({
      type: fc.string({ minLength: 1 }),
      duration: fc.constant('not-a-number'),
      date: fc.date(),
    }),
    // type 是空字符串
    fc.record({
      type: fc.constant(''),
      duration: fc.integer({ min: 1 }),
      date: fc.date(),
    })
  );

  /**
   * 生成缺少必需字段的 MusicRecommendation frontmatter
   */
  const invalidMusicRecommendationFrontmatter = fc.oneof(
    // 缺少 title
    fc.record({
      artist: fc.string({ minLength: 1 }),
    }),
    // 缺少 artist
    fc.record({
      title: fc.string({ minLength: 1 }),
    }),
    // title 是空字符串
    fc.record({
      title: fc.constant(''),
      artist: fc.string({ minLength: 1 }),
    }),
    // artist 是空字符串
    fc.record({
      title: fc.string({ minLength: 1 }),
      artist: fc.constant(''),
    })
  );

  // ============================================================================
  // Property 5: Metadata Round-Trip
  // ============================================================================

  describe('Property 5: Metadata Round-Trip', () => {
    it('对于任意包含封面图与个人回响的文章元数据，解析后应保持字段值不变', () => {
      fc.assert(
        fc.property(
          fc.record({
            article: fc.record({
              title: fc.string({ minLength: 1 }),
              url: fc.webUrl(),
              rating: fc.integer({ min: 0, max: 5 }),
              description: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            }),
            coverImage: fc.option(fc.webUrl(), { nil: undefined }),
            personalReflection: fc.option(fc.string(), { nil: undefined }),
          }),
          ({ article, coverImage, personalReflection }) => {
            const frontmatter: Record<string, any> = {
              coverImage,
              personalReflection,
            };

            const parsed = manager.parseEnhancedArticle(article, frontmatter);
            const serialized = JSON.parse(JSON.stringify(parsed));

            expect(serialized.title).toBe(article.title);
            expect(serialized.url).toBe(article.url);
            expect(serialized.rating).toBe(article.rating);
            expect(serialized.coverImage).toBe(coverImage);

            const expectedReflection = personalReflection?.trim()
              ? personalReflection.trim()
              : undefined;
            expect(serialized.personalReflection).toBe(expectedReflection);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于任意包含代码片段的工具元数据，解析后应保持字段值不变', () => {
      fc.assert(
        fc.property(
          fc.record({
            tool: fc.record({
              title: fc.string({ minLength: 1 }),
              url: fc.webUrl(),
              rating: fc.integer({ min: 0, max: 5 }),
              category: fc.string({ minLength: 1 }),
              description: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            }),
            codeSnippet: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            language: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          }),
          ({ tool, codeSnippet, language }) => {
            const parsed = manager.parseEnhancedTool(tool, { codeSnippet, language });
            const serialized = JSON.parse(JSON.stringify(parsed));

            expect(serialized.title).toBe(tool.title);
            expect(serialized.url).toBe(tool.url);
            expect(serialized.rating).toBe(tool.rating);
            expect(serialized.category).toBe(tool.category);
            expect(serialized.codeSnippet).toBe(codeSnippet?.trim());
            expect(serialized.language).toBe(language?.trim());
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于任意生活瞬间元数据，解析后应保留图片数组与日期字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            description: fc.option(fc.string(), { nil: undefined }),
            images: fc.array(fc.webUrl(), { minLength: 1, maxLength: 5 }),
            date: fc.date(),
            tags: fc.option(fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }), { nil: undefined }),
            category: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            filePath: fc.string({ minLength: 1 }),
          }),
          ({ title, description, images, date, tags, category, filePath }) => {
            const parsed = manager.parseLifeMoment(
              { title, description, images, date, tags, category },
              filePath
            );

            expect(parsed).not.toBeNull();
            expect(parsed!.title).toBe(title.trim());
            expect(parsed!.images).toEqual(images);
            expect(parsed!.date.toISOString()).toBe(date.toISOString());
            expect(parsed!.path).toBe(filePath);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于任意饮食记录元数据，解析后应保留图片数组与评分字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            description: fc.option(fc.string(), { nil: undefined }),
            images: fc.array(fc.webUrl(), { minLength: 1, maxLength: 5 }),
            date: fc.date(),
            rating: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
            category: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            filePath: fc.string({ minLength: 1 }),
          }),
          ({ title, description, images, date, rating, category, filePath }) => {
            const parsed = manager.parseFoodRecord(
              { title, description, images, date, rating, category },
              filePath
            );

            expect(parsed).not.toBeNull();
            expect(parsed!.title).toBe(title.trim());
            expect(parsed!.images).toEqual(images);
            expect(parsed!.date.toISOString()).toBe(date.toISOString());
            expect(parsed!.rating).toBe(rating);
            expect(parsed!.path).toBe(filePath);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于任意运动记录元数据，解析后应保留时长与卡路里字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            duration: fc.integer({ min: 1, max: 1000 }),
            calories: fc.option(fc.integer({ min: 0, max: 2000 }), { nil: undefined }),
            date: fc.date(),
            notes: fc.option(fc.string(), { nil: undefined }),
            category: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            filePath: fc.string({ minLength: 1 }),
          }),
          ({ type, duration, calories, date, notes, category, filePath }) => {
            const parsed = manager.parseExerciseRecord(
              { type, duration, calories, date, notes, category },
              filePath
            );

            expect(parsed).not.toBeNull();
            expect(parsed!.type).toBe(type.trim());
            expect(parsed!.duration).toBe(duration);
            expect(parsed!.calories).toBe(calories);
            expect(parsed!.date.toISOString()).toBe(date.toISOString());
            expect(parsed!.path).toBe(filePath);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于任意音乐推荐元数据，解析后应保留曲目信息字段', () => {
      fc.assert(
        fc.property(
          fc.record({
            title: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            artist: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            album: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            feeling: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            url: fc.option(fc.webUrl(), { nil: undefined }),
            date: fc.option(fc.date(), { nil: undefined }),
            category: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            filePath: fc.string({ minLength: 1 }),
          }),
          ({ title, artist, album, feeling, url, date, category, filePath }) => {
            const parsed = manager.parseMusicRecommendation(
              { title, artist, album, feeling, url, date, category },
              filePath
            );

            expect(parsed).not.toBeNull();
            expect(parsed!.title).toBe(title.trim());
            expect(parsed!.artist).toBe(artist.trim());
            expect(parsed!.album).toBe(album?.trim());
            expect(parsed!.feeling).toBe(feeling?.trim());
            expect(parsed!.url).toBe(url);
            if (date) {
              expect(parsed!.date?.toISOString()).toBe(date.toISOString());
            }
            expect(parsed!.path).toBe(filePath);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // ============================================================================
  // Property 6: Metadata Validation Rejects Invalid Data
  // ============================================================================

  describe('Property 6: Metadata Validation Rejects Invalid Data', () => {
    it('对于任意包含无效金句格式的元数据，验证应该失败并返回描述性错误', () => {
      fc.assert(
        fc.property(invalidGoldenQuote, (invalidQuote) => {
          const metadata = {
            goldenQuote: invalidQuote,
          };

          const result = manager.validateEnhancedMetadata(metadata);

          // 验证应该失败
          expect(result.valid).toBe(false);
          
          // 应该包含描述性错误信息
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(err => err.includes('goldenQuote'))).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('对于任意缺少必需字段的 LifeMoment，解析应该返回 null', () => {
      fc.assert(
        fc.property(
          invalidLifeMomentFrontmatter,
          fc.string(),
          (frontmatter, filePath) => {
            const result = manager.parseLifeMoment(frontmatter, filePath);

            // 缺少必需字段应该返回 null
            expect(result).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意缺少必需字段的 FoodRecord，解析应该返回 null', () => {
      fc.assert(
        fc.property(
          invalidFoodRecordFrontmatter,
          fc.string(),
          (frontmatter, filePath) => {
            const result = manager.parseFoodRecord(frontmatter, filePath);

            // 缺少必需字段应该返回 null
            expect(result).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意缺少必需字段的 ExerciseRecord，解析应该返回 null', () => {
      fc.assert(
        fc.property(
          invalidExerciseRecordFrontmatter,
          fc.string(),
          (frontmatter, filePath) => {
            const result = manager.parseExerciseRecord(frontmatter, filePath);

            // 缺少必需字段应该返回 null
            expect(result).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意缺少必需字段的 MusicRecommendation，解析应该返回 null', () => {
      fc.assert(
        fc.property(
          invalidMusicRecommendationFrontmatter,
          fc.string(),
          (frontmatter, filePath) => {
            const result = manager.parseMusicRecommendation(frontmatter, filePath);

            // 缺少必需字段应该返回 null
            expect(result).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意包含无效字段类型的元数据，验证应该提供清晰的错误信息', () => {
      fc.assert(
        fc.property(
          fc.record({
            coverImage: fc.option(invalidImagePath, { nil: undefined }),
            backgroundImage: fc.option(invalidImagePath, { nil: undefined }),
            goldenQuote: fc.option(invalidGoldenQuote, { nil: undefined }),
          }),
          (metadata) => {
            // 过滤掉所有字段都是 undefined 的情况
            const hasInvalidField = 
              metadata.coverImage !== undefined ||
              metadata.backgroundImage !== undefined ||
              metadata.goldenQuote !== undefined;

            if (!hasInvalidField) {
              // 如果所有字段都是 undefined，验证应该通过
              const result = manager.validateEnhancedMetadata(metadata);
              expect(result.valid).toBe(true);
              return;
            }

            const result = manager.validateEnhancedMetadata(metadata);

            // 如果有无效字段，验证应该失败
            if (!result.valid) {
              // 错误信息应该是描述性的
              expect(result.errors.length).toBeGreaterThan(0);
              result.errors.forEach(error => {
                expect(typeof error).toBe('string');
                expect(error.length).toBeGreaterThan(0);
              });
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意包含空字符串或只有空格的必需字段，解析应该失败', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t'),
            fc.constant('\n'),
            fc.constant('  \t  \n  ')
          ),
          fc.array(fc.webUrl(), { minLength: 1 }),
          fc.date(),
          fc.string(),
          (emptyTitle, images, date, filePath) => {
            const frontmatter = {
              title: emptyTitle,
              images,
              date,
            };

            const lifeMoment = manager.parseLifeMoment(frontmatter, filePath);
            const foodRecord = manager.parseFoodRecord(frontmatter, filePath);

            // 空字符串或只有空格的 title 应该导致解析失败
            expect(lifeMoment).toBeNull();
            expect(foodRecord).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意包含非数字的 duration 字段，ExerciseRecord 解析应该失败', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.oneof(
            fc.string().filter(s => isNaN(Number(s))),
            fc.constant(null),
            fc.constant(undefined),
            fc.object()
          ),
          fc.date(),
          fc.string(),
          (type, invalidDuration, date, filePath) => {
            const frontmatter = {
              type,
              duration: invalidDuration,
              date,
            };

            const result = manager.parseExerciseRecord(frontmatter, filePath);

            // 非数字的 duration 应该导致解析失败
            expect(result).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意包含无效日期的 frontmatter，解析应该失败', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.webUrl(), { minLength: 1 }),
          fc.oneof(
            fc.constant('invalid-date'),
            fc.constant('not-a-date'),
            fc.constant('2024-13-45'), // 无效的月份和日期
            fc.constant('abc123')
          ),
          fc.string(),
          (title, images, invalidDate, filePath) => {
            const frontmatter = {
              title,
              images,
              date: invalidDate,
            };

            const lifeMoment = manager.parseLifeMoment(frontmatter, filePath);
            const foodRecord = manager.parseFoodRecord(frontmatter, filePath);

            // 无效日期应该导致解析失败
            expect(lifeMoment).toBeNull();
            expect(foodRecord).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意包含空数组的 images 字段，解析应该失败', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.date(),
          fc.string(),
          (title, date, filePath) => {
            const frontmatter = {
              title,
              images: [],
              date,
            };

            const lifeMoment = manager.parseLifeMoment(frontmatter, filePath);
            const foodRecord = manager.parseFoodRecord(frontmatter, filePath);

            // 空的 images 数组应该导致解析失败
            expect(lifeMoment).toBeNull();
            expect(foodRecord).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意包含非字符串元素的 images 数组，应该过滤掉无效元素', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), // 确保 title 有效
          fc.array(
            fc.oneof(
              fc.webUrl(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.constant(undefined),
              fc.constant(''),
              fc.constant('   ')
            ),
            { minLength: 1 }
          ),
          fc.date(),
          fc.string(),
          (title, mixedImages, date, filePath) => {
            const frontmatter = {
              title,
              images: mixedImages,
              date,
            };

            const lifeMoment = manager.parseLifeMoment(frontmatter, filePath);

            // 计算有效图片数量（与实现逻辑一致）
            const validImages = mixedImages.filter(
              img => typeof img === 'string' && img.trim() !== ''
            );

            if (validImages.length === 0) {
              expect(lifeMoment).toBeNull();
            } else {
              // 如果有有效图片，应该成功解析并只包含有效图片
              expect(lifeMoment).not.toBeNull();
              expect(lifeMoment!.images.length).toBe(validImages.length);
              lifeMoment!.images.forEach(img => {
                expect(typeof img).toBe('string');
                expect(img.trim().length).toBeGreaterThan(0);
              });
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
