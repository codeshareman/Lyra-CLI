import * as cron from 'node-cron';
import { IContentGenerator } from '../types/interfaces';

/**
 * 调度任务接口
 */
export interface IScheduler {
  /**
   * 启动调度器
   */
  start(): void;

  /**
   * 停止调度器
   */
  stop(): void;

  /**
   * 添加调度任务
   * @param templateType 模板类型
   * @param cronExpression Cron 表达式
   * @param options 生成选项
   */
  addTask(
    templateType: string,
    cronExpression: string,
    options?: Record<string, any>
  ): void;

  /**
   * 移除调度任务
   * @param templateType 模板类型
   */
  removeTask(templateType: string): void;

  /**
   * 获取下次执行时间
   * @param templateType 模板类型
   * @returns 下次执行时间，如果任务不存在则返回 null
   */
  getNextRunTime(templateType: string): Date | null;
}

/**
 * 调度任务配置
 */
interface ScheduledTask {
  templateType: string;
  cronExpression: string;
  options: Record<string, any>;
  task: cron.ScheduledTask;
}

/**
 * 调度器类
 * 负责定时自动执行内容生成任务
 */
export class Scheduler implements IScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private generator: IContentGenerator;
  private isRunning: boolean = false;

  constructor(generator: IContentGenerator) {
    this.generator = generator;
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      console.warn('调度器已经在运行中');
      return;
    }

    this.isRunning = true;
    this.tasks.forEach((scheduledTask) => {
      scheduledTask.task.start();
    });

    console.log(`调度器已启动，共 ${this.tasks.size} 个任务`);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('调度器未运行');
      return;
    }

    this.isRunning = false;
    this.tasks.forEach((scheduledTask) => {
      scheduledTask.task.stop();
    });

    console.log('调度器已停止');
  }

  /**
   * 添加调度任务
   */
  addTask(
    templateType: string,
    cronExpression: string,
    options: Record<string, any> = {}
  ): void {
    // 验证 Cron 表达式
    if (!cron.validate(cronExpression)) {
      throw new Error(`无效的 Cron 表达式: ${cronExpression}`);
    }

    // 如果任务已存在，先移除
    if (this.tasks.has(templateType)) {
      this.removeTask(templateType);
    }

    // 创建调度任务
    const task = cron.schedule(
      cronExpression,
      async () => {
        await this.executeTask(templateType, options);
      },
      {
        scheduled: false, // 不立即启动，等待 start() 调用
      }
    );

    // 保存任务
    this.tasks.set(templateType, {
      templateType,
      cronExpression,
      options,
      task,
    });

    // 如果调度器正在运行，立即启动新任务
    if (this.isRunning) {
      task.start();
    }

    console.log(`已添加调度任务: ${templateType} (${cronExpression})`);
  }

  /**
   * 移除调度任务
   */
  removeTask(templateType: string): void {
    const scheduledTask = this.tasks.get(templateType);
    if (!scheduledTask) {
      console.warn(`调度任务不存在: ${templateType}`);
      return;
    }

    scheduledTask.task.stop();
    this.tasks.delete(templateType);

    console.log(`已移除调度任务: ${templateType}`);
  }

  /**
   * 获取下次执行时间
   */
  getNextRunTime(templateType: string): Date | null {
    const scheduledTask = this.tasks.get(templateType);
    if (!scheduledTask) {
      return null;
    }

    // node-cron 不直接提供下次执行时间，需要手动计算
    // 这里使用 cron-parser 库来计算
    try {
      const parser = require('cron-parser');
      const interval = parser.parseExpression(scheduledTask.cronExpression);
      return interval.next().toDate();
    } catch (error) {
      console.error(`计算下次执行时间失败: ${error}`);
      return null;
    }
  }

  /**
   * 执行调度任务
   */
  private async executeTask(
    templateType: string,
    options: Record<string, any>
  ): Promise<void> {
    const startTime = new Date();
    console.log(
      `[${startTime.toISOString()}] 开始执行调度任务: ${templateType}`
    );

    try {
      const result = await this.generator.generate(templateType, options);

      if (result.success) {
        console.log(
          `[${new Date().toISOString()}] 调度任务执行成功: ${templateType}`
        );
        console.log(`  生成文件: ${result.filePath}`);
        console.log(`  ${result.message}`);
      } else {
        console.error(
          `[${new Date().toISOString()}] 调度任务执行失败: ${templateType}`
        );
        console.error(`  错误: ${result.message}`);
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] 调度任务执行异常: ${templateType}`
      );
      console.error(
        `  错误: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`  执行耗时: ${duration}ms`);
  }
}
