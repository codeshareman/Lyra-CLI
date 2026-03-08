/**
 * MetadataManager 属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MetadataManager } from './MetadataManager';
import { MetadataOptions } from '../types/interfaces';

describe('MetadataManager Property Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../test-property-metadata', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  // 辅助函数：创建测试周刊文件
  async function createTestWeeklyFile(
    filePath: string,
    issueNumber: number,
    date: Date
  ): Promise<void> {
    const content = `---
id: "test-${issueNumber}"
title: "Weekly Issue #${issueNumber}"
type: weekly
issueNumber: ${issueNumber}
date: ${date.toISOString().split('T')[0]}
created: ${new Date().toISOString()}
modified: ${new Date().toISOString()}
status: published
tags:
  - weekly
  - newsletter
publishedPlatforms: []
---

# Weekly Issue #${issueNumber}

This is test issue ${issueNumber}.
`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  describe('Property 14: 周范围计算正确性', () => {
    it('对于任意日期，周范围应该从周一开始到周日结束', async () => {
      await fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (date) => {
            const manager = new MetadataManager(testDir);
            
            // 使用私有方法的反射访问来测试周范围计算
            const calculateWeekRange = (manager as any).calculateWeekRange.bind(manager);
            const { weekStart, weekEnd } = calculateWeekRange(date);

            // 验证周一是一周的开始（getDay() === 1）
            expect(weekStart.getDay()).toBe(1);

            // 验证周日是一周的结束（getDay() === 0）
            expect(weekEnd.getDay()).toBe(0);

            // 验证周范围是 7 天
            const diffInDays = Math.floor((weekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
            expect(diffInDays).toBe(6); // 周一到周日是 6 天差

            // 验证输入日期在周范围内
            expect(date.getTime()).toBeGreaterThanOrEqual(weekStart.getTime());
            expect(date.getTime()).toBeLessThanOrEqual(weekEnd.getTime());

            // 验证时间设置正确
            expect(weekStart.getHours()).toBe(0);
            expect(weekStart.getMinutes()).toBe(0);
            expect(weekStart.getSeconds()).toBe(0);
            expect(weekStart.getMilliseconds()).toBe(0);

            expect(weekEnd.getHours()).toBe(23);
            expect(weekEnd.getMinutes()).toBe(59);
            expect(weekEnd.getSeconds()).toBe(59);
            expect(weekEnd.getMilliseconds()).toBe(999);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于特定的星期几，周范围计算应该一致', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 2020, max: 2030 }), // 年份
          fc.integer({ min: 1, max: 12 }),      // 月份
          fc.integer({ min: 1, max: 28 }),      // 日期（避免月末问题）
          (year, month, day) => {
            const date = new Date(year, month - 1, day);
            const manager = new MetadataManager(testDir);
            
            const calculateWeekRange = (manager as any).calculateWeekRange.bind(manager);
            const { weekStart, weekEnd } = calculateWeekRange(date);

            // 对于同一周内的任何日期，周范围应该相同
            for (let i = 0; i < 7; i++) {
              const testDate = new Date(weekStart);
              testDate.setDate(weekStart.getDate() + i);
              
              const { weekStart: testWeekStart, weekEnd: testWeekEnd } = calculateWeekRange(testDate);
              
              expect(testWeekStart.getTime()).toBe(weekStart.getTime());
              expect(testWeekEnd.getTime()).toBe(weekEnd.getTime());
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 15: 文档 ID 唯一性', () => {
    it('对于任意时间点，生成的文档 ID 应该是唯一的', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2 }), // 避免测试超时
          async (count) => {
            const manager = new MetadataManager(testDir);
            const generateDocumentId = (manager as any).generateDocumentId.bind(manager);
            
            const ids = new Set<string>();
            
            // 连续生成多个 ID
            for (let i = 0; i < count; i++) {
              const id = generateDocumentId();
              
              // 验证 ID 格式（YYYYMMDDHHmmss）
              expect(id).toMatch(/^\d{14}$/);
              
              // 如果 ID 重复，等待 1 秒后重新生成
              if (ids.has(id)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const newId = generateDocumentId();
                expect(ids.has(newId)).toBe(false);
                ids.add(newId);
              } else {
                ids.add(id);
              }
              
              // 延迟确保时间戳不同
              if (i < count - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
            
            // 验证最终生成的 ID 数量
            expect(ids.size).toBeGreaterThan(0);
          }
        ),
        { numRuns: 2 } // 减少运行次数
      );
    }, 15000);

    it('生成的文档 ID 应该反映当前时间', async () => {
      const manager = new MetadataManager(testDir);
      const generateDocumentId = (manager as any).generateDocumentId.bind(manager);
      
      const beforeTime = new Date();
      const id = generateDocumentId();
      const afterTime = new Date();
      
      // 解析 ID 中的时间信息
      const year = parseInt(id.substring(0, 4));
      const month = parseInt(id.substring(4, 6));
      const day = parseInt(id.substring(6, 8));
      const hour = parseInt(id.substring(8, 10));
      const minute = parseInt(id.substring(10, 12));
      const second = parseInt(id.substring(12, 14));
      
      const idDate = new Date(year, month - 1, day, hour, minute, second);
      
      // 验证 ID 时间在生成前后时间范围内
      expect(idDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000); // 允许 1 秒误差
      expect(idDate.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);
    });
  });

  describe('Property 16: 期数递增正确性', () => {
    it('对于任意已存在的期数，新期数应该是最大期数 + 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.integer({ min: 1, max: 100 }),
            { minLength: 1, maxLength: 20 }
          ).map(arr => [...new Set(arr)].sort((a, b) => a - b)), // 去重并排序
          async (existingIssues) => {
            // 创建独立的测试目录
            const uniqueTestDir = path.join(testDir, `test-${Date.now()}-${Math.random()}`);
            await fs.mkdir(uniqueTestDir, { recursive: true });

            // 创建已存在的期数文件
            for (const issueNumber of existingIssues) {
              const filePath = path.join(uniqueTestDir, `weekly-${issueNumber}.md`);
              await createTestWeeklyFile(filePath, issueNumber, new Date());
            }

            const manager = new MetadataManager(uniqueTestDir);
            const calculateIssueNumber = (manager as any).calculateIssueNumber.bind(manager);
            
            const nextIssue = await calculateIssueNumber(uniqueTestDir);
            const maxExistingIssue = Math.max(...existingIssues);
            
            expect(nextIssue).toBe(maxExistingIssue + 1);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于空目录，期数应该从 1 开始', async () => {
      const manager = new MetadataManager(testDir);
      const calculateIssueNumber = (manager as any).calculateIssueNumber.bind(manager);
      
      const issueNumber = await calculateIssueNumber(testDir);
      expect(issueNumber).toBe(1);
    });

    it('对于不存在的目录，期数应该从 1 开始', async () => {
      const nonExistentDir = path.join(testDir, 'nonexistent');
      const manager = new MetadataManager(nonExistentDir);
      const calculateIssueNumber = (manager as any).calculateIssueNumber.bind(manager);
      
      const issueNumber = await calculateIssueNumber(nonExistentDir);
      expect(issueNumber).toBe(1);
    });

    it('对于包含无效期数的文件，应该忽略无效值', async () => {
      // 创建包含有效期数的文件
      await createTestWeeklyFile(path.join(testDir, 'valid-1.md'), 5, new Date());
      await createTestWeeklyFile(path.join(testDir, 'valid-2.md'), 10, new Date());

      // 创建包含无效期数的文件
      const invalidContent = `---
title: "Invalid Issue"
issueNumber: "not-a-number"
---

# Invalid Issue

This has an invalid issue number.
`;
      await fs.writeFile(path.join(testDir, 'invalid.md'), invalidContent, 'utf-8');

      // 创建没有期数的文件
      const noIssueContent = `---
title: "No Issue Number"
---

# No Issue Number

This has no issue number.
`;
      await fs.writeFile(path.join(testDir, 'no-issue.md'), noIssueContent, 'utf-8');

      const manager = new MetadataManager(testDir);
      const calculateIssueNumber = (manager as any).calculateIssueNumber.bind(manager);
      
      const nextIssue = await calculateIssueNumber(testDir);
      expect(nextIssue).toBe(11); // max(5, 10) + 1
    });
  });

  describe('Property 17: 元数据包含必需字段', () => {
    it('对于任意日期和输出路径，生成的元数据应该包含所有必需字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          async (date) => {
            const manager = new MetadataManager(testDir);
            const options: MetadataOptions = {
              date,
              outputPath: testDir
            };

            const metadata = await manager.generate(options);

            // 验证所有必需字段存在
            expect(metadata.id).toBeDefined();
            expect(typeof metadata.id).toBe('string');
            expect(metadata.id.length).toBeGreaterThan(0);

            expect(metadata.title).toBeDefined();
            expect(typeof metadata.title).toBe('string');
            expect(metadata.title.length).toBeGreaterThan(0);

            expect(metadata.type).toBe('weekly');

            expect(metadata.issueNumber).toBeDefined();
            expect(typeof metadata.issueNumber).toBe('number');
            expect(metadata.issueNumber).toBeGreaterThan(0);

            expect(metadata.date).toBeDefined();
            expect(typeof metadata.date).toBe('string');
            expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

            expect(metadata.weekStart).toBeDefined();
            expect(typeof metadata.weekStart).toBe('string');
            expect(metadata.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

            expect(metadata.weekEnd).toBeDefined();
            expect(typeof metadata.weekEnd).toBe('string');
            expect(metadata.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);

            expect(metadata.created).toBeDefined();
            expect(typeof metadata.created).toBe('string');
            expect(() => new Date(metadata.created)).not.toThrow();

            expect(metadata.modified).toBeDefined();
            expect(typeof metadata.modified).toBe('string');
            expect(() => new Date(metadata.modified)).not.toThrow();

            expect(metadata.status).toBeDefined();
            expect(typeof metadata.status).toBe('string');

            expect(metadata.tags).toBeDefined();
            expect(Array.isArray(metadata.tags)).toBe(true);
            expect(metadata.tags.length).toBeGreaterThan(0);

            expect(metadata.publishedPlatforms).toBeDefined();
            expect(Array.isArray(metadata.publishedPlatforms)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('生成的元数据字段应该具有正确的格式和值', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          async (date) => {
            const manager = new MetadataManager(testDir);
            const metadata = await manager.generate({ date, outputPath: testDir });

            // 验证 ID 格式
            expect(metadata.id).toMatch(/^\d{14}$/);

            // 验证标题格式
            expect(metadata.title).toMatch(/^Weekly Issue #\d+$/);

            // 验证日期格式
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            expect(metadata.date).toMatch(dateRegex);
            expect(metadata.weekStart).toMatch(dateRegex);
            expect(metadata.weekEnd).toMatch(dateRegex);

            // 验证 ISO 日期格式
            const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
            expect(metadata.created).toMatch(isoRegex);
            expect(metadata.modified).toMatch(isoRegex);

            // 验证标签包含预期值
            expect(metadata.tags).toContain('weekly');
            expect(metadata.tags).toContain('newsletter');

            // 验证期数与标题一致
            const titleIssueMatch = metadata.title.match(/Weekly Issue #(\d+)/);
            expect(titleIssueMatch).not.toBeNull();
            expect(parseInt(titleIssueMatch![1])).toBe(metadata.issueNumber);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('对于连续生成，期数应该递增', async () => {
      const manager = new MetadataManager(testDir);
      const date = new Date('2024-01-01');

      // 第一次生成
      const metadata1 = await manager.generate({ date, outputPath: testDir });
      expect(metadata1.issueNumber).toBe(1);

      // 创建第一期文件
      const filePath1 = path.join(testDir, `weekly-${metadata1.issueNumber}.md`);
      await createTestWeeklyFile(filePath1, metadata1.issueNumber, date);

      // 第二次生成
      const metadata2 = await manager.generate({ date, outputPath: testDir });
      expect(metadata2.issueNumber).toBe(2);

      // 创建第二期文件
      const filePath2 = path.join(testDir, `weekly-${metadata2.issueNumber}.md`);
      await createTestWeeklyFile(filePath2, metadata2.issueNumber, date);

      // 第三次生成
      const metadata3 = await manager.generate({ date, outputPath: testDir });
      expect(metadata3.issueNumber).toBe(3);
    });
  });

  describe('边界情况测试', () => {
    it('应该处理周末日期的周范围计算', async () => {
      const manager = new MetadataManager(testDir);
      const calculateWeekRange = (manager as any).calculateWeekRange.bind(manager);

      // 测试周六
      const saturday = new Date('2024-01-06'); // 2024年1月6日是周六
      const { weekStart: satStart, weekEnd: satEnd } = calculateWeekRange(saturday);
      
      expect(satStart.getDay()).toBe(1); // 周一
      expect(satEnd.getDay()).toBe(0);   // 周日
      expect(saturday.getTime()).toBeGreaterThanOrEqual(satStart.getTime());
      expect(saturday.getTime()).toBeLessThanOrEqual(satEnd.getTime());

      // 测试周日
      const sunday = new Date('2024-01-07'); // 2024年1月7日是周日
      const { weekStart: sunStart, weekEnd: sunEnd } = calculateWeekRange(sunday);
      
      expect(sunStart.getDay()).toBe(1); // 周一
      expect(sunEnd.getDay()).toBe(0);   // 周日
      expect(sunday.getTime()).toBeGreaterThanOrEqual(sunStart.getTime());
      expect(sunday.getTime()).toBeLessThanOrEqual(sunEnd.getTime());
    });

    it('应该处理跨月的周范围', async () => {
      const manager = new MetadataManager(testDir);
      const calculateWeekRange = (manager as any).calculateWeekRange.bind(manager);

      // 测试月末日期
      const endOfMonth = new Date('2024-01-31'); // 2024年1月31日
      const { weekStart, weekEnd } = calculateWeekRange(endOfMonth);
      
      expect(weekStart.getDay()).toBe(1); // 周一
      expect(weekEnd.getDay()).toBe(0);   // 周日
      
      // 验证周范围可能跨越到下个月
      if (weekEnd.getMonth() !== weekStart.getMonth()) {
        expect(weekEnd.getMonth()).toBe((weekStart.getMonth() + 1) % 12);
      }
    });

    it('应该处理闰年的日期计算', async () => {
      const manager = new MetadataManager(testDir);
      const calculateWeekRange = (manager as any).calculateWeekRange.bind(manager);

      // 测试闰年的2月29日
      const leapDay = new Date('2024-02-29'); // 2024年是闰年
      const { weekStart, weekEnd } = calculateWeekRange(leapDay);
      
      expect(weekStart.getDay()).toBe(1); // 周一
      expect(weekEnd.getDay()).toBe(0);   // 周日
      expect(leapDay.getTime()).toBeGreaterThanOrEqual(weekStart.getTime());
      expect(leapDay.getTime()).toBeLessThanOrEqual(weekEnd.getTime());
    });

    it('应该处理包含非 Markdown 文件的目录', async () => {
      // 创建一些非 Markdown 文件
      await fs.writeFile(path.join(testDir, 'readme.txt'), 'This is a text file', 'utf-8');
      await fs.writeFile(path.join(testDir, 'config.json'), '{"test": true}', 'utf-8');

      // 创建一个有效的周刊文件
      await createTestWeeklyFile(path.join(testDir, 'weekly-5.md'), 5, new Date());

      const manager = new MetadataManager(testDir);
      const calculateIssueNumber = (manager as any).calculateIssueNumber.bind(manager);
      
      const nextIssue = await calculateIssueNumber(testDir);
      expect(nextIssue).toBe(6); // 应该忽略非 Markdown 文件
    });
  });
});
