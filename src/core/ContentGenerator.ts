import * as fs from 'fs/promises';
import * as path from 'path';
import {
  IContentGenerator,
  ITemplateRegistry,
  IConfigManager,
  ITemplateEngine,
  GenerateOptions,
  GenerateResult,
  ILogger,
  IHookManager,
  TemplateConfig,
  EnhancedTemplateConfig,
  ExportFormat,
} from '../types/interfaces';
import {
  TemplateError,
  FileSystemError,
  ValidationError,
  ErrorCode
} from '../types/errors';
import { PlatformExporter } from '../export/PlatformExporter';
import { DEFAULT_WECHAT_THEME } from '../constants/wechatThemes';

/**
 * Type guard to check if value is TemplateConfig
 */
function isTemplateConfig(value: any): value is TemplateConfig {
  return value && typeof value === 'object' && 'enabled' in value && 'template' in value;
}

/**
 * ContentGenerator 是核心协调器，负责整个内容生成流程的编排
 */
export class ContentGenerator implements IContentGenerator {
  private registry: ITemplateRegistry;
  private configManager: IConfigManager;
  private templateEngine: ITemplateEngine;
  private logger: ILogger;
  private hookManager?: IHookManager;

  constructor(
    registry: ITemplateRegistry,
    configManager: IConfigManager,
    templateEngine: ITemplateEngine,
    logger: ILogger,
    hookManager?: IHookManager
  ) {
    this.registry = registry;
    this.configManager = configManager;
    this.templateEngine = templateEngine;
    this.logger = logger;
    this.hookManager = hookManager;
  }

