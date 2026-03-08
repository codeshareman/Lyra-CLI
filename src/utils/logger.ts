import { ILogger, LogLevel } from '../types/interfaces';

/**
 * Simple console logger implementation
 */
export class Logger implements ILogger {
  private level: LogLevel;
  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warning: 2,
    error: 3
  };

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    }
  }

  warn(message: string): void {
    if (this.shouldLog('warning')) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
    }
  }

  error(message: string | Error): void {
    if (this.shouldLog('error')) {
      const errorMessage = message instanceof Error ? message.message : message;
      console.error(`[ERROR] ${new Date().toISOString()} - ${errorMessage}`);
      if (message instanceof Error && message.stack) {
        console.error(message.stack);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }
}
