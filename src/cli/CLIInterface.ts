import { Command } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import matter from 'gray-matter';
import { IContentGenerator, ITemplateRegistry, ExportFormat } from '../types/interfaces';
import { Scheduler } from '../core/Scheduler';
import { ConfigManager } from '../core/ConfigManager';
import { PlatformExporter } from '../export/PlatformExporter';
import { DEFAULT_WECHAT_THEME } from '../constants/wechatThemes';

interface PromptProfile {
  description?: string;
  system?: string;
  template: string;
}

type PromptProfiles = Record<string, PromptProfile>;

interface TopicSuggestion {
  topic: string;
  idea: string;
  filePath: string;
  score: number;
}

interface TopicSelectionResult {
  topic?: string;
  idea: string;
  sourcePath?: string;
}

interface PlatformPromptRule {
  description?: string;
  system?: string;
  user?: string;
  output?: string;
}

type PlatformPromptRules = Record<string, PlatformPromptRule>;

interface PromptParts {
  system: string;
  user: string;
}

interface ModulePromptParts {
  system: string;
  user: string;
  filePath?: string;
}

interface ResolvedPromptRuntimeConfig {
  configPath?: string;
  configDir?: string;
  profilesPath: string;
  platformRulesPath?: string;
  modulesBaseDir: string;
  modulePromptMap: Record<string, string>;
  suggestionDirs: string[];
  defaultPlatform: string;
  defaultTopic?: string;
  defaultModule?: string;
  baseSystemPrompt: string;
  outputBaseDir: string;
  moduleBaseDir: string;
  moduleDraftsDirName: string;
  outputFilenameTemplate: string;
  moduleAliases: Record<string, string>;
  modules: Record<string, PromptModuleConfig>;
  platformSystemPromptFiles: Record<string, string>;
  platformImageSystemPromptFiles: Record<string, string>;
  platformImageCoverSystemPromptFiles: Record<string, string>;
  platformImageInlineSystemPromptFiles: Record<string, string>;
  articleAI: ArticleAIConfig;
  articleImage: ArticleImageConfig;
  outputDraftsDirName: string;
  hooks: Record<string, string>;
  templateName: string;
  templateExport?: Record<string, any>;
}

interface PromptWizardResult {
  topic: string;
  platform: string;
  idea: string;
  requirements: string;
  sourcePath?: string;
  moduleName?: string;
  outPath?: string;
}

interface PromptModuleConfig {
  key: string;
  label: string;
  moduleDir: string;
  promptFile?: string;
  platformPromptFiles: Record<string, string>;
  sources: string[];
  coverPrompt?: string;
  template?: string;
  coverImage?: Record<string, any>;
}

interface ArticleAIConfig {
  enabled: boolean;
  provider?: 'openai' | 'anthropic' | 'local' | 'gemini' | 'google';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
}

interface ArticleImageConfig {
  enabled: boolean;
  provider?: 'script';
  script?: string;
  ratio?: '4:3' | '16:9';
  outputDir?: string;
  insertCoverImage?: boolean;
  promptDir?: string;
  promptMap?: Record<string, string>;
  usePlatformImageSystem?: boolean;
  coverPromptBase?: string;
  inlinePromptBase?: string;
  baseImage?: string;
  input?: {
    image?: string;
    mask?: string;
    editText?: string;
    prompt?: string;
  };
  textOverlay?: {
    textTemplate?: string;
    selector?: 'title' | 'module';
    replace?: {
      pattern: string;
      with: string;
    };
    font?: string;
    size?: number;
    x?: number;
    y?: number;
    color?: string;
  };
  coverSourceOrder?: Array<'ai' | 'unsplash' | 'script' | 'placeholder'>;
  coverRatio?: string;
  coverAiEndpoint?: string;
  coverAiApiKeyEnv?: string;
  coverAiResponseUrl?: string;
  coverAiResponseBase64?: string;
  coverAiResponseMime?: string;
  unsplashAccessKeyEnv?: string;
  unsplashQuery?: string;
  cover?: Record<string, any>;
  inline?: Record<string, any>;
}

interface PublishModuleContext {
  rawModule?: string;
  moduleKey?: string;
  moduleLabel?: string;
  moduleConfig?: PromptModuleConfig;
  runtimeConfig?: ResolvedPromptRuntimeConfig;
  loadedConfig?: Record<string, any> | null;
}

interface GeneratedArticlePayload {
  title: string;
  content: string;
  imagePromptNanobanaPro: string;
  coverImage?: string;
  coverImageRatio?: string;
}

interface LengthConstraint {
  minChars?: number;
  maxChars?: number;
}

interface PromptComplianceRules {
  requireLyricsSection: boolean;
  minLyricsLines?: number;
  requireSingerSongTitle: boolean;
}

type MetadataIssueLevel = 'error' | 'warning';

interface MetadataIssue {
  level: MetadataIssueLevel;
  filePath: string;
  message: string;
}

interface ParsedTagResult {
  tags: string[];
  issues: string[];
}

/**
 * 优化的CLI接口实现
 * 遵循最佳CLI设计规范，提供简洁、直观的用户体验
 */
export class CLIInterface {
  private program: Command;
  private contentGenerator: IContentGenerator;
  private templateRegistry: ITemplateRegistry;
  private scheduler?: Scheduler;

  constructor(
    contentGenerator: IContentGenerator,
    templateRegistry: ITemplateRegistry
  ) {
    this.program = new Command();
    this.contentGenerator = contentGenerator;
    this.templateRegistry = templateRegistry;
  }

  /**
   * 初始化 CLI
   */
  init(): void {
    this.program
      .name('lyra')
      .description('🚀 智能内容生成器 - 快速生成高质量内容文档')
      .version('1.0.0')
      .helpOption('-h, --help', '显示帮助信息')
      .addHelpText('after', `
示例:
  $ lyra                          # 启动交互式界面
  $ lyra weekly                   # 快速生成weekly内容
  $ lyra article --module 生活志   # 议题推荐（未传 --idea 默认推荐）
  $ lyra weekly --dry-run         # 预览模式
  $ lyra list                     # 查看可用模板
  $ lyra init                     # 初始化配置文件

更多信息: https://github.com/your-repo/lyra
`);

    // 默认命令 - 启动交互式界面
    this.program
      .action(async () => {
        const { InteractiveCLI } = await import('./InteractiveCLI');
        const interactiveCLI = new InteractiveCLI(this.contentGenerator, this.templateRegistry);
        await interactiveCLI.start();
      });

    // 动态添加模板命令
    this.addTemplateCommands();

    // create 命令 - 支持位置参数
    this.program
      .command('create [template]')
      .alias('c')
      .description('📝 生成内容文档')
      .option('-c, --config <path>', '配置文件路径')
      .option('-d, --dry-run', '预览模式，不创建文件')
      .option('-v, --verbose', '详细日志输出')
      .option('--date <date>', '基准日期 (YYYY-MM-DD)')
      .option('--no-aggregate', '跳过内容聚合')
      .option('--regenerate-summaries', '强制重新生成AI摘要')
      .option('-y, --yes', '跳过确认提示')
      .addHelpText('after', `
示例:
  $ lyra create weekly           # 生成weekly内容
  $ lyra c weekly --dry-run      # 预览模式
  $ lyra create weekly --date 2026-03-01  # 指定日期
`)
      .action(async (template, options) => {
        await this.handleCreate(template, options);
      });

    // publish 命令 - 发布到平台草稿（如微信公众号）
    this.program
      .command('publish')
      .description('🛰️ 发布到平台草稿（支持 WeChat API/Playwright）')
      .option('-P, --platform <name>', '目标平台（默认 wechat）', 'wechat')
      .option('-m, --method <name>', '发布方式（api|playwright）', 'api')
      .option('-c, --config <path>', '发布配置 JSON 文件路径')
      .option('-f, --file <path>', '发布配置 JSON 文件路径（--config 别名）')
      .option('-M, --module <name>', '模块名称（用于关联提示词与发布配置）')
      .option('-C, --content <path>', '内容文件路径（HTML）')
      .option('-E, --env <path>', '.env 文件路径')
      .option('-s, --script <path>', '自定义发布脚本路径')
      .option('-x, --execute', '执行发布（默认 dry-run）')
      .option('-d, --dry-run', '仅预览（默认）')
      .addHelpText('after', `
示例:
  $ lyra publish --method api --config ./wechat_publish.json --content ./output/article.wechat.html --dry-run
  $ lyra publish --method api --config ./wechat_publish.json --execute
  $ lyra publish --method playwright --config ./wechat_publish.json --content ./output/article.wechat.html
`)
      .action(async (options) => {
        await this.handlePublish(options);
      });

    // list 命令
    this.program
      .command('list')
      .alias('ls')
      .description('📋 列出所有可用的模板类型')
      .option('--json', '以JSON格式输出')
      .action((options) => {
        this.handleList(options);
      });

    // init 命令
    this.program
      .command('init')
      .description('⚙️ 初始化配置文件')
      .option('-f, --force', '强制覆盖已存在的配置文件')
      .option('--template <type>', '指定默认模板类型', 'weekly')
      .action(async (options) => {
        await this.handleInit(options);
      });

    // schedule 命令
    this.program
      .command('schedule')
      .alias('sched')
      .description('⏰ 启动调度器')
      .option('-c, --config <path>', '配置文件路径')
      .option('-d, --daemon', '后台运行模式')
      .option('--dry-run', '预览调度任务，不实际执行')
      .action(async (options) => {
        await this.handleSchedule(options);
      });

    // config 命令
    this.program
      .command('config')
      .description('🔧 配置管理')
      .option('--show', '显示当前配置')
      .option('--validate', '验证配置文件')
      .action(async (options) => {
        await this.handleConfig(options);
      });

    // check-images 命令
    this.program
      .command('check-images')
      .alias('check-img')
      .description('🖼️ 检查 Markdown 图片域名是否命中白名单')
      .option('--dir <path>', '扫描目录（默认: ./Weekly）', 'Weekly')
      .option('--allow <hosts>', '允许域名白名单（逗号分隔）')
      .addHelpText('after', `
示例:
  $ lyra check-images
  $ lyra check-images --dir ./Output
  $ lyra check-images --allow znorth-1300857483.cos.ap-chengdu.myqcloud.com,img.mrzzz.top
`)
      .action(async (options) => {
        await this.handleCheckImages(options);
      });

    // check-metadata 命令
    this.program
      .command('check-metadata')
      .alias('check-meta')
      .description('🧾 检查并整理 Markdown 元数据与 tags（支持目录或单文件）')
      .option('--path <path>', '扫描目标（支持目录或单文件，默认: 当前目录）', '.')
      .option('--fix-tags', '自动清洗 tags（去空、去重、统一格式）')
      .option('--ai-tags', '基于内容用 AI 生成/补全 tags')
      .option('--max-tags <number>', '每篇最多 tags 数量（默认: 8）', '8')
      .option('--min-tags <number>', '每篇最少 tags 数量（默认: 1）', '1')
      .option('--provider <name>', 'AI provider: openai|anthropic|gemini|local')
      .option('--model <name>', 'AI 模型名称')
      .option('--api-key <key>', 'AI API Key（可用环境变量）')
      .option('--base-url <url>', 'AI Base URL')
      .option('--timeout <ms>', 'AI 请求超时毫秒')
      .option('--max-retries <number>', 'AI 最大重试次数')
      .option('--strict', 'warning 也视为失败（退出码 1）')
      .option('--dry-run', '仅预览，不落盘修改')
      .action(async (options) => {
        await this.handleCheckMetadata(options);
      });

    const articleCommand = this.program
      .command('article')
      .alias('a')
      .description('🧠 文章 Prompt 组装：平台规则 + 模块提示词 + 用户写作要求');
    this.configureArticleCommand(articleCommand, 'article');

    // 兼容别名：旧命令仍可用，但文档主入口统一为 lyra article
    const promptCommand = this.program
      .command('prompt')
      .alias('p')
      .description('🧠 [兼容] 等同于 lyra article');
    this.configureArticleCommand(promptCommand, 'prompt');

    // 全局错误处理
    this.program.exitOverride();
    
    // 改进帮助信息显示
    this.program.configureHelp({
      sortSubcommands: true,
      subcommandTerm: (cmd) => `${cmd.name()} ${cmd.usage()}`,
    });
  }

  /**
   * 动态添加模板命令（如 lyra weekly, lyra monthly 等）
   */
  private addTemplateCommands(): void {
    const templates = this.templateRegistry.listTemplates();
    
    templates.forEach(template => {
      this.program
        .command(template.name)
        .description(`📝 生成 ${template.name} 内容 - ${template.description}`)
        .option('-c, --config <path>', '配置文件路径')
        .option('-d, --dry-run', '预览模式，不创建文件')
        .option('-v, --verbose', '详细日志输出')
        .option('--date <date>', '基准日期 (YYYY-MM-DD)')
        .option('--no-aggregate', '跳过内容聚合')
        .option('--regenerate-summaries', '强制重新生成AI摘要')
        .option('-y, --yes', '跳过确认提示')
        .action(async (options) => {
          await this.handleCreate(template.name, options);
        });
    });
  }

  private configureArticleCommand(command: Command, mode: 'article' | 'prompt'): void {
    command
      .option('-c, --config <path>', '配置文件路径（可读取 ai.prompting）')
      .option('--topic <name>', '主题/Prompt 模板名称（兼容参数，建议使用 --module）')
      .option('--platform <name>', '目标平台（如：wechat、zhihu）')
      .option('--module <name>', '内容模块（如：生活志、声图志）')
      .option('--idea <text>', '你想写什么')
      .option('--requirements <text>', '写作要求（风格、结构、长度、禁用词等）')
      .option('--source <path>', '素材文件路径，可自动注入原文')
      .option('--profiles <path>', 'Prompt profiles JSON 文件路径', '.lyra-prompts.json')
      .option('--module-prompt <path>', '模块 Prompt 文件路径（覆盖配置）')
      .option('--platform-rules <path>', '平台规则 JSON 文件路径')
      .option('--interactive', '开启 @clack/prompts 交互向导（仅补问缺失项）')
      .option('--out <path>', '将渲染后的 Prompt 写入文件')
      .option('-d, --dry-run', '预览模式，仅输出 Prompt，不写入文件')
      .option('--prompt-only', '仅输出 Prompt，不调用模型生成文章')
      .option('--suggest', '从目录自动提取可写议题')
      .option('--from <paths>', '议题提取目录（逗号分隔）')
      .option('--limit <number>', '议题提取数量（默认 8）', '8')
      .option('--auto-idea', '自动使用最高分议题填充 --idea')
      .option('--list', '列出可用 Prompt 主题')
      .addHelpText('after', mode === 'article'
        ? `
示例:
  $ lyra article --list
  $ lyra article --module 生活志
  $ lyra article --module 生活志 --suggest --from ./Input,./Learning --limit 12
  $ lyra article --module 生活志 --auto-idea --requirements "控制在 1000 字内，口语化"
  $ lyra article --platform zhihu --module 声图志 --idea "成都春天的街头声音"
  $ lyra article --module 生活志 --idea "这周通勤观察" --dry-run
  $ lyra article --module 声图志 --idea "夜跑时听到的街头声音"
  $ lyra article --interactive --config ./.lyrarc.json
`
        : `
示例:
  $ lyra prompt --module 生活志 --auto-idea --requirements "900字以内，克制"
  $ lyra prompt --platform zhihu --module 声图志 --idea "成都春天的街头声音"
`)
      .action(async (options) => {
        if (mode === 'article') {
          await this.handleArticle(options, 'article');
          return;
        }
        await this.handlePrompt(options);
      });
  }

