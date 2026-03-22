import * as path from 'path';
import { TemplateEngine } from '../core/TemplateEngine';
import { TemplateData } from '../types/interfaces';

describe('Weekly Template', () => {
  let templateEngine: TemplateEngine;
  const templatePath = path.join(__dirname, '../../templates/weekly.hbs');

  beforeEach(() => {
    templateEngine = new TemplateEngine();
  });

  it('应该正确渲染符合新模板结构的周刊', async () => {
    const data: TemplateData = {
      metadata: {
        id: '20240101120000',
        title: 'Weekly #1',
        type: 'weekly',
        issueNumber: 1,
        date: '2024-01-01',
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        created: '2024-01-01T12:00:00Z',
        modified: '2024-01-01T12:00:00Z',
        status: 'draft',
        tags: ['weekly', 'newsletter'],
        publishedPlatforms: [],
      },
      content: {
        articles: [
          {
            title: '测试文章1',
            url: 'https://example.com/article1',
            description: '这是一篇测试文章',
            rating: 5,
          },
        ],
        tools: [
          {
            title: '测试工具1',
            url: 'https://example.com/tool1',
            description: '这是一个测试工具',
            category: '开发工具',
            rating: 5,
          },
        ],
        notes: [
          {
            title: '测试笔记1',
            path: '/notes/test1.md',
            description: '这是一条测试笔记',
            created: new Date('2024-01-01'),
          },
        ],
      },
      statistics: {
        articles: 1,
        tools: 1,
        notes: 1,
      },
    };

    const result = await templateEngine.render(templatePath, data);

    expect(result).toContain('id: "20240101120000"');
    expect(result).toContain('title: "Weekly #1"');
    expect(result).toContain('Z°N VOYAGE LOG');
    expect(result).toContain('## 精读文章');
    expect(result).toContain('## 技术与生产力');
  });

  it('应该在内容为空时渲染占位文案', async () => {
    const data: TemplateData = {
      metadata: {
        id: '20240101120000',
        title: 'Weekly #1',
        type: 'weekly',
        issueNumber: 1,
        date: '2024-01-01',
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        created: '2024-01-01T12:00:00Z',
        modified: '2024-01-01T12:00:00Z',
        status: 'draft',
        tags: ['weekly'],
        publishedPlatforms: [],
      },
      content: {
        articles: [],
        tools: [],
        notes: [],
      },
      statistics: {
        articles: 0,
        tools: 0,
        notes: 0,
      },
    };

    const result = await templateEngine.render(templatePath, data);

    expect(result).toContain('Z°N VOYAGE LOG');
    expect(result).not.toContain('## 精读文章');
    expect(result).not.toContain('## 技术与生产力');
  });

  it('应该优先使用 AI 摘要', async () => {
    const data: TemplateData = {
      metadata: {
        id: '20240101120000',
        title: 'Weekly #1',
        type: 'weekly',
        issueNumber: 1,
        date: '2024-01-01',
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        created: '2024-01-01T12:00:00Z',
        modified: '2024-01-01T12:00:00Z',
        status: 'draft',
        tags: ['weekly'],
        publishedPlatforms: [],
      },
      content: {
        articles: [
          {
            title: '测试文章',
            url: 'https://example.com/article',
            description: '原始描述',
            aiSummary: 'AI 生成的摘要',
            rating: 5,
          },
        ],
        tools: [],
        notes: [],
      },
      statistics: {
        articles: 1,
        tools: 0,
        notes: 0,
      },
    };

    const result = await templateEngine.render(templatePath, data);

    expect(result).toContain('AI 生成的摘要');
    expect(result).not.toContain('原始描述');
  });

  it('应该渲染文章、工具和笔记的可配置图片', async () => {
    const data: TemplateData = {
      metadata: {
        id: '20240101120000',
        title: 'Weekly #1',
        type: 'weekly',
        issueNumber: 1,
        date: '2024-01-01',
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        created: '2024-01-01T12:00:00Z',
        modified: '2024-01-01T12:00:00Z',
        status: 'draft',
        tags: ['weekly'],
        publishedPlatforms: [],
      },
      content: {
        articles: [
          {
            title: '带图文章',
            url: 'https://example.com/article',
            description: '文章描述',
            image: 'https://example.com/article.jpg',
            rating: 5,
          },
        ],
        tools: [
          {
            title: '带图工具',
            url: 'https://example.com/tool',
            description: '工具描述',
            image: 'https://example.com/tool.jpg',
            category: '开发工具',
            rating: 4,
          },
        ],
        notes: [
          {
            title: '带图笔记',
            path: '/notes/with-image.md',
            description: '笔记描述',
            image: 'https://example.com/note.jpg',
            created: new Date('2024-01-01'),
          },
        ],
      },
      statistics: {
        articles: 1,
        tools: 1,
        notes: 1,
      },
    };

    const result = await templateEngine.render(templatePath, data);

    expect(result).toContain('![带图文章](https://example.com/article.jpg)');
    expect(result).toContain('![带图工具](https://example.com/tool.jpg)');
  });
});
