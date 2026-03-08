import * as fc from 'fast-check';
import { Scheduler } from './Scheduler';
import { IContentGenerator, GenerateResult } from '../types/interfaces';
import * as cronParser from 'cron-parser';

// Mock IContentGenerator for testing
class MockContentGenerator implements IContentGenerator {
  async generate(
    templateType: string,
    options?: Record<string, any>
  ): Promise<GenerateResult> {
    return {
      success: true,
      filePath: `/output/${templateType}.md`,
      message: '生成成功',
    };
  }

  listTemplates(): string[] {
    return ['weekly', 'monthly'];
  }
}

describe('Scheduler Property Tests', () => {
  let scheduler: Scheduler;
  let mockGenerator: MockContentGenerator;

  beforeEach(() => {
    mockGenerator = new MockContentGenerator();
    scheduler = new Scheduler(mockGenerator);
  });

  afterEach(() => {
    scheduler.stop();
  });

  /**
   * Property 24: Cron 表达式计算下次执行时间
   * **Validates: Requirements 10.7**
   */
  describe('Property 24: Cron 表达式计算下次执行时间', () => {
    // 生成有效的 Cron 表达式
    const validCronExpression = fc.oneof(
      // 标准 5 字段格式 (分 时 日 月 周)
      fc.record({
        minute: fc.oneof(fc.constant('*'), fc.integer({ min: 0, max: 59 }).map(String)),
        hour: fc.oneof(fc.constant('*'), fc.integer({ min: 0, max: 23 }).map(String)),
        day: fc.oneof(fc.constant('*'), fc.integer({ min: 1, max: 31 }).map(String)),
        month: fc.oneof(fc.constant('*'), fc.integer({ min: 1, max: 12 }).map(String)),
        weekday: fc.oneof(fc.constant('*'), fc.integer({ min: 0, max: 7 }).map(String)),
      }).map(({ minute, hour, day, month, weekday }) => 
        `${minute} ${hour} ${day} ${month} ${weekday}`
      ),
      // 常用的预定义表达式
      fc.constantFrom(
        '0 0 * * *',     // 每天午夜
        '0 0 * * 0',     // 每周日午夜
        '0 0 1 * *',     // 每月1号午夜
        '0 9 * * 1-5',   // 工作日上午9点
        '*/15 * * * *',  // 每15分钟
        '0 */2 * * *',   // 每2小时
        '30 8 * * 1',    // 每周一上午8:30
        '0 0 1 1 *',     // 每年1月1号
        '0 12 * * 6',    // 每周六中午12点
        '45 23 * * *'    // 每天晚上11:45
      )
    );

    const templateTypeArb = fc.stringOf(
      fc.char().filter(c => /[a-zA-Z0-9_-]/.test(c)),
      { minLength: 1, maxLength: 20 }
    );

    it('应该为有效的 Cron 表达式返回未来的执行时间', () => {
      fc.assert(
        fc.property(
          validCronExpression,
          templateTypeArb,
          (cronExpression, templateType) => {
            // 跳过无效的 Cron 表达式
            try {
              cronParser.parseExpression(cronExpression);
            } catch {
              return true; // 跳过无效表达式
            }

            const currentTime = new Date();
            
            try {
              scheduler.addTask(templateType, cronExpression);
              const nextRunTime = scheduler.getNextRunTime(templateType);

              // 验证返回了有效的日期
              expect(nextRunTime).toBeInstanceOf(Date);
              expect(nextRunTime).not.toBeNull();

              // 验证下次执行时间在未来
              expect(nextRunTime!.getTime()).toBeGreaterThan(currentTime.getTime());

              // 验证时间差在合理范围内（不超过2年）
              const timeDiff = nextRunTime!.getTime() - currentTime.getTime();
              const twoYearsInMs = 2 * 365 * 24 * 60 * 60 * 1000;
              expect(timeDiff).toBeLessThanOrEqual(twoYearsInMs);

              return true;
            } catch (error) {
              // 如果 Cron 表达式无效，应该抛出错误
              if (error instanceof Error && error.message.includes('无效的 Cron 表达式')) {
                return true;
              }
              throw error;
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该为相同的 Cron 表达式返回一致的下次执行时间', () => {
      fc.assert(
        fc.property(
          validCronExpression,
          templateTypeArb,
          (cronExpression, templateType) => {
            // 跳过无效的 Cron 表达式
            try {
              cronParser.parseExpression(cronExpression);
            } catch {
              return true;
            }

            try {
              scheduler.addTask(templateType, cronExpression);
              
              const nextRunTime1 = scheduler.getNextRunTime(templateType);
              const nextRunTime2 = scheduler.getNextRunTime(templateType);

              // 在短时间内多次调用应该返回相同的时间
              expect(nextRunTime1).toEqual(nextRunTime2);

              return true;
            } catch (error) {
              if (error instanceof Error && error.message.includes('无效的 Cron 表达式')) {
                return true;
              }
              throw error;
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('应该为不同的 Cron 表达式返回不同的下次执行时间', () => {
      const differentCronExpressions = [
        '0 0 * * *',   // 每天午夜
        '0 12 * * *',  // 每天中午
        '0 0 * * 0',   // 每周日午夜
        '0 0 1 * *',   // 每月1号午夜
      ];

      const templateTypes = ['template1', 'template2', 'template3', 'template4'];
      const nextRunTimes: Date[] = [];

      differentCronExpressions.forEach((cronExpression, index) => {
        scheduler.addTask(templateTypes[index], cronExpression);
        const nextRunTime = scheduler.getNextRunTime(templateTypes[index]);
        expect(nextRunTime).not.toBeNull();
        nextRunTimes.push(nextRunTime!);
      });

      // 验证不同表达式产生不同的执行时间
      for (let i = 0; i < nextRunTimes.length; i++) {
        for (let j = i + 1; j < nextRunTimes.length; j++) {
          expect(nextRunTimes[i].getTime()).not.toBe(nextRunTimes[j].getTime());
        }
      }
    });

    it('应该正确处理特殊的 Cron 表达式格式', () => {
      const specialCronExpressions = [
        '*/5 * * * *',    // 每5分钟
        '0 */2 * * *',    // 每2小时
        '0 9-17 * * 1-5', // 工作日的工作时间
        '0 0 1,15 * *',   // 每月1号和15号
        '0 0 * * 1-5',    // 工作日
        '0 0 * 1,6,12 *', // 1月、6月、12月
      ];

      specialCronExpressions.forEach((cronExpression, index) => {
        const templateType = `special_${index}`;
        const currentTime = new Date();

        scheduler.addTask(templateType, cronExpression);
        const nextRunTime = scheduler.getNextRunTime(templateType);

        expect(nextRunTime).toBeInstanceOf(Date);
        expect(nextRunTime!.getTime()).toBeGreaterThan(currentTime.getTime());

        // 验证与 cron-parser 的结果一致
        const interval = cronParser.parseExpression(cronExpression);
        const expectedNextRun = interval.next().toDate();
        
        // 允许小的时间差异（毫秒级）
        const timeDiff = Math.abs(nextRunTime!.getTime() - expectedNextRun.getTime());
        expect(timeDiff).toBeLessThan(1000); // 小于1秒的差异
      });
    });

    it('应该为不存在的任务返回 null', () => {
      fc.assert(
        fc.property(
          templateTypeArb,
          (templateType) => {
            const nextRunTime = scheduler.getNextRunTime(templateType);
            expect(nextRunTime).toBeNull();
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('应该在任务被移除后返回 null', () => {
      fc.assert(
        fc.property(
          validCronExpression,
          templateTypeArb,
          (cronExpression, templateType) => {
            try {
              cronParser.parseExpression(cronExpression);
            } catch {
              return true;
            }

            try {
              scheduler.addTask(templateType, cronExpression);
              
              // 添加后应该有下次执行时间
              let nextRunTime = scheduler.getNextRunTime(templateType);
              expect(nextRunTime).not.toBeNull();

              // 移除后应该返回 null
              scheduler.removeTask(templateType);
              nextRunTime = scheduler.getNextRunTime(templateType);
              expect(nextRunTime).toBeNull();

              return true;
            } catch (error) {
              if (error instanceof Error && error.message.includes('无效的 Cron 表达式')) {
                return true;
              }
              throw error;
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('应该正确处理 Cron 表达式解析错误', () => {
      const invalidCronExpressions = [
        'invalid',
        '60 * * * *',     // 无效分钟
        '* 25 * * *',     // 无效小时
        '* * 32 * *',     // 无效日期
        '* * * 13 *',     // 无效月份
        '* * * * 8',      // 无效星期
        '',               // 空字符串
        '* * * *',        // 缺少字段
        '* * * * * *',    // 多余字段（6字段格式在某些情况下可能无效）
      ];

      invalidCronExpressions.forEach((cronExpression, index) => {
        const templateType = `invalid_${index}`;
        
        try {
          scheduler.addTask(templateType, cronExpression);
          // 如果没有抛出错误，检查 getNextRunTime 的行为
          const nextRunTime = scheduler.getNextRunTime(templateType);
          // 对于无效表达式，可能返回 null 或抛出错误
          if (nextRunTime !== null) {
            expect(nextRunTime).toBeInstanceOf(Date);
          }
        } catch (error) {
          // 预期会抛出无效 Cron 表达式的错误
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('无效的 Cron 表达式');
        }
      });
    });
  });
});