  /**
   * 解析命令行参数
   */
  parse(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.program.parseAsync(args).then(() => {
          resolve();
        }).catch((error) => {
          // 处理commander的退出错误
          if (error.code === 'commander.help' || 
              error.code === 'commander.version' || 
              error.code === 'commander.helpDisplayed') {
            resolve();
          } else {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理 create 命令
   */
  private async handleCreate(template: string | undefined, options: any): Promise<void> {
    try {
      // 如果没有指定模板，启动交互式选择
      if (!template) {
        const { InteractiveCLI } = await import('./InteractiveCLI');
        const interactiveCLI = new InteractiveCLI(this.contentGenerator, this.templateRegistry);
        await interactiveCLI.start();
        return;
      }

      // 验证模板类型
      if (!this.templateRegistry.hasTemplate(template)) {
        console.error(`❌ 错误: 模板类型 "${template}" 不存在`);
        console.log('\n可用的模板类型:');
        this.handleList({ json: false });
        console.log(`\n💡 提示: 使用 'lyra list' 查看所有可用模板`);
        process.exit(1);
      }

      // 自动查找配置文件
      let configPath = options.config;
      if (!configPath) {
        configPath = await this.findConfigFile();
        if (!configPath) {
          console.error('❌ 错误: 未找到配置文件');
          console.log('💡 提示: 使用 \'lyra init\' 创建配置文件');
          process.exit(1);
        }
        if (options.verbose) {
          console.log(`📁 使用配置文件: ${configPath}`);
        }
      }

      // 解析配置文件的绝对路径，用于后续的相对路径解析
      const resolvedConfigPath = path.resolve(configPath);
      const configDir = path.dirname(resolvedConfigPath);

      // 准备生成选项
      const generateOptions: Record<string, any> = {
        config: resolvedConfigPath,
        configDir: configDir, // 传递配置文件目录用于路径解析
        dryRun: options.dryRun,
        verbose: options.verbose,
      };

      if (options.date) {
        // 验证日期格式
        if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
          console.error('❌ 错误: 日期格式错误，请使用 YYYY-MM-DD 格式');
          process.exit(1);
        }
        generateOptions.date = options.date;
      }

      if (options.aggregate === false) {
        generateOptions.noAggregate = true;
      }

      if (options.regenerateSummaries) {
        generateOptions.regenerateSummaries = true;
      }

      // 显示生成信息
      if (!options.yes && !options.dryRun) {
        console.log(`🚀 准备生成 ${template} 内容...`);
      }

      if (options.dryRun) {
        console.log('👀 预览模式 - 不会创建实际文件');
      }

      if (
        template === 'weekly' &&
        !options.yes &&
        !options.dryRun &&
        process.stdout.isTTY
      ) {
        const prompts = await import('@clack/prompts');
        prompts.note(
          '将先执行：1) 扫描上周 weekly 输出 2) 同步 Input 推荐标记 3) 再生成本周内容',
          'Weekly 生成前检查'
        );
        const proceed = await prompts.confirm({
          message: '继续执行 weekly 生成吗？',
          initialValue: true,
        });
        if (prompts.isCancel(proceed) || !proceed) {
          prompts.cancel('已取消 weekly 生成');
          return;
        }
      }

      // 执行生成
      const result = await this.contentGenerator.generate(template, generateOptions);

      // 处理结果
      if (result.success) {
        if (options.dryRun) {
          console.log('\n✅ 预览完成');
        } else {
          console.log('\n✅ 生成成功!');
          if (result.filePath) {
            console.log(`📄 文件已保存: ${result.filePath}`);
          }
        }

        if (result.statistics && options.verbose) {
          console.log('\n📊 统计信息:');
          Object.entries(result.statistics).forEach(([key, value]) => {
            console.log(`  • ${key}: ${value}`);
          });
        }

        if (result.message && options.verbose) {
          console.log(`\n💬 ${result.message}`);
        }
      } else {
        console.error('\n❌ 生成失败!');
        console.error(`错误: ${result.message}`);
        
        // 提供解决建议
        if (result.message.includes('配置')) {
          console.log('\n💡 建议: 检查配置文件是否正确');
        } else if (result.message.includes('模板')) {
          console.log('\n💡 建议: 检查模板文件是否存在');
        }
        
        process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ 生成过程中发生异常:');
      console.error(error instanceof Error ? error.message : String(error));
      
      if (options.verbose && error instanceof Error && error.stack) {
        console.error('\n🔍 详细错误信息:');
        console.error(error.stack);
      }
      
      process.exit(1);
    }
  }

  private async handlePublish(options: any): Promise<void> {
    const platform = String(options.platform || 'wechat').toLowerCase();
    if (platform !== 'wechat') {
      console.error(`❌ 暂不支持的平台: ${platform}`);
      process.exit(1);
    }

    const method = String(options.method || 'api').toLowerCase();
    if (method !== 'api' && method !== 'playwright') {
      console.error(`❌ 暂不支持的发布方式: ${method}`);
      process.exit(1);
    }

    if (options.execute && options.dryRun) {
      console.error('❌ 不能同时指定 --execute 与 --dry-run');
      process.exit(1);
    }

    let configPath = options.config || options.file;
    if (!configPath) {
      configPath = await this.findConfigFile();
    }
    if (!configPath) {
      if (process.stdout.isTTY) {
        const prompts = await import('@clack/prompts');
        prompts.intro('🛰️ 发布到平台草稿');
        const picked = await prompts.text({
          message: '发布配置文件路径（JSON）',
          placeholder: './lyra.config.json',
        });
        if (prompts.isCancel(picked) || !picked) {
          prompts.cancel('已取消发布');
          return;
        }
        configPath = String(picked).trim();
      } else {
        console.error('❌ 错误: 未找到配置文件');
        console.log('💡 提示: 使用 \'lyra init\' 创建配置文件，或通过 --config 指定发布配置');
        process.exit(1);
      }
    }

    const resolvedConfigPath = path.resolve(configPath);
    const configDir = path.dirname(resolvedConfigPath);

    let publishConfig: Record<string, any> = {};
    try {
      const raw = await fs.readFile(resolvedConfigPath, 'utf-8');
      publishConfig = JSON.parse(raw);
    } catch (error) {
      console.error(`❌ 发布配置解析失败: ${resolvedConfigPath}`);
      console.error(error);
      process.exit(1);
    }

    const lyraConfigPath = this.resolveLyraConfigPath(
      publishConfig,
      configDir,
      resolvedConfigPath
    );
    const rawModule = String(
      options.module
        || publishConfig?.publish?.wechat?.module
        || publishConfig?.publish?.module
        || publishConfig?.module
        || ''
    ).trim();
    const moduleContext = await this.resolvePublishModuleContext({
      lyraConfigPath,
      rawModule: rawModule || undefined,
    });

    const execute = Boolean(options.execute);
    const dryRun = !execute;

    const publishDir = publishConfig?.publish?.outputDir
      ? path.resolve(configDir, publishConfig.publish.outputDir)
      : path.resolve(process.cwd(), 'publish');

    const scriptRelative = method === 'api'
      ? publishConfig?.publish?.wechat?.apiScript
      : publishConfig?.publish?.wechat?.playwrightScript;
    const scriptPathRaw = options.script
      ? path.resolve(process.cwd(), options.script)
      : (scriptRelative ? path.resolve(configDir, scriptRelative) : undefined);
    const scriptPath = scriptPathRaw || '';

    let contentPath = options.content;
    if (!contentPath) {
      contentPath = publishConfig?.publish?.wechat?.contentFile;
    }
    if (contentPath) {
      contentPath = path.resolve(configDir, contentPath);
    }

    const hasInlineArticles = Array.isArray(publishConfig?.articles)
      || Array.isArray(publishConfig?.publish?.wechat?.articles);

    if (!contentPath && !hasInlineArticles) {
      if (process.stdout.isTTY) {
        const prompts = await import('@clack/prompts');
        const picked = await prompts.text({
          message: '内容文件路径（HTML）',
          placeholder: './Output/article.wechat.html',
        });
        if (prompts.isCancel(picked) || !picked) {
          prompts.cancel('已取消发布');
          return;
        }
        contentPath = path.resolve(process.cwd(), String(picked).trim());
      } else {
        console.error('❌ 缺少内容文件路径，请使用 --content 或在发布配置中指定 publish.wechat.contentFile');
        process.exit(1);
      }
    }

    const publishConfigPath = publishConfig?.publish?.wechat?.configFile
      ? path.resolve(configDir, publishConfig.publish.wechat.configFile)
      : resolvedConfigPath;

    const envPath = options.env
      ? path.resolve(process.cwd(), options.env)
      : (publishConfig?.publish?.wechat?.envFile ? path.resolve(configDir, publishConfig.publish.wechat.envFile) : undefined);

    const publishMode = String(publishConfig?.publish?.wechat?.mode || 'draft').toLowerCase();
    if (publishMode !== 'draft' && publishMode !== 'publish') {
      console.error(`❌ 不支持的发布模式: ${publishMode}（仅支持 draft|publish）`);
      process.exit(1);
    }
    const publishAtRaw = publishConfig?.publish?.wechat?.publishAt;
    const publishAt = publishAtRaw ? this.parsePublishAt(String(publishAtRaw)) : null;
    if (publishAtRaw && !publishAt) {
      console.error(`❌ 无效的发布定时: ${publishAtRaw}`);
      process.exit(1);
    }

    const useScript = method === 'playwright' || Boolean(scriptPathRaw);
    const args = useScript ? [
      scriptPath,
      '--config', publishConfigPath,
      '--content', contentPath,
      '--mode', publishMode,
    ] : [];

    if (useScript && envPath) {
      args.push('--env', envPath);
    }

    if (method === 'playwright' && !scriptPathRaw) {
      console.error('❌ 缺少 Playwright 发布脚本，请在 publish.wechat.playwrightScript 配置');
      process.exit(1);
    }

    if (useScript) {
      if (dryRun) {
        args.push('--dry-run');
      } else {
        args.push('--execute');
      }

      try {
        await fs.access(scriptPath);
      } catch {
        console.error(`❌ 发布脚本不存在: ${scriptPath}`);
        console.log('💡 提示: 使用 --script 指定脚本路径，或安装 lyra-wechat-publisher skill');
        process.exit(1);
      }
    }

    if (!dryRun && process.stdout.isTTY && publishMode === 'publish') {
      const prompts = await import('@clack/prompts');
      const proceed = await prompts.confirm({
        message: '确认执行发布？（将写入平台草稿）',
        initialValue: true,
      });
      if (prompts.isCancel(proceed) || !proceed) {
        prompts.cancel('已取消发布');
        return;
      }
    }

    console.log('🛰️ 开始发布');
    console.log(`  • 方式: ${method}`);
    console.log(`  • 平台: ${platform}`);
    console.log(`  • 内容: ${contentPath}`);
    console.log(`  • 配置: ${publishConfigPath}`);
    console.log(`  • 脚本: ${scriptPath}`);
    console.log(`  • 模式: ${publishMode}`);
    if (envPath) {
      console.log(`  • .env: ${envPath}`);
    }
    if (dryRun) {
      console.log('  • 模式: dry-run');
    }

    if (publishMode === 'publish' && publishAt && dryRun) {
      console.log(`  • 定时发布: ${this.formatDateTime(publishAt)}`);
      console.log('✅ dry-run 结束（未执行发布）');
      return;
    }

    if (publishMode === 'publish' && publishAt && !dryRun) {
      const delayMs = Math.max(0, publishAt.getTime() - Date.now());
      console.log(`  • 定时发布: ${this.formatDateTime(publishAt)}`);
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
    }

    const publishLevelHooks = this.mergeHooks(
      (publishConfig?.hooks && typeof publishConfig.hooks === 'object') ? publishConfig.hooks : {},
      (publishConfig?.publish?.hooks && typeof publishConfig.publish.hooks === 'object')
        ? publishConfig.publish.hooks
        : {}
    );
    const publishHooks = this.mergeHooks(
      moduleContext.runtimeConfig?.hooks || {},
      publishLevelHooks
    );
    await this.runHookIfConfigured({
      hookName: 'publish.before',
      hooks: publishHooks,
      configDir,
      payload: {
        platform,
        method,
        mode: publishMode,
        contentPath,
        publishConfigPath,
      },
      context: {
        platform,
        method,
        mode: publishMode,
      },
    });

    if (useScript) {
      await this.runPublishScript(args);
    } else {
      await this.runPublishApiFlow({
        publishConfigPath,
        contentPath,
        envPath,
        mode: publishMode,
        dryRun,
        moduleContext,
      });
    }
    await this.runHookIfConfigured({
      hookName: 'publish.after',
      hooks: publishHooks,
      configDir,
      payload: {
        platform,
        method,
        mode: publishMode,
        contentPath,
        publishConfigPath,
      },
      context: {
        platform,
        method,
        mode: publishMode,
      },
    });
    console.log('✅ 发布流程完成');
  }

  private resolveLyraConfigPath(
    publishConfig: Record<string, any>,
    configDir: string,
    fallbackPath: string
  ): string | undefined {
    const direct = publishConfig?.lyraConfig
      || publishConfig?.lyra_config
      || publishConfig?.publish?.lyraConfig
      || publishConfig?.publish?.lyra_config
      || publishConfig?.publish?.wechat?.lyraConfig
      || publishConfig?.publish?.wechat?.lyra_config;
    if (typeof direct === 'string' && direct.trim()) {
      return path.resolve(configDir, direct.trim());
    }
    const looksLikeLyraConfig = Boolean(publishConfig?.templates || publishConfig?.global);
    return looksLikeLyraConfig ? fallbackPath : undefined;
  }

  private async resolvePublishModuleContext(args: {
    lyraConfigPath?: string;
    rawModule?: string;
  }): Promise<PublishModuleContext> {
    if (!args.lyraConfigPath) {
      return { rawModule: args.rawModule };
    }

    let runtimeConfig: ResolvedPromptRuntimeConfig | undefined;
    let loadedConfig: Record<string, any> | null = null;
    try {
      runtimeConfig = await this.resolvePromptRuntimeConfig({ config: args.lyraConfigPath });
      const manager = new ConfigManager();
      loadedConfig = await manager.load(args.lyraConfigPath);
    } catch (error) {
      console.warn(
        `[publish] 读取模块配置失败，已跳过模块关联: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { rawModule: args.rawModule };
    }

    const rawModule = args.rawModule || runtimeConfig.defaultModule;
    const moduleKey = rawModule ? this.resolveModuleKey(runtimeConfig, rawModule) : null;
    const moduleConfig = moduleKey ? runtimeConfig.modules[moduleKey] : undefined;
    const moduleLabel = moduleConfig?.label || moduleKey || rawModule;

    return {
      rawModule: rawModule || undefined,
      moduleKey: moduleKey || undefined,
      moduleLabel: moduleLabel || undefined,
      moduleConfig,
      runtimeConfig,
      loadedConfig,
    };
  }

  private loadEnvFile(filePath?: string): void {
    if (!filePath) {
      return;
    }
    try {
      const raw = require('fs').readFileSync(filePath, 'utf-8');
      raw.split(/\r?\n/).forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
        const idx = normalized.indexOf('=');
        if (idx === -1) return;
        const key = normalized.slice(0, idx).trim();
        const value = normalized.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      });
    } catch {
      // ignore missing env file
    }
  }

  private async runPublishApiFlow(args: {
    publishConfigPath: string;
    contentPath?: string;
    envPath?: string;
    mode: 'draft' | 'publish';
    dryRun: boolean;
    moduleContext?: PublishModuleContext;
  }): Promise<void> {
    const wechatConfig = await this.readJsonFile(args.publishConfigPath);
    if (!wechatConfig || typeof wechatConfig !== 'object') {
      throw new Error(`发布配置解析失败: ${args.publishConfigPath}`);
    }
    this.loadEnvFile(args.envPath);

    const wechatConfigTyped = wechatConfig as Record<string, any>;
    const configDir = path.dirname(args.publishConfigPath);
    const articles = await this.resolveWechatArticlesForPublish({
      wechatConfig: wechatConfigTyped,
      contentPath: args.contentPath,
      configDir,
      moduleContext: args.moduleContext,
      platform: 'wechat',
    });
    let payload = this.buildWechatDraftPayloadFromArticles(articles);

    if (args.dryRun) {
      for (let index = 0; index < articles.length; index += 1) {
        if (payload.articles?.[index]?.thumb_media_id) {
          continue;
        }
        const articleConfig = articles[index];
        const thumbSource = this.resolveThumbImageSource(articleConfig);
        if (thumbSource) {
          payload = this.assignDraftThumbMedia(payload, '__AUTO_UPLOAD__', index);
          console.log(`[publish] dry-run: 第${index + 1}篇缺少 thumb_media_id，将尝试自动上传封面图`);
        } else if (this.canAutoGenerateCover(articleConfig)) {
          payload = this.assignDraftThumbMedia(payload, '__AUTO_GENERATED__', index);
          console.log(`[publish] dry-run: 第${index + 1}篇缺少封面图，将自动生成/获取封面图`);
        } else if (this.shouldUsePlaceholderCover(articleConfig)) {
          payload = this.assignDraftThumbMedia(payload, '__AUTO_PLACEHOLDER__', index);
          console.log(`[publish] dry-run: 第${index + 1}篇缺少封面图，将使用占位图生成 thumb_media_id`);
        } else {
          console.log(`[publish] dry-run: 第${index + 1}篇缺少 thumb_media_id，且未提供封面图路径/URL`);
        }
      }
      console.log(JSON.stringify({ mode: args.mode, draftPayload: payload }, null, 2));
      return;
    }

    const accessToken = (wechatConfig as any).access_token || process.env.WECHAT_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('缺少 access_token，请在配置或 WECHAT_ACCESS_TOKEN 中提供');
    }

    for (let index = 0; index < articles.length; index += 1) {
      if (payload.articles?.[index]?.thumb_media_id) {
        continue;
      }
      const articleConfig = articles[index];
      let thumbSource = this.resolveThumbImageSource(articleConfig);
      if (!thumbSource) {
        thumbSource = await this.resolveAutoCoverSource({
          config: articleConfig,
          html: String(articleConfig.content || ''),
        });
      }
      if (!thumbSource && this.shouldUsePlaceholderCover(articleConfig)) {
        const placeholderPath = await this.generatePlaceholderCover({
          title: articleConfig.title,
          ratio: String(articleConfig.cover_ratio || '16:9'),
        });
        thumbSource = { type: 'path', value: placeholderPath };
      }
      if (!thumbSource) {
        throw new Error('缺少 thumb_media_id，且未提供封面图路径/URL（thumb_image_path 或 thumb_image_url）');
      }
      const uploaded = await this.uploadWechatThumbMedia({
        baseUrl: wechatConfigTyped.api_base || 'https://api.weixin.qq.com/cgi-bin',
        accessToken,
        source: thumbSource,
        endpoint: wechatConfigTyped.thumb_upload_endpoint || '/material/add_material?type=thumb',
      });
      payload = this.assignDraftThumbMedia(payload, uploaded.media_id, index);
    }

    const baseUrl = (wechatConfig as any).api_base || 'https://api.weixin.qq.com/cgi-bin';
    const draftAdd = (wechatConfig as any).draft_add_endpoint || '/draft/add';
    const draftUrl = `${String(baseUrl).replace(/\/$/, '')}${draftAdd}?access_token=${accessToken}`;
    const draftResult = await this.fetchJsonWithTimeout(
      draftUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      60000
    ) as any;

    if (args.mode !== 'publish') {
      console.log(JSON.stringify({ draftResult }, null, 2));
      return;
    }

    const mediaId = draftResult?.media_id || draftResult?.mediaId;
    if (!mediaId) {
      throw new Error('草稿创建未返回 media_id');
    }

    const publishEndpoint = (wechatConfig as any).publish_endpoint || '/freepublish/submit';
    const publishUrl = `${String(baseUrl).replace(/\/$/, '')}${publishEndpoint}?access_token=${accessToken}`;
    const publishResult = await this.fetchJsonWithTimeout(
      publishUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: mediaId }),
      },
      60000
    ) as any;

    console.log(JSON.stringify({ draftResult, publishResult }, null, 2));
  }

  private async readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private buildWechatDraftPayload(config: Record<string, any>, html: string): Record<string, any> {
    if (!config.title) {
      throw new Error('发布配置缺少 title，请使用独立的 wechat_publish.json 或补充字段');
    }
    const article = {
      title: config.title,
      author: config.author || '',
      digest: config.digest || '',
      content: html,
      content_source_url: config.source_url || '',
      thumb_media_id: config.thumb_media_id || '',
      need_open_comment: Number(config.need_open_comment || 0),
      only_fans_can_comment: Number(config.only_fans_can_comment || 0),
    };
    return this.buildWechatDraftPayloadFromArticles([article]);
  }

  private buildWechatDraftPayloadFromArticles(articles: Record<string, any>[]): Record<string, any> {
    const normalized = articles.map((article) => {
      if (!article.title) {
        throw new Error('发布配置缺少 title，请在每篇文章中提供 title');
      }
      if (!article.content) {
        throw new Error(`发布配置缺少 content: ${article.title}`);
      }
      return {
        title: article.title,
        author: article.author || '',
        digest: article.digest || '',
        content: article.content,
        content_source_url: article.content_source_url || article.source_url || '',
        thumb_media_id: article.thumb_media_id || '',
        need_open_comment: Number(article.need_open_comment || 0),
        only_fans_can_comment: Number(article.only_fans_can_comment || 0),
      };
    });
    return { articles: normalized };
  }

  private async resolveWechatArticlesForPublish(args: {
    wechatConfig: Record<string, any>;
    contentPath?: string;
    configDir: string;
    moduleContext?: PublishModuleContext;
    platform: string;
  }): Promise<Record<string, any>[]> {
    const runtimeConfig = args.moduleContext?.runtimeConfig;
    const loadedConfig = args.moduleContext?.loadedConfig;
    const rawArticles = Array.isArray(args.wechatConfig.articles)
      ? (args.wechatConfig.articles as Array<Record<string, any>>)
      : null;

    if (!rawArticles || rawArticles.length === 0) {
      if (!args.contentPath) {
        throw new Error('缺少内容文件路径，请使用 --content 或在发布配置中指定 contentFile');
      }
      const html = await fs.readFile(args.contentPath, 'utf-8');
      const single = await this.applyModuleCoverPrompt({
        articleConfig: {
          ...args.wechatConfig,
          content: html,
        },
        moduleContext: args.moduleContext,
        platform: args.platform,
      });
      return [single];
    }

    const defaults = { ...args.wechatConfig };
    delete defaults.articles;
    delete defaults.contents;

    const resolved: Record<string, any>[] = [];
    for (const item of rawArticles) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const entry = { ...defaults, ...item };
      const contentFileRaw = entry.contentFile || entry.content_file || entry.contentPath;
      let resolvedContentFile: string | undefined;
      if (!entry.content && contentFileRaw) {
        const contentFile = path.isAbsolute(contentFileRaw)
          ? contentFileRaw
          : path.resolve(args.configDir, contentFileRaw);
        resolvedContentFile = contentFile;
        entry.content = await fs.readFile(contentFile, 'utf-8');
      }
      if (!entry.content && rawArticles.length === 1 && args.contentPath) {
        entry.content = await fs.readFile(args.contentPath, 'utf-8');
      }
      if (!entry.module && runtimeConfig && resolvedContentFile) {
        const inferredModule = this.resolveModuleKeyByContentPath(runtimeConfig, resolvedContentFile);
        if (inferredModule) {
          entry.module = inferredModule;
        } else {
          console.warn(`[publish] 未能从路径匹配模块: ${resolvedContentFile}`);
        }
      } else if (!entry.module && !runtimeConfig) {
        console.warn('[publish] 未加载 lyra 配置，无法自动匹配模块');
      }

      if (loadedConfig && runtimeConfig) {
        const moduleKey = String(entry.module || '').trim();
        const imageConfig = this.resolvePublishImageConfig({
          loadedConfig,
          moduleKey,
          runtimeConfig,
        });
        if (imageConfig) {
          entry.cover_script = imageConfig.script || entry.cover_script || entry.coverScript;
          entry.cover_ratio = imageConfig.coverRatio || imageConfig.ratio || entry.cover_ratio;
          entry.cover_source_order = imageConfig.coverSourceOrder || entry.cover_source_order;
          entry.cover_ai_endpoint = imageConfig.coverAiEndpoint || entry.cover_ai_endpoint;
          entry.cover_ai_api_key_env = imageConfig.coverAiApiKeyEnv || entry.cover_ai_api_key_env;
          entry.cover_ai_response_url = imageConfig.coverAiResponseUrl || entry.cover_ai_response_url;
          entry.cover_ai_response_base64 = imageConfig.coverAiResponseBase64 || entry.cover_ai_response_base64;
          entry.cover_ai_response_mime = imageConfig.coverAiResponseMime || entry.cover_ai_response_mime;
          entry.unsplash_access_key_env = imageConfig.unsplashAccessKeyEnv || entry.unsplash_access_key_env;
          entry.unsplash_query = imageConfig.unsplashQuery || entry.unsplash_query;
        }
      }

      const enriched = await this.applyModuleCoverPrompt({
        articleConfig: entry,
        moduleContext: args.moduleContext,
        platform: args.platform,
      });
      resolved.push(enriched);
    }
    return resolved;
  }

  private resolveModuleKeyByContentPath(
    runtimeConfig: ResolvedPromptRuntimeConfig,
    contentPath: string
  ): string | null {
    const absContent = path.resolve(contentPath);
    const candidates: Array<{ key: string; dir: string }> = [];

    for (const module of Object.values(runtimeConfig.modules)) {
      const dir = module.moduleDir;
      if (!dir) {
        continue;
      }
      const absDir = path.isAbsolute(dir)
        ? dir
        : path.resolve(runtimeConfig.moduleBaseDir, dir);
      if (absContent.startsWith(`${absDir}${path.sep}`) || absContent === absDir) {
        candidates.push({ key: module.key, dir: absDir });
      }
    }

    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => b.dir.length - a.dir.length);
    return candidates[0].key;
  }

  private resolvePublishImageConfig(args: {
    loadedConfig: Record<string, any>;
    moduleKey: string;
    runtimeConfig: ResolvedPromptRuntimeConfig;
  }): ArticleImageConfig | null {
    const globalAI = args.loadedConfig?.global?.ai;
    const templates = args.loadedConfig?.templates || {};
    const moduleKey = args.moduleKey || '';
    const moduleTemplate = args.runtimeConfig.modules?.[moduleKey]?.template;
    const templateName = moduleTemplate || (moduleKey === 'weekly' ? 'weekly' : 'article');
    const templateAI = templates?.[templateName]?.ai;
    const base = this.resolveArticleImageConfig(globalAI, templateAI, {});
    const moduleCoverImage = args.runtimeConfig.modules?.[moduleKey]?.coverImage;
    return this.applyModuleImageOverrides(base, moduleCoverImage);
  }

  private applyModuleImageOverrides(
    base: ArticleImageConfig,
    moduleImage?: Record<string, any>
  ): ArticleImageConfig {
    if (!moduleImage || typeof moduleImage !== 'object') {
      return base;
    }
    const merged: ArticleImageConfig = { ...base };
    const copyIf = (key: keyof ArticleImageConfig, value: any) => {
      if (value !== undefined && value !== null && value !== '') {
        (merged as any)[key] = value;
      }
    };
    copyIf('script', moduleImage.script);
    copyIf('ratio', moduleImage.ratio);
    copyIf('outputDir', moduleImage.outputDir);
    copyIf('insertCoverImage', moduleImage.insertCoverImage);
    copyIf('promptDir', moduleImage.promptDir);
    copyIf('promptMap', moduleImage.promptMap);
    copyIf('usePlatformImageSystem', moduleImage.usePlatformImageSystem);
    copyIf('baseImage', moduleImage.baseImage);
    if (moduleImage.input && typeof moduleImage.input === 'object') {
      merged.input = { ...(merged.input || {}), ...moduleImage.input };
    }
    if (moduleImage.textOverlay && typeof moduleImage.textOverlay === 'object') {
      merged.textOverlay = { ...(merged.textOverlay || {}), ...moduleImage.textOverlay };
    }
    if (typeof moduleImage.promptBase === 'string' && moduleImage.promptBase.trim()) {
      merged.coverPromptBase = moduleImage.promptBase.trim();
    }
    if (typeof moduleImage.coverPromptBase === 'string' && moduleImage.coverPromptBase.trim()) {
      merged.coverPromptBase = moduleImage.coverPromptBase.trim();
    }
    if (typeof moduleImage.inlinePromptBase === 'string' && moduleImage.inlinePromptBase.trim()) {
      merged.inlinePromptBase = moduleImage.inlinePromptBase.trim();
    }
    copyIf('coverSourceOrder', moduleImage.coverSourceOrder);
    copyIf('coverRatio', moduleImage.coverRatio);
    copyIf('coverAiEndpoint', moduleImage.coverAiEndpoint);
    copyIf('coverAiApiKeyEnv', moduleImage.coverAiApiKeyEnv);
    copyIf('coverAiResponseUrl', moduleImage.coverAiResponseUrl);
    copyIf('coverAiResponseBase64', moduleImage.coverAiResponseBase64);
    copyIf('coverAiResponseMime', moduleImage.coverAiResponseMime);
    copyIf('unsplashAccessKeyEnv', moduleImage.unsplashAccessKeyEnv);
    copyIf('unsplashQuery', moduleImage.unsplashQuery);
    return merged;
  }

  private async applyModuleCoverPrompt(args: {
    articleConfig: Record<string, any>;
    moduleContext?: PublishModuleContext;
    platform: string;
  }): Promise<Record<string, any>> {
    const cloned = { ...args.articleConfig };
    if (cloned.cover_prompt || cloned.coverPrompt) {
      return cloned;
    }
    const runtimeConfig = args.moduleContext?.runtimeConfig;
    if (!runtimeConfig) {
      return cloned;
    }
    const rawModule = String(cloned.module || args.moduleContext?.rawModule || '').trim();
    const moduleKey = rawModule ? this.resolveModuleKey(runtimeConfig, rawModule) : null;
    const moduleConfig = moduleKey ? runtimeConfig.modules[moduleKey] : args.moduleContext?.moduleConfig;
    const moduleName = moduleConfig?.label || moduleKey || rawModule || args.moduleContext?.moduleLabel || 'article';
    if (!moduleConfig) {
      return cloned;
    }
    const coverPrompt = await this.resolveCoverPrompt({
      runtimeConfig,
      moduleConfig,
      moduleName,
      platform: args.platform,
      fallbackPrompt: '',
    });
    if (coverPrompt) {
      cloned.cover_prompt = coverPrompt;
    }
    return cloned;
  }

  private resolveThumbImageSource(config: Record<string, any>): { type: 'path' | 'url'; value: string } | null {
    const fromPath = String(config.thumb_image_path || config.cover_image_path || '').trim();
    if (fromPath) {
      return { type: 'path', value: fromPath };
    }
    const fromUrl = String(config.thumb_image_url || config.cover_image_url || '').trim();
    if (fromUrl) {
      return { type: 'url', value: fromUrl };
    }
    return null;
  }

  private shouldUsePlaceholderCover(config: Record<string, any>): boolean {
    const flag = config.placeholder_cover ?? config.placeholderCover;
    if (flag === undefined || flag === null) {
      return true;
    }
    return flag === true;
  }

  private canAutoGenerateCover(config: Record<string, any>): boolean {
    const order = this.resolveCoverSourceOrder(config);
    return order.includes('ai') || order.includes('unsplash') || order.includes('script');
  }

  private resolveCoverSourceOrder(
    config: Record<string, any>
  ): Array<'ai' | 'unsplash' | 'script' | 'placeholder'> {
    const raw = config.cover_source_order || config.coverSourceOrder;
    if (Array.isArray(raw)) {
      const cleaned = raw
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => item === 'ai' || item === 'unsplash' || item === 'script' || item === 'placeholder') as Array<
        'ai' | 'unsplash' | 'script' | 'placeholder'
      >;
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
    return ['ai', 'unsplash', 'placeholder'];
  }

  private async resolveAutoCoverSource(args: {
    config: Record<string, any>;
    html: string;
    configDir?: string;
  }): Promise<{ type: 'path' | 'url'; value: string } | null> {
    const order = this.resolveCoverSourceOrder(args.config);
    for (const source of order) {
      if (source === 'ai') {
        try {
          const result = await this.tryGenerateCoverFromAI(args.config, args.html);
          if (result) return result;
        } catch (error) {
          console.warn(`[publish] AI 封面生成失败，降级处理: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (source === 'unsplash') {
        try {
          const result = await this.tryFetchCoverFromUnsplash(args.config);
          if (result) return result;
        } catch (error) {
          console.warn(`[publish] Unsplash 获取失败，降级处理: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (source === 'script') {
        try {
          const result = await this.tryGenerateCoverFromScript({
            config: args.config,
            html: args.html,
            configDir: args.configDir,
          });
          if (result) return result;
        } catch (error) {
          console.warn(`[publish] 封面脚本执行失败，降级处理: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (source === 'placeholder') {
        const placeholderPath = await this.generatePlaceholderCover({
          title: args.config.title,
          ratio: String(args.config.cover_ratio || '16:9'),
        });
        return { type: 'path', value: placeholderPath };
      }
    }
    return null;
  }

  private async tryGenerateCoverFromAI(
    config: Record<string, any>,
    html: string
  ): Promise<{ type: 'path' | 'url'; value: string } | null> {
    const endpoint = String(config.cover_ai_endpoint || config.coverAiEndpoint || '').trim();
    if (!endpoint) return null;

    const apiKey = String(
      config.cover_ai_api_key
      || process.env[String(config.cover_ai_api_key_env || config.coverAiApiKeyEnv || '')]
      || ''
    ).trim();
    const ratio = String(config.cover_ratio || '16:9');
    const payload = {
      title: config.title,
      content: this.stripHtml(html),
      prompt: config.cover_prompt || config.coverPrompt || '',
      ratio,
      mode: config.cover_mode || config.coverMode,
      input: config.cover_input || config.coverInput,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const result = await this.fetchJsonWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      60000
    ) as any;

    const urlPath = config.cover_ai_response_url || config.coverAiResponseUrl || 'imageUrl';
    const base64Path = config.cover_ai_response_base64 || config.coverAiResponseBase64 || 'imageBase64';
    const mimePath = config.cover_ai_response_mime || config.coverAiResponseMime || 'mime';
    const imageUrl = this.readByPath(result, urlPath);
    if (typeof imageUrl === 'string' && imageUrl.trim()) {
      return { type: 'url', value: imageUrl.trim() };
    }
    const imageBase64 = this.readByPath(result, base64Path);
    if (typeof imageBase64 === 'string' && imageBase64.trim()) {
      const mime = this.readByPath(result, mimePath) || 'image/png';
      const filePath = await this.writeBase64Temp(imageBase64, String(mime));
      return { type: 'path', value: filePath };
    }
    return null;
  }

  private resolveCoverScriptPath(config: Record<string, any>, configDir?: string): string | null {
    const raw = String(
      config.cover_script
      || config.coverScript
      || config.cover_script_path
      || config.coverScriptPath
      || ''
    ).trim();
    if (!raw) {
      return null;
    }
    return this.resolvePathFromConfig(configDir, raw) || path.resolve(process.cwd(), raw);
  }

  private async tryGenerateCoverFromScript(args: {
    config: Record<string, any>;
    html: string;
    configDir?: string;
  }): Promise<{ type: 'path'; value: string } | null> {
    const scriptPath = this.resolveCoverScriptPath(args.config, args.configDir);
    if (!scriptPath) {
      return null;
    }
    const ratio = String(args.config.cover_ratio || '16:9');
    const title = String(args.config.title || 'Untitled');
    const outputPath = path.join(
      os.tmpdir(),
      `lyra-cover-${Date.now()}-${Math.random().toString(16).slice(2)}.svg`
    );
    const payload = {
      title,
      content: this.stripHtml(args.html),
      prompt: String(args.config.cover_prompt || args.config.coverPrompt || ''),
      ratio,
      outputPath,
    };
    const inputFile = path.join(
      os.tmpdir(),
      `lyra-cover-input-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
    await fs.writeFile(inputFile, JSON.stringify(payload, null, 2), 'utf-8');
    const result = await this.runCoverScript(scriptPath, inputFile);
    const coverImage = result.coverImage || result.outputPath || outputPath;
    return { type: 'path', value: coverImage };
  }

  private async tryFetchCoverFromUnsplash(
    config: Record<string, any>
  ): Promise<{ type: 'url'; value: string } | null> {
    const accessKey = String(
      config.unsplash_access_key
      || process.env[String(config.unsplash_access_key_env || '')]
      || ''
    ).trim();
    const query = String(config.unsplash_query || config.cover_unsplash_query || config.title || '').trim();
    if (!accessKey || !query) return null;

    const apiBase = String(config.unsplash_api_base || 'https://api.unsplash.com').replace(/\/$/, '');
    const endpoint = String(config.unsplash_search_endpoint || '/search/photos').trim();
    const orientation = String(config.cover_ratio || '16:9') === '4:3' ? 'landscape' : 'landscape';
    const url = `${apiBase}${endpoint}?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}`;

    const result = await this.fetchJsonWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      },
      60000
    ) as any;

    const imageField = String(config.unsplash_image_field || 'results.0.urls.regular');
    const imageUrl = this.readByPath(result, imageField);
    if (typeof imageUrl === 'string' && imageUrl.trim()) {
      return { type: 'url', value: imageUrl.trim() };
    }
    return null;
  }

  private stripHtml(html: string): string {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private readByPath(obj: any, pathExpr: string): unknown {
    if (!pathExpr) return undefined;
    const parts = String(pathExpr).split('.').filter(Boolean);
    let current: any = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      if (part.match(/^\d+$/)) {
        current = current[Number(part)];
      } else {
        current = current[part];
      }
    }
    return current;
  }

  private async writeBase64Temp(base64: string, mime: string): Promise<string> {
    const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'bin';
    const filename = `lyra-cover-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const outPath = path.join(os.tmpdir(), filename);
    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(outPath, buffer);
    return outPath;
  }
  private async generatePlaceholderCover(args: { title: string; ratio: string }): Promise<string> {
    const ratio = args.ratio === '4:3' ? '4:3' : '16:9';
    const size = ratio === '4:3' ? { width: 1200, height: 900 } : { width: 1600, height: 900 };
    const title = String(args.title || 'Untitled').slice(0, 60);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">\n` +
      `  <defs>\n` +
      `    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n` +
      `      <stop offset="0%" stop-color="#0f172a"/>\n` +
      `      <stop offset="100%" stop-color="#1f2937"/>\n` +
      `    </linearGradient>\n` +
      `  </defs>\n` +
      `  <rect width="100%" height="100%" fill="url(#g)"/>\n` +
      `  <text x="80" y="160" fill="#e2e8f0" font-size="54" font-family="Arial, sans-serif" font-weight="700">${title}</text>\n` +
      `  <text x="80" y="230" fill="#94a3b8" font-size="24" font-family="Arial, sans-serif">Cover Placeholder · ${ratio}</text>\n` +
      `</svg>\n`;
    const filename = `lyra-cover-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
    const outPath = path.join(os.tmpdir(), filename);
    const sharpModule = await import('sharp');
    const sharp = (sharpModule as any).default || sharpModule;
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    return outPath;
  }

  private assignDraftThumbMedia(
    payload: Record<string, any>,
    mediaId: string,
    index = 0
  ): Record<string, any> {
    const cloned = JSON.parse(JSON.stringify(payload));
    if (cloned?.articles?.[index]) {
      cloned.articles[index].thumb_media_id = mediaId;
    }
    return cloned;
  }

  private async uploadWechatThumbMedia(args: {
    baseUrl: string;
    accessToken: string;
    source: { type: 'path' | 'url'; value: string };
    endpoint: string;
  }): Promise<{ media_id: string }> {
    const urlBase = String(args.baseUrl || 'https://api.weixin.qq.com/cgi-bin').replace(/\/$/, '');
    const endpoint = String(args.endpoint || '').trim();
    const uploadUrl = `${urlBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}&access_token=${args.accessToken}`;

    const form = new FormData();
    let buffer: ArrayBuffer;
    let filename = 'cover.jpg';
    let mime = 'image/jpeg';

    if (args.source.type === 'path') {
      const filePath = path.resolve(process.cwd(), args.source.value);
      const data = await fs.readFile(filePath);
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      filename = path.basename(filePath);
      mime = this.inferImageMime(filename);
    } else {
      const response = await fetch(args.source.value);
      if (!response.ok) {
        throw new Error(`封面图 URL 获取失败: ${response.status}`);
      }
      buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type');
      if (contentType) {
        mime = contentType.split(';')[0];
      }
    }

    form.append('media', new Blob([buffer], { type: mime }), filename);

    const result = await this.fetchJsonWithTimeout(
      uploadUrl,
      {
        method: 'POST',
        body: form as any,
      },
      60000
    ) as any;

    const mediaId = result?.media_id;
    if (!mediaId) {
      throw new Error('上传封面图失败，未返回 media_id');
    }
    return { media_id: mediaId };
  }

  private inferImageMime(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.jpeg' || ext === '.jpg') return 'image/jpeg';
    return 'image/jpeg';
  }

  private parsePublishAt(raw: string): Date | null {
    const value = String(raw || '').trim();
    if (!value) {
      return null;
    }
    if (value.includes('T')) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const normalized = value.replace(' ', 'T');
    const withSeconds = normalized.match(/:\d{2}$/) ? normalized : `${normalized}:00`;
    const parsed = new Date(withSeconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private runPublishScript(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = args[0];
      const ext = path.extname(scriptPath).toLowerCase();
      let command = 'python3';
      let commandArgs = args;
      if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
        command = 'node';
        commandArgs = [scriptPath, ...args.slice(1)];
      } else if (ext === '.py') {
        command = 'python3';
      }

      const child = spawn(command, commandArgs, { stdio: 'inherit' });
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`发布脚本退出码 ${code}`));
        }
      });
    });
  }

  /**
   * 处理 list 命令
   */
  private handleList(options: any = {}): void {
    const templates = this.templateRegistry.listTemplates();

    if (templates.length === 0) {
      console.log('📋 没有可用的模板类型');
      console.log('💡 提示: 使用 \'lyra init\' 初始化配置');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(templates, null, 2));
      return;
    }

    console.log('📋 可用的模板类型:\n');
    templates.forEach((template, index) => {
      const prefix = index === templates.length - 1 ? '└─' : '├─';
      console.log(`${prefix} ${template.name}`);
      console.log(`   ${template.description}`);
      if (index < templates.length - 1) {
        console.log('');
      }
    });

    console.log(`\n💡 使用 'lyra <template>' 或 'lyra create <template>' 生成内容`);
  }

  /**
   * 处理 init 命令
   */
  private async handleInit(options: any): Promise<void> {
    try {
      const configPath = '.lyrarc.json';
      
      // 检查配置文件是否已存在
      const configExists = await this.fileExists(configPath);
      
      if (configExists && !options.force) {
        console.log('⚠️  配置文件已存在');
        console.log('💡 使用 --force 参数强制覆盖');
        return;
      }

      // 创建默认配置
      const defaultConfig = {
        global: {
          logLevel: 'info',
          defaultTemplate: options.template
        },
        templates: {
          [options.template]: {
            enabled: true,
            template: {
              path: `./lyra/templates/${options.template}.hbs`
            },
            sources: {
              articles: './Input/Clippings',
              tools: [
                './Input/Resources/Tools',
                './Learning/Javascript'
              ],
              notes: './Learning'
            },
            output: {
              path: './Output/Z° North/Weekly/Drafts',
              filename: `${options.template}-{{year}}-#{{issueNumber}}.md`
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

      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      
      console.log('✅ 配置文件创建成功!');
      console.log(`📄 文件位置: ${configPath}`);
      console.log(`🎯 默认模板: ${options.template}`);
      console.log('\n💡 下一步:');
      console.log('  1. 根据需要修改配置文件');
      console.log('  2. 准备数据源目录');
      console.log(`  3. 运行 'lyra ${options.template}' 生成内容`);
      
    } catch (error) {
      console.error('❌ 创建配置文件失败:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 处理 config 命令
   */
  private async handleConfig(options: any): Promise<void> {
    try {
      const configPath = await this.findConfigFile();
      
      if (!configPath) {
        console.log('❌ 未找到配置文件');
        console.log('💡 使用 \'lyra init\' 创建配置文件');
        return;
      }

      if (options.show) {
        const configContent = await fs.readFile(configPath, 'utf-8');
        console.log('📋 当前配置:');
        console.log(configContent);
        return;
      }

      if (options.validate) {
        const configManager = new ConfigManager();
        const config = await configManager.load(configPath);
        const validation = configManager.validate(config);
        
        if (validation.valid) {
          console.log('✅ 配置文件验证通过');
        } else {
          console.log('❌ 配置文件验证失败:');
          validation.errors.forEach(error => {
            console.log(`  • ${error}`);
          });
        }
        return;
      }

      // 默认显示配置文件路径
      console.log(`📁 配置文件位置: ${configPath}`);
    } catch (error) {
      console.error('❌ 配置操作失败:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 处理 schedule 命令
   */
  private async handleSchedule(options: any): Promise<void> {
    try {
      // 自动查找配置文件
      let configPath = options.config;
      if (!configPath) {
        configPath = await this.findConfigFile();
        if (!configPath) {
          console.error('❌ 错误: 未找到配置文件');
          console.log('💡 提示: 使用 \'lyra init\' 创建配置文件');
          process.exit(1);
        }
        console.log(`📁 使用配置文件: ${configPath}`);
      }

      // 加载配置
      const configManager = new ConfigManager();
      const config = await configManager.load(configPath);

      // 创建调度器
      this.scheduler = new Scheduler(this.contentGenerator);

      // 添加调度任务
      let taskCount = 0;
      const tasks: Array<{template: string, cron: string, nextRun?: Date}> = [];

      for (const [templateType, templateConfig] of Object.entries(config.templates)) {
        if (templateConfig.schedule?.enabled && templateConfig.schedule.cron) {
          if (!options.dryRun) {
            this.scheduler.addTask(
              templateType,
              templateConfig.schedule.cron,
              {
                config: configPath,
                verbose: options.verbose,
              }
            );
          }
          
          const nextRun = options.dryRun ? null : this.scheduler.getNextRunTime(templateType);
          tasks.push({
            template: templateType,
            cron: templateConfig.schedule.cron,
            nextRun: nextRun || undefined
          });
          taskCount++;
        }
      }

      if (taskCount === 0) {
        console.log('⚠️  没有配置任何调度任务');
        console.log('💡 在配置文件中为模板添加 schedule 配置:');
        console.log(`
{
  "templates": {
    "weekly": {
      "schedule": {
        "enabled": true,
        "cron": "0 9 * * 1"
      }
    }
  }
}`);
        return;
      }

      // 显示调度任务信息
      console.log(`⏰ 发现 ${taskCount} 个调度任务:\n`);
      tasks.forEach((task, index) => {
        const prefix = index === tasks.length - 1 ? '└─' : '├─';
        console.log(`${prefix} ${task.template}`);
        console.log(`   📅 Cron: ${task.cron}`);
        if (task.nextRun) {
          console.log(`   ⏰ 下次执行: ${task.nextRun.toLocaleString()}`);
        }
        if (index < tasks.length - 1) {
          console.log('');
        }
      });

      if (options.dryRun) {
        console.log('\n👀 预览模式 - 调度器未实际启动');
        return;
      }

      // 启动调度器
      console.log(`\n🚀 启动调度器...`);
      this.scheduler.start();

      // 处理退出信号
      const cleanup = () => {
        console.log('\n🛑 正在停止调度器...');
        if (this.scheduler) {
          this.scheduler.stop();
        }
        console.log('✅ 调度器已停止');
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      if (options.daemon) {
        console.log('🔄 调度器正在后台运行...');
        console.log('💡 按 Ctrl+C 停止');
        // 保持进程运行
        setInterval(() => {}, 1000);
      } else {
        console.log('🔄 调度器正在运行...');
        console.log('💡 按 Ctrl+C 停止');
        // 保持进程运行
        process.stdin.resume();
      }
    } catch (error) {
      console.error('❌ 启动调度器失败:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 处理 check-images 命令
   */
  private async handleCheckImages(options: any): Promise<void> {
    try {
      const targetDir = path.resolve(process.cwd(), options.dir || 'Weekly');
      const allowRaw =
        options.allow ||
        process.env.IMAGE_ALLOWED_HOSTS ||
        'znorth-1300857483.cos.ap-chengdu.myqcloud.com,img.mrzzz.top';
      const allowedHosts = new Set(
        String(allowRaw)
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      );

      if (!(await this.fileExists(targetDir))) {
        console.log(`[check:image-hosts] 目录不存在，已跳过: ${targetDir}`);
        return;
      }

      const markdownFiles = await this.collectMarkdownFiles(targetDir);
      if (markdownFiles.length === 0) {
        console.log(`[check:image-hosts] 未找到 Markdown 文件，已跳过: ${targetDir}`);
        return;
      }

      const violations: Array<{
        filePath: string;
        line: number;
        host: string;
        url: string;
        source: 'markdown' | 'html';
      }> = [];
      let scannedLinkCount = 0;

      for (const filePath of markdownFiles) {
        const content = await fs.readFile(filePath, 'utf-8');
        const imageLinks = this.collectImageLinks(content);

        for (const link of imageLinks) {
          const normalizedUrl = this.sanitizeImageUrl(link.rawUrl);
          const host = this.parseHttpHost(normalizedUrl);
          if (!host) {
            continue;
          }

          scannedLinkCount += 1;
          if (allowedHosts.has(host)) {
            continue;
          }

          violations.push({
            filePath,
            line: this.getLineNumber(content, link.index),
            host,
            url: normalizedUrl,
            source: link.source,
          });
        }
      }

      console.log(
        `[check:image-hosts] 扫描完成: ${markdownFiles.length} 个文件, ${scannedLinkCount} 条 HTTP(S) 图片链接`
      );
      console.log(
        `[check:image-hosts] 允许域名: ${Array.from(allowedHosts).join(', ')}`
      );

      if (violations.length === 0) {
        console.log('[check:image-hosts] 通过: 未发现非白名单图片域名');
        return;
      }

      console.error(`[check:image-hosts] 发现 ${violations.length} 条非白名单图片链接:`);
      for (const item of violations) {
        const relativePath = path.relative(process.cwd(), item.filePath);
        console.error(
          `- ${relativePath}:${item.line} [${item.source}] ${item.host} -> ${item.url}`
        );
      }
      process.exit(1);
    } catch (error) {
      console.error('❌ 图片域名检查失败:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }



  /**
   * 处理 check-metadata 命令
   */
  private async handleCheckMetadata(options: any): Promise<void> {
    try {
      const targetRaw = String(options.path || '.').trim() || '.';
      const targetPath = path.resolve(process.cwd(), targetRaw);
      const shouldFixTags = options.fixTags === true;
      const shouldAITags = options.aiTags === true;
      const dryRun = options.dryRun === true;
      const strict = options.strict === true;
      const maxTags = this.parsePositiveInt(options.maxTags, 8);
      const minTags = this.parsePositiveInt(options.minTags, 1);

      const markdownFiles = await this.resolveMarkdownTargets(targetPath);
      if (markdownFiles.length === 0) {
        console.log('[check:metadata] 未找到 Markdown 文件: ' + targetPath);
        return;
      }

      let aiConfig: ArticleAIConfig | null = null;
      if (shouldAITags) {
        aiConfig = this.resolveTagAIConfig(options);
      }

      const issues: MetadataIssue[] = [];
      let modifiedCount = 0;
      let aiTaggedCount = 0;

      for (const filePath of markdownFiles) {
        const relativePath = path.relative(process.cwd(), filePath) || filePath;
        let raw = '';

        try {
          raw = await fs.readFile(filePath, 'utf-8');
        } catch (error) {
          issues.push({
            level: 'error',
            filePath: relativePath,
            message: '文件读取失败: ' + (error instanceof Error ? error.message : String(error)),
          });
          continue;
        }

        const hasFrontmatter = /^\uFEFF?---\s*\n/.test(raw);
        if (!hasFrontmatter) {
          issues.push({
            level: 'error',
            filePath: relativePath,
            message: '缺少 frontmatter，无法校验/整理 tags',
          });
          continue;
        }

        let parsed: matter.GrayMatterFile<string>;
        try {
          parsed = matter(raw);
        } catch (error) {
          issues.push({
            level: 'error',
            filePath: relativePath,
            message: 'frontmatter 解析失败: ' + (error instanceof Error ? error.message : String(error)),
          });
          continue;
        }

        const data = (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
          ? (parsed.data as Record<string, unknown>)
          : {};
        const title = typeof data.title === 'string' ? data.title.trim() : '';

        const parsedTags = this.parseFrontmatterTags(data.tags);
        for (const issue of parsedTags.issues) {
          issues.push({
            level: shouldFixTags || shouldAITags ? 'warning' : 'error',
            filePath: relativePath,
            message: issue,
          });
        }

        const normalized = parsedTags.tags
          .map((tag) => this.normalizeTag(tag))
          .filter(Boolean);
        const deduped = this.dedupeTags(normalized);
        const duplicateLevel: MetadataIssueLevel = (shouldFixTags || shouldAITags) ? 'warning' : 'error';

        if (deduped.duplicates.length > 0) {
          issues.push({
            level: duplicateLevel,
            filePath: relativePath,
            message: '发现重复/等价 tags: ' + deduped.duplicates.join(', '),
          });
        }

        const overLongTags = deduped.tags.filter((tag) => tag.length > 24);
        if (overLongTags.length > 0) {
          issues.push({
            level: 'warning',
            filePath: relativePath,
            message: '存在较长 tag（建议 <= 24 字符）: ' + overLongTags.join(', '),
          });
        }

        if (deduped.tags.length > maxTags) {
          issues.push({
            level: shouldFixTags || shouldAITags ? 'warning' : 'error',
            filePath: relativePath,
            message: 'tags 数量过多: ' + deduped.tags.length + '（建议 <= ' + maxTags + '）',
          });
        }

        let finalTags = deduped.tags.slice(0, maxTags);

        if (shouldAITags && aiConfig) {
          try {
            const aiTags = await this.generateTagsWithAI({
              title,
              content: parsed.content,
              currentTags: finalTags,
              maxTags,
              aiConfig,
            });
            if (aiTags.length > 0) {
              finalTags = this.mergeTags(finalTags, aiTags, maxTags);
              aiTaggedCount += 1;
            } else {
              issues.push({
                level: 'warning',
                filePath: relativePath,
                message: 'AI 未返回可用 tags，已保留本地清洗结果',
              });
            }
          } catch (error) {
            issues.push({
              level: 'warning',
              filePath: relativePath,
              message: 'AI 生成 tags 失败: ' + (error instanceof Error ? error.message : String(error)),
            });
          }
        }

        if (finalTags.length < minTags) {
          issues.push({
            level: 'error',
            filePath: relativePath,
            message: 'tags 数量不足: ' + finalTags.length + '（要求 >= ' + minTags + '）',
          });
        }

        const shouldUpdateTags = shouldFixTags || shouldAITags;
        const changed = JSON.stringify(data.tags) !== JSON.stringify(finalTags);

        if (shouldUpdateTags && changed) {
          const nextData: Record<string, unknown> = {
            ...data,
            tags: finalTags,
          };
          const nextRaw = matter.stringify(parsed.content, nextData);
          if (!dryRun) {
            await fs.writeFile(filePath, nextRaw, 'utf-8');
          }
          modifiedCount += 1;
        }
      }

      const errorCount = issues.filter((issue) => issue.level === 'error').length;
      const warningCount = issues.length - errorCount;

      console.log('[check:metadata] 扫描完成: ' + markdownFiles.length + ' 个 Markdown 文件');
      console.log(
        '[check:metadata] 模式: fixTags=' + shouldFixTags + ', aiTags=' + shouldAITags + ', dryRun=' + dryRun + ', maxTags=' + maxTags + ', minTags=' + minTags
      );
      if (shouldAITags && aiConfig) {
        console.log('[check:metadata] AI: provider=' + (aiConfig.provider || 'local') + ', model=' + (aiConfig.model || '(default)'));
      }
      if (shouldFixTags || shouldAITags) {
        console.log(
          '[check:metadata] ' + (dryRun ? '预览修改文件数' : '已修改文件数') + ': ' + modifiedCount + (shouldAITags ? ', AI 参与文件: ' + aiTaggedCount : '')
        );
      }

      if (issues.length === 0) {
        console.log('[check:metadata] 通过: 未发现元数据或 tag 问题');
        return;
      }

      const print = errorCount > 0 ? console.error : console.log;
      print('[check:metadata] 问题统计: error=' + errorCount + ', warning=' + warningCount);
      for (const issue of issues) {
        const prefix = issue.level === 'error' ? 'ERROR' : 'WARN';
        print('- [' + prefix + '] ' + issue.filePath + ': ' + issue.message);
      }

      if (errorCount > 0 || (strict && warningCount > 0)) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ 元数据检查失败:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async resolveMarkdownTargets(targetPath: string): Promise<string[]> {
    if (!(await this.fileExists(targetPath))) {
      throw new Error('路径不存在: ' + targetPath);
    }

    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
      if (!targetPath.toLowerCase().endsWith('.md')) {
        throw new Error('仅支持 Markdown 文件: ' + targetPath);
      }
      return [targetPath];
    }

    if (stat.isDirectory()) {
      return this.collectMarkdownFiles(targetPath);
    }

    throw new Error('不支持的路径类型: ' + targetPath);
  }

  private parseFrontmatterTags(rawTags: unknown): ParsedTagResult {
    const result: ParsedTagResult = {
      tags: [],
      issues: [],
    };

    if (rawTags === undefined || rawTags === null) {
      result.issues.push('缺少 tags 字段');
      return result;
    }

    if (typeof rawTags === 'string') {
      result.tags = this.splitTagTokens(rawTags);
      return result;
    }

    if (Array.isArray(rawTags)) {
      for (const item of rawTags) {
        if (typeof item !== 'string') {
          result.issues.push('tags 包含非字符串项: ' + String(item));
          continue;
        }
        result.tags.push(...this.splitTagTokens(item));
      }
      return result;
    }

    result.issues.push('tags 类型无效: ' + typeof rawTags);
    return result;
  }

  private splitTagTokens(input: string): string[] {
    return String(input)
      .split(/[，,；;|、]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeTag(tag: string): string {
    const compact = String(tag || '')
      .replace(/^#+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!compact) {
      return '';
    }

    if (/^[a-zA-Z0-9._/-]+$/.test(compact)) {
      return compact.toLowerCase();
    }

    return compact;
  }

  private dedupeTags(tags: string[]): { tags: string[]; duplicates: string[] } {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const deduped: string[] = [];

    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        duplicates.push(tag);
        continue;
      }
      seen.add(key);
      deduped.push(tag);
    }

    return {
      tags: deduped,
      duplicates,
    };
  }

  private resolveTagAIConfig(options: any): ArticleAIConfig {
    const providerRaw = String(options.provider || process.env.LYRA_TAG_AI_PROVIDER || 'local')
      .trim()
      .toLowerCase();
    const provider = (providerRaw === 'openai' || providerRaw === 'anthropic' || providerRaw === 'gemini' || providerRaw === 'google' || providerRaw === 'local')
      ? (providerRaw === 'google' ? 'gemini' : providerRaw)
      : 'local';

    const defaultModel = provider === 'openai'
      ? 'gpt-4o-mini'
      : provider === 'anthropic'
        ? 'claude-3-5-sonnet-latest'
        : provider === 'gemini'
          ? 'gemini-1.5-flash'
          : 'llama3.1';

    const envApiKey = provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : provider === 'gemini'
          ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
          : process.env.LOCAL_MODEL_API_KEY;

    const apiKeyRaw = String(options.apiKey || envApiKey || '').trim();
    const apiKey = apiKeyRaw ? this.resolveEnvValue(apiKeyRaw) : '';

    if ((provider === 'openai' || provider === 'anthropic' || provider === 'gemini') && !apiKey) {
      throw new Error(provider + ' provider 缺少 apiKey（可通过 --api-key 或环境变量提供）');
    }

    return {
      enabled: true,
      provider,
      model: String(options.model || defaultModel).trim() || defaultModel,
      apiKey: apiKey || undefined,
      baseUrl: String(options.baseUrl || '').trim() || undefined,
      timeout: this.parsePositiveInt(options.timeout, 60000),
      maxRetries: this.parsePositiveInt(options.maxRetries, 2),
      temperature: 0.3,
      maxTokens: 300,
    };
  }

  private async generateTagsWithAI(args: {
    title: string;
    content: string;
    currentTags: string[];
    maxTags: number;
    aiConfig: ArticleAIConfig;
  }): Promise<string[]> {
    const clippedContent = String(args.content || '').trim().slice(0, 4000);
    if (!clippedContent) {
      return [];
    }

    const prompt = [
      '你是内容标签整理助手。',
      '请根据标题和正文，输出可直接用于 frontmatter 的 tags。',
      '仅输出 JSON 数组，不要解释，不要 Markdown 代码块。',
      '标签数量: 3-' + args.maxTags,
      '要求:',
      '- 避免重复、同义重复、过于空泛的标签（如 记录、随想、日常）',
      '- 中文优先，必要时可保留技术英文词',
      '- 标签尽量短（建议 2-12 字）',
      '',
      '标题: ' + (args.title || '(无标题)'),
      '现有标签: ' + (args.currentTags.join(', ') || '(无)'),
      '正文:',
      clippedContent,
    ].join('\n');

    const raw = await this.requestModelCompletion(prompt, args.aiConfig);
    return this.parseAIGeneratedTags(raw, args.maxTags);
  }

  private parseAIGeneratedTags(raw: string, maxTags: number): string[] {
    const cleaned = String(raw || '').trim();

    const parseArray = (input: string): string[] => {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string');
        }
        return [];
      } catch {
        return [];
      }
    };

    let candidates = parseArray(cleaned);

    if (candidates.length === 0) {
      const matched = cleaned.match(/\[[\s\S]*\]/);
      if (matched) {
        candidates = parseArray(matched[0]);
      }
    }

    if (candidates.length === 0) {
      candidates = cleaned
        .split(/[\n，,；;|、]+/)
        .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean);
    }

    const normalized = candidates
      .map((item) => this.normalizeTag(item))
      .filter(Boolean);

    return this.dedupeTags(normalized).tags.slice(0, maxTags);
  }

  private mergeTags(existingTags: string[], aiTags: string[], maxTags: number): string[] {
    const merged = [...existingTags, ...aiTags]
      .map((tag) => this.normalizeTag(tag))
      .filter(Boolean);

    return this.dedupeTags(merged).tags.slice(0, maxTags);
  }

  /**
   * 自动查找配置文件
   */
  private async findConfigFile(): Promise<string | null> {
    const configFilenames = [
      '.lyrarc',
      '.lyrarc.json',
      '.lyrarc.yaml',
      '.lyrarc.yml',
      '.lyrarc.js',
      '.lyrarc.cjs',
      '.lyrarc.mjs',
      'lyra.config.json',
      'lyra.config.js',
      'lyra.config.cjs',
      'lyra.config.mjs'
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
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async collectMarkdownFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const childFiles = await this.collectMarkdownFiles(fullPath);
        files.push(...childFiles);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private isSuggestionCandidateFile(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    if (!name.endsWith('.md')) {
      return false;
    }
    if (name === '_index.md') {
      return false;
    }
    if (name.startsWith('_template')) {
      return false;
    }
    if (name.startsWith('.')) {
      return false;
    }
    return true;
  }

  private collectImageLinks(content: string): Array<{
    rawUrl: string;
    index: number;
    source: 'markdown' | 'html';
  }> {
    const links: Array<{
      rawUrl: string;
      index: number;
      source: 'markdown' | 'html';
    }> = [];

    const markdownImageRegex = /!\[[^\]]*]\(([^)]+)\)/g;
    const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;

    let match = markdownImageRegex.exec(content);
    while (match) {
      links.push({
        rawUrl: match[1],
        index: match.index,
        source: 'markdown',
      });
      match = markdownImageRegex.exec(content);
    }

    match = htmlImageRegex.exec(content);
    while (match) {
      links.push({
        rawUrl: match[1],
        index: match.index,
        source: 'html',
      });
      match = htmlImageRegex.exec(content);
    }

    return links;
  }

  private sanitizeImageUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      return trimmed.slice(1, -1).trim();
    }
    const firstToken = trimmed.split(/\s+/)[0];
    return firstToken || '';
  }

  private parseHttpHost(value: string): string | null {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.host.toLowerCase();
    } catch {
      return null;
    }
  }

  private getLineNumber(content: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i += 1) {
      if (content.charCodeAt(i) === 10) {
        line += 1;
      }
    }
    return line;
  }

  private async handlePrompt(options: any): Promise<void> {
    await this.handleArticle(options, 'prompt');
  }

  private async handleArticle(
    options: any,
    entryMode: 'article' | 'prompt' = 'article'
  ): Promise<void> {
    const logPrefix = entryMode === 'article' ? '[article]' : '[prompt]';
    try {
      const runtimeConfig = await this.resolvePromptRuntimeConfig(options);
      const profilesPath = this.resolvePathFromConfig(
        runtimeConfig.configDir,
        options.profiles || runtimeConfig.profilesPath
      ) || path.resolve(process.cwd(), '.lyra-prompts.json');
      const platformRulesPath = this.resolvePathFromConfig(
        runtimeConfig.configDir,
        options.platformRules || runtimeConfig.platformRulesPath
      );
      const profiles = await this.loadPromptProfiles(profilesPath);
      const platformRules = await this.loadPlatformPromptRules(platformRulesPath, runtimeConfig);
      const suggestionLimit = this.parsePositiveInt(options.limit, 8);

      let moduleRaw = String(
        options.module
          || options.topic
          || runtimeConfig.defaultModule
          || runtimeConfig.defaultTopic
          || ''
      ).trim();
      let moduleKey = this.resolveModuleKey(runtimeConfig, moduleRaw || undefined);
      const moduleConfigByCli = moduleKey ? runtimeConfig.modules[moduleKey] : undefined;
      const suggestionDirs = this.resolveSuggestionDirs(
        options.from,
        (moduleConfigByCli?.sources && moduleConfigByCli.sources.length > 0)
          ? moduleConfigByCli.sources
          : runtimeConfig.suggestionDirs
      );
      const shouldSuggestExplicit = options.suggest === true;
      const shouldAutoIdea = options.autoIdea === true;
      let suggestions: TopicSuggestion[] = [];

      if (options.list) {
        const entries = Object.entries(profiles);
        if (entries.length === 0) {
          console.log(`${logPrefix} 当前没有可用的主题模板`);
          return;
        }
        console.log(`${logPrefix} 可用主题模板:`);
        for (const [name, profile] of entries) {
          const desc = (profile.description || '').trim();
          console.log(`- ${name}${desc ? `: ${desc}` : ''}`);
        }
        if (!(await this.fileExists(profilesPath))) {
          console.log(`${logPrefix} 当前使用内置模板。可新建自定义文件: ${profilesPath}`);
        } else {
          console.log(`${logPrefix} 已加载自定义模板: ${profilesPath}`);
        }
        console.log(
          `${logPrefix} 可用平台: ${Object.entries(platformRules)
            .map(([key, value]) => `${key}${value.description ? `(${value.description})` : ''}`)
            .join(', ')}`
        );
        if (Object.keys(runtimeConfig.modules).length > 0) {
          console.log(`${logPrefix} 可用模块:`);
          for (const module of Object.values(runtimeConfig.modules)) {
            console.log(`- ${module.key} (${module.label})`);
          }
        }
        return;
      }

      let wizardResult: PromptWizardResult | null = null;
      const shouldRunWizard = options.interactive === true;

      if (shouldRunWizard) {
        wizardResult = await this.runPromptWizard({
          profiles,
          platformRules,
          suggestionDirs,
          suggestionLimit,
          options,
          runtimeConfig,
        });
        if (!wizardResult) {
          return;
        }
      }

      let topicRaw =
        (options.topic || wizardResult?.topic || runtimeConfig.defaultTopic || '').trim();
      let platformRaw =
        (options.platform || wizardResult?.platform || runtimeConfig.defaultPlatform || '').trim();
      let moduleName = (options.module || wizardResult?.moduleName || topicRaw || '').trim();
      let idea = (options.idea || wizardResult?.idea || '').trim();
      let sourcePath = options.source || wizardResult?.sourcePath;
      let outputPath = options.out || wizardResult?.outPath;
      const requirements = (options.requirements || wizardResult?.requirements || '').trim();

      moduleRaw = moduleRaw || moduleName || topicRaw;
      moduleKey = this.resolveModuleKey(runtimeConfig, moduleRaw || undefined);
      const resolvedModuleConfig = moduleKey ? runtimeConfig.modules[moduleKey] : undefined;

      const shouldImplicitSuggest = !idea && !shouldAutoIdea && !shouldSuggestExplicit;
      const shouldCollectSuggestions = shouldSuggestExplicit || shouldAutoIdea || shouldImplicitSuggest;
      if (shouldCollectSuggestions) {
        suggestions = await this.collectTopicSuggestions(suggestionDirs, suggestionLimit);
        const targetTopic = resolvedModuleConfig?.label || moduleName || topicRaw;
        suggestions = this.filterSuggestionsByTopic(suggestions, targetTopic);
      }

      if (shouldSuggestExplicit || shouldImplicitSuggest) {
        if (suggestions.length === 0) {
          console.log(`${logPrefix} 未提取到可用议题`);
          console.log(`${logPrefix} 已扫描目录: ${suggestionDirs.join(', ')}`);
          return;
        }
        if (shouldImplicitSuggest) {
          console.log(`${logPrefix} 未提供 --idea，已默认进入推荐模式（等价 --suggest）`);
        }
        const shouldOfferSelection = entryMode === 'article' && !idea;
        if (shouldOfferSelection) {
          const picked = await this.selectTopicSuggestionInteractively({
            logPrefix,
            suggestions,
          });
          if (picked === 'cancel') {
            return;
          }
          if (picked) {
            topicRaw = topicRaw || picked.topic || '';
            idea = picked.idea;
            sourcePath = sourcePath || picked.sourcePath;
            if (picked.sourcePath) {
              const relative = path.relative(process.cwd(), picked.sourcePath);
              console.log(
                `${logPrefix} 已选择议题: [${picked.topic || '手动'}] ${picked.idea} (来源: ${relative || picked.sourcePath})`
              );
            } else {
              console.log(`${logPrefix} 已选择议题: ${picked.idea}`);
            }
          } else {
            this.printTopicSuggestions(logPrefix, suggestions);
            return;
          }
        } else {
          this.printTopicSuggestions(logPrefix, suggestions);
          return;
        }
      }

      if (shouldAutoIdea) {
        const best = suggestions[0];
        if (!best) {
          console.error(`${logPrefix} 自动提取议题失败，请先用 --suggest 检查目录内容`);
          process.exit(1);
        }
        topicRaw = topicRaw || best.topic;
        idea = idea || best.idea;
        sourcePath = sourcePath || best.filePath;
        console.log(
          `${logPrefix} 自动议题: [${best.topic}] ${best.idea} (来源: ${path.relative(process.cwd(), best.filePath) || best.filePath})`
        );
      }

      if (!idea) {
        console.error(`${logPrefix} 缺少 --idea（可使用 --auto-idea 或直接不传进入推荐模式）`);
        process.exit(1);
      }

      if (!platformRaw) {
        platformRaw = runtimeConfig.defaultPlatform || 'wechat';
      }
      const platformKey = this.resolvePlatformKey(platformRules, platformRaw);
      if (!platformKey) {
        console.error(`${logPrefix} 未找到平台规则: ${platformRaw}`);
        console.error(`${logPrefix} 可用平台: ${Object.keys(platformRules).join(', ')}`);
        process.exit(1);
      }

      moduleKey = this.resolveModuleKey(runtimeConfig, moduleRaw || moduleName || topicRaw);
      const moduleConfig = moduleKey ? runtimeConfig.modules[moduleKey] : undefined;
      const moduleLabel = moduleConfig?.label || moduleName || topicRaw || moduleKey || '';

      if (!topicRaw) {
        topicRaw = moduleLabel || moduleKey || 'default';
      }

      const topicKey = this.resolvePromptTopicKey(profiles, topicRaw)
        || this.resolvePromptTopicKey(profiles, moduleLabel)
        || this.resolvePromptTopicKey(profiles, moduleKey || '')
        || this.resolvePromptTopicKey(profiles, 'default')
        || Object.keys(profiles)[0];
      if (!topicKey) {
        console.error(`${logPrefix} 未找到可用主题模板`);
        process.exit(1);
      }

      if (!moduleName) {
        moduleName = moduleLabel || topicKey;
      }
      const displayTopic = moduleLabel || moduleName || topicRaw || topicKey;

      const profile = profiles[topicKey];
      const source = await this.readPromptSource(sourcePath);
      const profileParts = this.renderPromptProfileParts(profile, {
        topic: displayTopic,
        topicTemplate: topicKey,
        module: moduleName,
        platform: platformKey,
        idea,
        requirements,
        source,
        today: this.formatDate(new Date()),
        now: new Date().toISOString(),
      });
      const modulePrompt = await this.readModulePromptParts({
        explicitPath: options.modulePrompt,
        platform: platformKey,
        moduleName,
        moduleKey: moduleKey || undefined,
        moduleConfig,
        modulePromptMap: runtimeConfig.modulePromptMap,
        modulesBaseDir: runtimeConfig.modulesBaseDir,
        configDir: runtimeConfig.configDir,
      });
      let rendered = this.composeLayeredPrompt({
        topic: displayTopic,
        topicTemplate: topicKey,
        moduleName,
        platform: platformKey,
        requirements,
        profileParts,
        platformRule: platformRules[platformKey] || {},
        modulePrompt,
        baseSystemPrompt: runtimeConfig.baseSystemPrompt,
      });
      rendered = await this.runHookIfConfigured({
        hookName: 'prompt.before',
        hooks: runtimeConfig.hooks,
        configDir: runtimeConfig.configDir,
        payload: { renderedPrompt: rendered },
        context: {
          module: moduleName,
          platform: platformKey,
          template: runtimeConfig.templateName,
          idea,
        },
      }).then((result) => String(result.renderedPrompt || rendered));

      console.log(
        `${logPrefix} 已组装分层 Prompt: 平台=${platformKey}, 模块=${moduleName}, 主题模板=${topicKey}`
      );
      if (modulePrompt.filePath) {
        console.log(
          `${logPrefix} 模块 Prompt: ${path.relative(process.cwd(), modulePrompt.filePath) || modulePrompt.filePath}`
        );
      }

      const shouldGenerateArticle =
        entryMode === 'article' &&
        options.promptOnly !== true &&
        options.dryRun !== true;
      let generatedArticle: GeneratedArticlePayload | null = null;
      const lengthConstraint = this.resolveLengthConstraint({
        requirements,
        renderedPrompt: rendered,
      });
      if (shouldGenerateArticle) {
        generatedArticle = await this.generateArticleFromPrompt({
          renderedPrompt: rendered,
          idea,
          moduleName,
          platform: platformKey,
          runtimeConfig,
          requirements,
          lengthConstraint,
          imageRatio: this.resolveCoverRatio(runtimeConfig.articleImage.ratio),
        });
        generatedArticle = await this.runHookIfConfigured({
          hookName: 'image.generate',
          hooks: runtimeConfig.hooks,
          configDir: runtimeConfig.configDir,
          payload: { ...generatedArticle },
          context: {
            module: moduleName,
            platform: platformKey,
            template: runtimeConfig.templateName,
            idea,
          },
        }) as GeneratedArticlePayload;
        generatedArticle = await this.ensureArticlePromptCompliance({
          payload: generatedArticle,
          renderedPrompt: rendered,
          runtimeConfig,
          idea,
          moduleName,
          platform: platformKey,
        });
        if (lengthConstraint.minChars || lengthConstraint.maxChars) {
          generatedArticle = await this.ensureArticleWithinLength({
            payload: generatedArticle,
            constraint: lengthConstraint,
            runtimeConfig,
            idea,
            moduleName,
            platform: platformKey,
          });
        }
        if (lengthConstraint.minChars || lengthConstraint.maxChars) {
          const finalContentLength = this.estimateReadableLength(generatedArticle.content);
          if (!this.isLengthWithinConstraint(finalContentLength, lengthConstraint)) {
            const expected = this.describeLengthConstraint(lengthConstraint) || '未指定';
            throw new Error(
              `正文长度未满足约束（仅统计正文 content，不含 Nanobana 生图提示词）：当前 ${finalContentLength} 字，要求 ${expected}`
            );
          }
          console.log(
            `${logPrefix} 正文字数（不含生图提示词）: ${finalContentLength}`
          );
        }
        generatedArticle = await this.maybeGenerateArticleCoverImage({
          payload: generatedArticle,
          runtimeConfig,
          moduleConfig,
          moduleName: moduleLabel || moduleName || '生活志',
          platform: platformKey,
        });
      }

      rendered = await this.runHookIfConfigured({
        hookName: 'prompt.after',
        hooks: runtimeConfig.hooks,
        configDir: runtimeConfig.configDir,
        payload: { renderedPrompt: rendered },
        context: {
          module: moduleName,
          platform: platformKey,
          template: runtimeConfig.templateName,
          idea,
        },
      }).then((result) => String(result.renderedPrompt || rendered));

      const finalOutput =
        generatedArticle
          ? this.formatGeneratedArticleMarkdown(generatedArticle, {
              moduleName: moduleLabel || moduleName || '生活志',
              insertCoverImage: runtimeConfig.articleImage.insertCoverImage !== false,
            })
          : rendered;

      if (!outputPath && entryMode === 'article') {
        if (generatedArticle) {
          outputPath = this.buildDefaultArticleOutputPath({
            runtimeConfig,
            moduleConfig,
            moduleName,
            title: generatedArticle.title,
          });
        } else {
          outputPath = this.buildDefaultPromptOutputPath({
            runtimeConfig,
            moduleConfig,
            moduleName,
            platformKey,
            idea,
          });
        }
      }

      if (outputPath) {
        const outPath = this.resolvePathFromConfig(runtimeConfig.configDir, outputPath)
          || path.resolve(process.cwd(), outputPath);
        if (options.dryRun) {
          console.log(`${logPrefix} dry-run: 将写入 ${outPath}`);
        } else {
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, `${finalOutput}\n`, 'utf-8');
          console.log(`${logPrefix} 已写入: ${outPath}`);
          if (generatedArticle) {
            await this.writeArticleExports({
              markdownPath: outPath,
              markdownContent: finalOutput,
              exportConfig: runtimeConfig.templateExport,
            });
          }
        }
      }

      if (generatedArticle) {
        console.log('-----BEGIN ARTICLE-----');
        console.log(finalOutput);
        console.log('-----END ARTICLE-----');
      } else {
        console.log('-----BEGIN PROMPT-----');
        console.log(rendered);
        console.log('-----END PROMPT-----');
      }
    } catch (error) {
      console.error(`❌ ${entryMode === 'article' ? 'Article' : 'Prompt'} 生成失败:`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async resolvePromptRuntimeConfig(options: any): Promise<ResolvedPromptRuntimeConfig> {
    let configPath = '';
    let configDir = process.cwd();
    let loadedConfig: any = null;

    try {
      configPath = options.config
        ? path.resolve(process.cwd(), options.config)
        : ((await this.findConfigFile()) || '');
      if (configPath) {
        configDir = path.dirname(configPath);
        const configManager = new ConfigManager();
        loadedConfig = await configManager.load(configPath);
      }
    } catch (error) {
      console.warn(
        `[article] 读取配置失败，尝试以原始配置继续: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      if (configPath) {
        loadedConfig = await this.loadRawConfigForPrompting(configPath);
      }
    }

    const templates = loadedConfig?.templates || {};
    const defaultTemplate = loadedConfig?.global?.defaultTemplate || 'weekly';
    const articleTemplateConfig = templates?.article || {};
    const defaultTemplateConfig = templates?.[defaultTemplate] || {};
    const hasArticleTemplate = Object.keys(articleTemplateConfig).length > 0;
    const templateConfig = hasArticleTemplate ? articleTemplateConfig : defaultTemplateConfig;
    const globalConfig = (loadedConfig?.global && typeof loadedConfig.global === 'object')
      ? (loadedConfig.global as Record<string, any>)
      : {};
    const globalPrompting = (globalConfig.prompting && typeof globalConfig.prompting === 'object')
      ? (globalConfig.prompting as Record<string, any>)
      : {};
    const templatePrompting = (templateConfig?.prompting && typeof templateConfig.prompting === 'object')
      ? (templateConfig.prompting as Record<string, any>)
      : (templateConfig?.ai?.prompting || {}) as Record<string, any>;
    const prompting = this.mergePromptingConfig(globalPrompting, templatePrompting);
    const hooks = this.mergeHooks(
      (globalConfig.hooks && typeof globalConfig.hooks === 'object') ? globalConfig.hooks : {},
      (templateConfig?.hooks && typeof templateConfig.hooks === 'object') ? templateConfig.hooks : {}
    );

    const modulesRaw = (loadedConfig?.modules && typeof loadedConfig.modules === 'object')
      ? (loadedConfig.modules as Record<string, any>)
      : (globalConfig.modules && typeof globalConfig.modules === 'object')
        ? (globalConfig.modules as Record<string, any>)
        : (globalPrompting.modules && typeof globalPrompting.modules === 'object')
          ? (globalPrompting.modules as Record<string, any>)
          : (templatePrompting.modules && typeof templatePrompting.modules === 'object')
            ? (templatePrompting.modules as Record<string, any>)
            : {};

    const defaultOutputBaseDir = path.resolve(process.cwd(), '../Output/Z° North');
    const outputBaseDir = this.resolvePathFromConfig(
      configDir,
      globalConfig.outputBaseDir || prompting.outputBaseDir
        || (hasArticleTemplate
          ? (templateConfig?.output?.baseDir || templateConfig?.output?.path)
          : undefined)
    ) || defaultOutputBaseDir;

    const moduleBaseDir = this.resolvePathFromConfig(
      configDir,
      globalConfig.moduleBaseDir || prompting.modulesBaseDir
    ) || outputBaseDir;

    const modulesBaseDir = moduleBaseDir;

    const sourcePoolsFromConfig = this.resolveSourcePools(prompting.sourcePools, configDir);
    const suggestionDirs = Array.isArray(prompting.suggestionDirs)
      ? prompting.suggestionDirs
          .filter((item) => typeof item === 'string' && item.trim())
          .map((item) => this.resolvePathFromConfig(configDir, item) || path.resolve(process.cwd(), item))
      : sourcePoolsFromConfig;
    const finalSuggestionDirs = suggestionDirs.length > 0
      ? suggestionDirs
      : this.parseSuggestionDirs('./Input,./Learning');
    const modulePromptMap = this.normalizeModulePromptMap(
      prompting.modulePromptMap,
      modulesBaseDir,
      configDir
    );

    const modules = this.resolvePromptModules(modulesRaw, {
      configDir,
      modulesBaseDir,
      outputBaseDir,
    });
    const articleAI = this.resolveArticleAIConfig(globalConfig.ai, templateConfig?.ai, prompting);
    const articleImage = this.resolveArticleImageConfig(globalConfig.ai, templateConfig?.ai, prompting);

    return {
      configPath: configPath || undefined,
      configDir,
      profilesPath: prompting.profilesPath || '.lyra-prompts.json',
      platformRulesPath: prompting.platformRulesPath || undefined,
      modulesBaseDir,
      modulePromptMap,
      suggestionDirs: finalSuggestionDirs,
      defaultPlatform: String(prompting.defaultPlatform || 'wechat'),
      defaultTopic:
        typeof prompting.defaultTopic === 'string' ? prompting.defaultTopic : undefined,
      defaultModule:
        typeof prompting.defaultModule === 'string'
          ? prompting.defaultModule
          : (typeof prompting.defaultTopic === 'string' ? prompting.defaultTopic : undefined),
      baseSystemPrompt:
        typeof prompting.baseSystemPrompt === 'string' && prompting.baseSystemPrompt.trim()
          ? prompting.baseSystemPrompt.trim()
          : '你是作者的长期写作搭档。语气像与朋友聊天：自然、真诚、具体，不装腔，不说空话。',
      outputBaseDir,
      moduleBaseDir,
      moduleDraftsDirName: String(globalConfig.moduleDraftsDirName || 'Drafts'),
      outputFilenameTemplate:
        typeof prompting.outputFilename === 'string' && prompting.outputFilename.trim()
          ? prompting.outputFilename.trim()
          : (
            hasArticleTemplate &&
            typeof templateConfig?.output?.filename === 'string' &&
            templateConfig.output.filename.trim()
          )
          ? templateConfig.output.filename.trim()
          : '{{date}}-{{platform}}-{{module}}-{{slug}}.md',
      moduleAliases: this.resolveModuleAliases(prompting.aliases, modules),
      modules,
      platformSystemPromptFiles: this.resolvePlatformSystemPromptFiles(
        prompting.platforms,
        configDir
      ),
      platformImageSystemPromptFiles: this.resolvePlatformImageSystemPromptFiles(
        prompting.platforms,
        configDir,
        'imageSystemPromptFile'
      ),
      platformImageCoverSystemPromptFiles: this.resolvePlatformImageSystemPromptFiles(
        prompting.platforms,
        configDir,
        'imageCoverSystemPromptFile'
      ),
      platformImageInlineSystemPromptFiles: this.resolvePlatformImageSystemPromptFiles(
        prompting.platforms,
        configDir,
        'imageInlineSystemPromptFile'
      ),
      articleAI,
      articleImage,
      outputDraftsDirName:
        typeof prompting.outputDraftsDirName === 'string' && prompting.outputDraftsDirName.trim()
          ? prompting.outputDraftsDirName.trim()
          : String(globalConfig.outputDraftsDirName || 'drafts'),
      hooks,
      templateName: hasArticleTemplate ? 'article' : defaultTemplate,
      templateExport: (templateConfig && typeof templateConfig.export === 'object')
        ? (templateConfig.export as Record<string, any>)
        : undefined,
    };
  }

  private resolveExportFormats(exportConfig: Record<string, any> | undefined): ExportFormat[] {
    const rawFormats = exportConfig?.formats;
    const supportedFormats: ExportFormat[] = ['markdown', 'html', 'wechat'];
    if (!Array.isArray(rawFormats) || rawFormats.length === 0) {
      return ['markdown'];
    }
    const normalized = rawFormats.filter((format: unknown): format is ExportFormat =>
      supportedFormats.includes(format as ExportFormat)
    );
    return normalized.length > 0 ? Array.from(new Set(normalized)) : ['markdown'];
  }

  private getExportFilePath(markdownPath: string, format: ExportFormat): string {
    const extension = path.extname(markdownPath);
    const basePath = extension ? markdownPath.slice(0, -extension.length) : markdownPath;
    if (format === 'html') return `${basePath}.html`;
    if (format === 'wechat') return `${basePath}.wechat.html`;
    return markdownPath;
  }

  private async writeArticleExports(args: {
    markdownPath: string;
    markdownContent: string;
    exportConfig?: Record<string, any>;
  }): Promise<void> {
    const exportFormats = this.resolveExportFormats(args.exportConfig).filter(
      (format) => format !== 'markdown'
    );
    if (exportFormats.length === 0) {
      return;
    }

    const exporter = new PlatformExporter();
    const wechatConfig = (args.exportConfig?.wechat && typeof args.exportConfig.wechat === 'object')
      ? (args.exportConfig.wechat as Record<string, any>)
      : {};
    const backgroundPreset = wechatConfig.backgroundPreset || 'plain';
    const validateWechatImages = wechatConfig.validateImages ?? true;
    const wechatTheme = wechatConfig.theme || DEFAULT_WECHAT_THEME;
    const imageProxyUrl = wechatConfig.imageProxyUrl;
    const inaccessibleImageDomains = wechatConfig.inaccessibleImageDomains;
    const imageOptimization = wechatConfig.imageOptimization;

    for (const format of exportFormats) {
      const exportResult = await exporter.export(args.markdownContent, format, {
        includeStyles: true,
        backgroundImage: undefined,
        backgroundPreset: format === 'wechat' ? backgroundPreset : undefined,
        wechatTheme: format === 'wechat' ? wechatTheme : undefined,
        validateImages: format === 'wechat' ? validateWechatImages : false,
        imageProxyUrl: format === 'wechat' ? imageProxyUrl : undefined,
        inaccessibleImageDomains: format === 'wechat' ? inaccessibleImageDomains : undefined,
        imageOptimization: format === 'wechat' ? imageOptimization : undefined,
      });

      const exportPath = this.getExportFilePath(args.markdownPath, format);
      const normalizedContent = exportResult.content.replace(/\r\n/g, '\n');
      await fs.writeFile(exportPath, normalizedContent, { encoding: 'utf-8' });

      if (exportResult.warnings.length > 0) {
        exportResult.warnings.forEach((warning) => console.warn(`[${format}] ${warning}`));
      }
    }
  }

  private async loadRawConfigForPrompting(configPath: string): Promise<Record<string, unknown> | null> {
    try {
      const ext = path.extname(configPath).toLowerCase();
      if (ext && ext !== '.json' && !configPath.endsWith('.lyrarc')) {
        return null;
      }
      const raw = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private resolvePathFromConfig(configDir: string | undefined, inputPath?: string): string | undefined {
    if (!inputPath || typeof inputPath !== 'string') {
      return undefined;
    }
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    return path.resolve(configDir || process.cwd(), inputPath);
  }

  private mergeAIConfig(globalAI: unknown, templateAI: unknown): Record<string, unknown> {
    const base = (globalAI && typeof globalAI === 'object' && !Array.isArray(globalAI))
      ? (globalAI as Record<string, unknown>)
      : {};
    const override = (templateAI && typeof templateAI === 'object' && !Array.isArray(templateAI))
      ? (templateAI as Record<string, unknown>)
      : {};

    const merged = {
      ...base,
      ...override,
    } as Record<string, unknown>;

    if (base.options || override.options) {
      const baseOptions = (base.options && typeof base.options === 'object' && !Array.isArray(base.options))
        ? (base.options as Record<string, unknown>)
        : {};
      const overrideOptions = (override.options && typeof override.options === 'object' && !Array.isArray(override.options))
        ? (override.options as Record<string, unknown>)
        : {};
      merged.options = { ...baseOptions, ...overrideOptions };
    }

    return merged;
  }

  private mergePromptingConfig(
    globalPrompting: Record<string, any>,
    templatePrompting: Record<string, any>
  ): Record<string, any> {
    const merged = { ...globalPrompting, ...templatePrompting };
    if (globalPrompting.platforms || templatePrompting.platforms) {
      merged.platforms = {
        ...(globalPrompting.platforms || {}),
        ...(templatePrompting.platforms || {}),
      };
    }
    if (globalPrompting.modules || templatePrompting.modules) {
      merged.modules = {
        ...(globalPrompting.modules || {}),
        ...(templatePrompting.modules || {}),
      };
    }
    if (globalPrompting.aliases || templatePrompting.aliases) {
      merged.aliases = {
        ...(globalPrompting.aliases || {}),
        ...(templatePrompting.aliases || {}),
      };
    }
    return merged;
  }

  private mergeHooks(
    globalHooks: Record<string, any>,
    templateHooks: Record<string, any>
  ): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries(globalHooks || {})) {
      if (typeof value === 'string' && value.trim()) {
        merged[key] = value.trim();
      }
    }
    for (const [key, value] of Object.entries(templateHooks || {})) {
      if (typeof value === 'string' && value.trim()) {
        merged[key] = value.trim();
      }
    }
    return merged;
  }

  private resolveSourcePools(
    sourcePools: unknown,
    configDir: string
  ): string[] {
    const pools: string[] = [];
    if (sourcePools && typeof sourcePools === 'object' && !Array.isArray(sourcePools)) {
      for (const value of Object.values(sourcePools as Record<string, unknown>)) {
        if (typeof value !== 'string' || !value.trim()) {
          continue;
        }
        const resolved = this.resolvePathFromConfig(configDir, value.trim());
        if (resolved) {
          pools.push(resolved);
        }
      }
    }
    if (pools.length > 0) {
      return Array.from(new Set(pools));
    }
    return this.parseSuggestionDirs('./Input,./Learning');
  }

  private resolvePromptModules(
    raw: unknown,
    args: {
      configDir: string;
      modulesBaseDir: string;
      outputBaseDir: string;
    }
  ): Record<string, PromptModuleConfig> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const modules: Record<string, PromptModuleConfig> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const moduleValue = value as Record<string, unknown>;
      const label = typeof moduleValue.label === 'string' && moduleValue.label.trim()
        ? moduleValue.label.trim()
        : key;
      const moduleDirRaw =
        typeof moduleValue.moduleDir === 'string' && moduleValue.moduleDir.trim()
          ? moduleValue.moduleDir.trim()
          : label;
      const moduleDir = path.isAbsolute(moduleDirRaw)
        ? moduleDirRaw
        : path.resolve(args.modulesBaseDir, moduleDirRaw);
      const promptObj = (moduleValue.prompt && typeof moduleValue.prompt === 'object' && !Array.isArray(moduleValue.prompt))
        ? (moduleValue.prompt as Record<string, any>)
        : null;
      const promptFile = typeof promptObj?.file === 'string' && promptObj.file.trim()
        ? promptObj.file.trim()
        : (typeof moduleValue.promptFile === 'string' && moduleValue.promptFile.trim()
          ? moduleValue.promptFile.trim()
          : undefined);
      const coverPrompt = typeof moduleValue.coverPrompt === 'string' && moduleValue.coverPrompt.trim()
        ? moduleValue.coverPrompt.trim()
        : undefined;
      const coverImage = (moduleValue.coverImage && typeof moduleValue.coverImage === 'object' && !Array.isArray(moduleValue.coverImage))
        ? (moduleValue.coverImage as Record<string, unknown>)
        : (moduleValue.image && typeof moduleValue.image === 'object' && !Array.isArray(moduleValue.image))
          ? (moduleValue.image as Record<string, unknown>)
          : undefined;
      const sources = Array.isArray(moduleValue.sources)
        ? moduleValue.sources
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => this.resolvePathFromConfig(args.configDir, item) || path.resolve(args.configDir, item))
        : [];
      const template = typeof moduleValue.template === 'string' && moduleValue.template.trim()
        ? moduleValue.template.trim()
        : undefined;

      const platformPromptFiles: Record<string, string> = {};
      const platformSource =
        promptObj && typeof promptObj.platforms === 'object' && !Array.isArray(promptObj.platforms)
          ? promptObj.platforms
          : moduleValue.platforms;
      if (
        platformSource &&
        typeof platformSource === 'object' &&
        !Array.isArray(platformSource)
      ) {
        for (const [platformKey, platformValue] of Object.entries(
          platformSource as Record<string, unknown>
        )) {
          if (!platformValue || typeof platformValue !== 'object' || Array.isArray(platformValue)) {
            continue;
          }
          const promptFileFromPlatform = (platformValue as Record<string, unknown>).promptFile
            || (platformValue as Record<string, unknown>).file;
          if (typeof promptFileFromPlatform === 'string' && promptFileFromPlatform.trim()) {
            platformPromptFiles[platformKey] = promptFileFromPlatform.trim();
          }
        }
      }

      modules[key] = {
        key,
        label,
        moduleDir,
        promptFile,
        platformPromptFiles,
        sources,
        coverPrompt,
        template,
        coverImage,
      };
    }

    return modules;
  }

  private resolveModuleAliases(
    rawAliases: unknown,
    modules: Record<string, PromptModuleConfig>
  ): Record<string, string> {
    const aliasMap: Record<string, string> = {};
    if (rawAliases && typeof rawAliases === 'object' && !Array.isArray(rawAliases)) {
      for (const [alias, target] of Object.entries(rawAliases as Record<string, unknown>)) {
        if (typeof target !== 'string' || !target.trim()) {
          continue;
        }
        aliasMap[alias.trim().toLowerCase()] = target.trim();
      }
    }

    for (const [moduleKey, module] of Object.entries(modules)) {
      aliasMap[moduleKey.toLowerCase()] = moduleKey;
      aliasMap[module.label.toLowerCase()] = moduleKey;
    }

    aliasMap['生活志'] = aliasMap['生活志'] || '生活志';
    aliasMap['声图志'] = aliasMap['声图志'] || '声图志';
    aliasMap['areas'] = aliasMap['areas'] || 'areas';
    return aliasMap;
  }

  private resolvePlatformSystemPromptFiles(
    platforms: unknown,
    configDir: string
  ): Record<string, string> {
    const platformFiles: Record<string, string> = {};
    if (platforms && typeof platforms === 'object' && !Array.isArray(platforms)) {
      for (const [platformKey, platformValue] of Object.entries(platforms as Record<string, unknown>)) {
        if (!platformValue || typeof platformValue !== 'object' || Array.isArray(platformValue)) {
          continue;
        }
        const systemPromptFile = (platformValue as Record<string, unknown>).systemPromptFile;
        if (typeof systemPromptFile !== 'string' || !systemPromptFile.trim()) {
          continue;
        }
        const resolved = this.resolvePathFromConfig(configDir, systemPromptFile.trim());
        if (resolved) {
          platformFiles[platformKey] = resolved;
        }
      }
    }

    const builtInDir = path.resolve(process.cwd(), 'prompts');
    if (!platformFiles.wechat) {
      platformFiles.wechat = path.resolve(builtInDir, 'platform.wechat.system.md');
    }
    if (!platformFiles.zhihu) {
      platformFiles.zhihu = path.resolve(builtInDir, 'platform.zhihu.system.md');
    }
    return platformFiles;
  }

  private resolvePlatformImageSystemPromptFiles(
    platforms: unknown,
    configDir: string,
    key:
      | 'imageSystemPromptFile'
      | 'imageCoverSystemPromptFile'
      | 'imageInlineSystemPromptFile'
  ): Record<string, string> {
    const platformFiles: Record<string, string> = {};
    if (platforms && typeof platforms === 'object' && !Array.isArray(platforms)) {
      for (const [platformKey, platformValue] of Object.entries(platforms as Record<string, unknown>)) {
        if (!platformValue || typeof platformValue !== 'object' || Array.isArray(platformValue)) {
          continue;
        }
        const fileRaw = (platformValue as Record<string, unknown>)[key];
        if (typeof fileRaw !== 'string' || !fileRaw.trim()) {
          continue;
        }
        const resolved = this.resolvePathFromConfig(configDir, fileRaw.trim());
        if (resolved) {
          platformFiles[platformKey] = resolved;
        }
      }
    }
    return platformFiles;
  }

  private resolveArticleAIConfig(
    globalAI: unknown,
    templateAI: unknown,
    prompting: Record<string, any>
  ): ArticleAIConfig {
    const mergedAI = this.mergeAIConfig(globalAI, templateAI);
    const ai = (mergedAI && typeof mergedAI === 'object' && !Array.isArray(mergedAI))
      ? (mergedAI as Record<string, unknown>)
      : {};
    const promptingAI = (prompting.articleAI && typeof prompting.articleAI === 'object')
      ? (prompting.articleAI as Record<string, unknown>)
      : {};

    const providerRaw = String(
      promptingAI.provider || ai.provider || 'local'
    ).trim().toLowerCase();
    const provider = (providerRaw === 'openai' || providerRaw === 'anthropic' || providerRaw === 'gemini' || providerRaw === 'google' || providerRaw === 'local')
      ? (providerRaw === 'google' ? 'gemini' : providerRaw)
      : 'local';

    const apiKey = this.resolveEnvValue(
      String(promptingAI.apiKey || ai.apiKey || '').trim()
    );

    return {
      enabled: (promptingAI.enabled ?? ai.enabled ?? true) !== false,
      provider,
      model: String(promptingAI.model || ai.model || '').trim() || undefined,
      apiKey: apiKey || undefined,
      baseUrl: String(promptingAI.baseUrl || ai.baseUrl || '').trim() || undefined,
      timeout: this.parsePositiveInt(promptingAI.timeout || ai.timeout, 60000),
      maxRetries: this.parsePositiveInt(promptingAI.maxRetries || ai.maxRetries, 2),
      temperature: this.parseTemperature(promptingAI.temperature ?? ai.temperature, 0.7),
      maxTokens: this.parsePositiveInt(promptingAI.maxTokens || ai.maxTokens, 2000),
    };
  }

  private resolveArticleImageConfig(
    globalAI: unknown,
    templateAI: unknown,
    prompting: Record<string, any>
  ): ArticleImageConfig {
    const globalAIConfig = (globalAI && typeof globalAI === 'object' && !Array.isArray(globalAI))
      ? (globalAI as Record<string, unknown>)
      : {};
    const templateAIConfig = (templateAI && typeof templateAI === 'object' && !Array.isArray(templateAI))
      ? (templateAI as Record<string, unknown>)
      : {};
    const globalImage = (globalAIConfig.image && typeof globalAIConfig.image === 'object')
      ? (globalAIConfig.image as Record<string, unknown>)
      : (globalAIConfig.articleImage && typeof globalAIConfig.articleImage === 'object')
        ? (globalAIConfig.articleImage as Record<string, unknown>)
        : {};
    const templateImageConfig = (templateAIConfig.articleImage && typeof templateAIConfig.articleImage === 'object')
      ? (templateAIConfig.articleImage as Record<string, unknown>)
      : (templateAIConfig.image && typeof templateAIConfig.image === 'object')
        ? (templateAIConfig.image as Record<string, unknown>)
        : {};
    const promptingImage = (prompting.articleImage && typeof prompting.articleImage === 'object')
      ? (prompting.articleImage as Record<string, unknown>)
      : {};

    const enabled = (promptingImage.enabled ?? templateImageConfig.enabled ?? globalImage.enabled ?? false) !== false;
    const ratioRaw = String(
      promptingImage.ratio
      || templateImageConfig.ratio
      || globalImage.ratio
      || '16:9'
    ).trim();
    const ratio = ratioRaw === '4:3' ? '4:3' : '16:9';
    const templateCover = (templateImageConfig.cover && typeof templateImageConfig.cover === 'object')
      ? (templateImageConfig.cover as Record<string, unknown>)
      : {};
    const globalCover = (globalImage.cover && typeof globalImage.cover === 'object')
      ? (globalImage.cover as Record<string, unknown>)
      : {};
    const pickBool = (value: unknown): boolean | undefined =>
      typeof value === 'boolean' ? value : undefined;

    return {
      enabled,
      provider: 'script',
      script: String(
        promptingImage.script
        || templateImageConfig.script
        || globalImage.script
        || ''
      ).trim() || undefined,
      ratio,
      outputDir: String(
        promptingImage.outputDir
        || templateImageConfig.outputDir
        || globalImage.outputDir
        || ''
      ).trim() || undefined,
      insertCoverImage: (
        (promptingImage.cover && typeof promptingImage.cover === 'object')
          ? pickBool((promptingImage.cover as Record<string, unknown>).insertIntoArticle)
          : pickBool(promptingImage.insertCoverImage)
      ) ?? (
        (templateImageConfig.cover && typeof templateImageConfig.cover === 'object')
          ? pickBool((templateImageConfig.cover as Record<string, unknown>).insertIntoArticle)
          : pickBool(templateImageConfig.insertCoverImage)
      ) ?? (
        (globalImage.cover && typeof globalImage.cover === 'object')
          ? pickBool((globalImage.cover as Record<string, unknown>).insertIntoArticle)
          : pickBool(globalImage.insertCoverImage)
      ) ?? true,
      promptDir: String(
        promptingImage.promptDir
        || templateImageConfig.promptDir
        || globalImage.promptDir
        || ''
      ).trim() || undefined,
      promptMap: (promptingImage.promptMap && typeof promptingImage.promptMap === 'object')
        ? (promptingImage.promptMap as Record<string, string>)
        : (templateImageConfig.promptMap && typeof templateImageConfig.promptMap === 'object')
          ? (templateImageConfig.promptMap as Record<string, string>)
          : (globalImage.promptMap && typeof globalImage.promptMap === 'object')
            ? (globalImage.promptMap as Record<string, string>)
            : undefined,
      usePlatformImageSystem:
        (promptingImage.prompt && typeof promptingImage.prompt === 'object')
          ? (
            (promptingImage.prompt as Record<string, unknown>).usePlatformSystem
              ?? (promptingImage.prompt as Record<string, unknown>).usePlatformImageSystem
          ) !== false
          : (templateImageConfig.prompt && typeof templateImageConfig.prompt === 'object')
            ? (
              (templateImageConfig.prompt as Record<string, unknown>).usePlatformSystem
                ?? (templateImageConfig.prompt as Record<string, unknown>).usePlatformImageSystem
            ) !== false
            : (globalImage.prompt && typeof globalImage.prompt === 'object')
              ? (
                (globalImage.prompt as Record<string, unknown>).usePlatformSystem
                  ?? (globalImage.prompt as Record<string, unknown>).usePlatformImageSystem
              ) !== false
              : true,
      baseImage: String(
        promptingImage.baseImage
        || templateImageConfig.baseImage
        || globalImage.baseImage
        || ''
      ).trim() || undefined,
      input: (promptingImage.input && typeof promptingImage.input === 'object')
        ? (promptingImage.input as Record<string, any>)
        : (templateImageConfig.input && typeof templateImageConfig.input === 'object')
          ? (templateImageConfig.input as Record<string, any>)
          : (globalImage.input && typeof globalImage.input === 'object')
            ? (globalImage.input as Record<string, any>)
            : undefined,
      textOverlay: (promptingImage.textOverlay && typeof promptingImage.textOverlay === 'object')
        ? (promptingImage.textOverlay as Record<string, any>)
        : (templateImageConfig.textOverlay && typeof templateImageConfig.textOverlay === 'object')
          ? (templateImageConfig.textOverlay as Record<string, any>)
          : (globalImage.textOverlay && typeof globalImage.textOverlay === 'object')
            ? (globalImage.textOverlay as Record<string, any>)
            : undefined,
      coverSourceOrder: ((templateCover as any).sourceOrder ?? templateImageConfig.coverSourceOrder ?? (globalCover as any).sourceOrder ?? globalImage.coverSourceOrder) as any,
      coverPromptBase: String(
        (templateCover as any).promptBase ?? (globalCover as any).promptBase ?? (templateImageConfig.prompt as Record<string, unknown> | undefined)?.base ?? (globalImage.prompt as Record<string, unknown> | undefined)?.base ?? ''
      ).trim() || undefined,
      inlinePromptBase: String(
        (templateImageConfig.inline && typeof templateImageConfig.inline === 'object')
          ? (templateImageConfig.inline as Record<string, unknown>).promptBase
          : ((templateImageConfig.prompt as Record<string, unknown> | undefined)?.inlineBase)
        ?? ((globalImage.inline && typeof globalImage.inline === 'object')
          ? (globalImage.inline as Record<string, unknown>).promptBase
          : ((globalImage.prompt as Record<string, unknown> | undefined)?.inlineBase))
        ?? ''
      ).trim() || undefined,
      coverRatio: String(
        (templateCover as any).ratio ?? templateImageConfig.coverRatio ?? (globalCover as any).ratio ?? globalImage.coverRatio ?? ''
      ).trim() || undefined,
      coverAiEndpoint: String(
        (templateCover as any).aiEndpoint ?? templateImageConfig.coverAiEndpoint ?? (globalCover as any).aiEndpoint ?? globalImage.coverAiEndpoint ?? ''
      ).trim() || undefined,
      coverAiApiKeyEnv: String(
        (templateCover as any).aiApiKeyEnv ?? templateImageConfig.coverAiApiKeyEnv ?? (globalCover as any).aiApiKeyEnv ?? globalImage.coverAiApiKeyEnv ?? ''
      ).trim() || undefined,
      coverAiResponseUrl: String(
        (templateCover as any).aiResponseUrl ?? templateImageConfig.coverAiResponseUrl ?? (globalCover as any).aiResponseUrl ?? globalImage.coverAiResponseUrl ?? ''
      ).trim() || undefined,
      coverAiResponseBase64: String(
        (templateCover as any).aiResponseBase64 ?? templateImageConfig.coverAiResponseBase64 ?? (globalCover as any).aiResponseBase64 ?? globalImage.coverAiResponseBase64 ?? ''
      ).trim() || undefined,
      coverAiResponseMime: String(
        (templateCover as any).aiResponseMime ?? templateImageConfig.coverAiResponseMime ?? (globalCover as any).aiResponseMime ?? globalImage.coverAiResponseMime ?? ''
      ).trim() || undefined,
      unsplashAccessKeyEnv: String(
        (templateCover as any).unsplashAccessKeyEnv ?? templateImageConfig.unsplashAccessKeyEnv ?? (globalCover as any).unsplashAccessKeyEnv ?? globalImage.unsplashAccessKeyEnv ?? ''
      ).trim() || undefined,
      unsplashQuery: String(
        (templateCover as any).unsplashQuery ?? templateImageConfig.unsplashQuery ?? (globalCover as any).unsplashQuery ?? globalImage.unsplashQuery ?? ''
      ).trim() || undefined,
    };
  }

  private resolveEnvValue(value: string): string {
    const raw = String(value || '').trim();
    const exactEnvMatch = raw.match(/^\$\{([A-Z0-9_]+)\}$/i);
    if (exactEnvMatch?.[1]) {
      return process.env[exactEnvMatch[1]] || '';
    }
    return raw;
  }

  private parseTemperature(raw: unknown, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(1.5, Math.max(0, value));
  }

  private normalizeModulePromptMap(
    raw: unknown,
    modulesBaseDir: string,
    configDir?: string
  ): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'string' || !value.trim()) {
        continue;
      }
      if (path.isAbsolute(value)) {
        mapped[key] = value;
        continue;
      }

      const byModules = path.resolve(modulesBaseDir, value);
      const byConfig = this.resolvePathFromConfig(configDir, value);
      mapped[key] = byConfig && byConfig.includes(path.sep) ? byConfig : byModules;
    }
    return mapped;
  }

  private resolveSuggestionDirs(raw: string | undefined, fallbackDirs: string[]): string[] {
    if (typeof raw === 'string' && raw.trim()) {
      return this.parseSuggestionDirs(raw);
    }
    if (Array.isArray(fallbackDirs) && fallbackDirs.length > 0) {
      return fallbackDirs;
    }
    return this.parseSuggestionDirs('./Input,./Learning');
  }

  private async loadPlatformPromptRules(
    rulesPath?: string,
    runtimeConfig?: ResolvedPromptRuntimeConfig
  ): Promise<PlatformPromptRules> {
    const builtIn = await this.getBuiltInPlatformPromptRules(runtimeConfig);
    if (!rulesPath) {
      return builtIn;
    }

    if (!(await this.fileExists(rulesPath))) {
      console.warn(`[article] 平台规则文件不存在，已回退内置规则: ${rulesPath}`);
      return builtIn;
    }

    const raw = await fs.readFile(rulesPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`平台规则 JSON 解析失败: ${rulesPath}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`平台规则格式错误: ${rulesPath}`);
    }

    const custom: PlatformPromptRules = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const rule = value as Record<string, unknown>;
      custom[key] = {
        description:
          typeof rule.description === 'string' ? rule.description : undefined,
        system: typeof rule.system === 'string' ? rule.system : undefined,
        user: typeof rule.user === 'string' ? rule.user : undefined,
        output: typeof rule.output === 'string' ? rule.output : undefined,
      };
    }

    return {
      ...builtIn,
      ...custom,
    };
  }

  private async getBuiltInPlatformPromptRules(
    runtimeConfig?: ResolvedPromptRuntimeConfig
  ): Promise<PlatformPromptRules> {
    const rules: PlatformPromptRules = {
      wechat: {
        description: '微信公众号',
        system:
          '面向微信读者写作。中文优先，强调可读性、节奏、段落呼吸感，避免学术腔与过度术语。',
        user: '段落不宜过长，句式口语化，适当使用小标题增强扫读体验。',
        output: '输出 Markdown 正文；不要使用表格；结尾给一句行动建议。',
      },
      zhihu: {
        description: '知乎',
        system:
          '面向知乎读者写作。强调观点完整、论证链路清晰、例子充分，允许适度结构化表达。',
        user: '先给核心观点，再展开理由与反例，给出可复用方法。',
        output: '输出 Markdown 正文；可使用 3-5 个小标题；避免口号式结论。',
      },
    };

    const systemFiles = runtimeConfig?.platformSystemPromptFiles || {};
    for (const [platform, filePath] of Object.entries(systemFiles)) {
      if (!(await this.fileExists(filePath))) {
        continue;
      }
      const systemPrompt = (await fs.readFile(filePath, 'utf-8')).trim();
      if (!systemPrompt) {
        continue;
      }
      rules[platform] = {
        ...(rules[platform] || {}),
        system: systemPrompt,
      };
    }

    return rules;
  }

  private resolvePlatformKey(
    rules: PlatformPromptRules,
    rawPlatform: string
  ): string | null {
    if (!rawPlatform) {
      return null;
    }

    const normalized = rawPlatform.trim().toLowerCase();
    const alias: Record<string, string> = {
      微信: 'wechat',
      '微信公众号': 'wechat',
      wechat: 'wechat',
      wx: 'wechat',
      知乎: 'zhihu',
      zhihu: 'zhihu',
      zh: 'zhihu',
    };

    const mapped = alias[rawPlatform] || alias[normalized] || normalized;
    if (rules[mapped]) {
      return mapped;
    }

    for (const key of Object.keys(rules)) {
      if (key.toLowerCase() === normalized) {
        return key;
      }
    }
    return null;
  }

  private async runPromptWizard(args: {
    profiles: PromptProfiles;
    platformRules: PlatformPromptRules;
    suggestionDirs: string[];
    suggestionLimit: number;
    options: any;
    runtimeConfig: ResolvedPromptRuntimeConfig;
  }): Promise<PromptWizardResult | null> {
    const prompts = await import('@clack/prompts');
    prompts.intro('🧠 Article Prompt Studio');

    const moduleOptions = Object.values(args.runtimeConfig.modules).map((item) => ({
      value: item.key,
      label: item.label,
      hint: item.key,
    }));
    if (moduleOptions.length === 0) {
      moduleOptions.push(
        ...Object.entries(args.profiles).map(([key, value]) => ({
          value: key,
          label: key,
          hint: value.description || '',
        }))
      );
    }

    let moduleName = String(
      args.options.module || args.options.topic || args.runtimeConfig.defaultModule || args.runtimeConfig.defaultTopic || ''
    ).trim();
    if (!moduleName) {
      const selectedModule = await prompts.select({
        message: '选择内容模块',
        options: moduleOptions,
      });
      if (prompts.isCancel(selectedModule)) {
        prompts.cancel('已取消');
        return null;
      }
      moduleName = String(selectedModule);
    }

    let platform = String(args.options.platform || args.runtimeConfig.defaultPlatform || '').trim();
    if (!platform) {
      const selectedPlatform = await prompts.select({
        message: '选择发布平台',
        options: Object.entries(args.platformRules).map(([key, value]) => ({
          value: key,
          label: key,
          hint: value.description || '',
        })),
      });
      if (prompts.isCancel(selectedPlatform)) {
        prompts.cancel('已取消');
        return null;
      }
      platform = String(selectedPlatform);
    }

    let idea = String(args.options.idea || '').trim();
    let sourcePath = String(args.options.source || '').trim();
    if (!idea) {
      const mode = await prompts.select({
        message: '选题方式',
        options: [
          { value: 'suggest', label: '从素材推荐', hint: '默认推荐 Learning/Input 议题' },
          { value: 'manual', label: '手动输入', hint: '直接填写 idea' },
        ],
        initialValue: args.options.autoIdea ? 'suggest' : 'manual',
      });
      if (prompts.isCancel(mode)) {
        prompts.cancel('已取消');
        return null;
      }

      if (mode === 'suggest') {
        const suggestions = this.filterSuggestionsByTopic(
          await this.collectTopicSuggestions(args.suggestionDirs, args.suggestionLimit),
          moduleName
        );
        if (suggestions.length === 0) {
          prompts.note('未找到可用议题，请补充记录后重试。', '提示');
          prompts.cancel('已取消');
          return null;
        }
        const selected = await prompts.select({
          message: '选择议题',
          options: suggestions.map((item, index) => ({
            value: String(index),
            label: `[${item.topic}] ${item.idea}`,
            hint: path.relative(process.cwd(), item.filePath) || item.filePath,
          })),
        });
        if (prompts.isCancel(selected)) {
          prompts.cancel('已取消');
          return null;
        }
        const picked = suggestions[Number(selected)];
        idea = picked.idea;
        sourcePath = picked.filePath;
      } else {
        const text = await prompts.text({
          message: '你想写什么？',
          placeholder: '例如：这周通勤观察让我重新理解了注意力',
          validate: (value) => (String(value || '').trim() ? undefined : '请输入写作主题'),
        });
        if (prompts.isCancel(text)) {
          prompts.cancel('已取消');
          return null;
        }
        idea = String(text).trim();
      }
    }

    let requirements = String(args.options.requirements || '').trim();
    if (!requirements) {
      const requirementsInput = await prompts.text({
        message: '写作要求（可选）',
        placeholder: '例如：像和朋友聊天，900字以内，少空话，多细节',
      });
      if (prompts.isCancel(requirementsInput)) {
        prompts.cancel('已取消');
        return null;
      }
      requirements = String(requirementsInput || '').trim();
    }

    prompts.outro('✅ 已补齐缺失参数');
    return {
      topic: moduleName,
      platform,
      idea,
      requirements,
      sourcePath: sourcePath || undefined,
      moduleName,
      outPath: String(args.options.out || '') || undefined,
    };
  }

  private async readModulePromptParts(args: {
    explicitPath?: string;
    platform: string;
    moduleName: string;
    moduleKey?: string;
    moduleConfig?: PromptModuleConfig;
    modulePromptMap: Record<string, string>;
    modulesBaseDir: string;
    configDir?: string;
  }): Promise<ModulePromptParts> {
    const moduleName = String(args.moduleName || '').trim();
    const candidates: string[] = [];

    if (args.explicitPath) {
      const explicit = this.resolvePathFromConfig(args.configDir, args.explicitPath);
      if (explicit) {
        candidates.push(explicit);
      }
    }

    if (args.moduleConfig) {
      const genericPrompt = args.moduleConfig.promptFile;
      const platformPrompt = args.moduleConfig.platformPromptFiles[args.platform];
      if (platformPrompt) {
        candidates.push(
          path.isAbsolute(platformPrompt)
            ? platformPrompt
            : path.resolve(args.moduleConfig.moduleDir, platformPrompt)
        );
      }
      if (genericPrompt) {
        candidates.push(
          path.isAbsolute(genericPrompt)
            ? genericPrompt
            : path.resolve(args.moduleConfig.moduleDir, genericPrompt)
        );
      }
    }

    if (moduleName) {
      const direct = args.modulePromptMap[moduleName];
      const lower = args.modulePromptMap[moduleName.toLowerCase()];
      const keyMapped = args.moduleKey ? args.modulePromptMap[args.moduleKey] : undefined;
      if (direct) {
        candidates.push(direct);
      }
      if (lower && lower !== direct) {
        candidates.push(lower);
      }
      if (keyMapped && keyMapped !== direct && keyMapped !== lower) {
        candidates.push(keyMapped);
      }

      const normalized = this.resolveModuleDirectoryName(moduleName);
      const filenameCandidates = [
        `prompt.${args.platform}.md`,
        '_prompt.md',
        'prompt.md',
        '_prompt.txt',
      ];
      for (const filename of filenameCandidates) {
        candidates.push(path.resolve(args.modulesBaseDir, normalized, filename));
      }
      if (args.moduleKey && args.moduleKey !== normalized) {
        for (const filename of filenameCandidates) {
          candidates.push(path.resolve(args.modulesBaseDir, args.moduleKey, filename));
        }
      }
      candidates.push(path.resolve(args.modulesBaseDir, '_prompts', `${normalized}.md`));
      candidates.push(path.resolve(args.modulesBaseDir, '_prompts', `${moduleName}.md`));
    }

    const uniq = Array.from(new Set(candidates));
    const merged: ModulePromptParts = { system: '', user: '' };
    for (const candidate of uniq) {
      if (!(await this.fileExists(candidate))) {
        continue;
      }
      const content = await fs.readFile(candidate, 'utf-8');
      let parsed: ModulePromptParts = { system: '', user: '', filePath: candidate };

      if (candidate.toLowerCase().endsWith('.json')) {
        try {
          const jsonData = JSON.parse(content) as Record<string, unknown>;
          parsed = {
            ...this.parseModulePromptFromObject(jsonData),
            filePath: candidate,
          };
        } catch {
          parsed = {
            system: '',
            user: content.trim(),
            filePath: candidate,
          };
        }
      } else {
        const fm = matter(content);
        parsed = {
          system:
            typeof fm.data.system === 'string'
              ? fm.data.system.trim()
              : (typeof fm.data.systemPrompt === 'string' ? fm.data.systemPrompt.trim() : ''),
          user: fm.content.trim(),
          filePath: candidate,
        };
      }

      if (parsed.system || parsed.user) {
        merged.system = [merged.system, parsed.system].filter(Boolean).join('\n\n').trim();
        merged.user = [merged.user, parsed.user].filter(Boolean).join('\n\n').trim();
        merged.filePath = merged.filePath || candidate;
      }
    }

    return merged;
  }

  private parseModulePromptFromObject(input: Record<string, unknown>): ModulePromptParts {
    const system =
      typeof input.system === 'string'
        ? input.system.trim()
        : (typeof input.systemPrompt === 'string' ? input.systemPrompt.trim() : '');
    const user =
      typeof input.user === 'string'
        ? input.user.trim()
        : (typeof input.prompt === 'string' ? input.prompt.trim() : '');

    return { system, user };
  }

  private resolveModuleDirectoryName(moduleName: string): string {
    const normalizedName = String(moduleName || '').trim();
    const lower = normalizedName.toLowerCase();
    if (lower === 'areas' || lower === 'area') {
      return 'Areas';
    }
    if (normalizedName === '生活志' || normalizedName === 'Z°N 生活志') {
      return 'Z°N 生活志';
    }
    if (normalizedName === '声图志' || normalizedName === 'Z°N 声图志') {
      return 'Z°N 声图志';
    }
    return normalizedName;
  }

  private composeLayeredPrompt(args: {
    topic: string;
    topicTemplate?: string;
    moduleName: string;
    platform: string;
    requirements: string;
    profileParts: PromptParts;
    platformRule: PlatformPromptRule;
    modulePrompt: ModulePromptParts;
    baseSystemPrompt: string;
  }): string {
    const systemLayers: string[] = [];
    const userLayers: string[] = [];

    if (args.baseSystemPrompt.trim()) {
      systemLayers.push(`[SYSTEM:L1 基线角色]\n${args.baseSystemPrompt.trim()}`);
    }
    if ((args.platformRule.system || '').trim()) {
      systemLayers.push(
        `[SYSTEM:L2 平台规则:${args.platform}]\n${(args.platformRule.system || '').trim()}`
      );
    }
    if ((args.modulePrompt.system || '').trim()) {
      systemLayers.push(
        `[SYSTEM:L3 模块规则:${args.moduleName}]\n${args.modulePrompt.system.trim()}`
      );
    }
    if (args.profileParts.system.trim()) {
      const styleLabel = args.topicTemplate && args.topicTemplate !== args.topic
        ? `${args.topic}（模板:${args.topicTemplate}）`
        : args.topic;
      systemLayers.push(`[SYSTEM:L4 文风画像:${styleLabel}]\n${args.profileParts.system.trim()}`);
    }

    userLayers.push(`[USER:L5 写作任务]\n${args.profileParts.user.trim()}`);
    if ((args.modulePrompt.user || '').trim()) {
      userLayers.push(`[USER:L6 模块补充要求]\n${args.modulePrompt.user.trim()}`);
    }
    if ((args.requirements || '').trim()) {
      userLayers.push(`[USER:L7 用户临时要求]\n${args.requirements.trim()}`);
    }

    const outputRules = [args.platformRule.user || '', args.platformRule.output || '']
      .map((item) => item.trim())
      .filter(Boolean)
      .join('\n');
    if (outputRules) {
      userLayers.push(`[USER:L8 平台输出约束]\n${outputRules}`);
    }

    return [
      systemLayers.join('\n\n'),
      '',
      userLayers.join('\n\n'),
    ]
      .join('\n')
      .trim();
  }

  private async loadPromptProfiles(profilesPath: string): Promise<PromptProfiles> {
    if (!(await this.fileExists(profilesPath))) {
      return this.getBuiltInPromptProfiles();
    }

    const raw = await fs.readFile(profilesPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`自定义 Prompt profiles JSON 解析失败: ${profilesPath}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`自定义 Prompt profiles 格式错误: ${profilesPath}`);
    }

    const profiles: PromptProfiles = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const profile = value as Record<string, unknown>;
      const template = typeof profile.template === 'string' ? profile.template.trim() : '';
      if (!template) {
        continue;
      }
      profiles[key] = {
        description:
          typeof profile.description === 'string' ? profile.description : undefined,
        system: typeof profile.system === 'string' ? profile.system : undefined,
        template,
      };
    }

    if (Object.keys(profiles).length === 0) {
      throw new Error(`未读取到有效模板，至少需要一个含 template 字段的主题: ${profilesPath}`);
    }
    return profiles;
  }

  private getBuiltInPromptProfiles(): PromptProfiles {
    return {
      生活志: {
        description: '生活观察 -> 有细节、有情绪克制的生活向文章',
        system: '你是中文非虚构写作者，偏好真实经验、可感细节和克制表达。',
        template: [
          '今天日期：{{today}}',
          '主题：生活志',
          '我想写：{{idea}}',
          '写作要求：{{requirements}}',
          '素材（可为空）：',
          '{{source}}',
          '',
          '请输出一篇可直接发布的中文文章，要求：',
          '1) 第一人称，避免空话套话；',
          '2) 先场景后观点，观点要落在具体行动；',
          '3) 保持自然节奏，不要像“鸡汤”；',
          '4) 结尾给出一句可执行的生活建议。',
          '只输出正文，不要解释写作过程。',
        ].join('\n'),
      },
      声图志: {
        description: '声音/图像体验 -> 感官细节 + 审美判断 + 个人理解',
        system: '你是声音与影像观察写作者，擅长把感官经验写成有结构的文字。',
        template: [
          '今天日期：{{today}}',
          '主题：声图志',
          '我想写：{{idea}}',
          '写作要求：{{requirements}}',
          '素材（可为空）：',
          '{{source}}',
          '',
          '请产出一篇中文文章，结构为：',
          '1) 触发场景（我在何时何地看到/听到什么）；',
          '2) 感官细节（声音、画面、节奏、氛围）；',
          '3) 我的判断（为什么它值得记录）；',
          '4) 延伸思考（它如何影响我的创作或生活）。',
          '文风要求：具体、克制、避免华丽辞藻堆砌。',
          '只输出正文。',
        ].join('\n'),
      },
      areas: {
        description: '学习与方法论沉淀 -> 结构化、可复用的思考文章',
        system: '你是知识管理作者，强调概念澄清与可复用方法。',
        template: [
          '今天日期：{{today}}',
          '主题：Areas',
          '我想写：{{idea}}',
          '写作要求：{{requirements}}',
          '素材（可为空）：',
          '{{source}}',
          '',
          '请输出一篇“理解沉淀文”，包含：',
          '1) 我原本的认知；',
          '2) 新输入如何改变了认知；',
          '3) 可执行的方法/清单；',
          '4) 下一步验证计划。',
          '不要空泛总结，要给出具体例子或动作。',
          '只输出正文。',
        ].join('\n'),
      },
      default: {
        description: '通用文章生成模板',
        system: '你是中文写作助手，目标是把素材整理成可发布初稿。',
        template: [
          '今天日期：{{today}}',
          '主题：{{topic}}',
          '我想写：{{idea}}',
          '写作要求：{{requirements}}',
          '素材（可为空）：',
          '{{source}}',
          '',
          '请按以上信息输出一篇可发布初稿，语言自然、信息密度高。',
          '只输出正文。',
        ].join('\n'),
      },
    };
  }

  private renderPromptProfileParts(
    profile: PromptProfile,
    variables: Record<string, string>
  ): PromptParts {
    const render = (input: string): string => {
      return input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name: string) => {
        return variables[name] || '';
      });
    };

    return {
      system: render(profile.system || '').trim(),
      user: render(profile.template || '').trim(),
    };
  }

  private renderPromptProfile(
    profile: PromptProfile,
    variables: Record<string, string>
  ): string {
    const render = (input: string): string => {
      return input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name: string) => {
        return variables[name] || '';
      });
    };

    const userContent = render(profile.template).trim();
    const systemContent = render(profile.system || '').trim();

    if (!systemContent) {
      return userContent;
    }

    return [`[SYSTEM]`, systemContent, '', '[USER]', userContent].join('\n');
  }

  private resolveModuleKey(
    runtimeConfig: ResolvedPromptRuntimeConfig,
    rawModule?: string
  ): string | null {
    if (!rawModule) {
      return null;
    }

    const candidate = rawModule.trim();
    if (!candidate) {
      return null;
    }
    if (runtimeConfig.modules[candidate]) {
      return candidate;
    }
    const byAlias = runtimeConfig.moduleAliases[candidate.toLowerCase()];
    if (byAlias && runtimeConfig.modules[byAlias]) {
      return byAlias;
    }

    for (const module of Object.values(runtimeConfig.modules)) {
      if (module.label.toLowerCase() === candidate.toLowerCase()) {
        return module.key;
      }
    }

    return null;
  }

  private filterSuggestionsByTopic(
    suggestions: TopicSuggestion[],
    topicOrModule?: string
  ): TopicSuggestion[] {
    const target = String(topicOrModule || '').trim().toLowerCase();
    if (!target) {
      return suggestions;
    }

    const alias: Record<string, string> = {
      生活志: '生活志',
      'z°n 生活志': '生活志',
      life: '生活志',
      声图志: '声图志',
      'z°n 声图志': '声图志',
      audiovisual: '声图志',
      技术笔记: '技术笔记',
      tech: '技术笔记',
      观影志: '观影志',
      movie: '观影志',
      觅食记: '觅食记',
      food: '觅食记',
      运动志: '运动志',
      sports: '运动志',
      专题产品: '专题产品',
      series: '专题产品',
      areas: '技术笔记',
      area: '技术笔记',
      学习: '技术笔记',
      复盘: '技术笔记',
    };
    const normalizedTarget = alias[target] || target;
    const filtered = suggestions.filter((item) => {
      const itemTopic = (alias[item.topic.toLowerCase()] || item.topic).toLowerCase();
      return itemTopic === normalizedTarget;
    });
    if (filtered.length > 0) {
      return filtered;
    }
    return suggestions;
  }

  private canUseInteractivePrompts(): boolean {
    return Boolean(process.stdout.isTTY && process.stdin.isTTY);
  }

  private printTopicSuggestions(logPrefix: string, suggestions: TopicSuggestion[]): void {
    console.log(`${logPrefix} 议题候选（Top ${suggestions.length}）:`);
    suggestions.forEach((item, index) => {
      const relative = path.relative(process.cwd(), item.filePath);
      console.log(`${index + 1}. [${item.topic}] ${item.idea}`);
      console.log(`   来源: ${relative || item.filePath}`);
    });
  }

  private async selectTopicSuggestionInteractively(args: {
    logPrefix: string;
    suggestions: TopicSuggestion[];
  }): Promise<TopicSelectionResult | 'cancel' | null> {
    if (!this.canUseInteractivePrompts()) {
      console.log(`${args.logPrefix} 当前终端不支持交互选择，已回退为候选列表输出`);
      return null;
    }

    const prompts = await import('@clack/prompts');
    const suggestionPrefix = 'suggestion:';
    const manualValue = '__manual__';
    const listOnlyValue = '__list_only__';
    while (true) {
      const selected = await prompts.select({
        message: '请选择一个议题继续生成',
        options: [
          ...args.suggestions.map((item, index) => ({
            value: `${suggestionPrefix}${index}`,
            label: `[${item.topic}] ${item.idea}`,
            hint: path.relative(process.cwd(), item.filePath) || item.filePath,
          })),
          { value: manualValue, label: '手动输入选题', hint: '不使用推荐，直接填写 idea' },
          { value: listOnlyValue, label: '仅查看候选并退出', hint: '只列出建议，不继续生成' },
        ],
        initialValue: `${suggestionPrefix}0`,
      });
      if (prompts.isCancel(selected)) {
        prompts.cancel('已取消议题选择');
        return 'cancel';
      }

      if (selected === listOnlyValue) {
        return null;
      }

      if (selected === manualValue) {
        while (true) {
          const manualIdea = await prompts.text({
            message: '请输入写作议题',
            placeholder: '例如：下班路上的晚霞为什么让我慢下来',
            validate: (value) => (String(value || '').trim() ? undefined : '请输入议题'),
          });
          if (prompts.isCancel(manualIdea)) {
            prompts.cancel('已取消议题输入');
            return 'cancel';
          }
          const manualIdeaText = String(manualIdea || '').trim();
          const manualDecision = await prompts.select({
            message: '确认使用这个议题？',
            options: [
              { value: 'continue', label: '继续生成', hint: '使用该议题继续后续流程' },
              { value: 'reinput', label: '重新输入', hint: '修改手动输入的议题' },
              { value: 'cancel', label: '取消', hint: '退出 article 生成' },
            ],
            initialValue: 'continue',
          });
          if (prompts.isCancel(manualDecision) || manualDecision === 'cancel') {
            prompts.cancel('已取消议题确认');
            return 'cancel';
          }
          if (manualDecision === 'reinput') {
            continue;
          }
          return {
            idea: manualIdeaText,
          };
        }
      }

      if (typeof selected !== 'string' || !selected.startsWith(suggestionPrefix)) {
        continue;
      }
      const pickedIndex = Number(selected.slice(suggestionPrefix.length));
      if (!Number.isFinite(pickedIndex) || pickedIndex < 0) {
        continue;
      }
      const picked = args.suggestions[pickedIndex];
      if (!picked) {
        continue;
      }

      const relativePath = path.relative(process.cwd(), picked.filePath) || picked.filePath;
      const excerpt = await this.readSuggestionSourceExcerpt(picked.filePath);
      prompts.note(
        [
          `模块: ${picked.topic}`,
          `议题: ${picked.idea}`,
          `评分: ${this.formatSuggestionScore(picked.score)}`,
          `来源: ${relativePath}`,
          `摘要: ${excerpt || this.deriveIdeaExcerpt(picked.idea) || '（无摘要）'}`,
        ].join('\n'),
        '议题预览'
      );

      const decision = await prompts.select({
        message: '确认使用这个议题？',
        options: [
          { value: 'continue', label: '继续生成', hint: '使用该议题继续后续流程' },
          { value: 'reselect', label: '重新选择', hint: '返回候选列表重新挑选' },
          { value: 'cancel', label: '取消', hint: '退出 article 生成' },
        ],
        initialValue: 'continue',
      });
      if (prompts.isCancel(decision) || decision === 'cancel') {
        prompts.cancel('已取消议题确认');
        return 'cancel';
      }
      if (decision === 'reselect') {
        continue;
      }
      return {
        topic: picked.topic,
        idea: picked.idea,
        sourcePath: picked.filePath,
      };
    }
  }

  private formatSuggestionScore(score: number): string {
    if (!Number.isFinite(score)) {
      return '-';
    }
    const fixed = score.toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
  }

  private deriveIdeaExcerpt(idea: string): string {
    const trimmed = String(idea || '').trim();
    if (!trimmed) {
      return '';
    }
    const separatorIndex = trimmed.indexOf('｜');
    if (separatorIndex >= 0 && separatorIndex < trimmed.length - 1) {
      return trimmed.slice(separatorIndex + 1).trim();
    }
    return trimmed;
  }

  private async readSuggestionSourceExcerpt(filePath: string): Promise<string> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(raw);
      const condensed = String(parsed.content || '').replace(/\s+/g, ' ').trim();
      if (!condensed) {
        return '';
      }
      return condensed.length > 140 ? `${condensed.slice(0, 140)}...` : condensed;
    } catch {
      return '';
    }
  }

  private buildDefaultPromptOutputPath(args: {
    runtimeConfig: ResolvedPromptRuntimeConfig;
    moduleConfig?: PromptModuleConfig;
    moduleName: string;
    platformKey: string;
    idea: string;
  }): string {
    const today = this.formatDate(new Date());
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const moduleName = args.moduleConfig?.label || args.moduleName || 'article';
    const slug = this.sanitizeFilenamePart(args.idea, 48) || 'draft';
    const filename = this.renderOutputFilenameTemplate(args.runtimeConfig.outputFilenameTemplate, {
      date: today,
      platform: args.platformKey,
      module: this.sanitizeFilenamePart(moduleName, 24) || 'article',
      slug,
      title: this.sanitizeTitleFilename(args.idea) || slug,
      timestamp,
    });
    const moduleDir = args.moduleConfig?.moduleDir
      || path.resolve(args.runtimeConfig.moduleBaseDir, this.resolveModuleDirectoryName(moduleName));
    return path.resolve(moduleDir, filename);
  }

  private buildDefaultArticleOutputPath(args: {
    runtimeConfig: ResolvedPromptRuntimeConfig;
    moduleConfig?: PromptModuleConfig;
    moduleName: string;
    title: string;
  }): string {
    const moduleName = args.moduleConfig?.label || args.moduleName || 'article';
    const moduleDir = args.moduleConfig?.moduleDir
      || path.resolve(args.runtimeConfig.moduleBaseDir, this.resolveModuleDirectoryName(moduleName));
    const draftsDir = path.resolve(
      moduleDir,
      args.runtimeConfig.outputDraftsDirName || args.runtimeConfig.moduleDraftsDirName || 'drafts'
    );
    const titleForFilename = this.sanitizeTitleFilename(args.title) || '未命名文章';
    return path.resolve(draftsDir, `${titleForFilename}.md`);
  }

  private renderOutputFilenameTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    const rendered = String(template || '{{date}}-{{slug}}.md').replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      (_match, key: string) => variables[key] || ''
    ).trim();
    if (!rendered) {
      return `${variables.date || this.formatDate(new Date())}-${variables.slug || 'draft'}.md`;
    }
    if (path.extname(rendered)) {
      return rendered;
    }
    return `${rendered}.md`;
  }

  private sanitizeFilenamePart(input: string, maxLength: number): string {
    return String(input || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLength);
  }

  private sanitizeTitleFilename(input: string): string {
    return String(input || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private resolvePromptTopicKey(profiles: PromptProfiles, topic: string): string | null {
    if (profiles[topic]) {
      return topic;
    }

    const lowerTopic = topic.toLowerCase();
    for (const key of Object.keys(profiles)) {
      if (key.toLowerCase() === lowerTopic) {
        return key;
      }
    }

    return null;
  }

  private async readPromptSource(sourcePath?: string): Promise<string> {
    if (!sourcePath) {
      return '';
    }

    const resolved = path.resolve(process.cwd(), sourcePath);
    if (!(await this.fileExists(resolved))) {
      throw new Error(`素材文件不存在: ${resolved}`);
    }

    const raw = await fs.readFile(resolved, 'utf-8');
    const compact = raw.trim();
    if (compact.length <= 8000) {
      return compact;
    }
    return `${compact.slice(0, 8000)}\n\n[... 已截断剩余素材 ...]`;
  }

  private formatDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private parsePositiveInt(raw: unknown, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }

  private parseSuggestionDirs(raw: string): string[] {
    return String(raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => path.resolve(process.cwd(), item));
  }

  private async collectTopicSuggestions(
    dirs: string[],
    limit: number
  ): Promise<TopicSuggestion[]> {
    const candidates: TopicSuggestion[] = [];

    for (const dir of dirs) {
      if (!(await this.fileExists(dir))) {
        continue;
      }
      const files = await this.collectMarkdownFiles(dir);
      for (const filePath of files) {
        if (!this.isSuggestionCandidateFile(filePath)) {
          continue;
        }
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          const stat = await fs.stat(filePath);
          const candidate = this.extractTopicSuggestion(filePath, raw, stat.mtimeMs);
          if (candidate) {
            candidates.push(candidate);
          }
        } catch {
          // ignore unreadable file
        }
      }
    }

    const dedup = new Map<string, TopicSuggestion>();
    for (const item of candidates) {
      const key = `${item.topic}|${item.idea.toLowerCase()}`;
      const previous = dedup.get(key);
      if (!previous || previous.score < item.score) {
        dedup.set(key, item);
      }
    }

    return Array.from(dedup.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private extractTopicSuggestion(
    filePath: string,
    content: string,
    mtimeMs: number
  ): TopicSuggestion | null {
    const parsed = matter(content);
    const title = this.extractCandidateTitle(filePath, parsed.data, parsed.content);
    const bodySnippet = this.extractBodySnippet(parsed.content);
    if (!title && !bodySnippet) {
      return null;
    }

    const idea = [title, bodySnippet].filter(Boolean).join('｜');
    const topic = this.classifyTopic(filePath, `${title} ${bodySnippet}`);
    const score = this.scoreSuggestion(filePath, `${title} ${bodySnippet}`, mtimeMs);

    return {
      topic,
      idea: this.normalizeSuggestionIdea(idea),
      filePath,
      score,
    };
  }

  private extractCandidateTitle(
    filePath: string,
    data: Record<string, any>,
    body: string
  ): string {
    if (typeof data.title === 'string' && data.title.trim()) {
      return data.title.trim();
    }

    const headingMatch = body.match(/^#\s+(.+)$/m);
    if (headingMatch?.[1]) {
      return headingMatch[1].trim();
    }

    return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, ' ').trim();
  }

  private extractBodySnippet(body: string): string {
    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) {
          return false;
        }
        if (line.startsWith('#') || line.startsWith('![') || line.startsWith('>')) {
          return false;
        }
        if (/^[-*]\s/.test(line)) {
          return false;
        }
        return true;
      });

    const first = lines.find((line) => line.length >= 12) || lines[0] || '';
    if (!first) {
      return '';
    }
    return first.replace(/\s+/g, ' ').slice(0, 72);
  }

  private classifyTopic(filePath: string, text: string): string {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    const pathHint = normalizedPath.split('/').slice(-4).join('/');
    const source = `${pathHint} ${text}`.toLowerCase();

    // 目录硬映射优先，避免关键词误伤导致跨模块分类
    if (normalizedPath.includes('/input/logs/captures/')) {
      return '生活志';
    }
    if (normalizedPath.includes('/input/logs/music/')) {
      return '声图志';
    }
    if (normalizedPath.includes('/input/logs/movies/')) {
      return '观影志';
    }
    if (normalizedPath.includes('/input/logs/food/')) {
      return '觅食记';
    }
    if (normalizedPath.includes('/input/logs/exercise/')) {
      return '运动志';
    }
    if (normalizedPath.includes('/input/series/')) {
      return '专题产品';
    }
    if (
      normalizedPath.includes('/input/notes/')
      || normalizedPath.includes('/input/resources/tools/')
      || normalizedPath.includes('/learning/javascript/')
      || normalizedPath.includes('/learning/nodejs/')
      || normalizedPath.includes('/learning/git/')
    ) {
      return '技术笔记';
    }
    if (
      /(food|餐|吃|美食|探店|菜|口味|餐厅|外卖|小吃|火锅|咖啡|甜品)/.test(source)
    ) {
      return '觅食记';
    }

    if (
      /(exercise|sports|运动|训练|羽毛球|跑步|配速|心率|健身|力量|有氧)/.test(source)
    ) {
      return '运动志';
    }

    if (
      /(movie|film|剧|影评|观影|台词|剧情|角色|镜头|导演|豆瓣)/.test(source)
    ) {
      return '观影志';
    }

    if (
      /(tutorial|教程|系列|课程|专题|javascript|typescript|rust|remotion)/.test(source)
    ) {
      return '专题产品';
    }

    if (
      /(tech|技术|工程|开发|前端|后端|脚本|自动化|workflow|工具|git|ci|构建|部署)/.test(source)
    ) {
      return '技术笔记';
    }

    if (
      /(声音|画面|摄影|照片|相机|镜头|音乐|电影|播客|video|audio|photo|sound|music|visual|影像)/.test(
        source
      )
    ) {
      return '声图志';
    }

    if (
      /(learning|notes|学习|复盘|方法|模型|框架|思考|理解|实践|知识|workflow|系统)/.test(
        source
      )
    ) {
      return '技术笔记';
    }

    return '生活志';
  }

  private scoreSuggestion(filePath: string, text: string, mtimeMs: number): number {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    const normalized = text.toLowerCase();
    let score = 1;

    // 优先使用已消化内容，Input 作为素材兜底
    if (normalizedPath.includes('/learning/notes/')) {
      score += 6;
    } else if (normalizedPath.includes('/learning/')) {
      score += 3;
    } else if (normalizedPath.includes('/input/')) {
      score += 1;
    }

    if (/(思考|复盘|为什么|启发|方法|变化|问题|实践|经验|教训|总结|理解)/.test(normalized)) {
      score += 4;
    }
    if (/(今天|本周|最近|刚刚|刚才|this week|today)/.test(normalized)) {
      score += 2;
    }

    const ageHours = Math.max(0, (Date.now() - mtimeMs) / 36e5);
    if (ageHours <= 24) {
      score += 3;
    } else if (ageHours <= 72) {
      score += 2;
    } else if (ageHours <= 168) {
      score += 1;
    }

    return score;
  }

  private normalizeSuggestionIdea(idea: string): string {
    return idea.replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  private async generateArticleFromPrompt(args: {
    renderedPrompt: string;
    idea: string;
    moduleName: string;
    platform: string;
    runtimeConfig: ResolvedPromptRuntimeConfig;
    requirements: string;
    lengthConstraint?: LengthConstraint;
    imageRatio?: '4:3' | '16:9';
  }): Promise<GeneratedArticlePayload> {
    const ai = args.runtimeConfig.articleAI;
    if (!ai.enabled) {
      throw new Error('AI 生成功能已禁用。请在配置中启用 ai.enabled 或使用 --prompt-only。');
    }

    const imageSystemPrompt = await this.resolvePlatformImageSystemPrompt({
      runtimeConfig: args.runtimeConfig,
      platform: args.platform,
      kind: 'inline',
    });
    const prompt = this.buildArticleGenerationPrompt({
      ...args,
      imageSystemPrompt,
    });
    const raw = await this.requestModelCompletion(prompt, ai);
    const parsed = this.parseGeneratedArticlePayload(raw);

    if (parsed) {
      return parsed;
    }

    const fallbackTitle = this.deriveTitleFromRaw(raw, args.idea);
    const fallbackContent = this.deriveContentFromRaw(raw);
    return {
      title: fallbackTitle,
      content: fallbackContent,
      imagePromptNanobanaPro: this.buildFallbackNanobanaPrompt({
        title: fallbackTitle,
        idea: args.idea,
        moduleName: args.moduleName,
        platform: args.platform,
      }),
    };
  }

  private buildArticleGenerationPrompt(args: {
    renderedPrompt: string;
    idea: string;
    moduleName: string;
    platform: string;
    requirements: string;
    lengthConstraint?: LengthConstraint;
    imageRatio?: '4:3' | '16:9';
    imageSystemPrompt?: string;
  }): string {
    const lengthConstraintLine = this.describeLengthConstraint(args.lengthConstraint);
    const imageSystemPrompt = String(args.imageSystemPrompt || '').trim();
    return [
      args.renderedPrompt.trim(),
      '',
      '请严格按以下 JSON 结构输出，不要输出额外解释，也不要输出 Markdown 代码块：',
      '{',
      '  "title": "文章标题（中文，12-24字，具体，不空泛，不带日期/平台前缀）",',
      '  "content": "正文 Markdown，不包含标题本身",',
      '  "imagePromptNanobanaPro": "用于 Nanobana Pro 的生图提示词（中英混合，包含主体、场景、光线、镜头、质感、构图、色调，避免文字水印）"',
      '}',
      '',
      '额外要求：',
      `- 选题：${args.idea}`,
      `- 模块：${args.moduleName}`,
      `- 平台：${args.platform}`,
      `- 头图比例：${args.imageRatio || '4:3'}`,
      ...(imageSystemPrompt ? [`- 平台图像系统提示词：${imageSystemPrompt}`] : []),
      `- 用户临时要求：${args.requirements || '无'}`,
      ...(lengthConstraintLine ? [`- 正文字数硬约束：${lengthConstraintLine}（仅统计 content 正文）`] : []),
      '- title 需可直接作为文件名，不要以“日期-平台-模块”开头。',
      '- content 只写正文，不要再重复标题。',
      '- imagePromptNanobanaPro 要可直接复制到生图工具。',
    ].join('\n');
  }

  private async requestModelCompletion(prompt: string, ai: ArticleAIConfig): Promise<string> {
    const provider = ai.provider || 'local';
    const maxRetries = Math.max(1, ai.maxRetries || 2);
    const model = this.resolveArticleAIModelName(ai);
    const timeoutMs = this.resolveArticleAITimeout(ai);
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      console.log(
        `[ai] 请求中 (${attempt}/${maxRetries}): provider=${provider}, model=${model}, timeout=${timeoutMs}ms`
      );
      try {
        if (provider === 'openai') {
          return await this.requestOpenAICompletion(prompt, ai);
        }
        if (provider === 'anthropic') {
          return await this.requestAnthropicCompletion(prompt, ai);
        }
        if (provider === 'gemini') {
          return await this.requestGeminiCompletion(prompt, ai);
        }
        return await this.requestLocalCompletion(prompt, ai);
      } catch (error) {
        lastError = error;
        console.warn(
          `[ai] 请求失败 (${attempt}/${maxRetries}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (attempt < maxRetries) {
          console.warn(`[ai] ${300 * attempt}ms 后自动重试...`);
          await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        }
      }
    }

    throw new Error(
      `调用 AI 生成失败: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  private resolveArticleAIModelName(ai: ArticleAIConfig): string {
    const model = String(ai.model || '').trim();
    if (model) {
      return model;
    }
    const provider = ai.provider || 'local';
    if (provider === 'openai') {
      return 'gpt-4o-mini';
    }
    if (provider === 'anthropic') {
      return 'claude-3-5-sonnet-latest';
    }
    if (provider === 'gemini') {
      return 'gemini-1.5-flash';
    }
    return 'llama3.1';
  }

  private resolveArticleAITimeout(ai: ArticleAIConfig): number {
    const configured = Number(ai.timeout);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.floor(configured);
    }
    return (ai.provider || 'local') === 'local' ? 90000 : 60000;
  }

  private async requestOpenAICompletion(prompt: string, ai: ArticleAIConfig): Promise<string> {
    if (!ai.apiKey) {
      throw new Error('OpenAI provider 缺少 apiKey');
    }
    const baseUrl = ai.baseUrl || 'https://api.openai.com/v1';
    const data = await this.fetchJsonWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ai.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: ai.temperature ?? 0.7,
          max_tokens: ai.maxTokens ?? 2000,
        }),
      },
      ai.timeout || 60000
    ) as any;

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('OpenAI 返回内容为空');
    }
    return content.trim();
  }

  private async requestAnthropicCompletion(prompt: string, ai: ArticleAIConfig): Promise<string> {
    if (!ai.apiKey) {
      throw new Error('Anthropic provider 缺少 apiKey');
    }
    const baseUrl = ai.baseUrl || 'https://api.anthropic.com/v1';
    const data = await this.fetchJsonWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': ai.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ai.model || 'claude-3-5-sonnet-latest',
          max_tokens: ai.maxTokens ?? 2000,
          temperature: ai.temperature ?? 0.7,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      },
      ai.timeout || 60000
    ) as any;

    const content = data?.content?.[0]?.text;
    if (!content || typeof content !== 'string') {
      throw new Error('Anthropic 返回内容为空');
    }
    return content.trim();
  }

  private async requestGeminiCompletion(prompt: string, ai: ArticleAIConfig): Promise<string> {
    if (!ai.apiKey) {
      throw new Error('Gemini provider 缺少 apiKey');
    }
    const baseUrl = ai.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const model = ai.model || 'gemini-1.5-flash';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${encodeURIComponent(ai.apiKey)}`;
    const data = await this.fetchJsonWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: ai.temperature ?? 0.7,
            maxOutputTokens: ai.maxTokens ?? 2000,
          },
        }),
      },
      ai.timeout || 60000
    ) as any;

    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Gemini prompt blocked: ${data.promptFeedback.blockReason}`);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const content = parts.map((part: any) => part?.text || '').join('').trim();
    if (!content) {
      throw new Error('Gemini 返回内容为空');
    }
    return content;
  }

  private async requestLocalCompletion(prompt: string, ai: ArticleAIConfig): Promise<string> {
    const baseUrl = ai.baseUrl || 'http://localhost:11434';
    const data = await this.fetchJsonWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ai.model || 'llama3.1',
          prompt,
          stream: false,
          options: {
            temperature: ai.temperature ?? 0.7,
            num_predict: ai.maxTokens ?? 2000,
          },
        }),
      },
      ai.timeout || 90000
    ) as any;

    const content = data?.response;
    if (!content || typeof content !== 'string') {
      throw new Error('Local provider 返回内容为空');
    }
    return content.trim();
  }

  private async fetchJsonWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`请求超时 (${timeoutMs}ms): ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseGeneratedArticlePayload(raw: string): GeneratedArticlePayload | null {
    const compact = String(raw || '').trim();
    if (!compact) {
      return null;
    }

    const candidates: string[] = [compact];
    const fenced = compact.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      candidates.push(fenced[1].trim());
    }
    candidates.push(...this.extractJsonObjectCandidates(compact));

    const deduped = Array.from(new Set(candidates.filter(Boolean)));

    for (const candidate of deduped) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        const title = String(parsed.title || '').trim();
        const content = String(parsed.content || '').trim();
        const imagePrompt = String(
          parsed.imagePromptNanobanaPro || parsed.imagePrompt || parsed.nanobanaPrompt || ''
        ).trim();
        if (!title || !content) {
          continue;
        }
        return {
          title,
          content,
          imagePromptNanobanaPro: imagePrompt || this.buildFallbackNanobanaPrompt({
            title,
            idea: title,
            moduleName: '',
            platform: '',
          }),
        };
      } catch {
        // continue
      }
    }
    return null;
  }

  /**
   * 从“解释文本 + JSON”混合输出中提取 JSON 对象候选。
   * 常见于模型先输出注释/标题，再输出完整 JSON 的场景。
   */
  private extractJsonObjectCandidates(raw: string): string[] {
    const text = String(raw || '');
    if (!text) {
      return [];
    }

    const result: string[] = [];
    const maxCandidates = 8;
    for (let start = 0; start < text.length && result.length < maxCandidates; start += 1) {
      if (text[start] !== '{') {
        continue;
      }

      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < text.length; i += 1) {
        const ch = text[i];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{') {
          depth += 1;
          continue;
        }
        if (ch !== '}') {
          continue;
        }

        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1).trim();
          if (
            candidate.includes('"title"') &&
            candidate.includes('"content"')
          ) {
            result.push(candidate);
          }
          start = i;
          break;
        }
      }
    }

    return result;
  }

  private deriveTitleFromRaw(raw: string, fallbackIdea: string): string {
    const firstHeading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (firstHeading) {
      return firstHeading;
    }
    const firstLine = raw
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.length >= 6 && item.length <= 36);
    return firstLine || fallbackIdea || '未命名文章';
  }

  private deriveContentFromRaw(raw: string): string {
    const withoutFence = raw.replace(/```[\s\S]*?```/g, '').trim();
    const lines = withoutFence.split('\n');
    if (lines[0]?.startsWith('# ')) {
      return lines.slice(1).join('\n').trim();
    }
    return withoutFence;
  }

  private buildFallbackNanobanaPrompt(args: {
    title: string;
    idea: string;
    moduleName: string;
    platform: string;
  }): string {
    return [
      `${args.title || args.idea}`,
      `主题:${args.moduleName || '生活观察'}`,
      `平台:${args.platform || 'wechat'}`,
      'cinematic documentary style, natural light, realistic texture, 35mm lens, shallow depth of field, rich details, clean composition',
      'no text, no watermark, no logo',
    ]
      .filter(Boolean)
      .join(', ');
  }

  private formatGeneratedArticleMarkdown(
    payload: GeneratedArticlePayload,
    args: { moduleName: string; insertCoverImage: boolean }
  ): string {
    const normalizedTitle = String(payload.title || '').trim() || '未命名文章';
    const normalizedModule = String(args.moduleName || '').trim() || '生活志';
    const category = normalizedModule.startsWith('Z°N ')
      ? normalizedModule
      : `Z°N ${normalizedModule}`;
    const body = this.removeLeadingTitleHeading(payload.content, normalizedTitle).trim();
    const bodyChars = this.estimateReadableLength(body);
    const readMinutes = Math.max(1, Math.ceil(bodyChars / 350));
    const tipLine = `✨ 温馨提示：本文约${bodyChars}字，预计阅读时间${readMinutes}分钟。`;
    const escapedTitle = this.escapeYamlDoubleQuoted(normalizedTitle);
    const coverImage = payload.coverImage ? this.escapeYamlDoubleQuoted(payload.coverImage) : '';
    const coverRatio = payload.coverImageRatio ? this.escapeYamlDoubleQuoted(payload.coverImageRatio) : '';

    const coverMarkdown = payload.coverImage && args.insertCoverImage
      ? `![${this.escapeYamlDoubleQuoted(normalizedTitle)}](${payload.coverImage})\n\n`
      : '';

    return [
      '---',
      `title: "${escapedTitle}"`,
      'note_type: output_note',
      `category: "${this.escapeYamlDoubleQuoted(category)}"`,
      'weekly_recommended: false',
      'tags:',
      '  - para/output',
      '  - type/output-note',
      `image_prompt_nanobana_pro: "${this.escapeYamlDoubleQuoted(payload.imagePromptNanobanaPro || '')}"`,
      ...(coverImage ? [`cover_image: "${coverImage}"`] : []),
      ...(coverRatio ? [`cover_image_ratio: "${coverRatio}"`] : []),
      '---',
      '',
      tipLine,
      '',
      coverMarkdown,
      body,
      '',
    ].join('\n');
  }

  private removeLeadingTitleHeading(content: string, title: string): string {
    const lines = String(content || '').split('\n');
    const first = (lines[0] || '').trim();
    if (!first.startsWith('#')) {
      return String(content || '').trim();
    }
    const heading = first.replace(/^#+\s*/, '').trim();
    if (!heading) {
      return lines.slice(1).join('\n').trim();
    }
    if (heading === title || heading === `"${title}"`) {
      return lines.slice(1).join('\n').trim();
    }
    return String(content || '').trim();
  }

  private escapeYamlDoubleQuoted(value: string): string {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ');
  }

  private resolveLengthConstraint(args: {
    requirements: string;
    renderedPrompt: string;
  }): LengthConstraint {
    const fromRequirements = this.extractLengthConstraintFromText(args.requirements);
    const fromPrompt = this.extractLengthConstraintFromText(args.renderedPrompt);
    return this.normalizeLengthConstraint({
      minChars: fromRequirements.minChars ?? fromPrompt.minChars,
      maxChars: fromRequirements.maxChars ?? fromPrompt.maxChars,
    });
  }

  private resolveCoverRatio(input?: string): '4:3' | '16:9' {
    if (input === '4:3') {
      return '4:3';
    }
    return '16:9';
  }

  private extractLengthConstraintFromText(text: string): LengthConstraint {
    const normalized = String(text || '').trim();
    if (!normalized) {
      return {};
    }

    let minChars: number | undefined;
    let maxChars: number | undefined;

    const rangeMatch = normalized.match(/(\d{2,5})\s*[-~～到至]\s*(\d{2,5})\s*字/);
    if (rangeMatch?.[1] && rangeMatch?.[2]) {
      const left = Number(rangeMatch[1]);
      const right = Number(rangeMatch[2]);
      if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
        minChars = Math.min(left, right);
        maxChars = Math.max(left, right);
      }
    }

    const minPatterns = [
      /(\d{2,5})\s*字以上/,
      /不少于\s*(\d{2,5})\s*字/,
      /至少\s*(\d{2,5})\s*字/,
      /最少\s*(\d{2,5})\s*字/,
      /大于\s*(\d{2,5})\s*字/,
      />=\s*(\d{2,5})\s*字/,
      />\s*(\d{2,5})\s*字/,
      /不低于\s*(\d{2,5})\s*字/,
    ];
    for (const pattern of minPatterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > 0) {
          minChars = Math.floor(value);
          break;
        }
      }
    }

    const maxPatterns = [
      /(\d{2,5})\s*字以内/,
      /不超过\s*(\d{2,5})\s*字/,
      /小于等于\s*(\d{2,5})\s*字/,
      /不高于\s*(\d{2,5})\s*字/,
      /最多\s*(\d{2,5})\s*字/,
      /<\s*(\d{2,5})\s*字/,
      /<=\s*(\d{2,5})\s*字/,
    ];
    for (const pattern of maxPatterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > 0) {
          maxChars = Math.floor(value);
          break;
        }
      }
    }

    return this.normalizeLengthConstraint({ minChars, maxChars });
  }

  private normalizeLengthConstraint(constraint: LengthConstraint): LengthConstraint {
    const minChars = constraint.minChars && constraint.minChars > 0
      ? Math.floor(constraint.minChars)
      : undefined;
    const maxChars = constraint.maxChars && constraint.maxChars > 0
      ? Math.floor(constraint.maxChars)
      : undefined;

    if (minChars && maxChars && minChars > maxChars) {
      return { minChars: maxChars, maxChars: minChars };
    }
    return { minChars, maxChars };
  }

  private describeLengthConstraint(constraint?: LengthConstraint): string {
    if (!constraint) {
      return '';
    }
    const { minChars, maxChars } = this.normalizeLengthConstraint(constraint);
    if (minChars && maxChars) {
      return `${minChars}-${maxChars}字`;
    }
    if (minChars) {
      return `不少于${minChars}字`;
    }
    if (maxChars) {
      return `不超过${maxChars}字`;
    }
    return '';
  }

  private isLengthWithinConstraint(length: number, constraint: LengthConstraint): boolean {
    const normalized = this.normalizeLengthConstraint(constraint);
    if (normalized.minChars && length < normalized.minChars) {
      return false;
    }
    if (normalized.maxChars && length > normalized.maxChars) {
      return false;
    }
    return true;
  }

  private estimateReadableLength(markdown: string): number {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/[*_>#-]/g, '')
      .replace(/\s+/g, '')
      .length;
  }

  private async ensureArticleWithinLength(args: {
    payload: GeneratedArticlePayload;
    constraint: LengthConstraint;
    runtimeConfig: ResolvedPromptRuntimeConfig;
    idea: string;
    moduleName: string;
    platform: string;
  }): Promise<GeneratedArticlePayload> {
    const normalizedConstraint = this.normalizeLengthConstraint(args.constraint);
    const currentLength = this.estimateReadableLength(args.payload.content);
    if (this.isLengthWithinConstraint(currentLength, normalizedConstraint)) {
      return args.payload;
    }

    const lengthLine = this.describeLengthConstraint(normalizedConstraint);
    const actionText =
      normalizedConstraint.minChars && currentLength < normalizedConstraint.minChars
        ? '扩写'
        : '压缩改写';
    const compressPrompt = [
      `请将下面文章${actionText}到指定字数范围，并保持原有观点和语气。`,
      `目标字数：${lengthLine}（严格遵守，仅统计正文 content）`,
      `当前估算字数：${currentLength}`,
      `主题：${args.idea}`,
      `模块：${args.moduleName}`,
      `平台：${args.platform}`,
      '',
      '输出 JSON（不要代码块，不要额外说明）：',
      '{',
      '  "title": "精炼后的标题",',
      '  "content": "压缩后的正文 Markdown",',
      '  "imagePromptNanobanaPro": "原提示词可微调但保持核心主体"',
      '}',
      '',
      '原始标题：',
      args.payload.title,
      '',
      '原始正文：',
      args.payload.content,
      '',
      '原始生图提示词：',
      args.payload.imagePromptNanobanaPro,
    ].join('\n');

    try {
      const raw = await this.requestModelCompletion(compressPrompt, args.runtimeConfig.articleAI);
      const revised = this.parseGeneratedArticlePayload(raw);
      if (revised && this.isLengthWithinConstraint(
        this.estimateReadableLength(revised.content),
        normalizedConstraint
      )) {
        return revised;
      }
      if (revised) {
        const revisedWithMaxApplied = normalizedConstraint.maxChars
          ? {
            ...revised,
            content: this.trimMarkdownByChars(revised.content, normalizedConstraint.maxChars),
          }
          : revised;
        if (this.isLengthWithinConstraint(
          this.estimateReadableLength(revisedWithMaxApplied.content),
          normalizedConstraint
        )) {
          return revisedWithMaxApplied;
        }
        return {
          ...revised,
          content: await this.expandMarkdownToMinChars({
            content: revisedWithMaxApplied.content,
            minChars: normalizedConstraint.minChars,
            runtimeConfig: args.runtimeConfig,
            idea: args.idea,
            moduleName: args.moduleName,
            platform: args.platform,
          }),
        };
      }
    } catch {
      // 回退到本地裁剪
    }

    let fallbackContent = args.payload.content;
    if (normalizedConstraint.maxChars) {
      fallbackContent = this.trimMarkdownByChars(fallbackContent, normalizedConstraint.maxChars);
    }
    if (normalizedConstraint.minChars) {
      fallbackContent = await this.expandMarkdownToMinChars({
        content: fallbackContent,
        minChars: normalizedConstraint.minChars,
        runtimeConfig: args.runtimeConfig,
        idea: args.idea,
        moduleName: args.moduleName,
        platform: args.platform,
      });
    }

    return {
      ...args.payload,
      content: fallbackContent,
    };
  }

  private async expandMarkdownToMinChars(args: {
    content: string;
    minChars?: number;
    runtimeConfig: ResolvedPromptRuntimeConfig;
    idea: string;
    moduleName: string;
    platform: string;
  }): Promise<string> {
    const minChars = args.minChars;
    let content = String(args.content || '').trim();
    if (!minChars || minChars <= 0 || !content) {
      return content;
    }

    for (let index = 0; index < 2; index += 1) {
      const current = this.estimateReadableLength(content);
      if (current >= minChars) {
        return content;
      }
      const missing = minChars - current;
      const targetAppend = Math.min(Math.max(missing + 100, 180), 400);
      const expandPrompt = [
        '请继续补写以下中文文章正文，使总正文达到指定最小字数。',
        `当前正文字数约：${current}`,
        `目标下限：不少于${minChars}字（严格遵守，仅统计正文）`,
        `建议补充字数：${targetAppend}字左右`,
        `主题：${args.idea}`,
        `模块：${args.moduleName}`,
        `平台：${args.platform}`,
        '',
        '只输出可直接拼接到正文末尾的 Markdown 段落，不要输出标题、JSON、代码块或解释。',
        '',
        '已有正文：',
        content,
      ].join('\n');

      try {
        const raw = await this.requestModelCompletion(expandPrompt, args.runtimeConfig.articleAI);
        const addition = this.extractPlainMarkdownFromModel(raw);
        if (!addition) {
          break;
        }
        const merged = `${content}\n\n${addition}`.trim();
        if (merged === content) {
          break;
        }
        content = merged;
      } catch {
        break;
      }
    }

    return content;
  }

  private extractPlainMarkdownFromModel(raw: string): string {
    const parsed = this.parseGeneratedArticlePayload(raw);
    if (parsed?.content?.trim()) {
      return parsed.content.trim();
    }
    return this.deriveContentFromRaw(raw).trim();
  }

  private resolvePromptComplianceRules(args: {
    renderedPrompt: string;
  }): PromptComplianceRules {
    const renderedPrompt = String(args.renderedPrompt || '');
    const requireLyricsSection =
      /(歌词小节|可跟唱歌词|歌词节选|歌词（节选）|歌词\（节选\）)/.test(renderedPrompt);
    const requireSingerSongTitle = renderedPrompt.includes('歌手《歌名》：感悟');

    let minLyricsLines: number | undefined;
    const rangeMatch = renderedPrompt.match(/(?:歌词小节|该小节|建议)\D{0,12}(\d{1,2})\s*[-~～]\s*(\d{1,2})\s*行/);
    if (rangeMatch?.[1]) {
      const value = Number(rangeMatch[1]);
      if (Number.isFinite(value) && value > 0) {
        minLyricsLines = Math.floor(value);
      }
    }
    if (!minLyricsLines && requireLyricsSection) {
      minLyricsLines = 4;
    }

    return {
      requireLyricsSection,
      minLyricsLines,
      requireSingerSongTitle,
    };
  }

  private async ensureArticlePromptCompliance(args: {
    payload: GeneratedArticlePayload;
    renderedPrompt: string;
    runtimeConfig: ResolvedPromptRuntimeConfig;
    idea: string;
    moduleName: string;
    platform: string;
  }): Promise<GeneratedArticlePayload> {
    const rules = this.resolvePromptComplianceRules({
      renderedPrompt: args.renderedPrompt,
    });
    if (!rules.requireLyricsSection && !rules.requireSingerSongTitle) {
      return args.payload;
    }

    let current = args.payload;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const violations = this.detectPromptViolations(current, rules);
      if (violations.length === 0) {
        return current;
      }

      const fixPrompt = [
        '请修正下面文章，使其严格满足指定约束，并保留原有核心观点和语气。',
        `主题：${args.idea}`,
        `模块：${args.moduleName}`,
        `平台：${args.platform}`,
        `不满足项：${violations.join('；')}`,
        '',
        '输出 JSON（不要代码块，不要额外说明）：',
        '{',
        '  "title": "修正后的标题",',
        '  "content": "修正后的正文 Markdown（不包含标题）",',
        '  "imagePromptNanobanaPro": "生图提示词"',
        '}',
        '',
        '原始分层 Prompt（必须遵守）：',
        args.renderedPrompt,
        '',
        '当前标题：',
        current.title,
        '',
        '当前正文：',
        current.content,
        '',
        '当前生图提示词：',
        current.imagePromptNanobanaPro,
      ].join('\n');

      const raw = await this.requestModelCompletion(fixPrompt, args.runtimeConfig.articleAI);
      const revised = this.parseGeneratedArticlePayload(raw);
      if (revised) {
        current = revised;
      }
    }

    const finalViolations = this.detectPromptViolations(current, rules);
    if (finalViolations.length > 0) {
      throw new Error(`生成内容未满足 Prompt 约束: ${finalViolations.join('；')}`);
    }
    return current;
  }

  private async maybeGenerateArticleCoverImage(args: {
    payload: GeneratedArticlePayload;
    runtimeConfig: ResolvedPromptRuntimeConfig;
    moduleConfig?: PromptModuleConfig;
    moduleName: string;
    platform: string;
  }): Promise<GeneratedArticlePayload> {
    const effectiveImageConfig = this.applyModuleImageOverrides(
      args.runtimeConfig.articleImage,
      args.moduleConfig?.coverImage
    );
    const coverEnabled = effectiveImageConfig.enabled;
    if (!coverEnabled) {
      return args.payload;
    }

    const ratio = this.resolveCoverRatio(
      String(effectiveImageConfig.ratio || '16:9')
    );

    const moduleLabel = args.moduleConfig?.label || args.moduleName || 'article';
      const moduleDir = args.moduleConfig?.moduleDir
      || path.resolve(args.runtimeConfig.outputBaseDir, this.resolveModuleDirectoryName(moduleLabel));
    const coverDir = effectiveImageConfig.outputDir
      ? path.resolve(args.runtimeConfig.configDir || process.cwd(), effectiveImageConfig.outputDir)
      : path.resolve(moduleDir, 'images');
    const coverFileName = `${this.sanitizeTitleFilename(args.payload.title)}-cover-${ratio.replace(':', 'x')}.svg`;
    const coverOutput = path.resolve(coverDir, coverFileName);

    await fs.mkdir(path.dirname(coverOutput), { recursive: true });

    const textOverlayCover = await this.tryGenerateCoverFromTextOverlay({
      runtimeConfig: args.runtimeConfig,
      moduleName: moduleLabel,
      payload: args.payload,
      outputPath: coverOutput,
    });
    if (textOverlayCover) {
      return {
        ...args.payload,
        coverImage: textOverlayCover,
        coverImageRatio: ratio,
      };
    }

    const coverPrompt = await this.resolveCoverPrompt({
      runtimeConfig: args.runtimeConfig,
      moduleConfig: args.moduleConfig,
      moduleName: moduleLabel,
      platform: args.platform,
      fallbackPrompt: args.payload.imagePromptNanobanaPro,
    });

    const hookCover = await this.runHookIfConfigured({
      hookName: 'cover.generate',
      hooks: args.runtimeConfig.hooks,
      configDir: args.runtimeConfig.configDir,
      payload: {
        title: args.payload.title,
        content: args.payload.content,
        prompt: coverPrompt,
        ratio,
        outputPath: coverOutput,
        module: moduleLabel,
        platform: args.platform,
      },
      context: {
        module: moduleLabel,
        platform: args.platform,
        template: 'article',
      },
    });
    if (hookCover.coverImage) {
      return {
        ...args.payload,
        coverImage: String(hookCover.coverImage),
        coverImageRatio: ratio,
      };
    }

    const normalizedInput = this.normalizeImageInput(
      effectiveImageConfig.input,
      args.runtimeConfig.configDir,
      args.runtimeConfig.outputBaseDir,
      { content: args.payload.content, title: args.payload.title }
    );

    const autoConfig: Record<string, any> = {
      title: args.payload.title,
      cover_prompt: coverPrompt,
      cover_ratio: ratio,
      cover_source_order: effectiveImageConfig.coverSourceOrder || ['ai', 'unsplash', 'placeholder'],
      cover_input: normalizedInput,
      cover_mode: this.inferImageMode(normalizedInput),
      cover_ai_endpoint: effectiveImageConfig.coverAiEndpoint,
      cover_ai_api_key_env: effectiveImageConfig.coverAiApiKeyEnv,
      cover_ai_response_url: effectiveImageConfig.coverAiResponseUrl,
      cover_ai_response_base64: effectiveImageConfig.coverAiResponseBase64,
      cover_ai_response_mime: effectiveImageConfig.coverAiResponseMime,
      unsplash_access_key_env: effectiveImageConfig.unsplashAccessKeyEnv,
      unsplash_query: effectiveImageConfig.unsplashQuery,
      cover_script: effectiveImageConfig.script,
    };

    const coverResult = await this.resolveAutoCoverSource({
      config: autoConfig,
      html: args.payload.content,
      configDir: args.runtimeConfig.configDir,
    });
    if (coverResult) {
      return {
        ...args.payload,
        coverImage: coverResult.value,
        coverImageRatio: ratio,
      };
    }

    return args.payload;
  }

  private async resolveCoverPrompt(args: {
    runtimeConfig: ResolvedPromptRuntimeConfig;
    moduleConfig?: PromptModuleConfig;
    moduleName: string;
    platform: string;
    fallbackPrompt: string;
  }): Promise<string> {
    const coverBase = String(args.runtimeConfig.articleImage.coverPromptBase || '').trim();
    const coverPromptFile = (args.moduleConfig?.coverImage && typeof args.moduleConfig.coverImage === 'object')
      ? (args.moduleConfig.coverImage as Record<string, any>).promptFile
      : undefined;
    if (coverPromptFile || (args.moduleConfig as any)?.coverPromptFile) {
      const rawPath = String(coverPromptFile || (args.moduleConfig as any)?.coverPromptFile || '').trim();
      const resolved = path.isAbsolute(rawPath)
        ? rawPath
        : (
          args.moduleConfig?.moduleDir
            ? path.resolve(args.moduleConfig.moduleDir, rawPath)
            : (this.resolvePathFromConfig(args.runtimeConfig.configDir, rawPath) || rawPath)
        );
      if (resolved && await this.fileExists(resolved)) {
        const content = (await fs.readFile(resolved, 'utf-8')).trim();
        if (content) {
          const userPrompt = coverBase ? `${coverBase}\n\n${content}` : content;
          return this.composeImagePrompt({
            systemPrompt: await this.resolvePlatformImageSystemPrompt({
              runtimeConfig: args.runtimeConfig,
              platform: args.platform,
              kind: 'cover',
            }),
            userPrompt,
          });
        }
      } else {
        console.warn(`[cover] coverPromptFile 未找到: ${resolved}`);
      }
    }
    if (args.moduleConfig?.coverPrompt) {
      const raw = String(args.moduleConfig.coverPrompt).trim() || args.fallbackPrompt;
      const userPrompt = coverBase ? `${coverBase}\n\n${raw}` : raw;
      return this.composeImagePrompt({
        systemPrompt: await this.resolvePlatformImageSystemPrompt({
          runtimeConfig: args.runtimeConfig,
          platform: args.platform,
          kind: 'cover',
        }),
        userPrompt,
      });
    }

    const moduleKey = args.moduleConfig?.key || args.moduleName;
    const promptMap = args.runtimeConfig.articleImage.promptMap || {};
    const mapped = moduleKey && promptMap[moduleKey] ? promptMap[moduleKey] : undefined;

    const promptDirs: string[] = [];
    const promptDirRaw = args.runtimeConfig.articleImage.promptDir;
    if (promptDirRaw) {
      const resolved = this.resolvePathFromConfig(args.runtimeConfig.configDir, promptDirRaw)
        || path.resolve(process.cwd(), promptDirRaw);
      promptDirs.push(resolved);
    }
    const moduleCoverPromptDir = (args.moduleConfig?.coverImage && typeof args.moduleConfig.coverImage === 'object')
      ? (args.moduleConfig.coverImage as Record<string, any>).promptDir
      : undefined;
    if (moduleCoverPromptDir && String(moduleCoverPromptDir).trim()) {
      const raw = String(moduleCoverPromptDir).trim();
      const resolved = path.isAbsolute(raw)
        ? raw
        : (args.moduleConfig?.moduleDir
          ? path.resolve(args.moduleConfig.moduleDir, raw)
          : (this.resolvePathFromConfig(args.runtimeConfig.configDir, raw)));
      if (resolved) {
        promptDirs.push(resolved);
      }
    }
    if (args.moduleConfig?.moduleDir) {
      promptDirs.push(args.moduleConfig.moduleDir);
    }
    if (promptDirs.length === 0) {
      return this.composeImagePrompt({
        systemPrompt: await this.resolvePlatformImageSystemPrompt({
          runtimeConfig: args.runtimeConfig,
          platform: args.platform,
          kind: 'cover',
        }),
        userPrompt: args.fallbackPrompt,
      });
    }

    const candidates = [
      mapped,
      moduleKey ? `${moduleKey}.prompt.md` : undefined,
      moduleKey ? `${moduleKey}.md` : undefined,
      args.platform ? `cover.prompt.${args.platform}.md` : undefined,
      'cover.prompt.wechat.md',
      'cover.prompt.md',
      args.platform ? `prompt.${args.platform}.md` : undefined,
      'prompt.wechat.md',
      'prompt.md',
    ].filter(Boolean) as string[];

    for (const dir of promptDirs) {
      for (const candidate of candidates) {
        const filePath = path.resolve(dir, candidate);
        if (await this.fileExists(filePath)) {
          const content = (await fs.readFile(filePath, 'utf-8')).trim();
          if (content) {
            const userPrompt = coverBase ? `${coverBase}\n\n${content}` : content;
            return this.composeImagePrompt({
              systemPrompt: await this.resolvePlatformImageSystemPrompt({
                runtimeConfig: args.runtimeConfig,
                platform: args.platform,
                kind: 'cover',
              }),
              userPrompt,
            });
          }
        }
      }
    }

    const fallback = coverBase ? `${coverBase}\n\n${args.fallbackPrompt}` : args.fallbackPrompt;
    return this.composeImagePrompt({
      systemPrompt: await this.resolvePlatformImageSystemPrompt({
        runtimeConfig: args.runtimeConfig,
        platform: args.platform,
        kind: 'cover',
      }),
      userPrompt: fallback,
    });
  }

  private async resolvePlatformImageSystemPrompt(args: {
    runtimeConfig: ResolvedPromptRuntimeConfig;
    platform: string;
    kind: 'cover' | 'inline';
  }): Promise<string> {
    if (args.runtimeConfig.articleImage.usePlatformImageSystem === false) {
      return '';
    }
    const platform = String(args.platform || '').trim().toLowerCase();
    const resolvedPlatform = platform || 'wechat';
    const coverMap = args.runtimeConfig.platformImageCoverSystemPromptFiles || {};
    const inlineMap = args.runtimeConfig.platformImageInlineSystemPromptFiles || {};
    const genericMap = args.runtimeConfig.platformImageSystemPromptFiles || {};
    const pick =
      (args.kind === 'cover' ? coverMap[resolvedPlatform] : inlineMap[resolvedPlatform])
      || genericMap[resolvedPlatform];
    if (pick && (await this.fileExists(pick))) {
      const content = (await fs.readFile(pick, 'utf-8')).trim();
      if (content) {
        return content;
      }
    }
    return this.getBuiltInPlatformImagePrompt(resolvedPlatform, args.kind);
  }

  private getBuiltInPlatformImagePrompt(
    platform: string,
    kind: 'cover' | 'inline'
  ): string {
    const normalized = String(platform || '').trim().toLowerCase();
    const baseCover =
      '视觉风格：干净、克制、留白；避免复杂纹理与高噪点；画面主体清晰、对比适中；不出现文字、水印、logo。';
    const baseInline =
      '视觉风格：辅助阅读，画面清晰，色彩不过饱和；避免密集细节与文字元素；不出现水印、logo。';
    if (normalized === 'zhihu') {
      return kind === 'cover'
        ? '视觉风格：简洁、理性、信息密度适中；主体清晰，构图稳重；不出现文字、水印、logo。'
        : '视觉风格：支持论证与阅读理解，画面简洁；避免花哨装饰与文字元素；不出现水印、logo。';
    }
    if (normalized === 'wechat' || normalized === 'wx') {
      return kind === 'cover'
        ? '视觉风格：移动端友好、留白、清晰；主体突出、背景干净；不出现文字、水印、logo。'
        : '视觉风格：配合微信阅读节奏，简洁清爽；避免复杂背景与文字元素；不出现水印、logo。';
    }
    return kind === 'cover' ? baseCover : baseInline;
  }

  private composeImagePrompt(args: {
    systemPrompt?: string;
    userPrompt?: string;
  }): string {
    const system = String(args.systemPrompt || '').trim();
    const user = String(args.userPrompt || '').trim();
    if (system && user) {
      return `${system}\n\n${user}`;
    }
    return user || system || '';
  }

  private inferImageMode(input?: {
    image?: string;
    mask?: string;
    editText?: string;
    prompt?: string;
  }): 'text' | 'image' | 'text+image' | 'edit' {
    const image = String(input?.image || '').trim();
    const mask = String(input?.mask || '').trim();
    const editText = String(input?.editText || '').trim();
    const prompt = String(input?.prompt || '').trim();
    if (mask || editText) {
      return 'edit';
    }
    if (image && prompt) {
      return 'text+image';
    }
    if (image) {
      return 'image';
    }
    return 'text';
  }

  private normalizeImageInput(
    input: Record<string, any> | undefined,
    configDir?: string,
    baseDir?: string,
    context?: { content?: string; title?: string }
  ): Record<string, any> | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const normalized: Record<string, any> = { ...input };
    const resolvePath = (raw: string): string => {
      if (!raw) return raw;
      if (path.isAbsolute(raw)) return raw;
      if (raw.startsWith('.')) {
        return this.resolvePathFromConfig(configDir, raw) || raw;
      }
      if (baseDir) {
        return path.resolve(baseDir, raw);
      }
      return this.resolvePathFromConfig(configDir, raw) || raw;
    };
    if (normalized.image) {
      normalized.image = resolvePath(String(normalized.image));
    }
    if (normalized.mask) {
      normalized.mask = resolvePath(String(normalized.mask));
    }
    if (normalized.editText && context) {
      const issueNumber = this.resolveIssueNumberFromContent(context.content || '', context.title || '');
      normalized.editText = this.renderTemplate(String(normalized.editText), {
        issueNumber,
      });
      if (String(normalized.editText).includes('{{issueNumber}}')) {
        console.warn('[image] 未能解析 issueNumber，将保留占位符');
      }
    }
    return normalized;
  }

  private async tryGenerateCoverFromTextOverlay(args: {
    runtimeConfig: ResolvedPromptRuntimeConfig;
    moduleName: string;
    payload: GeneratedArticlePayload;
    outputPath: string;
  }): Promise<string | null> {
    const overlay = args.runtimeConfig.articleImage.textOverlay;
    if (!overlay) {
      return null;
    }
    const baseImageRaw = args.runtimeConfig.articleImage.baseImage;
    if (!baseImageRaw) {
      return null;
    }
    const baseImage = this.resolvePathFromConfig(args.runtimeConfig.configDir, baseImageRaw) || baseImageRaw;
    try {
      await fs.access(baseImage);
    } catch {
      console.warn(`[cover] baseImage not found: ${baseImage}`);
      return null;
    }

    const text = this.resolveTextOverlayText({
      overlay,
      title: args.payload.title,
      moduleName: args.moduleName,
    });
    if (!text) {
      return null;
    }

    const sharpModule = await import('sharp');
    const sharp = (sharpModule as any).default || sharpModule;
    const meta = await sharp(baseImage).metadata();
    const width = meta.width || 1600;
    const height = meta.height || 900;
    const font = overlay.font || 'Arial';
    const size = Number(overlay.size || 64);
    const x = Number(overlay.x ?? 80);
    const y = Number(overlay.y ?? 160);
    const color = overlay.color || '#ffffff';

    const svg = [
      `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${width}\" height=\"${height}\">`,
      `<style>text { font-family: ${font}; font-size: ${size}px; fill: ${color}; }</style>`,
      `<text x=\"${x}\" y=\"${y}\">${this.escapeXml(text)}</text>`,
      `</svg>`,
    ].join('');

    await sharp(baseImage)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .toFile(args.outputPath);
    return args.outputPath;
  }

  private async runHookIfConfigured(args: {
    hookName: string;
    hooks: Record<string, string> | undefined;
    configDir?: string;
    payload: Record<string, any>;
    context?: Record<string, any>;
  }): Promise<Record<string, any>> {
    const hookPath = args.hooks?.[args.hookName];
    if (!hookPath) {
      return args.payload;
    }
    const resolved = this.resolvePathFromConfig(args.configDir, hookPath) || path.resolve(process.cwd(), hookPath);
    try {
      const inputFile = path.join(
        os.tmpdir(),
        `lyra-hook-${args.hookName}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
      );
      const inputPayload = {
        context: args.context || {},
        payload: args.payload,
      };
      await fs.writeFile(inputFile, JSON.stringify(inputPayload, null, 2), 'utf-8');
      const result = await this.runHookScript(resolved, inputFile);
      if (result && typeof result === 'object') {
        if ((result as any).payload && typeof (result as any).payload === 'object') {
          return (result as any).payload as Record<string, any>;
        }
        return result as Record<string, any>;
      }
      return args.payload;
    } catch (error) {
      console.warn(`[hook] ${args.hookName} 执行失败: ${error instanceof Error ? error.message : String(error)}`);
      return args.payload;
    }
  }

  private async runHookScript(scriptPath: string, inputFile: string): Promise<Record<string, any>> {
    try {
      await fs.access(scriptPath);
    } catch {
      throw new Error(`hook 脚本不存在: ${scriptPath}`);
    }
    const ext = path.extname(scriptPath).toLowerCase();
    let command = scriptPath;
    let args = ['--input', inputFile];
    if (ext === '.py') {
      command = 'python3';
      args = [scriptPath, '--input', inputFile];
    } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      command = 'node';
      args = [scriptPath, '--input', inputFile];
    }
    const output = await this.spawnAndCollect(command, args);
    const trimmed = output.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed);
  }

  private resolveTextOverlayText(args: {
    overlay: NonNullable<ArticleImageConfig['textOverlay']>;
    title: string;
    moduleName: string;
  }): string {
    if (args.overlay.textTemplate) {
      return this.renderTemplate(args.overlay.textTemplate, {
        title: args.title,
        module: args.moduleName,
      });
    }
    let base = args.overlay.selector === 'module' ? args.moduleName : args.title;
    if (args.overlay.replace?.pattern) {
      try {
        const re = new RegExp(args.overlay.replace.pattern);
        base = base.replace(re, args.overlay.replace.with || '');
      } catch {
        // ignore invalid regex
      }
    }
    return String(base || '').trim();
  }

  private renderTemplate(template: string, vars: Record<string, string>): string {
    return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
      return vars[key] || '';
    });
  }

  private escapeXml(input: string): string {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private resolveIssueNumberFromContent(content: string, title: string): string {
    const raw = String(content || '').trim();
    const normalized = raw.includes('\\n') && !raw.includes('\n')
      ? raw.replace(/\\n/g, '\n')
      : raw;
    if (normalized.startsWith('---')) {
      try {
        const parsed = matter(normalized);
        const issue = parsed?.data?.issueNumber;
        if (issue !== undefined && issue !== null && String(issue).trim()) {
          return String(issue).trim();
        }
      } catch {
        // ignore
      }
      const fmMatch = normalized.match(/issueNumber\\s*:\\s*(\\d{1,4})/i);
      if (fmMatch?.[1]) {
        return fmMatch[1];
      }
    }
    const htmlMatch = normalized.match(/ISSUE\\s*#?\\s*(\\d{1,4})/i);
    if (htmlMatch?.[1]) {
      return htmlMatch[1];
    }
    const titleMatch = String(title || '').match(/#\\s*(\\d{1,4})/);
    if (titleMatch?.[1]) {
      return titleMatch[1];
    }
    return '';
  }

  private async runCoverScript(scriptPath: string, inputFile: string): Promise<Record<string, any>> {
    try {
      await fs.access(scriptPath);
    } catch {
      console.error(`❌ 头图脚本不存在: ${scriptPath}`);
      process.exit(1);
    }

    const ext = path.extname(scriptPath).toLowerCase();
    let command = scriptPath;
    let args = ['--input', inputFile];
    if (ext === '.py') {
      command = 'python3';
      args = [scriptPath, '--input', inputFile];
    } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      command = 'node';
      args = [scriptPath, '--input', inputFile];
    }

    const output = await this.spawnAndCollect(command, args);
    const trimmed = output.trim();
    if (!trimmed) {
      return {};
    }
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      console.warn(`[cover] 脚本输出不是 JSON，已忽略: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  private spawnAndCollect(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `头图脚本退出码 ${code}`));
        }
      });
    });
  }

  private detectPromptViolations(
    payload: GeneratedArticlePayload,
    rules: PromptComplianceRules
  ): string[] {
    const errors: string[] = [];
    const title = String(payload.title || '').trim();
    const content = String(payload.content || '').trim();

    if (rules.requireSingerSongTitle) {
      const titlePattern = /^.+《[^》]+》：.+$/;
      if (!titlePattern.test(title)) {
        errors.push('标题必须符合“歌手《歌名》：感悟”格式');
      }
    }

    if (rules.requireLyricsSection) {
      const sectionBody = this.extractLyricsSectionBody(content);
      if (!sectionBody) {
        errors.push('缺少“歌词节选”小节');
      } else {
        if (/歌词待补充/.test(sectionBody)) {
          errors.push('歌词小节不能是“待补充”占位内容');
        }
        const lyricLines = sectionBody
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));
        if (rules.minLyricsLines && lyricLines.length < rules.minLyricsLines) {
          errors.push(`歌词小节至少需要 ${rules.minLyricsLines} 行`);
        }
      }
    }

    return errors;
  }

  private extractLyricsSectionBody(markdown: string): string {
    const lines = String(markdown || '').split('\n');
    let bestStart = -1;
    let bestScore = 0;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!/^#{2,3}\s+/.test(line)) {
        continue;
      }
      const title = line.replace(/^#{2,3}\s+/, '').replace(/\s+/g, '');
      if (!title.includes('歌词')) {
        continue;
      }

      let score = 1;
      if (title.includes('节选')) {
        score += 1;
      }
      if (title.includes('跟唱') || title.includes('哼')) {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestStart = i + 1;
      }
    }

    if (bestStart < 0) {
      return '';
    }

    const body: string[] = [];
    for (let i = bestStart; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^#{2,3}\s+/.test(line.trim())) {
        break;
      }
      body.push(line);
    }
    return body.join('\n').trim();
  }

  private trimMarkdownByChars(markdown: string, maxChars: number): string {
    const text = String(markdown || '').trim();
    if (!text) {
      return text;
    }

    const paragraphs = text.split(/\n{2,}/);
    const kept: string[] = [];
    for (const paragraph of paragraphs) {
      const tentative = [...kept, paragraph].join('\n\n');
      if (this.estimateReadableLength(tentative) <= maxChars) {
        kept.push(paragraph);
        continue;
      }

      const sentenceParts = paragraph.split(/(?<=[。！？!?])/);
      let partial = '';
      for (const sentence of sentenceParts) {
        const next = `${partial}${sentence}`;
        const nextTentative = [...kept, next].join('\n\n');
        if (this.estimateReadableLength(nextTentative) <= maxChars) {
          partial = next;
        } else {
          break;
        }
      }
      if (partial.trim()) {
        kept.push(partial.trim());
      }
      break;
    }

    const result = kept.join('\n\n').trim();
    return result || text.slice(0, Math.max(100, maxChars));
  }
}
