import * as path from 'path';
import { TemplateEngine } from '../core/TemplateEngine';
import { EnhancedTemplateData } from '../types/interfaces';

function createBaseData(): EnhancedTemplateData {
  return {
    metadata: {
      id: '20240101120000',
      title: 'Enhanced Weekly #1',
      type: 'weekly',
      issueNumber: 1,
      year: 2024,
      date: '2024-01-01',
      weekStart: '2024-01-01',
      weekEnd: '2024-01-07',
      created: '2024-01-01T12:00:00Z',
      modified: '2024-01-01T12:00:00Z',
      status: 'draft',
      tags: ['weekly'],
      publishedPlatforms: [],
      coverImage: 'https://example.com/weekly-cover.jpg',
      goldenQuote: {
        content: '行到水穷处，坐看云起时。',
        author: '王维',
      },
    },
    content: {
      weeklyUpdates: [],
      reading: [],
      tech: [],
      life: [],
      products: [],
      food: [],
      exercise: [],
      music: [],
      thoughts: [],
    },
    statistics: {
      weeklyUpdates: 0,
      reading: 0,
      tech: 0,
      life: 0,
      products: 0,
      food: 0,
      exercise: 0,
      music: 0,
      thoughts: 0,
    },
  };
}

describe('Weekly Unified Template', () => {
  let templateEngine: TemplateEngine;
  const templatePath = path.join(__dirname, '../../templates/weekly.hbs');

  beforeEach(() => {
    templateEngine = new TemplateEngine();
  });

  it('应该在模块内容为空时隐藏模块结构，仅保留头部信息', async () => {
    const data = createBaseData();

    const result = await templateEngine.render(templatePath, data);

    expect(result).not.toContain('## 📌 本周动态');
    expect(result).not.toContain('## 📄 精读文章');
    expect(result).not.toContain('## 📘 书籍输入');
    expect(result).not.toContain('## 🛠️ 技术与生产力');
    expect(result).not.toContain('## 🖼️ 生活瞬间');
    expect(result).not.toContain('## 🛍️ 购物与好物');
    expect(result).not.toContain('## 🍴 饮食记录');
    expect(result).not.toContain('## 🏃 运动记录');
    expect(result).not.toContain('## 🎵 本周旋律');
    expect(result).not.toContain('## 💬 随感');
    expect(result).toContain('> 本周收录：0 篇精读 · 0 个工具 · 0 条思考');
  });

  it('应该正确渲染九个模块的图标与标题', async () => {
    const data = createBaseData();

    data.content.weeklyUpdates = [{
      title: '迭代了文档发布流程',
      path: '/updates/1.md',
      created: new Date('2024-01-03'),
      description: '本周完成自动化发布链路。',
      category: '本周动态',
    }];
    data.content.reading = [{
      title: '系统设计读书笔记',
      url: 'https://example.com/reading',
      rating: 5,
      aiSummary: '拆解了缓存与一致性设计。',
      coverImage: 'https://example.com/reading-cover.jpg',
    }];
    data.content.tech = [{
      title: 'Vite',
      url: 'https://vite.dev',
      rating: 5,
      category: '工具',
      codeSnippet: 'npm create vite@latest',
      language: 'bash',
    }];
    data.content.life = [{
      title: '周末徒步',
      images: ['https://example.com/life-1.jpg'],
      date: new Date('2024-01-06'),
    }];
    data.content.products = [{
      title: '机械键盘',
      path: '/products/keyboard.md',
      created: new Date('2024-01-05'),
      description: '手感稳定，适合长时间编码。',
      category: '好物',
    }];
    data.content.food = [{
      title: '牛肉面',
      images: ['https://example.com/food-1.jpg'],
      date: new Date('2024-01-04'),
      rating: 4,
    }];
    data.content.exercise = [{
      type: '跑步',
      duration: 95,
      calories: 600,
      date: new Date('2024-01-02'),
    }];
    data.content.music = [{
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      url: 'https://example.com/song',
    }];
    data.content.thoughts = [{
      title: '关于复盘',
      path: '/thoughts/review.md',
      created: new Date('2024-01-07'),
      description: '复盘最关键的是沉淀可复用决策。',
      category: '思考',
    }];

    data.statistics = {
      weeklyUpdates: 1,
      reading: 1,
      tech: 1,
      life: 1,
      products: 1,
      food: 1,
      exercise: 1,
      music: 1,
      thoughts: 1,
    };

    const result = await templateEngine.render(templatePath, data);

    expect(result).toContain('## 📌 本周动态');
    expect(result).toContain('## 📄 精读文章');
    expect(result).toContain('## 🛠️ 技术与生产力');
    expect(result).toContain('## 🖼️ 生活瞬间');
    expect(result).toContain('## 🛍️ 购物与好物');
    expect(result).toContain('## 🍴 饮食记录');
    expect(result).toContain('## 🏃 运动记录');
    expect(result).toContain('## 🎵 本周旋律');
    expect(result).toContain('## 💬 随感');
  });

  it('应该渲染增强内容类型（封面图、代码片段、图片数组和运动时长）', async () => {
    const data = createBaseData();

    data.content.reading = [{
      title: '可观测性实践',
      url: 'https://example.com/obs',
      rating: 5,
      aiSummary: '重点讨论了指标、日志和追踪的一体化建设。',
      personalReflection: '我们当前最缺的是指标到告警的闭环。',
      coverImage: 'https://example.com/article-cover.jpg',
    }];
    data.content.tech = [{
      title: 'Bun',
      url: 'https://bun.sh',
      rating: 5,
      category: '工具',
      codeSnippet: 'bun add lodash',
      language: 'bash',
    }];
    data.content.life = [{
      title: '城市夜景',
      images: ['https://example.com/life-a.jpg', 'https://example.com/life-b.jpg'],
      date: new Date('2024-01-03'),
    }];
    data.content.exercise = [{
      type: '羽毛球',
      duration: 90,
      calories: 520,
      date: new Date('2024-01-06'),
      notes: '双打节奏比单打快。',
    }];

    data.statistics = {
      weeklyUpdates: 0,
      reading: 1,
      tech: 1,
      life: 1,
      products: 0,
      food: 0,
      exercise: 1,
      music: 0,
      thoughts: 0,
    };

    const result = await templateEngine.render(templatePath, data);

    expect(result).toContain('![可观测性实践](https://example.com/article-cover.jpg)');
    expect(result).toContain('**个人回响**：我们当前最缺的是指标到告警的闭环。');
    expect(result).toContain('```bash\nbun add lodash\n```');
    expect(result).toContain('![](https://example.com/life-a.jpg)');
    expect(result).toContain('![](https://example.com/life-b.jpg)');
    expect(result).toContain('1小时30分钟');
  });
});
