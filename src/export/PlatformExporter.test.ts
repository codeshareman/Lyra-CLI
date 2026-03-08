import { PlatformExporter } from './PlatformExporter';

describe('PlatformExporter', () => {
  let exporter: PlatformExporter;

  beforeEach(() => {
    exporter = new PlatformExporter();
  });

  it('应在 markdown 导出时保持原始内容不变', async () => {
    const markdown = '# Title\n\n- item 1\n- item 2';

    const result = await exporter.export(markdown, 'markdown', {
      validateImages: true,
    });

    expect(result.content).toBe(markdown);
    expect(result.warnings).toEqual([]);
  });

  it('应在 html 导出时注入内联样式并完成基础转换', async () => {
    const markdown = '# Weekly\n\nThis is a paragraph.\n\n```ts\nconst x = 1\n```';

    const result = await exporter.export(markdown, 'html', {
      includeStyles: true,
    });

    expect(result.content).toContain('<!DOCTYPE html>');
    expect(result.content).toContain('<style>');
    expect(result.content).toContain('<article class="cg-article">');
    expect(result.content).toContain('<h1>Weekly</h1>');
    expect(result.content).toContain('<pre class="code-block language-ts">');
    expect(result.content).toContain('class="language-ts"');
  });

  it('应在 wechat 导出时包含微信样式和背景图覆盖策略', async () => {
    const markdown = '# Weekly\n\n> Quote';

    const result = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      backgroundImage: 'https://example.com/bg.jpg',
      validateImages: true,
    });

    expect(result.content).toContain('<article class="cg-article wechat-article');
    expect(result.content).toContain('<h1 style="');
    expect(result.content).toContain('<blockquote style="');
    expect(result.content).toContain('id="cg-copy-wechat-btn"');
    expect(result.content).toContain('复制到公众号');
    expect(result.content).toContain('.wechat-article');
    expect(result.content).toContain('<article class="cg-article wechat-article');
    expect(result.content).toContain("background-image: url('https://example.com/bg.jpg')");
    expect(result.content).toContain('background-size: cover;');
    expect(result.content).toContain('background-repeat: repeat-y;');
    expect(result.content).toContain('Quote</blockquote>');
  });

  it('应在未设置背景图时使用背景预设并写入内联样式', async () => {
    const result = await exporter.export('# Weekly', 'wechat', {
      includeStyles: true,
      backgroundPreset: 'warm',
    });

    expect(result.content).toContain('radial-gradient(');
    expect(result.content).toContain('background-color: #fffaf0; background-image: radial-gradient(');
  });

  it('应在导出 HTML 时忽略 frontmatter', async () => {
    const markdown = [
      '---',
      'title: test',
      'tags: [weekly]',
      '---',
      '',
      '# Weekly',
      '',
      '正文内容',
    ].join('\n');

    const result = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
    });

    expect(result.content).not.toContain('title: test');
    expect(result.content).toContain('<h1 style="');
    expect(result.content).toContain('>Weekly</h1>');
    expect(result.content).toContain('<p style="');
    expect(result.content).toContain('>正文内容</p>');
  });

  it('应将连续引用渲染为单个 blockquote 并支持作者行', async () => {
    const markdown = [
      '> “先把流程跑通”',
      '> —— Z°N',
    ].join('\n');

    const result = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
    });

    expect(result.content).toContain('<blockquote style="');
    expect(result.content).toContain('“先把流程跑通”<br />');
    expect(result.content).toContain('<cite style="');
    expect(result.content).toContain('>— Z°N</cite>');
  });

  it('应在 wechat 导出时为正文元素写入内联样式，便于粘贴到公众号', async () => {
    const markdown = [
      '# 标题',
      '',
      '## 模块',
      '',
      '### 小节',
      '',
      '正文 **加粗** 与 [链接](https://example.com)',
    ].join('\n');

    const result = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
    });

    expect(result.content).toContain('<h1 style="');
    expect(result.content).toContain('<h2 style="');
    expect(result.content).toContain('<h3 style="');
    expect(result.content).toContain('<p style="');
    expect(result.content).toContain('<a href="https://example.com" target="_blank" rel="noreferrer" style="');
    expect(result.content).toContain('<strong style="');
  });

  it('应在检测到本地图片路径时返回警告', async () => {
    const markdown = [
      '![remote](https://example.com/remote.jpg)',
      '![local1](./assets/local.png)',
      '![local2](/Users/me/pic.jpg)',
      '![local3](images/card.png)',
    ].join('\n\n');

    const result = await exporter.export(markdown, 'wechat', {
      validateImages: true,
    });

    expect(result.warnings.length).toBe(3);
    expect(result.warnings.some((w) => w.includes('./assets/local.png'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('/Users/me/pic.jpg'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('images/card.png'))).toBe(true);
  });

  it('应为 markdown 图片注入合法的内联样式标签结构', async () => {
    const markdown = '![封面](https://example.com/cover.jpg)';

    const result = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
    });

    expect(result.content).toContain('<img src="https://example.com/cover.jpg" alt="封面"');
    expect(result.content).toContain('style="display: block; width: 100%');
    expect(result.content).not.toContain('/ style=');
  });

  it('应支持为图片应用代理 URL 与压缩参数', async () => {
    const markdown = '![封面](https://images.unsplash.com/photo-123.jpg)';

    const result = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      imageProxyUrl: 'https://images.weserv.nl/?url={url}',
      imageOptimization: {
        maxWidth: 960,
        quality: 75,
        format: 'webp',
      },
    });

    expect(result.content).toContain('<img src="https://images.weserv.nl/');
    expect(result.content).toContain('url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-123.jpg');
    expect(result.content).toContain('w=960');
    expect(result.content).toContain('q=75');
    expect(result.content).toContain('output=webp');
  });

  it('应在检测到潜在受限网络图片域名时返回提示', async () => {
    const markdown = '![cover](https://images.unsplash.com/photo-123.jpg)';

    const result = await exporter.export(markdown, 'wechat', {
      validateImages: true,
    });

    expect(result.warnings.some((w) => w.includes('images.unsplash.com'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('imageProxyUrl'))).toBe(true);
  });

  it('应支持通过配置切换微信主题样式', async () => {
    const markdown = [
      '# Z°N VOYAGE',
      '## ISSUE #001',
      '### SYSTEM VERSION: 2026.1.0',
      'RANGE: 03.02 — 03.08 · STATUS: PUBLISHED',
      '---',
      '> "quote"',
      '> —— Z°N',
    ].join('\n\n');

    const industrial = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      wechatTheme: 'industrial',
    });
    expect(industrial.content).toContain('wechat-theme-industrial');
    expect(industrial.content).toContain('background: #1d2432');
    expect(industrial.content).toContain('border-top: 4px solid #1d2432');

    const modernist = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      wechatTheme: 'modernist-print',
    });
    expect(modernist.content).toContain('wechat-theme-modernist-print');
    expect(modernist.content).toContain('border-top: 5px solid #11141b');
    expect(modernist.content).toContain('border: 1px solid #11141b');

    const techSpec = await exporter.export(markdown, 'wechat', {
      includeStyles: true,
      wechatTheme: 'tech-spec',
    });
    expect(techSpec.content).toContain('wechat-theme-tech-spec');
    expect(techSpec.content).toContain('border-top: 3px solid #28344a');
    expect(techSpec.content).toContain('background: #28344a');
  });
});
