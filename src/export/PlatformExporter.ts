import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ExportFormat,
  ExportOptions,
  ExportResult,
  IPlatformExporter,
} from '../types/interfaces';
import { ErrorCode, ValidationError } from '../types/errors';
import {
  DEFAULT_WECHAT_THEME,
  isWechatTheme,
  type WechatTheme,
} from '../constants/wechatThemes';

interface WechatInlineThemeProfile {
  heading1: string;
  heading2: string;
  heroIssueH2: string;
  heading3: string;
  heroSystemH3: string;
  paragraph: string;
  summaryParagraph: string;
  heroRangeP: string;
  hr: string;
  list: string;
  listItem: string;
  image: string;
  link: string;
  strong: string;
  emphasis: string;
  del: string;
  code: string;
  pre: string;
  blockquote: string;
  heroQuote: string;
  cite: string;
}

const DEFAULT_HTML_STYLES = `
body {
  margin: 0;
  padding: 0;
  background: #f7f7f5;
  color: #1f1f1f;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  line-height: 1.75;
}

.cg-article {
  max-width: 780px;
  margin: 0 auto;
  padding: 32px 24px;
  background: #ffffff;
}

h1, h2, h3, h4 {
  line-height: 1.35;
  margin-top: 1.2em;
  margin-bottom: 0.5em;
}

p {
  margin: 0.75em 0;
}

ul {
  padding-left: 1.25em;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  margin: 12px 0;
}

a {
  color: #0f4c81;
}

pre.code-block {
  overflow-x: auto;
  background: #f5f5f5;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 12px;
}

pre.code-block code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
}

blockquote {
  margin: 1em 0;
  padding: 0.6em 1em;
  border-left: 4px solid #d9d9d9;
  background: #fafafa;
  color: #4b4b4b;
}
`;

const DEFAULT_WECHAT_STYLES = `
.wechat-article {
  max-width: 760px;
  margin: 22px auto 44px;
  padding: 42px 36px;
  font-size: 15px;
  line-height: 1.82;
  color: #2b3445;
  background: linear-gradient(180deg, #fdfdfb 0%, #f7f9fd 100%);
  border: 1px solid #e1e6ee;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(24, 36, 58, 0.07);
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.wechat-article h1 {
  margin: 0 0 10px;
  padding-bottom: 12px;
  font-size: 42px;
  line-height: 1.12;
  text-align: left;
  letter-spacing: 0.022em;
  color: #1b2230;
  border-bottom: 1px solid rgba(42, 58, 90, 0.22);
  font-family: "Times New Roman", Georgia, "Songti SC", serif;
  font-weight: 700;
}

.wechat-article h1 + h2 {
  display: table;
  margin: 2px 0 10px auto;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: #253a67;
  color: #f4f7ff;
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
}

.wechat-article h1 + h2 + h3 {
  margin-top: 0;
  margin-bottom: 6px;
  color: #768198;
  font-size: 12px;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
}

.wechat-article h1 + h2 + h3 + p {
  margin: 0 0 18px;
  color: #8d98ad;
  font-size: 12px;
  line-height: 1.5;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
}

.wechat-article h2 {
  margin-top: 30px;
  margin-bottom: 12px;
  padding: 0 0 7px;
  display: block;
  font-size: 14px;
  line-height: 1.36;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #3f5fa8;
  border-top: 0;
  border-bottom: 1px solid rgba(63, 95, 168, 0.24);
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  text-transform: uppercase;
}

.wechat-article h3 {
  margin-top: 14px;
  margin-bottom: 7px;
  font-size: 18px;
  line-height: 1.38;
  color: #202a3b;
  font-weight: 700;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.wechat-article p {
  margin: 0.64em 0;
  text-align: justify;
  letter-spacing: 0.003em;
}

.wechat-article hr {
  border: 0;
  border-top: 3px solid #2f446f;
  margin: 0 0 24px;
}

.wechat-article ul {
  margin: 0.72em 0;
  padding-left: 1.22em;
}

.wechat-article li + li {
  margin-top: 0.45em;
}

.wechat-article img {
  width: 100%;
  border-radius: 6px;
  margin: 12px 0 16px;
  border: 1px solid #d7deeb;
  box-shadow: 0 2px 8px rgba(27, 39, 61, 0.06);
}

.wechat-article pre.code-block {
  background: #1f2937;
  color: #eef3ff;
  border: 1px solid #161f2f;
  border-radius: 5px;
  padding: 11px 13px;
}

.wechat-article blockquote {
  margin: 0.9em 0;
  padding: 0.74em 0.94em;
  border-left: 3px solid #6c84bf;
  background: #f5f8ff;
  color: #384d6f;
  border-radius: 7px;
}

.wechat-article a {
  color: #3f5fa8;
  text-decoration: underline;
  text-decoration-color: rgba(63, 95, 168, 0.44);
  text-underline-offset: 2px;
}

.wechat-article strong {
  color: #213b69;
}

.wechat-article code {
  font-family: Menlo, Consolas, monospace;
  font-size: 0.85em;
  color: #1f3b74;
  background: #edf2ff;
  padding: 0.12em 0.3em;
  border-radius: 3px;
}
`;

const WECHAT_THEME_STYLE_FILES: Record<WechatTheme, string> = {
  industrial: 'wechat.theme.industrial.css',
  'magazine-editorial': 'wechat.theme.magazine-editorial.css',
  'magazine-bold': 'wechat.theme.magazine-bold.css',
  'newspaper-classic': 'wechat.theme.newspaper-classic.css',
  'minimal-clean': 'wechat.theme.minimal-clean.css',
  'modernist-print': 'wechat.theme.modernist-print.css',
  'tech-spec': 'wechat.theme.tech-spec.css',
};

const DEFAULT_INACCESSIBLE_IMAGE_DOMAINS = [
  'images.unsplash.com',
  'source.unsplash.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'githubusercontent.com',
];

/**
 * PlatformExporter 负责将 Markdown 内容导出为不同平台格式。
 */
export class PlatformExporter implements IPlatformExporter {
  private styleDir: string;
  private htmlStyleCache?: string;
  private wechatStyleCache?: string;
  private wechatThemeStyleCache: Map<WechatTheme, string> = new Map();

  constructor(styleDir?: string) {
    this.styleDir = styleDir || path.join(__dirname, 'styles');
  }

  async export(
    content: string,
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    const warnings = this.collectImageWarnings(
      content,
      options.validateImages ?? format === 'wechat',
      options
    );

    if (format === 'markdown') {
      return {
        content,
        warnings,
      };
    }

    if (format === 'html' || format === 'wechat') {
      const isWechat = format === 'wechat';
      const htmlContent = await this.exportHtml(content, isWechat, options);
      return {
        content: htmlContent,
        warnings,
      };
    }

    throw new ValidationError(
      ErrorCode.E007,
      `不支持的导出格式: ${format}`,
      { format, supportedFormats: ['markdown', 'html', 'wechat'] }
    );
  }

