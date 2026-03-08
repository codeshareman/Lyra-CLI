import { Scheduler } from './Scheduler';
import { IContentGenerator, GenerateResult } from '../types/interfaces';

// Mock IContentGenerator
class MockContentGenerator implements IContentGenerator {
  public generateCalls: Array<{ templateType: string; options: any }> = [];
  public shouldSucceed: boolean = true;

  async generate(
    templateType: string,
    options?: Record<string, any>
  ): Promise<GenerateResult> {
    this.generateCalls.push({ templateType, options: options || {} });

    if (this.shouldSucceed) {
      return {
        success: true,
        filePath: `/output/${templateType}.md`,
        message: '生成成功',
      };
    } else {
      return {
        success: false,
        message: '生成失败',
      };
    }
  }

  listTemplates(): string[] {
    return ['weekly', 'monthly'];
  }
}

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockGenerator: MockContentGenerator;

  beforeEach(() => {
    mockGenerator = new MockContentGenerator();
    scheduler = new Scheduler(mockGenerator);
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('addTask', () => {
    it('应该成功添加有效的调度任务', () => {
      expect(() => {
        scheduler.addTask('weekly', '0 0 * * 1'); // 每周一 00:00
      }).not.toThrow();
    });

    it('应该拒绝无效的 Cron 表达式', () => {
      expect(() => {
        scheduler.addTask('weekly', 'invalid-cron');
      }).toThrow('无效的 Cron 表达式');
    });

    it('应该支持添加多个不同模板的任务', () => {
      scheduler.addTask('weekly', '0 0 * * 1');
      scheduler.addTask('monthly', '0 0 1 * *');

      expect(scheduler.getNextRunTime('weekly')).not.toBeNull();
      expect(scheduler.getNextRunTime('monthly')).not.toBeNull();
    });

    it('应该替换已存在的同名任务', () => {
      scheduler.addTask('weekly', '0 0 * * 1');
      scheduler.addTask('weekly', '0 0 * * 2'); // 替换为周二

      const nextRun = scheduler.getNextRunTime('weekly');
      expect(nextRun).not.toBeNull();
    });
  });

  describe('removeTask', () => {
    it('应该成功移除已存在的任务', () => {
      scheduler.addTask('weekly', '0 0 * * 1');
      scheduler.removeTask('weekly');

      expect(scheduler.getNextRunTime('weekly')).toBeNull();
    });

    it('应该优雅处理移除不存在的任务', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      scheduler.removeTask('nonexistent');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务不存在')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('start and stop', () => {
    it('应该启动调度器', () => {
      scheduler.addTask('weekly', '0 0 * * 1');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      scheduler.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度器已启动')
      );

      consoleSpy.mockRestore();
    });

    it('应该停止调度器', () => {
      scheduler.addTask('weekly', '0 0 * * 1');
      scheduler.start();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      scheduler.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度器已停止')
      );

      consoleSpy.mockRestore();
    });

    it('应该防止重复启动', () => {
      scheduler.start();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      scheduler.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度器已经在运行中')
      );

      consoleSpy.mockRestore();
    });

    it('应该优雅处理停止未运行的调度器', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      scheduler.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度器未运行')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getNextRunTime', () => {
    it('应该返回下次执行时间', () => {
      scheduler.addTask('weekly', '0 0 * * 1'); // 每周一 00:00

      const nextRun = scheduler.getNextRunTime('weekly');
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now());
    });

    it('应该为不存在的任务返回 null', () => {
      const nextRun = scheduler.getNextRunTime('nonexistent');
      expect(nextRun).toBeNull();
    });

    it('应该正确计算不同 Cron 表达式的下次执行时间', () => {
      // 每分钟执行
      scheduler.addTask('test1', '* * * * *');
      const nextRun1 = scheduler.getNextRunTime('test1');
      expect(nextRun1).not.toBeNull();

      // 每小时执行
      scheduler.addTask('test2', '0 * * * *');
      const nextRun2 = scheduler.getNextRunTime('test2');
      expect(nextRun2).not.toBeNull();

      // 下次执行时间应该不同
      expect(nextRun1!.getTime()).not.toBe(nextRun2!.getTime());
    });
  });

  describe('executeTask', () => {
    it('应该在调度时间到达时执行任务', async () => {
      // 使用每秒执行的 Cron 表达式进行测试
      scheduler.addTask('weekly', '* * * * * *', { date: '2024-01-01' });
      scheduler.start();

      // 等待任务执行
      await new Promise((resolve) => setTimeout(resolve, 1500));

      scheduler.stop();

      // 验证任务至少执行了一次
      expect(mockGenerator.generateCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockGenerator.generateCalls[0].templateType).toBe('weekly');
      expect(mockGenerator.generateCalls[0].options.date).toBe('2024-01-01');
    }, 3000);

    it('应该记录成功执行的日志', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      scheduler.addTask('weekly', '* * * * * *');
      scheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      scheduler.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('开始执行调度任务')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行成功')
      );

      consoleSpy.mockRestore();
    }, 3000);

    it('应该记录失败执行的日志并继续运行', async () => {
      mockGenerator.shouldSucceed = false;

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      scheduler.addTask('weekly', '* * * * * *');
      scheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      scheduler.stop();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行失败')
      );

      // 验证任务仍然执行了
      expect(mockGenerator.generateCalls.length).toBeGreaterThanOrEqual(1);

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 3000);

    it('应该处理任务执行异常', async () => {
      // 创建一个会抛出异常的 generator
      const errorGenerator: IContentGenerator = {
        async generate() {
          throw new Error('测试异常');
        },
        listTemplates() {
          return [];
        },
      };

      const errorScheduler = new Scheduler(errorGenerator);
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      errorScheduler.addTask('weekly', '* * * * * *');
      errorScheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      errorScheduler.stop();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行异常')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('测试异常')
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 3000);
  });

  describe('错误处理 (Error Handling)', () => {
    it('应该拒绝各种无效的 Cron 表达式', () => {
      const invalidExpressions = [
        '',                    // 空字符串
        'invalid',             // 完全无效
        '60 * * * *',         // 无效分钟 (>59)
        '* 25 * * *',         // 无效小时 (>23)
        '* * 32 * *',         // 无效日期 (>31)
        '* * * 13 *',         // 无效月份 (>12)
        '* * * * 8',          // 无效星期 (>7)
        '* * * *',            // 缺少字段
        'a b c d e',          // 非数字字符
        '*/0 * * * *',        // 除零错误
        '-1 * * * *',         // 负数
      ];

      invalidExpressions.forEach((expr, index) => {
        expect(() => {
          scheduler.addTask(`test_${index}`, expr);
        }).toThrow('无效的 Cron 表达式');
      });
    });

    it('应该处理 getNextRunTime 中的解析错误', () => {
      // 模拟 cron-parser 不可用的情况
      const originalRequire = require;
      jest.doMock('cron-parser', () => {
        throw new Error('模块不可用');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // 添加一个有效任务
      scheduler.addTask('test', '0 0 * * *');
      
      // 获取下次执行时间应该返回 null 并记录错误
      const nextRun = scheduler.getNextRunTime('test');
      expect(nextRun).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('计算下次执行时间失败')
      );

      consoleErrorSpy.mockRestore();
      jest.dontMock('cron-parser');
    });

    it('应该处理 Promise 拒绝的情况', async () => {
      // 创建一个返回被拒绝 Promise 的 generator
      const rejectGenerator: IContentGenerator = {
        async generate() {
          return Promise.reject(new Error('Promise 被拒绝'));
        },
        listTemplates() {
          return [];
        },
      };

      const rejectScheduler = new Scheduler(rejectGenerator);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      rejectScheduler.addTask('test', '* * * * * *');
      rejectScheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      rejectScheduler.stop();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行异常')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Promise 被拒绝')
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 3000);

    it('应该处理非 Error 对象的异常', async () => {
      // 创建一个抛出非 Error 对象的 generator
      const stringErrorGenerator: IContentGenerator = {
        async generate() {
          throw '字符串错误';
        },
        listTemplates() {
          return [];
        },
      };

      const stringErrorScheduler = new Scheduler(stringErrorGenerator);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      stringErrorScheduler.addTask('test', '* * * * * *');
      stringErrorScheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      stringErrorScheduler.stop();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行异常')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('字符串错误')
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 3000);

    it('应该处理 undefined 和 null 异常', async () => {
      // 创建一个抛出 undefined 的 generator
      const undefinedErrorGenerator: IContentGenerator = {
        async generate() {
          throw undefined;
        },
        listTemplates() {
          return [];
        },
      };

      const undefinedErrorScheduler = new Scheduler(undefinedErrorGenerator);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      undefinedErrorScheduler.addTask('test', '* * * * * *');
      undefinedErrorScheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      undefinedErrorScheduler.stop();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行异常')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('undefined')
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 3000);

    it('应该在任务执行失败后继续调度', async () => {
      let callCount = 0;
      const intermittentFailureGenerator: IContentGenerator = {
        async generate() {
          callCount++;
          if (callCount === 1) {
            throw new Error('第一次失败');
          }
          return {
            success: true,
            filePath: '/output/test.md',
            message: '生成成功',
          };
        },
        listTemplates() {
          return [];
        },
      };

      const intermittentScheduler = new Scheduler(intermittentFailureGenerator);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      intermittentScheduler.addTask('test', '* * * * * *');
      intermittentScheduler.start();

      // 等待足够长的时间让任务执行多次
      await new Promise((resolve) => setTimeout(resolve, 2500));

      intermittentScheduler.stop();

      // 验证第一次失败被记录
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行异常')
      );

      // 验证后续成功执行被记录
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度任务执行成功')
      );

      // 验证任务被调用了多次
      expect(callCount).toBeGreaterThan(1);

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 4000);

    it('应该正确记录执行耗时', async () => {
      // 创建一个有延迟的 generator
      const delayGenerator: IContentGenerator = {
        async generate() {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            success: true,
            filePath: '/output/test.md',
            message: '生成成功',
          };
        },
        listTemplates() {
          return [];
        },
      };

      const delayScheduler = new Scheduler(delayGenerator);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      delayScheduler.addTask('test', '* * * * * *');
      delayScheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      delayScheduler.stop();

      // 验证执行耗时被记录
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/执行耗时: \d+ms/)
      );

      consoleLogSpy.mockRestore();
    }, 3000);
  });

  describe('integration', () => {
    it('应该支持动态添加和移除任务', async () => {
      scheduler.start();

      // 添加第一个任务
      scheduler.addTask('weekly', '* * * * * *');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const calls1 = mockGenerator.generateCalls.length;
      expect(calls1).toBeGreaterThanOrEqual(1);

      // 移除任务
      scheduler.removeTask('weekly');
      mockGenerator.generateCalls = [];

      // 等待一段时间，确认任务不再执行
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(mockGenerator.generateCalls.length).toBe(0);

      // 添加新任务
      scheduler.addTask('monthly', '* * * * * *');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(mockGenerator.generateCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockGenerator.generateCalls[0].templateType).toBe('monthly');

      scheduler.stop();
    }, 6000);
  });
});
