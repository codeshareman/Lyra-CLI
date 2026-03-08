import * as prompts from '@clack/prompts';
import { IContentGenerator, ITemplateRegistry } from '../types/interfaces';
import { ConfigManager } from '../core/ConfigManager';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 交互式CLI界面
 * 提供友好的用户交互体验
 */
export class InteractiveCLI {
  private contentGenerator: IContentGenerator;
  private templateRegistry: ITemplateRegistry;

  constructor(
    contentGenerator: IContentGenerator,
    templateRegistry: ITemplateRegistry
  ) {
    this.contentGenerator = contentGenerator;
    this.templateRegistry = templateRegistry;
  }

  /**
   * 启动交互式界面
   */
  async start(): Promise<void> {
    prompts.intro('🚀 Content Generator');

    try {
      // 1. 选择操作类型
      const action = await prompts.select({
        message: '你想要做什么？',
        options: [
          { value: 'create', label: '📝 生成内容', hint: '创建新的内容文档' },
          { value: 'list', label: '📋 查看模板', hint: '列出所有可用模板' },
          { value: 'schedule', label: '⏰ 启动调度器', hint: '定时自动生成内容' },
          { value: 'init', label: '⚙️ 初始化配置', hint: '创建配置文件' },
        ],
      });

      if (prompts.isCancel(action)) {
        prompts.cancel('操作已取消');
        process.exit(0);
      }

      switch (action) {
        case 'create':
          await this.handleInteractiveCreate();
          break;
        case 'list':
          await this.handleInteractiveList();
          break;
        case 'schedule':
          await this.handleInteractiveSchedule();
          break;
        case 'init':
          await this.handleInteractiveInit();
          break;
      }

      prompts.outro('✨ 操作完成！');
    } catch (error) {
      prompts.cancel(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  /**
   * 交互式内容生成
   */
  private async handleInteractiveCreate(): Promise<void> {
    const templates = this.templateRegistry.listTemplates();
    
    if (templates.length === 0) {
      prompts.note('没有可用的模板类型', '请先配置模板');
      return;
    }

    // 选择模板
    const templateType = await prompts.select({
      message: '选择模板类型',
      options: templates.map(t => ({
        value: t.name,
        label: `${t.name}`,
        hint: t.description
      }))
    });

    if (prompts.isCancel(templateType)) {
      return;
    }

    // 查找配置文件
    const configPath = await this.findConfigFile();
    if (!configPath) {
      const shouldCreateConfig = await prompts.confirm({
        message: '未找到配置文件，是否创建？',
        initialValue: true
      });

      if (prompts.isCancel(shouldCreateConfig) || !shouldCreateConfig) {
        return;
      }

      await this.createDefaultConfig();
    }

    // 高级选项
    const advancedOptions = await prompts.confirm({
      message: '是否配置高级选项？',
      initialValue: false
    });

    let options: any = {};

    if (!prompts.isCancel(advancedOptions) && advancedOptions) {
      // 预览模式
      const dryRun = await prompts.confirm({
        message: '启用预览模式？（不创建文件）',
        initialValue: false
      });

      // 详细日志
      const verbose = await prompts.confirm({
        message: '启用详细日志？',
        initialValue: false
      });

      // 自定义日期（仅Weekly模板）
      let customDate;
      if (templateType === 'weekly') {
        const useCustomDate = await prompts.confirm({
          message: '使用自定义基准日期？',
          initialValue: false
        });

        if (!prompts.isCancel(useCustomDate) && useCustomDate) {
          customDate = await prompts.text({
            message: '输入日期 (YYYY-MM-DD)',
            placeholder: '2026-03-06',
            validate: (value) => {
              if (!value) return '请输入日期';
              if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return '日期格式错误，请使用 YYYY-MM-DD 格式';
              }
              return;
            }
          });
        }
      }

      options = {
        dryRun: !prompts.isCancel(dryRun) ? dryRun : false,
        verbose: !prompts.isCancel(verbose) ? verbose : false,
        date: !prompts.isCancel(customDate) ? customDate : undefined,
        config: configPath
      };
    } else {
      options = { config: configPath };
    }

    // 显示生成进度
    const spinner = prompts.spinner();
    spinner.start('正在生成内容...');

    try {
      const result = await this.contentGenerator.generate(templateType as string, options);

      spinner.stop();

      if (result.success) {
        prompts.note(
          `✅ 生成成功！\n${result.filePath ? `📄 文件: ${result.filePath}` : ''}\n💬 ${result.message}`,
          '生成结果'
        );

        if (result.statistics) {
          const stats = Object.entries(result.statistics)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          prompts.note(stats, '📊 统计信息');
        }
      } else {
        prompts.note(`❌ ${result.message}`, '生成失败');
      }
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }

  /**
   * 交互式模板列表
   */
  private async handleInteractiveList(): Promise<void> {
    const templates = this.templateRegistry.listTemplates();

    if (templates.length === 0) {
      prompts.note('没有可用的模板类型', '模板列表');
      return;
    }

    const templateList = templates
      .map(t => `• ${t.name} - ${t.description}`)
      .join('\n');

    prompts.note(templateList, '📋 可用模板');
  }

  /**
   * 交互式调度器
   */
  private async handleInteractiveSchedule(): Promise<void> {
    const configPath = await this.findConfigFile();
    if (!configPath) {
      prompts.note('未找到配置文件，请先创建配置文件', '错误');
      return;
    }

    const daemonMode = await prompts.confirm({
      message: '启用后台运行模式？',
      initialValue: false
    });

    if (prompts.isCancel(daemonMode)) {
      return;
    }

    prompts.note('调度器功能需要在配置文件中设置 schedule 配置', '提示');
    
    // 这里可以调用原有的调度器逻辑
    // 为了简化，暂时只显示提示信息
  }

  /**
   * 交互式配置初始化
   */
  private async handleInteractiveInit(): Promise<void> {
    const configExists = await this.findConfigFile();
    
    if (configExists) {
      const overwrite = await prompts.confirm({
        message: '配置文件已存在，是否覆盖？',
        initialValue: false
      });

      if (prompts.isCancel(overwrite) || !overwrite) {
        return;
      }
    }

    // 选择模板类型
    const templateTypes = await prompts.multiselect({
      message: '选择要启用的模板类型',
      options: [
        { value: 'weekly', label: 'Weekly', hint: '周报生成' }
      ],
      required: true
    });

    if (prompts.isCancel(templateTypes)) {
      return;
    }

    // 配置输出路径
    const outputPath = await prompts.text({
      message: '输出目录路径',
      placeholder: './output',
      initialValue: './output'
    });

    if (prompts.isCancel(outputPath)) {
      return;
    }

    // 配置数据源
    const articlesPath = await prompts.text({
      message: '文章数据源路径',
      placeholder: './articles',
      initialValue: './articles'
    });

    if (prompts.isCancel(articlesPath)) {
      return;
    }

    // 生成配置文件
    const config = {
      global: {
        logLevel: 'info',
        defaultTemplate: templateTypes[0]
      },
      templates: {}
    };

    // 为每个选中的模板类型生成配置
    for (const templateType of templateTypes) {
      if (templateType === 'weekly') {
        (config.templates as any)[templateType] = {
          enabled: true,
          template: {
            path: `./templates/${templateType}.hbs`
          },
          sources: {
            articles: articlesPath,
            tools: ['./tools'],
            notes: ['./notes']
          },
          output: {
            path: outputPath,
            filename: `${templateType}-{{year}}-#{{issueNumber}}.md`
          },
          content: {
            articles: {
              topN: 10,
              minRating: 0
            },
            tools: {
              perCategory: 3
            },
            notes: {
              groupBy: 'none'
            }
          }
        };
      }
    }

    // 写入配置文件
    const configFilePath = '.content-generatorrc.json';
    await fs.writeFile(configFilePath, JSON.stringify(config, null, 2), 'utf-8');

    prompts.note(`配置文件已创建: ${configFilePath}`, '✅ 初始化完成');
  }

  /**
   * 查找配置文件
   */
  private async findConfigFile(): Promise<string | null> {
    const configFilenames = [
      '.content-generatorrc.json',
      '.content-generatorrc.js',
      'content-generator.config.json',
      'content-generator.config.js'
    ];

    let currentDir = process.cwd();
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      for (const filename of configFilenames) {
        const configPath = path.join(currentDir, filename);
        try {
          await fs.access(configPath);
          return configPath;
        } catch {
          // 文件不存在，继续查找
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * 创建默认配置文件
   */
  private async createDefaultConfig(): Promise<void> {
    const defaultConfig = {
      global: {
        logLevel: 'info',
        defaultTemplate: 'weekly'
      },
      templates: {
        weekly: {
          enabled: true,
          template: {
            path: './templates/weekly.hbs'
          },
          sources: {
            articles: './articles',
            tools: ['./tools'],
            notes: ['./notes']
          },
          output: {
            path: './output',
            filename: 'weekly-{{year}}-#{{issueNumber}}.md'
          },
          content: {
            articles: {
              topN: 10,
              minRating: 0
            },
            tools: {
              perCategory: 3
            },
            notes: {
              groupBy: 'none'
            }
          }
        }
      }
    };

    await fs.writeFile('.content-generatorrc.json', JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }
}