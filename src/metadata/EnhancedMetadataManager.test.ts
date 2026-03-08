import { EnhancedMetadataManager } from './EnhancedMetadataManager';
import {
  EnhancedDocumentMetadata,
  EnhancedArticle,
  EnhancedTool,
  LifeMoment,
  FoodRecord,
  ExerciseRecord,
  MusicRecommendation,
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
      };

      const frontmatter = {
        personal_reflection: 'Using snake case',
      };

      const enhanced = manager.parseEnhancedArticle(baseArticle, frontmatter);

      expect(enhanced.personalReflection).toBe('Using snake case');
    });
  });

  describe('parseEnhancedTool', () => {
    it('should parse tool with code snippet', () => {
      const baseTool: Tool = {
        title: 'Vite',
        url: 'https://vitejs.dev',
        rating: 5,
        category: '开发工具',
      };

      const frontmatter = {
        codeSnippet: 'npm create vite@latest',
        language: 'bash',
      };

      const enhanced = manager.parseEnhancedTool(baseTool, frontmatter);

      expect(enhanced.title).toBe('Vite');
      expect(enhanced.codeSnippet).toBe('npm create vite@latest');
      expect(enhanced.language).toBe('bash');
    });

    it('should handle missing optional fields', () => {
      const baseTool: Tool = {
        title: 'Vite',
        url: 'https://vitejs.dev',
        rating: 5,
        category: '开发工具',
      };

      const frontmatter = {};

      const enhanced = manager.parseEnhancedTool(baseTool, frontmatter);

      expect(enhanced.title).toBe('Vite');
      expect(enhanced.codeSnippet).toBeUndefined();
      expect(enhanced.language).toBeUndefined();
    });

    it('should support snake_case field names', () => {
      const baseTool: Tool = {
        title: 'Vite',
        url: 'https://vitejs.dev',
        rating: 5,
        category: '开发工具',
      };

      const frontmatter = {
        code_snippet: 'npm install vite',
      };

      const enhanced = manager.parseEnhancedTool(baseTool, frontmatter);

      expect(enhanced.codeSnippet).toBe('npm install vite');
    });
  });

  describe('parseLifeMoment', () => {
    it('should parse valid life moment', () => {
      const frontmatter = {
        title: '周末郊游',
        description: '阳光明媚的周末',
        images: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
        date: '2024-01-14',
        tags: ['旅行', '摄影'],
        category: '生活',
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).not.toBeNull();
      expect(lifeMoment!.title).toBe('周末郊游');
      expect(lifeMoment!.description).toBe('阳光明媚的周末');
      expect(lifeMoment!.images).toHaveLength(2);
      expect(lifeMoment!.date).toBeInstanceOf(Date);
      expect(lifeMoment!.tags).toEqual(['旅行', '摄影']);
      expect(lifeMoment!.path).toBe('/path/to/file.md');
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        description: '缺少标题和图片',
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
        title: '川菜火锅',
        description: '麻辣鲜香',
        images: ['https://example.com/food.jpg'],
        date: '2024-01-14',
        rating: 5,
        category: '美食',
      };

      const foodRecord = manager.parseFoodRecord(frontmatter, '/path/to/file.md');

      expect(foodRecord).not.toBeNull();
      expect(foodRecord!.title).toBe('川菜火锅');
      expect(foodRecord!.description).toBe('麻辣鲜香');
      expect(foodRecord!.images).toHaveLength(1);
      expect(foodRecord!.rating).toBe(5);
      expect(foodRecord!.path).toBe('/path/to/file.md');
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        description: '缺少标题和图片',
      };

      const foodRecord = manager.parseFoodRecord(frontmatter, '/path/to/file.md');

      expect(foodRecord).toBeNull();
    });

    it('should handle missing optional rating', () => {
      const frontmatter = {
        title: '川菜火锅',
        images: ['https://example.com/food.jpg'],
        date: '2024-01-14',
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
        calories: 350,
        date: '2024-01-15',
        notes: '晨跑5公里',
        category: '运动',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).not.toBeNull();
      expect(exerciseRecord!.type).toBe('跑步');
      expect(exerciseRecord!.duration).toBe(45);
      expect(exerciseRecord!.calories).toBe(350);
      expect(exerciseRecord!.notes).toBe('晨跑5公里');
      expect(exerciseRecord!.path).toBe('/path/to/file.md');
    });

    it('should return null for missing required fields', () => {
      const frontmatter = {
        notes: '缺少类型和时长',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).toBeNull();
    });

    it('should handle missing optional calories', () => {
      const frontmatter = {
        type: '瑜伽',
        duration: 30,
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
      expect(result.errors).toHaveLength(0);
    });

    it('should accept absolute paths for images', () => {
      const metadata = {
        coverImage: '/assets/cover.jpg',
      };

      const result = manager.validateEnhancedMetadata(metadata);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid golden quote format', () => {
      const metadata = {
        goldenQuote: {
          content: '生活不止眼前的苟且',
          // missing author
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
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only strings as missing', () => {
      const frontmatter = {
        title: '   ',
        images: ['https://example.com/photo.jpg'],
        date: '2024-01-14',
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).toBeNull();
    });

    it('should filter out empty strings from arrays', () => {
      const frontmatter = {
        title: 'Test',
        images: ['https://example.com/photo.jpg', '', '  '],
        date: '2024-01-14',
        tags: ['valid', '', '  ', 'another'],
      };

      const lifeMoment = manager.parseLifeMoment(frontmatter, '/path/to/file.md');

      expect(lifeMoment).not.toBeNull();
      expect(lifeMoment!.images).toHaveLength(1);
      expect(lifeMoment!.tags).toEqual(['valid', 'another']);
    });

    it('should handle invalid date formats', () => {
      const frontmatter = {
        type: '跑步',
        duration: 45,
        date: 'invalid-date',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).toBeNull();
    });

    it('should handle non-numeric duration', () => {
      const frontmatter = {
        type: '跑步',
        duration: 'not-a-number',
        date: '2024-01-15',
      };

      const exerciseRecord = manager.parseExerciseRecord(
        frontmatter,
        '/path/to/file.md'
      );

      expect(exerciseRecord).toBeNull();
    });
  });
});
