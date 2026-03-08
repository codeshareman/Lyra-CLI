/**
 * Error codes for the content generator system
 */
export enum ErrorCode {
  E001 = 'TEMPLATE_NOT_FOUND',
  E002 = 'TEMPLATE_PARSE_ERROR',
  E003 = 'OUTPUT_DIR_ERROR',
  E004 = 'FILE_EXISTS',
  E005 = 'DATA_VALIDATION_ERROR',
  E006 = 'CONFIG_ERROR',
  E007 = 'SOURCE_NOT_FOUND',
  E008 = 'INVALID_DATE',
  E009 = 'METADATA_ERROR',
  E010 = 'RENDER_ERROR',
  E011 = 'REGISTRY_ERROR',
  E012 = 'SCHEDULE_ERROR',
  E013 = 'HOOK_LOAD_ERROR',
  E014 = 'HOOK_EXECUTION_ERROR',
  E015 = 'DATA_SOURCE_ERROR',
  E016 = 'GLOB_PATTERN_ERROR',
  E017 = 'AI_API_ERROR',
  E018 = 'SUMMARY_CACHE_ERROR',
  E019 = 'RATE_LIMIT_EXCEEDED'
}

/**
 * Base error class for content generator errors
 */
export class ContentGeneratorError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ContentGeneratorError';
  }
}

export class ConfigError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'ConfigError';
  }
}

export class TemplateError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'TemplateError';
  }
}

export class DataCollectionError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'DataCollectionError';
  }
}

export class FileSystemError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'FileSystemError';
  }
}

export class ValidationError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'ValidationError';
  }
}

export class RenderError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'RenderError';
  }
}

export class RegistryError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'RegistryError';
  }
}

export class ScheduleError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'ScheduleError';
  }
}

export class HookError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'HookError';
  }
}

export class DataSourceError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'DataSourceError';
  }
}

export class AIError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'AIError';
  }
}

export class CacheError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'CacheError';
  }
}

export class RateLimitError extends ContentGeneratorError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
    this.name = 'RateLimitError';
  }
}
