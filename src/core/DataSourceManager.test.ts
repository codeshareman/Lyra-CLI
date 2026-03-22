import { DataSourceManager } from './DataSourceManager';
import { DataSourceConfig, DataSourceInput } from '../types/interfaces';

describe('DataSourceManager', () => {
  describe('normalize', () => {
    it('should normalize string input to DataSourceConfig array with defaults', () => {
      const input: DataSourceInput = 'path/to/source';
      const result = DataSourceManager.normalize(input);
      
      expect(result).toEqual([{
        path: 'path/to/source',
        include: ['**/*.md'],
        exclude: [],
        priority: 0
      }]);
    });
    
    it('should normalize single object input with all fields', () => {
      const input: DataSourceInput = {
        path: 'path/to/source',
        include: ['**/*.txt'],
        exclude: ['**/draft/**'],
        priority: 5,
        alias: 'my-source'
      };
      const result = DataSourceManager.normalize(input);
      
      expect(result).toEqual([{
        path: 'path/to/source',
        include: ['**/*.txt'],
        exclude: ['**/draft/**'],
        priority: 5,
        alias: 'my-source'
      }]);
    });
    
    it('should normalize single object input with partial fields and apply defaults', () => {
      const input: DataSourceInput = {
        path: 'path/to/source'
      };
      const result = DataSourceManager.normalize(input);
      
      expect(result).toEqual([{
        path: 'path/to/source',
        include: ['**/*.md'],
        exclude: [],
        priority: 0,
        alias: undefined
      }]);
    });
    
    it('should normalize array of strings', () => {
      const input: any = ['path/to/source1', 'path/to/source2'];
      const result = DataSourceManager.normalize(input);
      
      expect(result).toEqual([
        {
          path: 'path/to/source1',
          include: ['**/*.md'],
          exclude: [],
          priority: 0
        },
        {
          path: 'path/to/source2',
          include: ['**/*.md'],
          exclude: [],
          priority: 0
        }
      ]);
    });
    
    it('should normalize array of objects', () => {
      const input: DataSourceInput = [
        {
          path: 'path/to/source1',
          priority: 1
        },
        {
          path: 'path/to/source2',
          include: ['**/*.txt'],
          priority: 2,
          alias: 'source2'
        }
      ];
      const result = DataSourceManager.normalize(input);
      
      expect(result).toEqual([
        {
          path: 'path/to/source1',
          include: ['**/*.md'],
          exclude: [],
          priority: 1,
          alias: undefined
        },
        {
          path: 'path/to/source2',
          include: ['**/*.txt'],
          exclude: [],
          priority: 2,
          alias: 'source2'
        }
      ]);
    });
    
    it('should normalize mixed array of strings and objects', () => {
      const input: any = [
        'path/to/source1',
        {
          path: 'path/to/source2',
          priority: 3
        }
      ];
      const result = DataSourceManager.normalize(input);
      
      expect(result).toEqual([
        {
          path: 'path/to/source1',
          include: ['**/*.md'],
          exclude: [],
          priority: 0
        },
        {
          path: 'path/to/source2',
          include: ['**/*.md'],
          exclude: [],
          priority: 3,
          alias: undefined
        }
      ]);
    });
    
    it('should handle priority 0 explicitly set', () => {
      const input: DataSourceInput = {
        path: 'path/to/source',
        priority: 0
      };
      const result = DataSourceManager.normalize(input);
      
      expect(result[0].priority).toBe(0);
    });
    
    it('should preserve empty arrays for include and exclude', () => {
      const input: DataSourceInput = {
        path: 'path/to/source',
        include: [],
        exclude: []
      };
      const result = DataSourceManager.normalize(input);
      
      expect(result[0].include).toEqual(['**/*.md']);
      expect(result[0].exclude).toEqual([]);
    });
  });
  
  describe('validate', () => {
    it('should validate valid data source configurations', () => {
      const sources: DataSourceConfig[] = [
        {
          path: 'path/to/source',
          include: ['**/*.md'],
          exclude: [],
          priority: 0
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    
    it('should reject data source without path', () => {
      const sources: DataSourceConfig[] = [
        {
          path: '',
          include: ['**/*.md'],
          exclude: [],
          priority: 0
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0: path is required');
    });
    
    it('should reject data source with non-string path', () => {
      const sources: any[] = [
        {
          path: 123,
          include: ['**/*.md'],
          exclude: [],
          priority: 0
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0: path must be a string');
    });
    
    it('should reject data source with non-number priority', () => {
      const sources: any[] = [
        {
          path: 'path/to/source',
          priority: '5'
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0 (path/to/source): priority must be a number');
    });
    
    it('should reject data source with non-array include', () => {
      const sources: any[] = [
        {
          path: 'path/to/source',
          include: '**/*.md'
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0 (path/to/source): include must be an array');
    });
    
    it('should reject data source with non-array exclude', () => {
      const sources: any[] = [
        {
          path: 'path/to/source',
          exclude: '**/draft/**'
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0 (path/to/source): exclude must be an array');
    });
    
    it('should reject data source with non-string include patterns', () => {
      const sources: any[] = [
        {
          path: 'path/to/source',
          include: ['**/*.md', 123, '**/*.txt']
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0 (path/to/source): include pattern at index 1 must be a string');
    });
    
    it('should reject data source with non-string exclude patterns', () => {
      const sources: any[] = [
        {
          path: 'path/to/source',
          exclude: ['**/draft/**', null, '**/archive/**']
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0 (path/to/source): exclude pattern at index 1 must be a string');
    });
    
    it('should reject data source with non-string alias', () => {
      const sources: any[] = [
        {
          path: 'path/to/source',
          alias: 123
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data source at index 0 (path/to/source): alias must be a string');
    });
    
    it('should validate multiple data sources and collect all errors', () => {
      const sources: any[] = [
        {
          path: '',
          priority: 'invalid'
        },
        {
          path: 'valid/path',
          include: 'not-an-array'
        },
        {
          path: 'another/path',
          exclude: ['valid', 123]
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Data source at index 0: path is required');
      expect(result.errors).toContain('Data source at index 0 (): priority must be a number');
      expect(result.errors).toContain('Data source at index 1 (valid/path): include must be an array');
      expect(result.errors).toContain('Data source at index 2 (another/path): exclude pattern at index 1 must be a string');
    });
    
    it('should accept data source with undefined optional fields', () => {
      const sources: DataSourceConfig[] = [
        {
          path: 'path/to/source'
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    
    it('should accept data source with priority 0', () => {
      const sources: DataSourceConfig[] = [
        {
          path: 'path/to/source',
          priority: 0
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    
    it('should accept data source with negative priority', () => {
      const sources: DataSourceConfig[] = [
        {
          path: 'path/to/source',
          priority: -1
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    
    it('should accept empty arrays for include and exclude', () => {
      const sources: DataSourceConfig[] = [
        {
          path: 'path/to/source',
          include: [],
          exclude: []
        }
      ];
      const result = DataSourceManager.validate(sources);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
  
  describe('integration: normalize and validate', () => {
    it('should normalize and validate string input successfully', () => {
      const input: DataSourceInput = 'path/to/source';
      const normalized = DataSourceManager.normalize(input);
      const validation = DataSourceManager.validate(normalized);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
    
    it('should normalize and validate object input successfully', () => {
      const input: DataSourceInput = {
        path: 'path/to/source',
        include: ['**/*.md'],
        priority: 5
      };
      const normalized = DataSourceManager.normalize(input);
      const validation = DataSourceManager.validate(normalized);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
    
    it('should normalize and validate array input successfully', () => {
      const input: any = [
        'path/to/source1',
        {
          path: 'path/to/source2',
          priority: 2
        }
      ];
      const normalized = DataSourceManager.normalize(input);
      const validation = DataSourceManager.validate(normalized);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });
});