  /**
   * 生成指定类型的内容
   * @param templateType - 模板类型（如 'weekly', 'monthly'）
   * @param options - 生成选项
   * @returns 生成结果
   */
  async generate(templateType: string, options: GenerateOptions): Promise<GenerateResult> {
    try {
      this.logger.info(`开始生成 ${templateType} 内容`);
      const startTime = Date.now();

      // 1. 加载配置
      const config = await this.configManager.load(options.config);
      
      // 2. 确定配置文件目录用于路径解析
      const configDir = options.configDir || (options.config ? path.dirname(path.resolve(options.config)) : process.cwd());
      
      // 3. 验证配置
      const validation = this.configManager.validate(config);
      if (!validation.valid) {
        throw new ValidationError(
          ErrorCode.E006,
          `配置验证失败: ${validation.errors.join(', ')}`,
          { errors: validation.errors }
        );
      }

      // 3. 获取模板配置
      const templateConfig = this.configManager.getTemplateConfig(templateType);
      if (!templateConfig || !isTemplateConfig(templateConfig)) {
        const availableTemplates = this.listTemplates();
        throw new TemplateError(
          ErrorCode.E001,
          `模板类型不存在: ${templateType}`,
          { 
            templateType,
            availableTemplates
          }
        );
      }

      // 4. 检查模板是否启用
      if (!templateConfig.enabled) {
        return {
          success: false,
          message: `模板 ${templateType} 未启用`
        };
      }

      // 5. 从注册表获取 Data Provider 构造函数
      const ProviderConstructor = this.registry.getTemplateConstructor(templateType);
      if (!ProviderConstructor) {
        const availableTemplates = this.listTemplates();
        throw new TemplateError(
          ErrorCode.E001,
          `未找到模板类型: ${templateType}`,
          {
            templateType,
            availableTemplates
          }
        );
      }

      // 6. 实例化 Data Provider，传递配置目录用于路径解析
      const dataProvider = new ProviderConstructor(templateConfig, this.hookManager, configDir);

      // 7. 收集数据
      this.logger.info('正在收集数据...');
      const { date: rawDate, ...otherOptions } = options;
      const templateData = await dataProvider.collectData({
        ...otherOptions,
        date: rawDate ? new Date(rawDate) : new Date(),
        // TypeScript incorrectly infers templateConfig as string | TemplateConfig
        // Cast to any first to bypass the type check
        config: templateConfig as any,
        configDir: configDir, // 传递配置文件目录
      });
      const totalContentItems = this.countStatistics(templateData.statistics);
      const shouldLogProgress = totalContentItems > 100;
      this.logLargeDatasetProgress(shouldLogProgress, 1, 3, `数据收集完成（${totalContentItems} 条）`);

      // 8. 验证数据
      this.logger.info('正在验证数据...');
      const dataValidation = dataProvider.validateData(templateData);
      if (!dataValidation.valid) {
        throw new ValidationError(
          ErrorCode.E005,
          `数据验证失败: ${dataValidation.errors.join(', ')}`,
          { errors: dataValidation.errors }
        );
      }
      this.logLargeDatasetProgress(shouldLogProgress, 2, 3, '数据验证完成');

      // 9. 获取模板路径
      const templatePath = dataProvider.getTemplatePath();
      
      // 解析模板路径为绝对路径（相对于配置文件目录）
      const resolvedTemplatePath = path.resolve(configDir, templatePath);
      
      // 检查模板文件是否存在
      try {
        await fs.access(resolvedTemplatePath);
      } catch (error) {
        throw new TemplateError(
          ErrorCode.E001,
          `模板文件不存在: ${templatePath} (解析为: ${resolvedTemplatePath})`,
          { templatePath: resolvedTemplatePath }
        );
      }

      // 10. 渲染模板
      this.logger.info('正在渲染模板...');
      const renderedContent = await this.templateEngine.render(resolvedTemplatePath, templateData);
      this.logLargeDatasetProgress(shouldLogProgress, 3, 3, '模板渲染完成');

      // 11. 如果是预览模式，输出内容并返回
      if (options.dryRun) {
        this.logger.info('预览模式：不创建文件');
        console.log('\n--- 生成的内容 ---\n');
        console.log(renderedContent);
        console.log('\n--- 统计信息 ---');
        console.log(JSON.stringify(templateData.statistics, null, 2));
        
        return {
          success: true,
          message: '预览模式：内容已输出到控制台',
          statistics: templateData.statistics
        };
      }

      // 12. 生成输出文件名
      const outputFilename = this.generateFilename(
        templateConfig.output.filename,
        templateData.metadata
      );
      
      // 解析输出路径为绝对路径（相对于配置文件目录）
      const resolvedOutputPath = path.resolve(configDir, templateConfig.output.path);
      const outputPath = path.join(resolvedOutputPath, outputFilename);

      // 13. 创建输出目录（如果不存在）
      try {
        await fs.mkdir(resolvedOutputPath, { recursive: true });
      } catch (error: any) {
        throw new FileSystemError(
          ErrorCode.E003,
          `无法创建输出目录: ${templateConfig.output.path} (解析为: ${resolvedOutputPath})`,
          { path: resolvedOutputPath, error: error?.message }
        );
      }

      // 14. 检查文件是否已存在（同一周期内允许覆盖）
      let fileExists = false;
      try {
        await fs.access(outputPath);
        fileExists = true;
        
        // 如果文件存在，检查是否为同一周期
        if (templateType === 'weekly') {
          const existingContent = await fs.readFile(outputPath, 'utf-8');
          const matter = await import('gray-matter');
          const { data: existingData } = matter.default(existingContent);
          
          // 检查是否为同一周期（通过比较 weekStart 和 weekEnd）
          const currentWeekStart = templateData.metadata.weekStart;
          const currentWeekEnd = templateData.metadata.weekEnd;
          
          // 支持两种字段名格式：weekStart/weekEnd 和 week_start/week_end
          const existingWeekStart = existingData.weekStart || existingData.week_start;
          const existingWeekEnd = existingData.weekEnd || existingData.week_end;
          
          // 将日期统一转换为 YYYY-MM-DD 格式进行比较
          const formatDate = (date: any): string => {
            if (typeof date === 'string') {
              return date;
            }
            if (date instanceof Date) {
              return date.toISOString().split('T')[0];
            }
            return String(date);
          };
          
          const currentWeekStartFormatted = formatDate(currentWeekStart);
          const currentWeekEndFormatted = formatDate(currentWeekEnd);
          const existingWeekStartFormatted = formatDate(existingWeekStart);
          const existingWeekEndFormatted = formatDate(existingWeekEnd);
          
          this.logger.info(`当前周期: ${currentWeekStartFormatted} ~ ${currentWeekEndFormatted}`);
          this.logger.info(`已存在文档周期: ${existingWeekStartFormatted} ~ ${existingWeekEndFormatted}`);
          
          if (currentWeekStartFormatted === existingWeekStartFormatted && currentWeekEndFormatted === existingWeekEndFormatted) {
            // 同一周期，允许覆盖
            this.logger.info(`检测到同一周期的文档，将覆盖: ${outputPath}`);
          } else {
            // 不同周期，不允许覆盖
            throw new FileSystemError(
              ErrorCode.E004,
              `目标文件已存在且属于不同周期: ${outputPath}`,
              { path: outputPath }
            );
          }
        } else {
          // 非 weekly 模板，不允许覆盖
          throw new FileSystemError(
            ErrorCode.E004,
            `目标文件已存在: ${outputPath}`,
            { path: outputPath }
          );
        }
      } catch (error: any) {
        if (error?.code === ErrorCode.E004) {
          throw error;
        }
        // 文件不存在或其他错误，继续执行
      }

      // 15. 写入文件（UTF-8 编码，LF 换行符）
      this.logger.info(`正在写入文件: ${outputPath}`);
      const contentWithLF = renderedContent.replace(/\r\n/g, '\n');
      try {
        await fs.writeFile(outputPath, contentWithLF, { encoding: 'utf-8' });
      } catch (error: any) {
        throw new FileSystemError(
          ErrorCode.E003,
          `写入文件失败: ${outputPath}`,
          { path: outputPath, error: error?.message }
        );
      }

      // 16. 按需导出 HTML / WeChat 格式
      const exportedFiles = await this.writeAdditionalExports(
        templateConfig,
        templateData,
        contentWithLF,
        outputPath
      );

      if (exportedFiles.length > 0) {
        this.logger.info(`附加导出完成: ${exportedFiles.join(', ')}`);
      }

      // 17. 更新上期文档元数据（如果适用）
      if (templateData.metadata.issueNumber && templateData.metadata.issueNumber > 1) {
        try {
          // 这里假设 Data Provider 有 MetadataManager
          // 实际实现中，MetadataManager 应该在 Data Provider 中调用
          this.logger.debug('上期文档元数据更新由 Data Provider 处理');
        } catch (error: any) {
          this.logger.warn(`更新上期文档失败: ${error?.message}`);
        }
      }

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      this.logger.info(`内容生成完成，耗时 ${duration} 秒`);
      this.logger.info(`文件已保存到: ${outputPath}`);

      return {
        success: true,
        filePath: outputPath,
        message:
          exportedFiles.length > 0
            ? `成功生成 ${templateType} 内容，并导出 ${exportedFiles.length} 个附加文件`
            : `成功生成 ${templateType} 内容`,
        statistics: templateData.statistics
      };

    } catch (error: any) {
      this.logger.error(`生成失败: ${error?.message}`);
      
      return {
        success: false,
        message: `生成失败: ${error?.message}`,
        statistics: undefined
      };
    }
  }

