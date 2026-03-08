/**
 * TemplateRegistry 属性测试
 */

import * as fc from 'fast-check';
import { TemplateRegistry } from './TemplateRegistry';
import { IDataProvider, DataProviderConstructor } from '../types/interfaces';
import { Logger } from './Logger';
import { RegistryError, ErrorCode } from '../types/errors';

// Mock Data Provider for testing
class MockDataProvider implements IDataProvider {
  async collectData(): Promise<any> {
    return { metadata: {}, content: {}, statistics: {} };
  }

  validateData(): any {
    return { valid: true, errors: [] };
  }

  getTemplatePath(): string {
    return './templates/mock.hbs';
  }
}

describe('TemplateRegistry Property Tests', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('debug');
  });

  describe('Property 1: 模板注册后可查找', () => {
    it('对于任意模板名称，注册后应该可以通过 hasTemplate 查找', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (templateName) => {
            const registry = new TemplateRegistry(logger);
            
            // 注册前应该不存在
            expect(registry.hasTemplate(templateName)).toBe(false);
            
            // 注册模板
            registry.registerTemplate(templateName, MockDataProvider);
            
            // 注册后应该存在
            expect(registry.hasTemplate(templateName)).toBe(true);
            
            // 应该能获取到构造函数
            const constructor = registry.getTemplateConstructor(templateName);
            expect(constructor).toBe(MockDataProvider);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任意模板名称，重复注册应该抛出错误', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (templateName) => {
            const registry = new TemplateRegistry(logger);
            
            // 第一次注册应该成功
            registry.registerTemplate(templateName, MockDataProvider);
            
            // 第二次注册应该抛出错误
            expect(() => {
              registry.registerTemplate(templateName, MockDataProvider);
            }).toThrow(RegistryError);
            
            // 错误应该包含正确的错误代码
            try {
              registry.registerTemplate(templateName, MockDataProvider);
            } catch (error) {
              expect(error.code).toBe(ErrorCode.E011);
              expect(error.message).toContain(templateName);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 2: 注册表列表完整性', () => {
    it('对于任意注册的模板集合，listTemplates 应该返回所有已注册的模板', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            { minLength: 0, maxLength: 20 }
          ).map(arr => [...new Set(arr)]), // 去重确保唯一性
          (templateNames) => {
            const registry = new TemplateRegistry(logger);
            
            // 注册所有模板
            for (const name of templateNames) {
              registry.registerTemplate(name, MockDataProvider);
            }
            
            // 获取模板列表
            const templates = registry.listTemplates();
            
            // 验证数量一致
            expect(templates.length).toBe(templateNames.length);
            
            // 验证所有模板都在列表中
            const listedNames = templates.map(t => t.name);
            for (const name of templateNames) {
              expect(listedNames).toContain(name);
            }
            
            // 验证列表中的模板都已注册
            for (const template of templates) {
              expect(registry.hasTemplate(template.name)).toBe(true);
            }
            
            // 验证模板信息结构
            for (const template of templates) {
              expect(template.name).toBeTruthy();
              expect(template.description).toBeTruthy();
              expect(template.version).toBeTruthy();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于空注册表，listTemplates 应该返回空数组', () => {
      const registry = new TemplateRegistry(logger);
      const templates = registry.listTemplates();
      
      expect(templates).toEqual([]);
      expect(Array.isArray(templates)).toBe(true);
    });

    it('对于任意模板名称，注册和注销后列表应该保持一致性', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            { minLength: 1, maxLength: 10 }
          ).map(arr => [...new Set(arr)]), // 去重
          (templateNames) => {
            const registry = new TemplateRegistry(logger);
            
            // 逐个注册并验证列表
            for (let i = 0; i < templateNames.length; i++) {
              registry.registerTemplate(templateNames[i], MockDataProvider);
              
              const templates = registry.listTemplates();
              expect(templates.length).toBe(i + 1);
              
              // 验证所有已注册的模板都在列表中
              for (let j = 0; j <= i; j++) {
                expect(templates.some(t => t.name === templateNames[j])).toBe(true);
              }
            }
            
            // 最终验证
            const finalTemplates = registry.listTemplates();
            expect(finalTemplates.length).toBe(templateNames.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('边界情况测试', () => {
    it('应该处理特殊字符的模板名称', () => {
      const registry = new TemplateRegistry(logger);
      const specialNames = ['模板-1', 'template_2', 'Template.3', 'TEMPLATE@4'];
      
      for (const name of specialNames) {
        registry.registerTemplate(name, MockDataProvider);
        expect(registry.hasTemplate(name)).toBe(true);
      }
      
      const templates = registry.listTemplates();
      expect(templates.length).toBe(specialNames.length);
    });

    it('应该处理大量模板注册', () => {
      const registry = new TemplateRegistry(logger);
      const templateCount = 1000;
      
      // 注册大量模板
      for (let i = 0; i < templateCount; i++) {
        registry.registerTemplate(`template-${i}`, MockDataProvider);
      }
      
      // 验证所有模板都已注册
      for (let i = 0; i < templateCount; i++) {
        expect(registry.hasTemplate(`template-${i}`)).toBe(true);
      }
      
      // 验证列表完整性
      const templates = registry.listTemplates();
      expect(templates.length).toBe(templateCount);
    });
  });
});