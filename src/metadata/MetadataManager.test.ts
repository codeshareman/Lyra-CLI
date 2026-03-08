import { MetadataManager } from './MetadataManager';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import matter from 'gray-matter';

describe('MetadataManager', () => {
  let tempDir: string;
  let metadataManager: MetadataManager;

  beforeEach(async () => {
    // 创建临时测试目录
    tempDir = path.join(tmpdir(), `metadata-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    metadataManager = new MetadataManager(tempDir);
  });

  afterEach(async () => {
    // 清理临时测试目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('generate', () => {
    it('应该生成完整的元数据对象', async () => {
      const date = new Date('2024-01-15'); // 周一
      const metadata = await metadataManager.generate({
        date,
        outputPath: tempDir,
      });

      // 验证必需字段
      expect(metadata.id).toBeDefined();
      expect(metadata.id).toMatch(/^\d{14}$/); // YYYYMMDDHHmmss 格式
      expect(metadata.title).toBe('Weekly Issue #1');
      expect(metadata.type).toBe('weekly');
      expect(metadata.issueNumber).toBe(1);
      expect(metadata.date).toBe('2024-01-15');
      expect(metadata.weekStart).toBe('2024-01-15'); // 周一
      expect(metadata.weekEnd).toBe('2024-01-21'); // 周日
      expect(metadata.created).toBeDefined();
      expect(metadata.modified).toBeDefined();
      expect(metadata.status).toBe('published');
      expect(metadata.tags).toEqual(['weekly', 'newsletter']);
      expect(metadata.publishedPlatforms).toEqual([]);
    });

    it('应该正确计算周范围（周一到周日）', async () => {
      // 测试周三
      const wednesday = new Date('2024-01-17');
      const metadata = await metadataManager.generate({
        date: wednesday,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-15'); // 周一
      expect(metadata.weekEnd).toBe('2024-01-21'); // 周日
    });

    it('应该正确处理周日', async () => {
      // 测试周日
      const sunday = new Date('2024-01-21');
      const metadata = await metadataManager.generate({
        date: sunday,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-15'); // 上周一
      expect(metadata.weekEnd).toBe('2024-01-21'); // 当前周日
    });

    it('应该在空目录中返回期数 1', async () => {
      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata.issueNumber).toBe(1);
    });

    it('应该计算下一期期数（扫描已存在文档）', async () => {
      // 创建已存在的文档
      const existingFile = path.join(tempDir, 'weekly-1.md');
      const frontmatter = {
        issueNumber: 1,
        title: 'Weekly Issue #1',
      };
      const content = matter.stringify('# Content', frontmatter);
      await fs.writeFile(existingFile, content, 'utf-8');

      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata.issueNumber).toBe(2);
    });

    it('应该找到最大期数并加 1', async () => {
      // 创建多个已存在的文档
      const files = [
        { name: 'weekly-1.md', issue: 1 },
        { name: 'weekly-3.md', issue: 3 },
        { name: 'weekly-2.md', issue: 2 },
      ];

      for (const file of files) {
        const filePath = path.join(tempDir, file.name);
        const frontmatter = {
          issueNumber: file.issue,
          title: `Weekly Issue #${file.issue}`,
        };
        const content = matter.stringify('# Content', frontmatter);
        await fs.writeFile(filePath, content, 'utf-8');
      }

      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata.issueNumber).toBe(4); // max(1, 2, 3) + 1
    });

    it('应该生成唯一的文档 ID', async () => {
      const metadata1 = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      // 等待 1 秒确保 ID 不同
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const metadata2 = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata1.id).not.toBe(metadata2.id);
      expect(metadata1.id).toMatch(/^\d{14}$/);
      expect(metadata2.id).toMatch(/^\d{14}$/);
    });

    it('应该支持 issue_number 字段（向后兼容）', async () => {
      // 创建使用 issue_number 字段的文档
      const existingFile = path.join(tempDir, 'weekly-1.md');
      const frontmatter = {
        issue_number: 5,
        title: 'Weekly Issue #5',
      };
      const content = matter.stringify('# Content', frontmatter);
      await fs.writeFile(existingFile, content, 'utf-8');

      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata.issueNumber).toBe(6);
    });

    it('应该忽略无效的期数字段', async () => {
      // 创建包含无效期数的文档
      const files = [
        { name: 'invalid-1.md', issue: 'invalid' },
        { name: 'invalid-2.md', issue: -1 },
        { name: 'valid.md', issue: 2 },
      ];

      for (const file of files) {
        const filePath = path.join(tempDir, file.name);
        const frontmatter = {
          issueNumber: file.issue,
          title: 'Test',
        };
        const content = matter.stringify('# Content', frontmatter);
        await fs.writeFile(filePath, content, 'utf-8');
      }

      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata.issueNumber).toBe(3); // 只计算有效的期数 2
    });
  });

  describe('updatePreviousIssue', () => {
    it('应该更新上期文档的 next 字段', async () => {
      // 创建上期文档
      const previousFile = path.join(tempDir, 'weekly-1.md');
      const frontmatter = {
        issueNumber: 1,
        title: 'Weekly Issue #1',
      };
      const content = matter.stringify('# Previous Content', frontmatter);
      await fs.writeFile(previousFile, content, 'utf-8');

      // 更新上期文档
      const currentPath = path.join(tempDir, 'weekly-2.md');
      await metadataManager.updatePreviousIssue(2, currentPath);

      // 验证上期文档已更新
      const updatedContent = await fs.readFile(previousFile, 'utf-8');
      const parsed = matter(updatedContent);

      expect(parsed.data.next).toBe('weekly-2.md');
      expect(parsed.data.modified).toBeDefined();
      expect(parsed.content.trim()).toBe('# Previous Content');
    });

    it('应该在第一期时不执行任何操作', async () => {
      // 第一期不应该更新任何文档
      await expect(
        metadataManager.updatePreviousIssue(1, 'weekly-1.md')
      ).resolves.not.toThrow();
    });

    it('应该在上期文档不存在时记录警告但不抛出错误', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // 上期文档不存在
      await expect(
        metadataManager.updatePreviousIssue(2, 'weekly-2.md')
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('未找到上期文档')
      );

      consoleSpy.mockRestore();
    });

    it('应该在更新失败时记录警告但不中断流程', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // 创建一个无效的文档
      const previousFile = path.join(tempDir, 'weekly-1.md');
      await fs.writeFile(previousFile, 'Invalid YAML', 'utf-8');

      // 更新应该失败但不抛出错误
      await expect(
        metadataManager.updatePreviousIssue(2, 'weekly-2.md')
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('应该保留上期文档的原始内容', async () => {
      // 创建上期文档
      const previousFile = path.join(tempDir, 'weekly-1.md');
      const originalContent = '# Previous Content\n\nSome text here.';
      const frontmatter = {
        issueNumber: 1,
        title: 'Weekly Issue #1',
        tags: ['weekly'],
      };
      const content = matter.stringify(originalContent, frontmatter);
      await fs.writeFile(previousFile, content, 'utf-8');

      // 更新上期文档
      await metadataManager.updatePreviousIssue(2, 'weekly-2.md');

      // 验证内容保留
      const updatedContent = await fs.readFile(previousFile, 'utf-8');
      const parsed = matter(updatedContent);

      expect(parsed.content.trim()).toBe(originalContent.trim());
      expect(parsed.data.title).toBe('Weekly Issue #1');
      expect(parsed.data.tags).toEqual(['weekly']);
      expect(parsed.data.next).toBe('weekly-2.md');
    });
  });

  describe('周范围计算', () => {
    it('应该正确计算周一的周范围', async () => {
      const monday = new Date('2024-01-15');
      const metadata = await metadataManager.generate({
        date: monday,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-15');
      expect(metadata.weekEnd).toBe('2024-01-21');
    });

    it('应该正确计算周二的周范围', async () => {
      const tuesday = new Date('2024-01-16');
      const metadata = await metadataManager.generate({
        date: tuesday,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-15');
      expect(metadata.weekEnd).toBe('2024-01-21');
    });

    it('应该正确计算周六的周范围', async () => {
      const saturday = new Date('2024-01-20');
      const metadata = await metadataManager.generate({
        date: saturday,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-15');
      expect(metadata.weekEnd).toBe('2024-01-21');
    });

    it('应该正确计算周日的周范围', async () => {
      const sunday = new Date('2024-01-21');
      const metadata = await metadataManager.generate({
        date: sunday,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-15');
      expect(metadata.weekEnd).toBe('2024-01-21');
    });

    it('应该正确处理跨月的周范围', async () => {
      const date = new Date('2024-01-31'); // 周三
      const metadata = await metadataManager.generate({
        date,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-29'); // 周一
      expect(metadata.weekEnd).toBe('2024-02-04'); // 周日（跨月）
    });

    it('应该正确处理跨年的周范围', async () => {
      const date = new Date('2024-01-01'); // 周一
      const metadata = await metadataManager.generate({
        date,
        outputPath: tempDir,
      });

      expect(metadata.weekStart).toBe('2024-01-01'); // 周一
      expect(metadata.weekEnd).toBe('2024-01-07'); // 周日
    });
  });

  describe('文档 ID 生成', () => {
    it('应该生成 YYYYMMDDHHmmss 格式的 ID', async () => {
      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      expect(metadata.id).toMatch(/^\d{14}$/);
      expect(metadata.id.length).toBe(14);
    });

    it('应该生成当前时间的 ID', async () => {
      const before = new Date();
      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });
      const after = new Date();

      // 提取 ID 中的年月日
      const year = parseInt(metadata.id.substring(0, 4));
      const month = parseInt(metadata.id.substring(4, 6));
      const day = parseInt(metadata.id.substring(6, 8));

      expect(year).toBe(before.getFullYear());
      expect(month).toBe(before.getMonth() + 1);
      expect(day).toBeGreaterThanOrEqual(before.getDate());
      expect(day).toBeLessThanOrEqual(after.getDate());
    });
  });

  describe('日期格式化', () => {
    it('应该正确格式化日期为 YYYY-MM-DD', async () => {
      const date = new Date('2024-01-05');
      const metadata = await metadataManager.generate({
        date,
        outputPath: tempDir,
      });

      expect(metadata.date).toBe('2024-01-05');
    });

    it('应该正确格式化日期时间为 ISO 8601', async () => {
      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: tempDir,
      });

      // 验证 ISO 8601 格式
      expect(metadata.created).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      expect(metadata.modified).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe('错误处理', () => {
    it('应该在生成元数据失败时抛出 ContentGeneratorError', async () => {
      // 模拟文件系统错误
      const invalidManager = new MetadataManager(tempDir);
      
      // 使用 jest.spyOn 模拟 glob 抛出错误
      const globModule = require('glob');
      jest.spyOn(globModule, 'glob').mockRejectedValueOnce(new Error('文件系统错误'));

      await expect(
        invalidManager.generate({
          date: new Date(),
          outputPath: tempDir,
        })
      ).rejects.toThrow('生成元数据失败');
      
      // 恢复 mock
      jest.restoreAllMocks();
    });

    it('应该在目录不存在时返回期数 1', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      const metadata = await metadataManager.generate({
        date: new Date(),
        outputPath: nonExistentDir,
      });

      expect(metadata.issueNumber).toBe(1);
    });
  });
});