  private async exportHtml(
    markdown: string,
    isWechat: boolean,
    options: ExportOptions
  ): Promise<string> {
    const markdownBody = this.stripFrontmatter(markdown);
    let body = this.markdownToHtml(markdownBody, options);
    const includeStyles = options.includeStyles !== false;
    const wechatTheme = isWechat
      ? this.resolveWechatTheme(options.wechatTheme)
      : DEFAULT_WECHAT_THEME;
    const wechatBackground = isWechat
      ? this.resolveWechatBackground(
          options.backgroundImage,
          options.backgroundPreset || 'grid'
        )
      : { css: '', inlineStyle: '' };

    let styles = '';
    if (includeStyles) {
      const htmlStyles = await this.getHtmlStyles();
      const wechatStyles = isWechat ? await this.getWechatStyles(wechatTheme) : '';
      const dynamicWechatBackground = isWechat ? wechatBackground.css : '';
      const helperStyles = isWechat ? this.getWechatHelperStyles() : '';

      styles = `<style>\n${htmlStyles}\n${wechatStyles}\n${dynamicWechatBackground}\n${helperStyles}\n</style>`;
    }

    const articleClass = isWechat
      ? `cg-article wechat-article wechat-theme-${wechatTheme}`
      : 'cg-article';
    const articleStyle = isWechat
      ? this.buildInlineStyleAttribute(
          [this.getWechatArticleContainerStyle(wechatTheme), wechatBackground.inlineStyle]
            .filter(Boolean)
            .join('; ')
        )
      : '';
    const helperToolbar = isWechat ? this.getWechatHelperToolbar() : '';
    const helperScript = isWechat ? this.getWechatCopyScript() : '';

    if (isWechat) {
      body = this.inlineWechatBodyStyles(body, wechatTheme);
    }

    return [
      '<!DOCTYPE html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="UTF-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '<title>Weekly Export</title>',
      styles,
      '</head>',
      '<body>',
      helperToolbar,
      `<article class="${articleClass}"${articleStyle}>`,
      body,
      '</article>',
      helperScript,
      '</body>',
      '</html>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private inlineWechatBodyStyles(html: string, theme: WechatTheme): string {
    const profile = this.getWechatInlineThemeProfile(theme);
    let heading2Index = 0;
    let heading3Index = 0;
    let paragraphIndex = 0;
    let contentHeading3Index = 0;

    const markedSummaryParagraphs = html.replace(
      /<h3>([\s\S]*?)<\/h3>\s*<p>/g,
      (_match, inner: string) => {
        contentHeading3Index += 1;
        if (contentHeading3Index <= 1) {
          return `<h3>${inner}</h3><p>`;
        }
        return `<h3>${inner}</h3><p data-cg-summary="1">`;
      }
    );

    const result = markedSummaryParagraphs
      .replace(/<h1>/g, `<h1 style="${this.escapeAttribute(profile.heading1)}">`)
      .replace(/<h2>/g, () => {
        heading2Index += 1;
        const style = heading2Index === 1 ? profile.heroIssueH2 : profile.heading2;
        return `<h2 style="${this.escapeAttribute(style)}">`;
      })
      .replace(/<h3>/g, () => {
        heading3Index += 1;
        const style = heading3Index === 1 ? profile.heroSystemH3 : profile.heading3;
        return `<h3 style="${this.escapeAttribute(style)}">`;
      })
      .replace(/<p([^>]*)>/g, (_match, attrs = '') => {
        paragraphIndex += 1;
        const isSummaryParagraph = /data-cg-summary="1"/.test(attrs);
        const style = paragraphIndex === 1
          ? profile.heroRangeP
          : (isSummaryParagraph ? profile.summaryParagraph : profile.paragraph);
        return `<p style="${this.escapeAttribute(style)}">`;
      })
      .replace(/<hr\s*\/?>/g, `<hr style="${this.escapeAttribute(profile.hr)}">`)
      .replace(/<ul>/g, `<ul style="${this.escapeAttribute(profile.list)}">`)
      .replace(/<li>/g, `<li style="${this.escapeAttribute(profile.listItem)}">`)
      .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_match, inner) => {
        const style = /<cite>/.test(inner) ? profile.heroQuote : profile.blockquote;
        return `<blockquote style="${this.escapeAttribute(style)}">${inner}</blockquote>`;
      });

    const withImg = result.replace(/<img([^>]*)>/g, (match, attrs) => {
      if (/style=/.test(match)) {
        return match;
      }
      const cleanedAttrs = attrs.replace(/\s*\/\s*$/, '');
      return `<img${cleanedAttrs} style="${this.escapeAttribute(profile.image)}">`;
    });

    const withAnchor = withImg.replace(/<a([^>]*)>/g, (match, attrs) => {
      if (/style=/.test(match)) {
        return match;
      }
      return `<a${attrs} style="${this.escapeAttribute(profile.link)}">`;
    });

