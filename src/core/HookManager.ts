import path from 'path';
import {
  IHookManager,
  HookType,
  HookContext,
  HookFunction,
} from '../types/interfaces';

/**
 * HookManager 负责管理和执行用户自定义的钩子函数
 * 允许用户在不修改核心代码的情况下自定义筛选逻辑
 */
export class HookManager implements IHookManager {
  private hooks: Map<HookType, HookFunction>;

  constructor() {
    this.hooks = new Map();
  }

  /**
   * 注册钩子函数
   * @param hookType - 钩子类型
   * @param hookPath - 钩子函数文件路径
   * @throws 如果钩子文件无法加载或不是有效的函数
   */
  registerHook(hookType: HookType, hookPath: string): void {
    try {
      // 解析为绝对路径
      const absolutePath = path.resolve(hookPath);

      // 动态加载钩子模块
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const hookModule = require(absolutePath);

      // 获取导出的函数（支持 default 导出和直接导出）
      const hookFunction = hookModule.default || hookModule;

      // 验证是否为函数
      if (typeof hookFunction !== 'function') {
        throw new Error(`Hook at ${hookPath} is not a function`);
      }

      // 注册钩子
      this.hooks.set(hookType, hookFunction);
    } catch (error) {
      throw new Error(
        `Failed to register hook ${hookType} from ${hookPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 执行钩子函数
   * @param hookType - 钩子类型
   * @param context - 钩子上下文
   * @returns 钩子函数的返回值，如果钩子未注册或执行失败则返回原始数据
   */
  async executeHook(hookType: HookType, context: HookContext): Promise<any> {
    const hookFunction = this.hooks.get(hookType);

    // 如果钩子未注册，返回原始数据
    if (!hookFunction) {
      return context.data;
    }

    try {
      // 执行钩子函数（支持同步和异步）
      const result = await Promise.resolve(hookFunction(context));

      // 返回钩子函数的结果
      return result;
    } catch (error) {
      // 钩子执行失败时优雅降级，返回原始数据
      console.warn(
        `Hook ${hookType} execution failed, using default behavior: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return context.data;
    }
  }

  /**
   * 检查是否已注册指定类型的钩子
   * @param hookType - 钩子类型
   * @returns 如果已注册返回 true，否则返回 false
   */
  hasHook(hookType: HookType): boolean {
    return this.hooks.has(hookType);
  }

  /**
   * 清除所有已注册的钩子
   */
  clearHooks(): void {
    this.hooks.clear();
  }
}
