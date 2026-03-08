import { ILogger, LogLevel } from '../types/interfaces';

/**
 * Logger 类提供结构化的日志记录功能
 * 支持日志级别、时间戳和详细模式
 */
export class Logger implements ILogger {
  private level: LogLevel;
  private verbose: boolean;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warning: 2,
    error: 3,
  };

  constructor(level: LogLevel = 'info', verbose: boolean = false) {
    this.level = level;
    this.verbose = verbose;
  }

  /**
   * 设置日志级别
   * @param level - 日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 设置详细模式
   * @param verbose - 是否启用详细模式
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * 记录调试信息
   * @param message - 日志消息
   */
  debug(message: string): void {
    if (this.shouldLog('debug')) {
      this.log('DEBUG', message);
    }
  }

  /**
   * 记录一般信息
   * @param message - 日志消息
   */
  info(message: string): void {
    if (this.shouldLog('info')) {
      this.log('INFO', message);
    }
  }

  /**
   * 记录警告信息
   * @param message - 日志消息
   */
  warn(message: string): void {
    if (this.shouldLog('warning')) {
      this.log('WARN', message);
    }
  }

  /**
   * 记录错误信息
   * @param message - 日志消息或错误对象
   */
  error(message: string | Error): void {
    if (this.shouldLog('error')) {
      const errorMessage = message instanceof Error ? message.message : message;
      const stackTrace = message instanceof Error ? message.stack : undefined;
      
      this.log('ERROR', errorMessage);
      
      // 在详细模式下输出堆栈跟踪
      if (this.verbose && stackTrace) {
        console.error(stackTrace);
      }
    }
  }

  /**
   * 判断是否应该记录指定级别的日志
   * @param level - 日志级别
   * @returns 是否应该记录
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  /**
   * 输出格式化的日志消息
   * @param levelName - 日志级别名称
   * @param message - 日志消息
   */
  private log(levelName: string, message: string): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${levelName}] ${message}`;
    
    // 根据级别选择输出方法
    switch (levelName) {
      case 'DEBUG':
        console.debug(formattedMessage);
        break;
      case 'INFO':
        console.info(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'ERROR':
        console.error(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }
}