    return withAnchor
      .replace(/<strong>/g, `<strong style="${this.escapeAttribute(profile.strong)}">`)
      .replace(/<em>/g, `<em style="${this.escapeAttribute(profile.emphasis)}">`)
      .replace(/<del>/g, `<del style="${this.escapeAttribute(profile.del)}">`)
      .replace(/<code>/g, `<code style="${this.escapeAttribute(profile.code)}">`)
      .replace(/<pre([^>]*)>/g, (_match, attrs) => `<pre${attrs} style="${this.escapeAttribute(profile.pre)}">`)
      .replace(/<cite>/g, `<cite style="${this.escapeAttribute(profile.cite)}">`)
      .replace(/\sdata-cg-summary="1"/g, '');
  }

  private getWechatInlineThemeProfile(theme: WechatTheme): WechatInlineThemeProfile {
    const base: WechatInlineThemeProfile = {
      heading1:
        'margin: 0 0 10px; padding-bottom: 12px; font-size: 42px; line-height: 1.12; text-align: left; letter-spacing: .022em; color: #1b2230; border-bottom: 1px solid rgba(42,58,90,.22); font-weight: 700; font-family: Times New Roman,Georgia,Songti SC,serif',
      heroIssueH2:
        'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 0; border-radius: 6px; background: #253a67; color: #f4f7ff; font-size: 11px; line-height: 1.2; letter-spacing: .1em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
      heroSystemH3:
        'margin-top: 0; margin-bottom: 6px; color: #768198; font-size: 12px; line-height: 1.4; letter-spacing: .14em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
      heroRangeP:
        'margin: 0 0 18px; color: #8d98ad; font-size: 12px; line-height: 1.5; letter-spacing: .11em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
      heading2:
        'margin-top: 30px; margin-bottom: 12px; padding: 0 0 7px; display: block; border-top: 0; border-bottom: 1px solid rgba(63,95,168,.24); font-size: 14px; line-height: 1.36; letter-spacing: .1em; font-weight: 700; color: #3f5fa8; font-family: SFMono-Regular,Menlo,Consolas,monospace; text-transform: uppercase',
      heading3:
        'margin-top: 14px; margin-bottom: 7px; font-size: 18px; line-height: 1.38; font-weight: 700; color: #202a3b; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
      paragraph:
        'margin: .64em 0; line-height: 1.78; color: #2b3445; text-align: justify; letter-spacing: .003em',
      summaryParagraph:
        'margin: .5em 0 .7em; font-size: 14px; line-height: 1.78; color: #5f6f88; text-align: justify; letter-spacing: .002em',
      hr: 'border: 0; border-top: 3px solid #2f446f; margin: 0 0 24px',
      list: 'margin: .72em 0; padding-left: 1.22em',
      listItem: 'margin: 0 0 .45em; line-height: 1.74',
      image:
        'display: block; width: 100%; max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0 16px; border: 1px solid #d7deeb; box-shadow: 0 2px 8px rgba(27,39,61,.06)',
      link:
        'color: #3f5fa8; text-decoration: underline; text-decoration-color: rgba(63,95,168,.44); text-underline-offset: 2px',
      strong: 'color: #213b69; font-weight: 700',
      emphasis: 'font-style: italic; color: #42516f',
      del: 'color: #748099',
      code:
        'font-family: Menlo,Consolas,monospace; font-size: .85em; color: #1f3b74; background: #edf2ff; padding: .12em .3em; border-radius: 3px',
      pre:
        'background: #1f2937; color: #eef3ff; border: 1px solid #161f2f; border-radius: 5px; padding: 11px 13px; overflow-x: auto',
      blockquote:
        'margin: .9em 0; padding: .74em .94em; border-left: 3px solid #6c84bf; background: #f5f8ff; color: #384d6f; border-radius: 7px',
      heroQuote:
        'margin: 16px 0 26px; padding: 13px 15px 11px; border-left: 3px solid #4e69ad; border-top: 1px solid rgba(78,105,173,.18); border-bottom: 1px solid rgba(78,105,173,.18); background: linear-gradient(160deg,#f7f9ff 0%,#f1f5fd 100%); border-radius: 7px; color: #2b4068; font-size: 18px; line-height: 1.62; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
      cite:
        'display: block; margin-top: 7px; color: #607295; font-size: 12px; line-height: 1.6; letter-spacing: .05em; text-align: right; font-style: normal; font-family: SFMono-Regular,Menlo,Consolas,monospace; white-space: normal; word-break: break-word',
    };

    if (theme === 'industrial') {
      return {
        ...base,
        heading1:
          'margin: 0 0 10px; padding-bottom: 12px; font-size: 44px; line-height: 1.1; text-align: left; letter-spacing: .06em; color: #171d28; border-bottom: 2px solid #1d2432; font-weight: 800; font-family: Courier New,SFMono-Regular,Menlo,Consolas,monospace',
        heroIssueH2:
          'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 1px solid #1d2432; border-radius: 0; background: #1d2432; color: #f5f7fb; font-size: 11px; line-height: 1.2; letter-spacing: .1em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroSystemH3:
          'margin-top: 0; margin-bottom: 6px; color: #616f88; font-size: 12px; line-height: 1.4; letter-spacing: .12em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroRangeP:
          'margin: 0 0 18px; color: #7a8597; font-size: 12px; line-height: 1.5; letter-spacing: .12em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heading2:
          'margin-top: 30px; margin-bottom: 12px; padding: 0 0 7px; display: block; border-top: 0; border-bottom: 1px solid rgba(31,43,67,.3); font-size: 13px; line-height: 1.35; letter-spacing: .14em; font-weight: 700; color: #2f4368; font-family: SFMono-Regular,Menlo,Consolas,monospace; text-transform: uppercase',
        heading3:
          'margin-top: 14px; margin-bottom: 7px; font-size: 18px; line-height: 1.36; font-weight: 700; color: #263246; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
        paragraph:
          'margin: .64em 0; line-height: 1.76; color: #333f53; text-align: justify; letter-spacing: .002em',
        summaryParagraph:
          'margin: .5em 0 .72em; font-size: 14px; line-height: 1.74; color: #5a6780; text-align: justify; letter-spacing: .002em',
        hr: 'border: 0; border-top: 4px solid #1d2432; margin: 0 0 28px',
        link:
          'color: #3d547f; text-decoration: underline; text-decoration-color: rgba(61,84,127,.4); text-underline-offset: 2px',
        strong: 'color: #253753; font-weight: 700',
        blockquote:
          'margin: .9em 0; padding: .72em .92em; border-left: 3px solid #4b5f89; background: #f2f5fa; color: #314059; border-radius: 2px',
        heroQuote:
          'margin: 16px 0 26px; padding: 13px 15px 11px; border-left: 3px solid #334766; border-top: 1px solid rgba(51,71,102,.18); border-bottom: 1px solid rgba(51,71,102,.18); background: linear-gradient(160deg,#f6f8fc 0%,#f1f4f9 100%); border-radius: 4px; color: #2c3a52; font-size: 18px; line-height: 1.6; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
      };
    }

    if (theme === 'magazine-bold') {
      return {
        ...base,
        heading1:
          'margin: 0 0 10px; padding-bottom: 12px; font-size: 44px; line-height: 1.1; text-align: left; letter-spacing: .03em; color: #0f1220; border-bottom: 2px solid #3358d4; font-weight: 800; font-family: Times New Roman,Georgia,Songti SC,serif',
        heroIssueH2:
          'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 0; border-radius: 8px; background: #3358d4; color: #f7f9ff; font-size: 11px; line-height: 1.2; letter-spacing: .09em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heading2:
          'margin-top: 30px; margin-bottom: 12px; padding: 0 0 7px; display: block; border-top: 0; border-bottom: 1px solid rgba(51,88,212,.3); font-size: 13px; line-height: 1.35; letter-spacing: .11em; font-weight: 700; color: #3459c9; font-family: SFMono-Regular,Menlo,Consolas,monospace; text-transform: uppercase',
        heading3:
          'margin-top: 14px; margin-bottom: 7px; font-size: 18px; line-height: 1.36; font-weight: 700; color: #1e2740; font-family: Times New Roman,Georgia,Songti SC,serif',
        paragraph:
          'margin: .64em 0; line-height: 1.78; color: #2a3247; text-align: justify; letter-spacing: .002em',
        summaryParagraph:
          'margin: .5em 0 .72em; font-size: 14px; line-height: 1.74; color: #5c6680; text-align: justify; letter-spacing: .002em',
        link:
          'color: #3559c8; text-decoration: underline; text-decoration-color: rgba(53,89,200,.46); text-underline-offset: 2px',
        strong: 'color: #243f8f; font-weight: 700',
        heroQuote:
          'margin: 16px 0 26px; padding: 13px 15px 11px; border-left: 3px solid #3358d4; border-top: 1px solid rgba(51,88,212,.2); border-bottom: 1px solid rgba(51,88,212,.2); background: linear-gradient(160deg,#f7faff 0%,#f0f5ff 100%); border-radius: 8px; color: #26407e; font-size: 18px; line-height: 1.62; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
      };
    }

    if (theme === 'newspaper-classic') {
      return {
        ...base,
        heading1:
          'margin: 0 0 10px; padding-bottom: 11px; font-size: 40px; line-height: 1.14; text-align: left; letter-spacing: .016em; color: #211a12; border-bottom: 1px solid #2b241b; font-weight: 700; font-family: Palatino Linotype,Book Antiqua,Times New Roman,Georgia,Songti SC,STSong,serif',
        heroIssueH2:
          'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 1px solid #2f271d; border-radius: 0; background: #f8f4eb; color: #2f271d; font-size: 11px; line-height: 1.2; letter-spacing: .08em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroSystemH3:
          'margin-top: 0; margin-bottom: 6px; color: #736857; font-size: 12px; line-height: 1.4; letter-spacing: .11em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroRangeP:
          'margin: 0 0 18px; color: #877a68; font-size: 12px; line-height: 1.5; letter-spacing: .11em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heading2:
          'margin-top: 30px; margin-bottom: 12px; padding: 0 10px 5px 0; display: table; border: 0; border-bottom: 1px solid #b8aa93; font-size: 17px; line-height: 1.36; letter-spacing: .012em; font-weight: 700; color: #28221a; font-family: Iowan Old Style,Palatino Linotype,Book Antiqua,Times New Roman,Georgia,Songti SC,STSong,serif',
        heading3:
          'margin-top: 14px; margin-bottom: 8px; font-size: 17px; line-height: 1.42; font-weight: 700; color: #2b2319; font-family: Iowan Old Style,Palatino Linotype,Book Antiqua,Times New Roman,Georgia,Songti SC,STSong,serif',
        paragraph:
          'margin: .66em 0; font-size: 16px; line-height: 1.9; color: #312b20; text-align: justify; letter-spacing: .004em; font-family: Iowan Old Style,Palatino Linotype,Book Antiqua,Times New Roman,Georgia,Songti SC,STSong,serif',
        summaryParagraph:
          'margin: .48em 0 .72em; font-size: 14px; line-height: 1.84; color: #6a5d4b; text-align: justify; letter-spacing: .003em; font-family: Iowan Old Style,Palatino Linotype,Book Antiqua,Times New Roman,Georgia,Songti SC,STSong,serif',
        hr: 'border: 0; border-top: 3px solid #2b241b; margin: 0 0 28px',
        list: 'margin: .76em 0; padding-left: 1.22em',
        listItem: 'margin: 0 0 .46em; line-height: 1.84',
        link:
          'color: #3f5d8a; text-decoration: none; font-weight: 600; letter-spacing: .004em',
        strong:
          'color: #2d241a; font-weight: 700; letter-spacing: .012em',
        emphasis: 'font-style: italic; color: #4e4031',
        blockquote:
          'margin: .92em 0; padding: .72em .92em; border-left: 3px solid #756248; background: #f4eee3; color: #3f3427; border-radius: 4px',
        heroQuote:
          'margin: 18px 0 26px; padding: 13px 15px 11px; border-left: 3px solid #5f4f39; border-top: 1px solid rgba(95,79,57,.14); border-bottom: 1px solid rgba(95,79,57,.14); background: #f3ece1; border-radius: 6px; color: #352c22; font-size: 18px; line-height: 1.66; font-family: Iowan Old Style,Palatino Linotype,Book Antiqua,Times New Roman,Songti SC,STSong,serif',
        cite:
          'display: block; margin-top: 7px; color: #6a5e4f; font-size: 12px; line-height: 1.6; letter-spacing: .05em; text-align: right; font-style: normal; font-family: SFMono-Regular,Menlo,Consolas,monospace; white-space: normal; word-break: break-word',
      };
    }

    if (theme === 'minimal-clean') {
      return {
        ...base,
        heading1:
          'margin: 0 0 10px; padding-bottom: 12px; font-size: 40px; line-height: 1.14; text-align: left; letter-spacing: .02em; color: #1e2533; border-bottom: 1px solid #d7deea; font-weight: 700; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
        heroIssueH2:
          'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 1px solid #d3daea; border-radius: 14px; background: #f7f9ff; color: #3f547d; font-size: 11px; line-height: 1.2; letter-spacing: .07em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroSystemH3:
          'margin-top: 0; margin-bottom: 6px; color: #7a879b; font-size: 12px; line-height: 1.4; letter-spacing: .1em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroRangeP:
          'margin: 0 0 18px; color: #94a0b4; font-size: 12px; line-height: 1.5; letter-spacing: .1em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heading2:
          'margin-top: 28px; margin-bottom: 11px; padding: 0 0 7px; display: block; border-top: 0; border-bottom: 1px solid #dbe2ef; font-size: 13px; line-height: 1.35; letter-spacing: .09em; font-weight: 700; color: #4b5f8a; font-family: SFMono-Regular,Menlo,Consolas,monospace; text-transform: uppercase',
        heading3:
          'margin-top: 13px; margin-bottom: 7px; font-size: 18px; line-height: 1.36; font-weight: 700; color: #243047; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
        paragraph:
          'margin: .64em 0; line-height: 1.76; color: #333d4f; text-align: justify; letter-spacing: .003em',
        summaryParagraph:
          'margin: .5em 0 .72em; font-size: 14px; line-height: 1.74; color: #69768d; text-align: justify; letter-spacing: .002em',
        hr: 'border: 0; border-top: 2px solid #dbe2ef; margin: 0 0 26px',
        image:
          'display: block; width: 100%; max-width: 100%; height: auto; border-radius: 12px; margin: 14px 0 18px; border: 1px solid #e2e8f3; box-shadow: 0 3px 10px rgba(25,38,61,.06)',
        link:
          'color: #4560a2; text-decoration: underline; text-decoration-color: rgba(69,96,162,.45); text-underline-offset: 2px',
        blockquote:
          'margin: .9em 0; padding: .72em .9em; border-left: 3px solid #9eb0d5; background: #f6f8fd; color: #3d4d6b; border-radius: 9px',
        heroQuote:
          'margin: 16px 0 24px; padding: 12px 14px 10px; border-left: 3px solid #6f89c8; border-top: 1px solid rgba(111,137,200,.18); border-bottom: 1px solid rgba(111,137,200,.18); background: linear-gradient(160deg,#f8faff 0%,#f3f6fd 100%); border-radius: 9px; color: #2f3f60; font-size: 17px; line-height: 1.6; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
      };
    }

    if (theme === 'modernist-print') {
      return {
        ...base,
        heading1:
          'margin: 0 0 10px; padding-bottom: 12px; font-size: 46px; line-height: 1.04; text-align: left; letter-spacing: .018em; color: #11141b; border-bottom: 2px solid #11141b; font-weight: 800; font-family: Helvetica Neue,Arial Black,Arial,sans-serif',
        heroIssueH2:
          'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 1px solid #11141b; border-radius: 0; background: #11141b; color: #f6f7fb; font-size: 11px; line-height: 1.2; letter-spacing: .1em; text-transform: uppercase; font-family: Helvetica Neue,Arial,sans-serif',
        heroSystemH3:
          'margin-top: 0; margin-bottom: 6px; color: #667083; font-size: 12px; line-height: 1.4; letter-spacing: .11em; text-transform: uppercase; font-family: Helvetica Neue,Arial,sans-serif',
        heroRangeP:
          'margin: 0 0 18px; color: #748096; font-size: 12px; line-height: 1.5; letter-spacing: .12em; text-transform: uppercase; font-family: Helvetica Neue,Arial,sans-serif',
        heading2:
          'margin-top: 30px; margin-bottom: 12px; padding: 0 0 8px; display: block; border-top: 0; border-bottom: 2px solid #11141b; font-size: 13px; line-height: 1.35; letter-spacing: .14em; font-weight: 800; color: #11141b; text-transform: uppercase; font-family: Helvetica Neue,Arial,sans-serif',
        heading3:
          'margin-top: 14px; margin-bottom: 7px; font-size: 18px; line-height: 1.34; font-weight: 700; color: #1c2330; font-family: Times New Roman,Georgia,Songti SC,serif',
        paragraph:
          'margin: .64em 0; line-height: 1.76; color: #2f3745; text-align: justify; letter-spacing: .002em',
        summaryParagraph:
          'margin: .5em 0 .7em; font-size: 14px; line-height: 1.74; color: #636b79; text-align: justify; letter-spacing: .002em',
        hr: 'border: 0; border-top: 5px solid #11141b; margin: 0 0 28px',
        image:
          'display: block; width: 100%; max-width: 100%; height: auto; border-radius: 2px; margin: 14px 0 18px; border: 1px solid #cfd5df; box-shadow: 0 2px 8px rgba(18,24,34,.08)',
        link:
          'color: #0f141d; text-decoration: underline; text-decoration-color: rgba(15,20,29,.45); text-underline-offset: 2px',
        strong: 'color: #11141b; font-weight: 700',
        emphasis: 'font-style: italic; color: #374052',
        code:
          'font-family: Menlo,Consolas,monospace; font-size: .9em; color: #0f1b33; background: #eceff5; padding: .14em .34em; border-radius: 3px',
        pre:
          'background: #171b24; color: #f1f4fb; border: 1px solid #0f1218; border-radius: 3px; padding: 12px 14px; overflow-x: auto',
        blockquote:
          'margin: .9em 0; padding: .72em .92em; border-left: 3px solid #11141b; background: #f2f4f8; color: #2d3646; border-radius: 2px',
        heroQuote:
          'margin: 16px 0 24px; padding: 12px 14px 10px; border-left: 3px solid #11141b; border-top: 1px solid #11141b; border-bottom: 1px solid #11141b; background: #f5f6f8; border-radius: 0; color: #1f2633; font-size: 17px; line-height: 1.58; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
        cite:
          'display: block; margin-top: 7px; color: #616a7d; font-size: 12px; line-height: 1.6; letter-spacing: .06em; text-align: right; font-style: normal; font-family: Helvetica Neue,Arial,sans-serif; white-space: normal; word-break: break-word',
      };
    }

    if (theme === 'tech-spec') {
      return {
        ...base,
        heading1:
          'margin: 0 0 10px; padding-bottom: 12px; font-size: 42px; line-height: 1.1; text-align: left; letter-spacing: .018em; color: #141b27; border-bottom: 2px solid #28344a; font-weight: 780; font-family: SFMono-Regular,Menlo,Consolas,Monaco,monospace',
        heroIssueH2:
          'display: table; margin: 2px 0 10px auto; padding: 4px 10px; border: 1px solid #28344a; border-radius: 2px; background: #28344a; color: #eef3ff; font-size: 11px; line-height: 1.2; letter-spacing: .11em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroSystemH3:
          'margin-top: 0; margin-bottom: 6px; color: #727d92; font-size: 12px; line-height: 1.4; letter-spacing: .16em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heroRangeP:
          'margin: 0 0 18px; color: #8a94a9; font-size: 12px; line-height: 1.5; letter-spacing: .12em; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heading2:
          'margin-top: 30px; margin-bottom: 12px; padding: 0 0 7px; display: block; border-top: 0; border-bottom: 1px solid rgba(40,52,74,.22); font-size: 13px; line-height: 1.35; letter-spacing: .1em; font-weight: 760; color: #3a5fbf; text-transform: uppercase; font-family: SFMono-Regular,Menlo,Consolas,monospace',
        heading3:
          'margin-top: 14px; margin-bottom: 7px; font-size: 18px; line-height: 1.38; font-weight: 680; color: #1f293d; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
        paragraph:
          'margin: .66em 0; line-height: 1.78; color: #2c3446; text-align: justify; letter-spacing: .003em',
        summaryParagraph:
          'margin: .5em 0 .72em; font-size: 14px; line-height: 1.74; color: #5e6c86; text-align: justify; letter-spacing: .002em',
        hr: 'border: 0; border-top: 3px solid #28344a; margin: 0 0 24px',
        list: 'margin: .72em 0; padding-left: 1.2em',
        listItem: 'margin: 0 0 .46em; line-height: 1.75',
        image:
          'display: block; width: 100%; max-width: 100%; height: auto; border-radius: 4px; margin: 12px 0 16px; border: 1px solid #d7deeb; box-shadow: 0 2px 8px rgba(23,35,58,.06)',
        link:
          'color: #3a5fbf; text-decoration: underline; text-decoration-color: rgba(58,95,191,.42); text-underline-offset: 2px',
        strong: 'color: #253964; font-weight: 700',
        emphasis: 'font-style: italic; color: #3c4f71',
        code:
          'font-family: Menlo,Consolas,monospace; font-size: .86em; color: #203c79; background: #edf2ff; padding: .12em .3em; border-radius: 3px',
        pre:
          'background: #1a2233; color: #eef2ff; border: 1px solid #0f1523; border-radius: 4px; padding: 11px 13px; overflow-x: auto',
        blockquote:
          'margin: .9em 0; padding: .74em .94em; border-left: 3px solid #3a5fbf; background: #f3f6ff; color: #354969; border-radius: 6px',
        heroQuote:
          'margin: 16px 0 24px; padding: 12px 14px 10px; border-left: 3px solid #3a5fbf; border-top: 1px solid rgba(58,95,191,.16); border-bottom: 1px solid rgba(58,95,191,.16); background: linear-gradient(160deg,#f8faff 0%,#f1f5ff 100%); border-radius: 6px; color: #29426f; font-size: 17px; line-height: 1.6; font-family: PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
        cite:
          'display: block; margin-top: 8px; color: #657999; font-size: 12px; line-height: 1.6; letter-spacing: .06em; text-align: right; font-style: normal; font-family: SFMono-Regular,Menlo,Consolas,monospace; white-space: normal; word-break: break-word',
      };
    }

    return base;
  }

  private markdownToHtml(markdown: string, options: ExportOptions): string {
    const lines = markdown.split(/\r?\n/);
    const html: string[] = [];

    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];
    let inList = false;
    let paragraphLines: string[] = [];
    let quoteLines: string[] = [];

    const flushParagraph = () => {
      if (paragraphLines.length === 0) {
        return;
      }
      const text = paragraphLines.join(' ').trim();
      if (text) {
        html.push(`<p>${this.parseInline(text, options)}</p>`);
      }
      paragraphLines = [];
    };

    const closeList = () => {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    };

    const flushQuote = () => {
      if (quoteLines.length === 0) {
        return;
      }

      const renderedLines = quoteLines.map((line) => {
        const trimmedLine = line.trim();
        if (/^[-—]{1,2}\s*/.test(trimmedLine)) {
          const authorLine = trimmedLine.replace(/^[-—]{1,2}\s*/, '— ');
          return `<cite>${this.parseInline(authorLine, options)}</cite>`;
        }
        return this.parseInline(trimmedLine, options);
      });

      html.push(`<blockquote>${renderedLines.join('<br />')}</blockquote>`);
      quoteLines = [];
    };

    const closeCodeBlock = () => {
      const languageClass = codeLanguage
        ? ` language-${this.escapeAttribute(codeLanguage)}`
        : '';
      const codeClass = codeLanguage
        ? ` class="language-${this.escapeAttribute(codeLanguage)}"`
        : '';
      const code = this.escapeHtml(codeLines.join('\n'));
      html.push(
        `<pre class="code-block${languageClass}"><code${codeClass}>${code}</code></pre>`
      );
      codeLines = [];
      codeLanguage = '';
    };

    for (const line of lines) {
      const trimmed = line.trim();

      if (inCodeBlock) {
        if (trimmed.startsWith('```')) {
          closeCodeBlock();
          inCodeBlock = false;
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (trimmed.startsWith('```')) {
        flushParagraph();
        closeList();
        flushQuote();
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
        continue;
      }

      if (trimmed.length === 0) {
        flushParagraph();
        closeList();
        flushQuote();
        continue;
      }

      if (/^-{3,}$/.test(trimmed)) {
        flushParagraph();
        closeList();
        flushQuote();
        html.push('<hr />');
        continue;
      }

      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (headingMatch) {
        flushParagraph();
        closeList();
        flushQuote();
        const level = headingMatch[1].length;
        html.push(`<h${level}>${this.parseInline(headingMatch[2], options)}</h${level}>`);
        continue;
      }

      const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
      if (quoteMatch) {
        flushParagraph();
        closeList();
        quoteLines.push(quoteMatch[1]);
        continue;
      }

      const listMatch = /^-\s+(.+)$/.exec(trimmed);
      if (listMatch) {
        flushParagraph();
        flushQuote();
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(`<li>${this.parseInline(listMatch[1], options)}</li>`);
        continue;
      }

      closeList();
      flushQuote();
      paragraphLines.push(trimmed);
    }

    if (inCodeBlock) {
      closeCodeBlock();
    }

    flushParagraph();
    closeList();
    flushQuote();

    return html.join('\n');
  }

  private stripFrontmatter(markdown: string): string {
    if (!markdown.startsWith('---')) {
      return markdown;
    }

    const frontmatterMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
    if (!frontmatterMatch) {
      return markdown;
    }

    return markdown.slice(frontmatterMatch[0].length);
  }

  private parseInline(text: string, options: ExportOptions): string {
    const tokens: string[] = [];
    let tokenized = text;

    tokenized = tokenized.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      const transformedSrc = this.transformImageUrl(src.trim(), options);
      const token = `__CG_TOKEN_${tokens.length}__`;
      tokens.push(
        `<img src="${this.escapeAttribute(transformedSrc)}" alt="${this.escapeAttribute(
          alt.trim()
        )}" />`
      );
      return token;
    });

    tokenized = tokenized.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, title, href) => {
      const token = `__CG_TOKEN_${tokens.length}__`;
      tokens.push(
        `<a href="${this.escapeAttribute(href.trim())}" target="_blank" rel="noreferrer">${this.escapeHtml(
          title.trim()
        )}</a>`
      );
      return token;
    });

    let escaped = this.escapeHtml(tokenized);
    escaped = this.applyInlineMarkdown(escaped);

    tokens.forEach((htmlSnippet, index) => {
      escaped = escaped.replace(`__CG_TOKEN_${index}__`, htmlSnippet);
    });

    return escaped;
  }

  private applyInlineMarkdown(text: string): string {
    const codeTokens: string[] = [];
    let rendered = text.replace(/`([^`]+?)`/g, (_match, code) => {
      const token = `__CG_CODE_${codeTokens.length}__`;
      codeTokens.push(`<code>${code}</code>`);
      return token;
    });

    rendered = rendered.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    rendered = rendered.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
    rendered = rendered.replace(/~~([^~]+?)~~/g, '<del>$1</del>');

    codeTokens.forEach((snippet, index) => {
      rendered = rendered.replace(`__CG_CODE_${index}__`, snippet);
    });

    return rendered;
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(input: string): string {
    return this.escapeHtml(input).replace(/`/g, '&#96;');
  }

  private collectImageWarnings(
    content: string,
    shouldValidate: boolean,
    options: ExportOptions
  ): string[] {
    if (!shouldValidate) {
      return [];
    }

    const imagePaths = new Set<string>();

    for (const match of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (match[1]) {
        imagePaths.add(match[1].trim());
      }
    }

    for (const match of content.matchAll(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
      if (match[1]) {
        imagePaths.add(match[1].trim());
      }
    }

    const warnings: string[] = [];
    const inaccessibleDomains =
      options.inaccessibleImageDomains && options.inaccessibleImageDomains.length > 0
        ? options.inaccessibleImageDomains
        : DEFAULT_INACCESSIBLE_IMAGE_DOMAINS;

    for (const imagePath of imagePaths) {
      if (this.isLocalImagePath(imagePath)) {
        warnings.push(`检测到本地图片路径: ${imagePath}，请上传图片后改为 URL`);
        continue;
      }

      const host = this.tryGetHostname(imagePath);
      if (host && this.isDomainMatch(host, inaccessibleDomains)) {
        warnings.push(
          `图片域名可能在部分网络不可访问: ${host}（${imagePath}），建议配置 export.wechat.imageProxyUrl`
        );
      }
    }

    return warnings;
  }

  private isLocalImagePath(imagePath: string): boolean {
    const normalized = imagePath.trim();

    if (!normalized) {
      return false;
    }

    if (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('//') ||
      normalized.startsWith('data:')
    ) {
      return false;
    }

    if (
      normalized.startsWith('./') ||
      normalized.startsWith('../') ||
      normalized.startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(normalized) ||
      normalized.startsWith('~/')
    ) {
      return true;
    }

    // 未显式声明协议的路径（如 images/a.png）默认为本地路径。
    return true;
  }

  private transformImageUrl(rawUrl: string, options: ExportOptions): string {
    const trimmed = rawUrl.trim();
    if (!trimmed || !this.isHttpUrl(trimmed)) {
      return trimmed;
    }

    let transformedUrl = trimmed;
    if (options.imageProxyUrl) {
      transformedUrl = this.buildProxyImageUrl(options.imageProxyUrl, transformedUrl);
    }

    if (options.imageOptimization) {
      transformedUrl = this.applyImageOptimization(transformedUrl, options.imageOptimization);
    }

    return transformedUrl;
  }

  private buildProxyImageUrl(proxyTemplate: string, sourceUrl: string): string {
    const template = proxyTemplate.trim();
    if (!template) {
      return sourceUrl;
    }

    const encodedSourceUrl = encodeURIComponent(sourceUrl);
    if (template.includes('{url}')) {
      return template.split('{url}').join(encodedSourceUrl);
    }

    const separator = template.includes('?') ? '&' : '?';
    return `${template}${separator}url=${encodedSourceUrl}`;
  }

  private applyImageOptimization(
    imageUrl: string,
    imageOptimization: NonNullable<ExportOptions['imageOptimization']>
  ): string {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return imageUrl;
    }

    if (
      imageOptimization.maxWidth === undefined &&
      imageOptimization.quality === undefined &&
      imageOptimization.format === undefined
    ) {
      return imageUrl;
    }

    if (imageOptimization.maxWidth !== undefined) {
      parsed.searchParams.set('w', String(Math.round(imageOptimization.maxWidth)));
    }

    if (imageOptimization.quality !== undefined) {
      parsed.searchParams.set('q', String(Math.round(imageOptimization.quality)));
    }

    if (imageOptimization.format !== undefined) {
      const formatValue =
        imageOptimization.format === 'auto' ? 'auto' : imageOptimization.format;
      parsed.searchParams.set('output', formatValue);
    }

    return parsed.toString();
  }

  private isHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private tryGetHostname(url: string): string | undefined {
    if (!this.isHttpUrl(url)) {
      return undefined;
    }

    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  private isDomainMatch(hostname: string, domains: string[]): boolean {
    const normalizedHost = hostname.toLowerCase();
    for (const domain of domains) {
      const normalizedDomain = domain.trim().toLowerCase();
      if (!normalizedDomain) {
        continue;
      }

      if (
        normalizedHost === normalizedDomain ||
        normalizedHost.endsWith(`.${normalizedDomain}`)
      ) {
        return true;
      }
    }

    return false;
  }

  private async getHtmlStyles(): Promise<string> {
    if (!this.htmlStyleCache) {
      this.htmlStyleCache = await this.readStyleFile('html.css', DEFAULT_HTML_STYLES);
    }
    return this.htmlStyleCache;
  }

  private async getWechatStyles(theme: WechatTheme): Promise<string> {
    if (!this.wechatStyleCache) {
      this.wechatStyleCache = await this.readStyleFile('wechat.css', DEFAULT_WECHAT_STYLES);
    }

    let themeStyles = this.wechatThemeStyleCache.get(theme);
    if (!themeStyles) {
      const themeFile = WECHAT_THEME_STYLE_FILES[theme];
      themeStyles = await this.readStyleFile(
        themeFile,
        this.getWechatThemeOverrideStyles(theme)
      );
      this.wechatThemeStyleCache.set(theme, themeStyles);
    }

    return `${this.wechatStyleCache}\n${themeStyles}`;
  }

  private getWechatThemeOverrideStyles(theme: WechatTheme): string {
    if (theme === 'industrial') {
      return `
.wechat-article { border-radius: 6px; box-shadow: 0 10px 24px rgba(21, 29, 43, 0.1); background: linear-gradient(180deg, #fafbfd 0%, #f3f6fb 100%); }
`;
    }

    if (theme === 'magazine-bold') {
      return `
.wechat-article { border-radius: 14px; box-shadow: 0 14px 34px rgba(37, 63, 146, 0.12); background: linear-gradient(180deg, #fcfdff 0%, #f3f7ff 100%); }
`;
    }

    if (theme === 'newspaper-classic') {
      return `
.wechat-article { border-radius: 6px; box-shadow: none; background: #f6f2e9; border-color: #d7ccb8; }
`;
    }

    if (theme === 'minimal-clean') {
      return `
.wechat-article { border-radius: 14px; box-shadow: 0 10px 24px rgba(23, 35, 58, 0.07); background: linear-gradient(180deg, #ffffff 0%, #f8f9fc 100%); border-color: #e2e7f1; }
`;
    }

    if (theme === 'modernist-print') {
      return `
.wechat-article { border-radius: 4px; box-shadow: 0 8px 18px rgba(20, 26, 36, 0.08); background: #f7f8fa; border-color: #d0d5de; }
`;
    }

    if (theme === 'tech-spec') {
      return `
.wechat-article { border-radius: 8px; box-shadow: 0 10px 24px rgba(27, 40, 65, 0.1); background: linear-gradient(180deg, #fbfcff 0%, #f4f7ff 100%); border-color: #d6deed; }
`;
    }

    return '';
  }

  private resolveWechatTheme(theme: ExportOptions['wechatTheme']): WechatTheme {
    if (theme && isWechatTheme(theme)) {
      return theme;
    }

    return DEFAULT_WECHAT_THEME;
  }

  private async readStyleFile(fileName: string, fallback: string): Promise<string> {
    const candidates = [
      path.join(this.styleDir, fileName),
      path.join(process.cwd(), 'content-generator', 'src', 'export', 'styles', fileName),
      path.join(process.cwd(), 'src', 'export', 'styles', fileName),
    ];

    for (const stylePath of candidates) {
      try {
        return await fs.readFile(stylePath, 'utf-8');
      } catch {
        // 尝试下一个候选路径
      }
    }

    return fallback;
  }

  private resolveWechatBackground(
    backgroundImage: string | undefined,
    backgroundPreset: 'grid' | 'warm' | 'plain'
  ): { css: string; inlineStyle: string } {
    if (backgroundImage) {
      const cssSafeUrl = this.escapeAttribute(backgroundImage);
      const imageStyles = [
        "background-image: url('" + backgroundImage + "')",
        'background-size: cover',
        'background-repeat: repeat-y',
        'background-position: top center',
      ].join('; ');

      return {
        css: `
.wechat-article {
  background-image: url('${cssSafeUrl}');
  background-size: cover;
  background-repeat: repeat-y;
  background-position: top center;
}
`,
        inlineStyle: imageStyles,
      };
    }

    return this.buildPresetBackground(backgroundPreset);
  }

  private buildPresetBackground(
    preset: 'grid' | 'warm' | 'plain'
  ): { css: string; inlineStyle: string } {
    if (preset === 'plain') {
      return {
        css: '',
        inlineStyle: '',
      };
    }

    if (preset === 'warm') {
      const warmStyle = [
        'background-color: #fffaf0',
        'background-image: radial-gradient(circle at 1px 1px, rgba(235, 213, 179, 0.35) 1px, transparent 0)',
        'background-size: 16px 16px',
      ].join('; ');

      return {
        css: `
.wechat-article {
  ${warmStyle};
}
`,
        inlineStyle: warmStyle,
      };
    }

    const gridStyle = [
      'background-color: #fcfaf5',
      'background-image: linear-gradient(rgba(28, 28, 28, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(28, 28, 28, 0.04) 1px, transparent 1px)',
      'background-size: 22px 22px',
    ].join('; ');

    return {
      css: `
.wechat-article {
  ${gridStyle};
}
`,
      inlineStyle: gridStyle,
    };
  }

  private getWechatArticleContainerStyle(theme: WechatTheme): string {
    const base = [
      'max-width: 760px',
      'margin: 22px auto 44px',
      'padding: 42px 36px',
      'font-size: 15px',
      'line-height: 1.82',
      'color: #2b3445',
      'background: linear-gradient(180deg, #fdfdfb 0%, #f7f9fd 100%)',
      'border: 1px solid #e1e6ee',
      'border-radius: 10px',
      'box-shadow: 0 10px 28px rgba(24, 36, 58, 0.07)',
      'font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    ];

    if (theme === 'industrial') {
      return [
        ...base,
        'background: linear-gradient(180deg, #fafbfd 0%, #f3f6fb 100%)',
        'border-color: #d5dcea',
        'border-radius: 6px',
        'box-shadow: 0 10px 24px rgba(21, 29, 43, 0.1)',
      ].join('; ');
    }

    if (theme === 'magazine-bold') {
      return [
        ...base,
        'background: linear-gradient(180deg, #fcfdff 0%, #f3f7ff 100%)',
        'border-color: #d6def3',
        'border-radius: 14px',
        'box-shadow: 0 14px 34px rgba(37, 63, 146, 0.12)',
      ].join('; ');
    }

    if (theme === 'newspaper-classic') {
      return [
        ...base,
        'background: #f6f2e9',
        'border-color: #d7ccb8',
        'border-radius: 6px',
        'box-shadow: none',
        'font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Times New Roman", Georgia, "Songti SC", "STSong", serif',
      ].join('; ');
    }

    if (theme === 'minimal-clean') {
      return [
        ...base,
        'background: linear-gradient(180deg, #ffffff 0%, #f8f9fc 100%)',
        'border-color: #e2e7f1',
        'border-radius: 14px',
        'box-shadow: 0 10px 24px rgba(23, 35, 58, 0.07)',
      ].join('; ');
    }

    if (theme === 'modernist-print') {
      return [
        ...base,
        'background: #f7f8fa',
        'border-color: #d0d5de',
        'border-radius: 4px',
        'box-shadow: 0 8px 18px rgba(20, 26, 36, 0.08)',
      ].join('; ');
    }

    if (theme === 'tech-spec') {
      return [
        ...base,
        'background: linear-gradient(180deg, #fbfcff 0%, #f4f7ff 100%)',
        'border-color: #d6deed',
        'border-radius: 8px',
        'box-shadow: 0 10px 24px rgba(27, 40, 65, 0.1)',
      ].join('; ');
    }

    return base.join('; ');
  }

  private buildInlineStyleAttribute(style: string): string {
    const trimmed = style.trim();
    if (!trimmed) {
      return '';
    }
    return ` style="${this.escapeAttribute(trimmed)}"`;
  }

  private getWechatHelperStyles(): string {
    return `
.cg-wechat-helper {
  position: sticky;
  top: 10px;
  z-index: 10;
  margin: 10px auto 0;
  max-width: 760px;
  padding: 8px 10px;
  border: 1px solid rgba(109, 132, 187, 0.3);
  border-radius: 10px;
  background: rgba(245, 248, 255, 0.9);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  backdrop-filter: blur(2px);
}

.cg-wechat-helper button {
  border: 0;
  border-radius: 7px;
  background: #2d4fc7;
  color: #ffffff;
  padding: 6px 11px;
  font-size: 13px;
  cursor: pointer;
}

.cg-wechat-helper button:hover {
  background: #223ea0;
}

.cg-wechat-helper span {
  color: #4f607f;
  font-size: 12px;
  line-height: 1.5;
}
`;
  }

  private getWechatHelperToolbar(): string {
    return [
      '<div class="cg-wechat-helper">',
      '<button type="button" id="cg-copy-wechat-btn">复制到公众号</button>',
      '<span id="cg-copy-wechat-status">请在浏览器中点击按钮，再粘贴到公众号编辑器</span>',
      '</div>',
    ].join('');
  }

  private getWechatCopyScript(): string {
    return `<script>
(() => {
  const copyButton = document.getElementById('cg-copy-wechat-btn');
  const statusNode = document.getElementById('cg-copy-wechat-status');
  if (!copyButton) {
    return;
  }

  const setStatus = (message) => {
    if (statusNode) {
      statusNode.textContent = message;
    }
  };

  const copyRichContent = async () => {
    const article = document.querySelector('.wechat-article');
    if (!article) {
      setStatus('未找到正文区域，无法复制');
      return;
    }

    try {
      const range = document.createRange();
      // 复制整个容器节点，确保背景、边框、内边距等容器样式一并进入剪贴板。
      range.selectNode(article);
      const selection = window.getSelection();
      if (!selection) {
        throw new Error('Selection API not available');
      }
      selection.removeAllRanges();
      selection.addRange(range);
      const copied = document.execCommand('copy');
      selection.removeAllRanges();

      if (!copied) {
        throw new Error('Copy command failed');
      }

      setStatus('已复制富文本，可直接粘贴到公众号');
    } catch (_error) {
      const text = article.innerText || article.textContent || '';
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
          .then(() => setStatus('已复制纯文本，建议手动框选正文复制富文本'))
          .catch(() => setStatus('自动复制失败，请手动框选正文后复制'));
      } else {
        setStatus('自动复制失败，请手动框选正文后复制');
      }
    }
  };

  copyButton.addEventListener('click', () => {
    void copyRichContent();
  });
})();
</script>`;
  }
}
