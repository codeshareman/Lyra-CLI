import {
  ITemplateRegistry,
  IDataProvider,
  TemplateInfo,
  DataProviderConstructor
} from '../types/interfaces';
import { RegistryError, ErrorCode } from '../types/errors';
import { ILogger } from '../types/interfaces';

/**
 * Template Registry manages all registered template types and their data providers
 */
export class TemplateRegistry implements ITemplateRegistry {
  private templates: Map<string, DataProviderConstructor>;
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.templates = new Map();
    this.logger = logger;
  }

  /**
   * Register a new template type
   * @param name - Template name
   * @param provider - Data Provider constructor
   */
  registerTemplate(name: string, provider: DataProviderConstructor): void {
    if (this.templates.has(name)) {
      throw new RegistryError(
        ErrorCode.E011,
        `模板类型已存在: ${name}`,
        { templateType: name }
      );
    }

    this.templates.set(name, provider);
    this.logger.info(`已注册模板类型: ${name}`);
  }

  /**
   * Get a Data Provider instance for the specified template
   * @param name - Template name
   * @returns Data Provider instance or null if not found
   */
  getTemplate(name: string): IDataProvider | null {
    const ProviderClass = this.templates.get(name);
    if (!ProviderClass) {
      return null;
    }

    // Note: The actual instantiation with config will be done by ContentGenerator
    // This method is primarily for checking existence
    return null;
  }

  /**
   * Get a Data Provider constructor for the specified template
   * @param name - Template name
   * @returns Data Provider constructor or null if not found
   */
  getTemplateConstructor(name: string): DataProviderConstructor | null {
    return this.templates.get(name) || null;
  }

  /**
   * List all registered templates
   * @returns Array of template information
   */
  listTemplates(): TemplateInfo[] {
    const templates: TemplateInfo[] = [];
    
    for (const [name] of this.templates) {
      templates.push({
        name,
        description: `${name} template`,
        version: '1.0.0'
      });
    }

    return templates;
  }

  /**
   * Check if a template is registered
   * @param name - Template name
   * @returns true if template exists
   */
  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }
}
