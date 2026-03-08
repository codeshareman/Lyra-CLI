/**
 * Content Generator - 通用内容生成器
 * 
 * 主入口文件，负责初始化系统并导出公共 API
 */

import { TemplateRegistry } from './core/TemplateRegistry';
import { ContentGenerator } from './core/ContentGenerator';
import { ConfigManager } from './core/ConfigManager';
import { TemplateEngine } from './core/TemplateEngine';
import { HookManager } from './core/HookManager';
import { WeeklyDataProvider } from './providers/WeeklyDataProvider';
import { CLIInterface } from './cli/CLIInterface';
import { ILogger, LogLevel } from './types/interfaces';

/**
 * 简单的控制台 Logger 实现
 */
class ConsoleLogger implements ILogger {
  private level: LogLevel = 'info';
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warning: 2,
    error: 3,
  };

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string): void {
    if (this.levels[this.level] <= this.levels.debug) {
      console.debug(`[DEBUG] ${message}`);
    }
  }

  info(message: string): void {
    if (this.levels[this.level] <= this.levels.info) {
      console.info(`[INFO] ${message}`);
    }
  }

  warn(message: string): void {
    if (this.levels[this.level] <= this.levels.warning) {
      console.warn(`[WARN] ${message}`);
    }
  }

  error(message: string | Error): void {
    if (this.levels[this.level] <= this.levels.error) {
      const errorMessage = message instanceof Error ? message.message : message;
      console.error(`[ERROR] ${errorMessage}`);
    }
  }
}

/**
 * 初始化系统
 * @returns 初始化后的组件
 */
export function initializeSystem() {
  // 首先创建 logger，因为其他组件需要它
  const logger = new ConsoleLogger();

  // 创建 HookManager（需要在 ConfigManager 之前创建）
  const hookManager = new HookManager();

  // 创建核心组件，将 HookManager 传递给 ConfigManager
  const templateRegistry = new TemplateRegistry(logger);
  const configManager = new ConfigManager(hookManager);
  const templateEngine = new TemplateEngine();

  // 注册 Weekly 模板
  templateRegistry.registerTemplate('weekly', WeeklyDataProvider);

  // 创建内容生成器
  const contentGenerator = new ContentGenerator(
    templateRegistry,
    configManager,
    templateEngine,
    logger,
    hookManager
  );

  // 创建 CLI 接口
  const cli = new CLIInterface(contentGenerator, templateRegistry);
  cli.init();

  return {
    contentGenerator,
    templateRegistry,
    configManager,
    templateEngine,
    hookManager,
    logger,
    cli,
  };
}

/**
 * CLI 入口点
 */
export function runCLI() {
  const { cli } = initializeSystem();
  cli.parse(process.argv);
}

// 导出公共 API
export { TemplateRegistry } from './core/TemplateRegistry';
export { ContentGenerator } from './core/ContentGenerator';
export { ConfigManager } from './core/ConfigManager';
export { TemplateEngine } from './core/TemplateEngine';
export { HookManager } from './core/HookManager';
export { Scheduler } from './core/Scheduler';
export { WeeklyDataProvider } from './providers/WeeklyDataProvider';
export { CLIInterface } from './cli/CLIInterface';
export { Logger } from './core/Logger';
export { PlatformExporter } from './export/PlatformExporter';

// 导出类型
export * from './types/interfaces';
export * from './types/errors';
