import Handlebars from 'handlebars';
import { promises as fs } from 'fs';
import { format } from 'date-fns';
import {
  ITemplateEngine,
  TemplateData,
  IHookManager,
  HookType,
} from '../types/interfaces';

/**
 * TemplateEngine 负责加载和渲染 Handlebars 模板
 * 支持模板缓存、自定义 Helper 和 Dataview 代码块保留
 */
export class TemplateEngine implements ITemplateEngine {
  private handlebars: typeof Handlebars;
  private templateCache: Map<string, HandlebarsTemplateDelegate>;
  private hookManager?: IHookManager;

  constructor(hookManager?: IHookManager) {
    this.handlebars = Handlebars.create();
    this.templateCache = new Map();
    this.hookManager = hookManager;
    this.registerBuiltinHelpers();
  }

  /**
   * 渲染模板
   * @param templatePath - 模板文件路径
   * @param data - 模板数据
   * @returns 渲染后的内容
   */
  async render(templatePath: string, data: TemplateData): Promise<string> {
    // 执行 beforeRender hook
    let processedData = data;
    if (this.hookManager && this.hookManager.hasHook('beforeRender')) {
      processedData = await this.hookManager.executeHook('beforeRender', {
        type: 'beforeRender',
        data,
        config: {},
        options: {},
      });
    }

    // 从缓存获取或加载模板
    let template = this.templateCache.get(templatePath);
    if (!template) {
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      
      // 保护 Dataview 代码块
      const protectedContent = this.protectDataviewBlocks(templateContent);
      
      // 编译模板
      template = this.handlebars.compile(protectedContent);
      
      // 缓存编译后的模板
      this.templateCache.set(templatePath, template);
    }

    // 渲染模板
    let rendered = template(processedData);

    // 恢复 Dataview 代码块
    rendered = this.restoreDataviewBlocks(rendered);

    // 执行 afterRender hook
    if (this.hookManager && this.hookManager.hasHook('afterRender')) {
      rendered = await this.hookManager.executeHook('afterRender', {
        type: 'afterRender',
        data: rendered,
        config: {},
        options: {},
      });
    }

    return rendered;
  }

  /**
   * 注册自定义 Helper
   * @param name - Helper 名称
   * @param fn - Helper 函数
   */
  registerHelper(name: string, fn: Function): void {
    this.handlebars.registerHelper(name, fn as Handlebars.HelperDelegate);
  }

