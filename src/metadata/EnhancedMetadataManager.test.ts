import { EnhancedMetadataManager } from './EnhancedMetadataManager';
import {
  EnhancedDocumentMetadata,
  EnhancedArticle,
  EnhancedTool,
  LifeMoment,
  FoodRecord,
  ExerciseRecord,
  MusicRecommendation,
  MovieRecord,
  TVRecord,
  Article,
  Tool,
} from '../types/interfaces';

describe('EnhancedMetadataManager', () => {
  let manager: EnhancedMetadataManager;

  beforeEach(() => {
    manager = new EnhancedMetadataManager('./test-output');
  });

  describe('generateEnhanced', () => {
    it('should generate enhanced metadata with visual config', async () => {
      const options = {
        date: new Date('2024-01-15'),
        outputPath: './test-output',
      };

      const visualConfig = {
        coverImage: 'https://example.com/cover.jpg',
        backgroundImage: 'https://example.com/bg.jpg',
        goldenQuote: {
          content: '生活不止眼前的苟且',
          author: '高晓松',
        },
      };

      const metadata = await manager.generateEnhanced(options, visualConfig);

      expect(metadata.coverImage).toBe('https://example.com/cover.jpg');
      expect(metadata.backgroundImage).toBe('https://example.com/bg.jpg');
      expect(metadata.goldenQuote).toEqual({
        content: '生活不止眼前的苟且',
        author: '高晓松',
      });
      expect(metadata.issueNumber).toBeGreaterThan(0);
      expect(metadata.title).toContain('Weekly Issue');
    });

    it('should generate enhanced metadata without visual config', async () => {
      const options = {
        date: new Date('2024-01-15'),
        outputPath: './test-output',
      };

      const metadata = await manager.generateEnhanced(options);

      expect(metadata.coverImage).toBeUndefined();
      expect(metadata.backgroundImage).toBeUndefined();
      expect(metadata.goldenQuote).toBeUndefined();
      expect(metadata.issueNumber).toBeGreaterThan(0);
    });
  });

  describe('parseEnhancedArticle', () => {
    it('should parse article with cover image and personal reflection', () => {
      const baseArticle: Article = {
        title: 'Test Article',
        url: 'https://example.com/article',
        rating: 5,
        category: 'Article',
      };

      const frontmatter = {
        coverImage: 'https://example.com/article-cover.jpg',
        personalReflection: 'This article changed my perspective',
      };

      const enhanced = manager.parseEnhancedArticle(baseArticle, frontmatter);

      expect(enhanced.title).toBe('Test Article');
      expect(enhanced.coverImage).toBe('https://example.com/article-cover.jpg');
      expect(enhanced.personalReflection).toBe(
        'This article changed my perspective'
      );
    });

    it('should handle missing optional fields', () => {
      const baseArticle: Article = {
        title: 'Test Article',
        url: 'https://example.com/article',
        rating: 5,
        category: 'Article',
      };

      const frontmatter = {};

      const enhanced = manager.parseEnhancedArticle(baseArticle, frontmatter);

      expect(enhanced.title).toBe('Test Article');
      expect(enhanced.coverImage).toBeUndefined();
      expect(enhanced.personalReflection).toBeUndefined();
    });

    it('should support snake_case field names', () => {
      const baseArticle: Article = {
        title: 'Test Article',
        url: 'https://example.com/article',
        rating: 5,
        category: 'Article',
      };

      const frontmatter = {
        personal_reflection: 'Snake case reflection',
      };

      const enhanced = manager.parseEnhancedArticle(baseArticle, frontmatter);

      expect(enhanced.personalReflection).toBe('Snake case reflection');
    });
  });

  describe('parseEnhancedTool', () => {
    it('should parse tool with code snippet', () => {
      const baseTool: Tool = {
        title: 'Test Tool',
        url: 'https://example.com/tool',
        rating: 4,
        category: 'Development',
      };

      const frontmatter = {
        codeSnippet: 'console.log("hello")',
        language: 'javascript',
      };

      const enhanced = manager.parseEnhancedTool(baseTool, frontmatter);

      expect(enhanced.title).toBe('Test Tool');
      expect(enhanced.codeSnippet).toBe('console.log("hello")');
      expect(enhanced.language).toBe('javascript');
    });

    it('should handle missing optional fields', () => {
      const baseTool: Tool = {
        title: 'Test Tool',
        url: 'https://example.com/tool',
        rating: 4,
        category: 'Development',
      };

      const frontmatter = {};

      const enhanced = manager.parseEnhancedTool(baseTool, frontmatter);

      expect(enhanced.title).toBe('Test Tool');
      expect(enhanced.codeSnippet).toBeUndefined();
      expect(enhanced.language).toBeUndefined();
    });

    it('should support snake_case field names', () => {
      const baseTool: Tool = {
        title: 'Test Tool',
        url: 'https://example.com/tool',
        rating: 4,
        category: 'Development',
      };

      const frontmatter = {
        code_snippet: 'print("hello")',
      };

      const enhanced = manager.parseEnhancedTool(baseTool, frontmatter);

      expect(enhanced.codeSnippet).toBe('print("hello")');
    });
  });

  describe('parseLifeMoment', () => {
    it('should parse valid life moment', () => {
      const frontmatter = {
        title: '周末郊游',
        description: '在奥森公园玩得很开心',
        url: 'https://example.com/moment',
        images: ['https://example.com/photo.jpg'],
        date: '2024-01-14',
        tags: ['户外', '休闲'],
        category: '生活',
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).not.toBeNull();
      expect(lifeMoment!.title).toBe('周末郊游');
      expect(lifeMoment!.images).toEqual(['https://example.com/photo.jpg']);
      expect(lifeMoment!.date).toBeInstanceOf(Date);
      expect(lifeMoment!.path).toBe('/path/to/file.md');
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        description: '没有标题',
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).toBeNull();
    });

    it('should allow empty images array', () => {
      const frontmatter = {
        title: '周末郊游',
        images: [],
        date: '2024-01-14',
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).not.toBeNull();
      expect(lifeMoment!.images).toEqual([]);
    });

    it('should use created field as fallback for date', () => {
      const frontmatter = {
        title: '周末郊游',
        images: ['https://example.com/photo.jpg'],
        created: '2024-01-14',
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).not.toBeNull();
      expect(lifeMoment!.date).toBeInstanceOf(Date);
    });
  });

  describe('parseFoodRecord', () => {
    it('should parse valid food record', () => {
      const frontmatter = {
        title: '美味火锅',
        description: '味道很正宗',
        images: ['https://example.com/food.jpg'],
        date: '2024-01-15',
        rating: 5,
        location: '北京',
        category: '饮食',
      };

      const foodRecord = manager.parseFoodRecord(frontmatter, '/path/to/file.md');

      expect(foodRecord).not.toBeNull();
      expect(foodRecord!.title).toBe('美味火锅');
      expect(foodRecord!.rating).toBe(5);
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        rating: 5,
      };

      const foodRecord = manager.parseFoodRecord(frontmatter, '/path/to/file.md');

      expect(foodRecord).toBeNull();
    });

    it('should handle missing optional rating', () => {
      const frontmatter = {
        title: '美味火锅',
        images: ['https://example.com/food.jpg'],
        date: '2024-01-15',
      };

      const foodRecord = manager.parseFoodRecord(frontmatter, '/path/to/file.md');

      expect(foodRecord).not.toBeNull();
      expect(foodRecord!.rating).toBeUndefined();
    });
  });

  describe('parseExerciseRecord', () => {
    it('should parse valid exercise record', () => {
      const frontmatter = {
        type: '跑步',
        duration: 45,
        calories: 400,
        date: '2024-01-15',
        notes: '晨跑 5 公里',
        category: '运动',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).not.toBeNull();
      expect(exerciseRecord!.type).toBe('跑步');
      expect(exerciseRecord!.duration).toBe(45);
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        duration: 45,
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).toBeNull();
    });

    it('should handle missing optional calories', () => {
      const frontmatter = {
        type: '跑步',
        duration: 45,
        date: '2024-01-15',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).not.toBeNull();
      expect(exerciseRecord!.calories).toBeUndefined();
    });

    it('should parse duration as number from string', () => {
      const frontmatter = {
        type: '跑步',
        duration: '45',
        date: '2024-01-15',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).not.toBeNull();
      expect(exerciseRecord!.duration).toBe(45);
    });
  });

  describe('parseMusicRecommendation', () => {
    it('should parse valid music recommendation', () => {
      const frontmatter = {
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
        feeling: 'Epic and timeless',
        url: 'https://music.example.com/song',
        date: '2024-01-15',
        category: '音乐',
      };

      const musicRec = manager.parseMusicRecommendation(
        frontmatter,
        '/path/to/file.md'
      );

      expect(musicRec).not.toBeNull();
      expect(musicRec!.title).toBe('Bohemian Rhapsody');
      expect(musicRec!.artist).toBe('Queen');
      expect(musicRec!.album).toBe('A Night at the Opera');
      expect(musicRec!.feeling).toBe('Epic and timeless');
      expect(musicRec!.url).toBe('https://music.example.com/song');
      expect(musicRec!.path).toBe('/path/to/file.md');
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        album: '缺少标题和艺术家',
      };

      const musicRec = manager.parseMusicRecommendation(
        frontmatter,
        '/path/to/file.md'
      );

      expect(musicRec).toBeNull();
    });

    it('should handle missing optional fields', () => {
      const frontmatter = {
        title: 'Test Song',
        artist: 'Test Artist',
      };

      const musicRec = manager.parseMusicRecommendation(
        frontmatter,
        '/path/to/file.md'
      );

      expect(musicRec).not.toBeNull();
      expect(musicRec!.album).toBeUndefined();
      expect(musicRec!.feeling).toBeUndefined();
      expect(musicRec!.url).toBeUndefined();
      expect(musicRec!.date).toBeUndefined();
    });
  });

  describe('parseMovieRecord', () => {
    it('should parse valid movie record', () => {
      const frontmatter = {
        title: 'The Shawshank Redemption',
        director: 'Frank Darabont',
        year: 1994,
        rating: 9.3,
        review: 'Hope is a good thing.',
        url: 'https://www.imdb.com/title/tt0111161/',
        date: '2024-01-15',
        tags: ['drama', 'hope'],
        category: '电影',
      };

      const movieRecord = manager.parseMovieRecord(
        frontmatter,
        '/path/to/movie.md'
      );

      expect(movieRecord).not.toBeNull();
      expect(movieRecord!.title).toBe('The Shawshank Redemption');
      expect(movieRecord!.director).toBe('Frank Darabont');
      expect(movieRecord!.year).toBe(1994);
      expect(movieRecord!.rating).toBe(9.3);
      expect(movieRecord!.review).toBe('Hope is a good thing.');
      expect(movieRecord!.tags).toEqual(['drama', 'hope']);
    });

    it('should handle optional movie fields', () => {
      const frontmatter = {
        title: 'Inception',
      };

      const movieRecord = manager.parseMovieRecord(
        frontmatter,
        '/path/to/movie.md'
      );

      expect(movieRecord).not.toBeNull();
      expect(movieRecord!.title).toBe('Inception');
      expect(movieRecord!.director).toBeUndefined();
      expect(movieRecord!.rating).toBeUndefined();
    });

    it('should return null for invalid movie records', () => {
      const frontmatter = {
        // missing title
      };

      const movieRecord = manager.parseMovieRecord(
        frontmatter,
        '/path/to/movie.md'
      );

      expect(movieRecord).toBeNull();
    });
  });

  describe('parseTVRecord', () => {
    it('should parse valid TV record', () => {
      const frontmatter = {
        title: 'Breaking Bad',
        season: 5,
        episode: 16,
        status: 'completed',
        rating: 9.5,
        review: 'Best show ever.',
        url: 'https://www.imdb.com/title/tt0903747/',
        date: '2024-01-15',
        tags: ['crime', 'drama'],
        category: '电视剧',
      };

      const tvRecord = manager.parseTVRecord(frontmatter, '/path/to/tv.md');

      expect(tvRecord).not.toBeNull();
      expect(tvRecord!.title).toBe('Breaking Bad');
      expect(tvRecord!.season).toBe(5);
      expect(tvRecord!.episode).toBe(16);
      expect(tvRecord!.status).toBe('completed');
      expect(tvRecord!.rating).toBe(9.5);
      expect(tvRecord!.review).toBe('Best show ever.');
    });

    it('should handle optional TV fields', () => {
      const frontmatter = {
        title: 'Stranger Things',
      };

      const tvRecord = manager.parseTVRecord(frontmatter, '/path/to/tv.md');

      expect(tvRecord).not.toBeNull();
      expect(tvRecord!.title).toBe('Stranger Things');
      expect(tvRecord!.status).toBeUndefined();
      expect(tvRecord!.season).toBeUndefined();
    });

    it('should handle invalid TV status', () => {
      const frontmatter = {
        title: 'Dark',
        status: 'invalid-status',
      };

      const tvRecord = manager.parseTVRecord(frontmatter, '/path/to/tv.md');

      expect(tvRecord).not.toBeNull();
      expect(tvRecord!.status).toBeUndefined();
    });

    it('should return null for invalid TV records', () => {
      const frontmatter = {
        // missing title
      };

      const tvRecord = manager.parseTVRecord(frontmatter, '/path/to/tv.md');

      expect(tvRecord).toBeNull();
    });
  });

  describe('validateEnhancedMetadata', () => {
    it('should validate valid metadata', () => {
      const metadata = {
        coverImage: 'https://example.com/cover.jpg',
        backgroundImage: 'https://example.com/bg.jpg',
        goldenQuote: {
          content: '生活不止眼前的苟且',
          author: '高晓松',
        },
      };

      const result = manager.validateEnhancedMetadata(metadata);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept relative paths for images', () => {
      const metadata = {
        coverImage: './images/cover.jpg',
        backgroundImage: '../assets/bg.jpg',
      };

      const result = manager.validateEnhancedMetadata(metadata);

      expect(result.valid).toBe(true);
    });

    it('should accept absolute paths for images', () => {
      const metadata = {
        coverImage: '/absolute/path/to/cover.jpg',
      };

      const result = manager.validateEnhancedMetadata(metadata);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid golden quote format', () => {
      const metadata = {
        goldenQuote: {
          content: '只有内容没有作者',
        },
      };

      const result = manager.validateEnhancedMetadata(metadata);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Invalid goldenQuote format: must have content and author fields'
      );
    });

    it('should handle empty metadata', () => {
      const metadata = {};

      const result = manager.validateEnhancedMetadata(metadata);

      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only strings as missing', () => {
      const baseArticle: Article = {
        title: 'Test',
        url: 'test',
        rating: 3,
        category: 'Article',
      };
      const frontmatter = {
        personalReflection: '   ',
      };
      const enhanced = manager.parseEnhancedArticle(baseArticle, frontmatter);
      expect(enhanced.personalReflection).toBeUndefined();
    });

    it('should filter out empty strings from arrays', () => {
      const frontmatter = {
        title: 'Test',
        images: ['https://example.com/img.jpg', '  ', ''],
        date: '2024-01-01',
      };
      const lifeMoment = manager.parseLifeMoment(frontmatter, 'test.md');
      expect(lifeMoment!.images).toEqual(['https://example.com/img.jpg']);
    });

    it('should handle invalid date formats', () => {
      const frontmatter = {
        title: 'Test',
        images: ['img.jpg'],
        date: 'not-a-date',
      };
      const lifeMoment = manager.parseLifeMoment(frontmatter, 'test.md');
      expect(lifeMoment).toBeNull();
    });

    it('should handle non-numeric duration', () => {
      const frontmatter = {
        type: 'Run',
        duration: 'fast',
        date: '2024-01-01',
      };
      const exercise = manager.parseExerciseRecord(frontmatter, 'test.md');
      expect(exercise).toBeNull();
    });
  });
});