  /**
   * 获取所有可用的模板类型
   * @returns 模板类型列表
   */
  listTemplates(): string[] {
    const templates = this.registry.listTemplates();
    return templates.map(t => t.name);
  }

  /**
   * 生成输出文件名
   * @param filenameTemplate - 文件名模板（支持 {{变量}} 占位符）
   * @param metadata - 元数据对象
   * @returns 生成的文件名
   */
  private generateFilename(filenameTemplate: string, metadata: Record<string, any>): string {
    let filename = filenameTemplate;

    // 替换所有 {{变量}} 占位符
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    filename = filename.replace(placeholderRegex, (match, key) => {
      const value = metadata[key];
      if (value !== undefined && value !== null) {
        return String(value);
      }
      return match; // 保留未找到的占位符
    });

    return filename;
  }

  private countStatistics(statistics?: Record<string, any>): number {
    if (!statistics || typeof statistics !== 'object') {
      return 0;
    }

    return Object.values(statistics).reduce((total, value) => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return total + value;
      }
      return total;
    }, 0);
  }

  private logLargeDatasetProgress(
    shouldLogProgress: boolean,
    step: number,
    totalSteps: number,
    message: string
  ): void {
    if (!shouldLogProgress) {
      return;
    }

    this.logger.info(`处理进度 ${step}/${totalSteps}: ${message}`);
  }

  private async writeAdditionalExports(
    templateConfig: TemplateConfig,
    templateData: { metadata?: Record<string, any> },
    markdownContent: string,
    markdownPath: string
  ): Promise<string[]> {
    const formats = this.resolveExportFormats(templateConfig).filter(
      (format) => format !== 'markdown'
    );

    if (formats.length === 0) {
      return [];
    }

    const enhanced = templateConfig as EnhancedTemplateConfig;
    const exporter = new PlatformExporter();
    const exportedFiles: string[] = [];
    const backgroundImage =
      templateData.metadata?.backgroundImage || enhanced.visual?.backgroundImage;
    const backgroundPreset = enhanced.export?.wechat?.backgroundPreset || 'grid';
    const validateWechatImages = enhanced.export?.wechat?.validateImages ?? true;
    const wechatTheme = enhanced.export?.wechat?.theme || DEFAULT_WECHAT_THEME;
    const imageProxyUrl = enhanced.export?.wechat?.imageProxyUrl;
    const inaccessibleImageDomains = enhanced.export?.wechat?.inaccessibleImageDomains;
    const imageOptimization = enhanced.export?.wechat?.imageOptimization;

    for (const format of formats) {
      const exportResult = await exporter.export(markdownContent, format, {
        includeStyles: true,
        // 微信导出默认使用稳定的背景预设，避免随机背景图导致观感和可读性不稳定。
        backgroundImage: format === 'wechat' ? undefined : backgroundImage,
        backgroundPreset: format === 'wechat' ? backgroundPreset : undefined,
        wechatTheme: format === 'wechat' ? wechatTheme : undefined,
        validateImages: format === 'wechat' ? validateWechatImages : false,
        imageProxyUrl: format === 'wechat' ? imageProxyUrl : undefined,
        inaccessibleImageDomains: format === 'wechat' ? inaccessibleImageDomains : undefined,
        imageOptimization: format === 'wechat' ? imageOptimization : undefined,
      });

      const exportPath = this.getExportFilePath(markdownPath, format);
      const normalizedContent = exportResult.content.replace(/\r\n/g, '\n');

      await fs.writeFile(exportPath, normalizedContent, { encoding: 'utf-8' });
      exportedFiles.push(exportPath);

      if (exportResult.warnings.length > 0) {
        exportResult.warnings.forEach((warning) => this.logger.warn(`[${format}] ${warning}`));
      }
    }

    return exportedFiles;
  }

  private resolveExportFormats(templateConfig: TemplateConfig): ExportFormat[] {
    const enhanced = templateConfig as EnhancedTemplateConfig;
    const rawFormats = enhanced.export?.formats;
    const supportedFormats: ExportFormat[] = ['markdown', 'html', 'wechat'];

    if (!Array.isArray(rawFormats) || rawFormats.length === 0) {
      return ['markdown'];
    }

    const normalizedFormats = rawFormats.filter((format): format is ExportFormat =>
      supportedFormats.includes(format)
    );

    if (normalizedFormats.length === 0) {
      return ['markdown'];
    }

    return Array.from(new Set(normalizedFormats));
  }

  private getExportFilePath(markdownPath: string, format: ExportFormat): string {
    const extension = path.extname(markdownPath);
    const basePath = extension ? markdownPath.slice(0, -extension.length) : markdownPath;

    if (format === 'html') {
      return `${basePath}.html`;
    }

    if (format === 'wechat') {
      return `${basePath}.wechat.html`;
    }

    return markdownPath;
  }
}
