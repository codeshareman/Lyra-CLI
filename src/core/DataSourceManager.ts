import { DataSourceConfig, DataSourceInput, ValidationResult } from '../types/interfaces';

/**
 * DataSourceManager handles normalization and validation of data source configurations.
 * It supports flexible input formats: string, single object, or array of objects.
 */
export class DataSourceManager {
  /**
   * Normalize data source configuration to a standard array format
   * @param input - Data source input (string, object, or array)
   * @returns Normalized array of DataSourceConfig objects
   */
  static normalize(input: DataSourceInput): DataSourceConfig[] {
    // Handle string input (simple path)
    if (typeof input === 'string') {
      return [{
        path: input,
        include: ['**/*.md'],
        exclude: [],
        priority: 0
      }];
    }
    
    // Handle array input
    if (Array.isArray(input)) {
      return input.map(source => this.normalizeSource(source));
    }
    
    // Handle single object input
    return [this.normalizeSource(input)];
  }
  
  /**
   * Normalize a single data source configuration
   * @param source - Single data source config (string or object)
   * @returns Normalized DataSourceConfig object
   */
  private static normalizeSource(source: string | DataSourceConfig): DataSourceConfig {
    // Handle string in array
    if (typeof source === 'string') {
      return {
        path: source,
        include: ['**/*.md'],
        exclude: [],
        priority: 0
      };
    }
    
    // Handle object - apply defaults for optional fields
    return {
      path: source.path,
      include: source.include && source.include.length > 0 ? source.include : ['**/*.md'],
      exclude: source.exclude || [],
      priority: source.priority !== undefined ? source.priority : 0,
      alias: source.alias
    };
  }
  
  /**
   * Validate data source configurations
   * @param sources - Array of data source configurations
   * @returns Validation result with errors if any
   */
  static validate(sources: DataSourceConfig[]): ValidationResult {
    const errors: string[] = [];
    
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      
      // Validate path is required
      if (!source.path) {
        errors.push(`Data source at index ${i}: path is required`);
      }
      
      // Validate path is a string
      if (source.path && typeof source.path !== 'string') {
        errors.push(`Data source at index ${i}: path must be a string`);
      }
      
      // Validate priority is a number if provided
      if (source.priority !== undefined && typeof source.priority !== 'number') {
        errors.push(`Data source at index ${i} (${source.path}): priority must be a number`);
      }
      
      // Validate include is an array if provided
      if (source.include && !Array.isArray(source.include)) {
        errors.push(`Data source at index ${i} (${source.path}): include must be an array`);
      }
      
      // Validate exclude is an array if provided
      if (source.exclude && !Array.isArray(source.exclude)) {
        errors.push(`Data source at index ${i} (${source.path}): exclude must be an array`);
      }
      
      // Validate include patterns are strings
      if (source.include && Array.isArray(source.include)) {
        for (let j = 0; j < source.include.length; j++) {
          if (typeof source.include[j] !== 'string') {
            errors.push(`Data source at index ${i} (${source.path}): include pattern at index ${j} must be a string`);
          }
        }
      }
      
      // Validate exclude patterns are strings
      if (source.exclude && Array.isArray(source.exclude)) {
        for (let j = 0; j < source.exclude.length; j++) {
          if (typeof source.exclude[j] !== 'string') {
            errors.push(`Data source at index ${i} (${source.path}): exclude pattern at index ${j} must be a string`);
          }
        }
      }
      
      // Validate alias is a string if provided
      if (source.alias !== undefined && typeof source.alias !== 'string') {
        errors.push(`Data source at index ${i} (${source.path}): alias must be a string`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