  /**
   * 注册内置 Helpers
   */
  private registerBuiltinHelpers(): void {
    // formatDate: 格式化日期
    this.registerHelper('formatDate', (date: Date | string, formatStr?: string | any) => {
      if (!date) return '';
      
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      
      if (isNaN(dateObj.getTime())) {
        return '';
      }
      
      // 如果 formatStr 是 Handlebars options 对象，使用默认格式
      const actualFormat = typeof formatStr === 'string' ? formatStr : 'yyyy-MM-dd';
      
      return format(dateObj, actualFormat);
    });

    // hasItems: 检查数组是否有元素
    this.registerHelper('hasItems', (array: any) => {
      return Array.isArray(array) && array.length > 0;
    });

    // renderImage: 渲染单个图片
    this.registerHelper('renderImage', (url: string, alt?: string | any) => {
      if (!url) return '';
      
      // 如果 alt 是 Handlebars options 对象，使用空字符串
      const actualAlt = typeof alt === 'string' ? alt : '';
      
      return new this.handlebars.SafeString(`![${actualAlt}](${url})`);
    });

    // renderImages: 渲染图片数组
    this.registerHelper('renderImages', (images: string[]) => {
      if (!images || !Array.isArray(images) || images.length === 0) return '';
      
      const imageMarkdown = images.map(url => `![](${url})`).join('\n\n');
      return new this.handlebars.SafeString(imageMarkdown);
    });

    // renderReferenceLinks: 汇总内容区的链接引用（遵循模板的展示顺序）
    this.registerHelper('renderReferenceLinks', (content: Record<string, any>) => {
      if (!content || typeof content !== 'object') return '';

      const links: string[] = [];
      const seen = new Set<string>();

      const pushLinks = (items: any) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const url = String((item as Record<string, any>).url || '').trim();
          if (!url || seen.has(url)) continue;
          seen.add(url);
          links.push(url);
        }
      };

      const contentMap = content as Record<string, any>;

      // 本周动态
      pushLinks(contentMap.weeklyUpdates);

      // 精读文章：readingArticles -> reading -> articles
      if (Array.isArray(contentMap.readingArticles) && contentMap.readingArticles.length > 0) {
        pushLinks(contentMap.readingArticles);
      } else if (Array.isArray(contentMap.reading) && contentMap.reading.length > 0) {
        pushLinks(contentMap.reading);
      } else if (Array.isArray(contentMap.articles) && contentMap.articles.length > 0) {
        pushLinks(contentMap.articles);
      }

      // 书籍输入
      pushLinks(contentMap.readingBooks);

      // 技术与生产力：tech -> tools
      if (Array.isArray(contentMap.tech) && contentMap.tech.length > 0) {
        pushLinks(contentMap.tech);
      } else if (Array.isArray(contentMap.tools) && contentMap.tools.length > 0) {
        pushLinks(contentMap.tools);
      }

      // 产品与精选
      pushLinks(contentMap.products);

      // 生活记录
      pushLinks(contentMap.life);

      // 饮食记录
      pushLinks(contentMap.food);

      // 运动记录
      pushLinks(contentMap.exercise);

      // 本周旋律
      pushLinks(contentMap.music);

      // 随感
      pushLinks(contentMap.thoughts);

      if (links.length === 0) return '';

      const sanitize = (value: string) => value.replace(/[\r\n]+/g, '').trim();

      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const lines = links.map((link, index) => `[${index + 1}] ${sanitize(link)}`);
      // Blank lines create separate paragraphs; no HTML tags will show as text.
      const body = lines.join('\n\n');

      return new this.handlebars.SafeString(`## 引用链接\n\n${body}`);
    });

    // renderCode: 渲染代码块
    this.registerHelper('renderCode', (code: string, language?: string | any) => {
      if (!code) return '';
      
      // 如果 language 是 Handlebars options 对象，使用空字符串
      const actualLanguage = typeof language === 'string' ? language : '';
      
      return new this.handlebars.SafeString(
        `\`\`\`${actualLanguage}\n${code}\n\`\`\``
      );
    });

    // hasContent: 检查模块是否有内容
    this.registerHelper('hasContent', (items: any) => {
      return items && Array.isArray(items) && items.length > 0;
    });

    // formatDuration: 格式化时长（分钟）
    this.registerHelper('formatDuration', (minutes: number) => {
      if (!minutes || typeof minutes !== 'number') return '';
      
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      
      if (hours > 0) {
        return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
      }
      return `${mins}分钟`;
    });

    // yamlString: 将任意值转为 YAML 安全字符串（双引号）
    this.registerHelper('yamlString', (value: unknown) => {
      if (value === null || value === undefined) {
        return new this.handlebars.SafeString('""');
      }

      const text = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');

      return new this.handlebars.SafeString(`"${text}"`);
    });

    // uppercase: 转大写（用于刊头和状态展示）
    this.registerHelper('uppercase', (value: unknown) => {
      if (value === null || value === undefined) {
        return '';
      }
      return String(value).toUpperCase();
    });

    // padStart: 数字/字符串左侧补齐（用于期号格式化）
    this.registerHelper(
      'padStart',
      (value: unknown, length: number | string, fillChar?: string | any) => {
        if (value === null || value === undefined) {
          return '';
        }

        const targetLength = Number(length);
        if (!Number.isFinite(targetLength) || targetLength <= 0) {
          return String(value);
        }

        const padChar = typeof fillChar === 'string' ? fillChar : '0';
        return String(value).padStart(targetLength, padChar);
      }
    );
  }

  /**
   * 保护 Dataview 代码块，防止被 Handlebars 处理
   * @param content - 模板内容
   * @returns 保护后的内容
   */
  private protectDataviewBlocks(content: string): string {
    // 使用占位符替换 Dataview 代码块
    const dataviewRegex = /```dataview\n([\s\S]*?)```/g;
    const placeholders: string[] = [];
    
    const protectedContent = content.replace(dataviewRegex, (match) => {
      const index = placeholders.length;
      placeholders.push(match);
      return `__DATAVIEW_BLOCK_${index}__`;
    });

    // 将占位符存储在实例中以便恢复
    (this as any)._dataviewPlaceholders = placeholders;

    return protectedContent;
  }

  /**
   * 恢复 Dataview 代码块
   * @param content - 渲染后的内容
   * @returns 恢复后的内容
   */
  private restoreDataviewBlocks(content: string): string {
    const placeholders = (this as any)._dataviewPlaceholders || [];
    
    let restored = content;
    placeholders.forEach((block: string, index: number) => {
      restored = restored.replace(`__DATAVIEW_BLOCK_${index}__`, block);
    });

    // 清理占位符
    delete (this as any)._dataviewPlaceholders;

    return restored;
  }
}
