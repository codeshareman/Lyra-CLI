# Lyra

[English README (Default)](https://github.com/codeshareman/Lyra/blob/main/README.md)

Lyra 是一个面向 Markdown 内容生产的 CLI 工具，用于生成周报内容、组装文章 Prompt，并治理 frontmatter 元数据（尤其是 tags）。

包名：`@captain_z/lyra`  
命令：`lyra`

## 目录

- [功能](#功能)
- [安装](#安装)
- [快速开始](#快速开始)
- [命令参考](#命令参考)
- [元数据与标签治理](#元数据与标签治理)
- [配置发现规则](#配置发现规则)
- [最小配置示例](#最小配置示例)
- [版本策略](#版本策略)
- [故障排查](#故障排查)
- [文档](#文档)
- [许可证](#许可证)

## 功能

- 模板化内容生成（`weekly` 等）
- 通过 `lyra article` / `lyra prompt` 组装 Prompt
- 使用 `lyra schedule` 执行调度
- 使用 `lyra check-images` 检查图片域名
- 使用 `lyra check-metadata` 检查并整理元数据与 tags

## 安装

```bash
# 全局安装
npm install -g @captain_z/lyra

# 本地安装
npm install @captain_z/lyra
```

## 快速开始

```bash
# 1) 初始化配置
lyra init

# 2) 查看模板
lyra list

# 3) 预览生成（不写文件）
lyra weekly --dry-run

# 4) 真实生成
lyra weekly
```

## 命令参考

| 命令 | 别名 | 说明 |
|---|---|---|
| `lyra` | - | 启动交互模式 |
| `lyra <template>` | - | 按模板快速生成 |
| `lyra create [template]` | `lyra c` | 显式生成命令 |
| `lyra list` | `lyra ls` | 列出模板 |
| `lyra init` | - | 初始化配置 |
| `lyra config` | - | 查看/验证配置 |
| `lyra schedule` | `lyra sched` | 启动调度器 |
| `lyra check-images` | `lyra check-img` | 图片域名白名单检查 |
| `lyra check-metadata` | `lyra check-meta` | 元数据与 tags 整理 |
| `lyra article` | `lyra a` | 文章 Prompt 组装 |
| `lyra prompt` | `lyra p` | `article` 的兼容别名 |
| `lyra publish` | - | 发布到平台草稿（WeChat API/Playwright） |

### 发布配置（多内容 + 模块关联）

- 建议使用独立的 `wechat.publish.json` / `zhihu.publish.json` 配置文件
- 发布配置仅包含平台发布字段（AI 配置跟随 `.lyrarc.json`）

```json
{
  "lyraConfig": "./.lyrarc.json",
  "title": "默认标题",
  "author": "Lyra",
  "digest": "默认摘要",
  "thumb_image_path": "./Output/Z° North/Publish/default-cover.png",
  "cover_source_order": ["ai", "unsplash", "placeholder"],
  "articles": [
    {
      "title": "Weekly #12",
      "module": "weekly",
      "contentFile": "./Output/Z° North/Z°N Weekly/drafts/2026-03-16-weekly.html"
    },
    {
      "title": "生活志 · 通勤观察",
      "contentFile": "./Output/Z° North/Z°N 生活志/drafts/2026-03-16-life.html"
    }
  ]
}
```

发布命令：
```bash
lyra publish --config ./wechat.publish.json
```

## 元数据与标签治理

`lyra check-metadata` 同时支持目录与单文件，并支持自动去重和 AI 补全标签。

```bash
# 目录检查（不改文件）
lyra check-metadata --path ../your-notes-repo

# 自动整理 tags
lyra check-metadata --path ../your-notes-repo --fix-tags

# 单文件整理
lyra check-metadata --path ./Input/Notes/today.md --fix-tags

# 本地清洗后，再用 AI 补全 tags
lyra check-metadata --path ../your-notes-repo --fix-tags --ai-tags --provider openai
```

常用参数：

- `--path <path>`：目录或单个 Markdown 文件
- `--fix-tags`：去重、trim、分隔符清洗
- `--ai-tags`：按标题和正文补全更合适 tags
- `--max-tags <n>`：每篇最大 tags 数（默认 `8`）
- `--min-tags <n>`：每篇最小 tags 数（默认 `1`）
- `--dry-run`：只预览不落盘

Provider 说明：

- `openai`：需要 `OPENAI_API_KEY`
- `anthropic`：需要 `ANTHROPIC_API_KEY`
- `gemini`：需要 `GEMINI_API_KEY`（或 `GOOGLE_API_KEY`）
- `local`：本地模型服务

## 配置发现规则

CLI 会从当前目录向上查找：

- `.lyrarc`
- `.lyrarc.json`
- `.lyrarc.yaml`
- `.lyrarc.yml`
- `.lyrarc.js`
- `.lyrarc.cjs`
- `.lyrarc.mjs`
- `lyra.config.json`
- `lyra.config.js`
- `lyra.config.cjs`
- `lyra.config.mjs`

## 最小配置示例

```json
{
  "global": {
    "logLevel": "info",
    "defaultTemplate": "weekly"
  },
  "templates": {
    "weekly": {
      "enabled": true,
      "template": {
        "path": "./templates/weekly.hbs"
      },
      "sources": {
        "articles": "./articles",
        "tools": "./tools",
        "notes": "./notes"
      },
      "output": {
        "path": "./output",
        "filename": "Weekly-{{issueNumber}}.md"
      },
      "content": {
        "articles": { "topN": 10, "minRating": 0 },
        "tools": { "perCategory": 3 },
        "notes": { "groupBy": "none" }
      }
    }
  }
}
```

## 版本策略

使用语义化版本（`MAJOR.MINOR.PATCH`）：

- `MAJOR`：不兼容变更
- `MINOR`：向后兼容功能
- `PATCH`：向后兼容修复

建议每次发布至少递增 `PATCH`。

## 故障排查

### `npm publish` 在 `prepublishOnly` 失败

若在 `npm run build` 阶段出现 `EPERM`（`dist` 不可写），先清理并重建：

```bash
rm -rf dist
npm run build
```

### 找不到配置文件

```bash
lyra init
```

### 输出内容不符合预期

```bash
lyra weekly --dry-run --verbose
```

## 文档

- [CLI 使用指南](https://github.com/codeshareman/Lyra/blob/main/CLI_GUIDE.md)
- [快速入门](https://github.com/codeshareman/Lyra/blob/main/QUICK_START.md)
- [增强模板指南](https://github.com/codeshareman/Lyra/blob/main/docs/enhanced-template-guide.md)
- [迁移指南（Legacy -> Enhanced）](https://github.com/codeshareman/Lyra/blob/main/docs/migration-guide.md)
- [增强配置 Schema](https://github.com/codeshareman/Lyra/blob/main/schemas/enhanced-config.schema.json)

## 许可证

MIT
