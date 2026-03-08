/**
 * Logger 单元测试
 */

import { Logger } from './Logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('日志级别', () => {
    it('应该默认使用 info 级别', () => {
      logger.debug('debug message');
      logger.info('info message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('应该支持设置日志级别', () => {
      logger.setLevel('debug');
      logger.debug('debug message');

      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('应该在 warning 级别时只记录 warning 和 error', () => {
      logger.setLevel('warning');
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warning message');
      logger.error('error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('应该在 error 级别时只记录 error', () => {
      logger.setLevel('error');
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warning message');
      logger.error('error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('时间戳', () => {
    it('应该在日志消息中包含 ISO 时间戳', () => {
      logger.info('test message');

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logMessage = consoleInfoSpy.mock.calls[0][0];
      
      // 验证时间戳格式 [YYYY-MM-DDTHH:mm:ss.sssZ]
      expect(logMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('应该在日志消息中包含级别标签', () => {
      logger.info('test message');

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logMessage = consoleInfoSpy.mock.calls[0][0];
      
      expect(logMessage).toContain('[INFO]');
      expect(logMessage).toContain('test message');
    });
  });

  describe('详细模式', () => {
    it('应该在详细模式下输出错误堆栈跟踪', () => {
      const verboseLogger = new Logger('info', true);
      const error = new Error('test error');

      verboseLogger.error(error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // 消息 + 堆栈
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('test error');
      expect(consoleErrorSpy.mock.calls[1][0]).toContain('Error: test error');
    });

    it('应该在非详细模式下不输出错误堆栈跟踪', () => {
      const error = new Error('test error');

      logger.error(error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // 只有消息
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('test error');
    });

    it('应该支持设置详细模式', () => {
      logger.setVerbose(true);
      const error = new Error('test error');

      logger.error(error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('错误处理', () => {
    it('应该支持字符串错误消息', () => {
      logger.error('string error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('string error message');
    });

    it('应该支持 Error 对象', () => {
      const error = new Error('error object message');
      logger.error(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('error object message');
    });
  });

  describe('日志方法', () => {
    it('应该正确调用 debug 方法', () => {
      logger.setLevel('debug');
      logger.debug('debug message');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('debug message');
    });

    it('应该正确调用 info 方法', () => {
      logger.info('info message');

      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('[INFO]');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('info message');
    });

    it('应该正确调用 warn 方法', () => {
      logger.warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('warning message');
    });

    it('应该正确调用 error 方法', () => {
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('error message');
    });
  });
});
