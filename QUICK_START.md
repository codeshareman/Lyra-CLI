# Content Generator 快速入门指南

## 第一步：创建配置文件

在你的项目根目录创建 `.content-generatorrc.json`：

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
        "path": "./lyra/templates/weekly.hbs"
      },
      "sources": {
        "articles": "./Input/Clippings",
        "tools": "./Input/Resources/Tools",
        "notes": "./Input/Notes"
      },
      "output": {
        "path": "./Output/Z° North/Weekly/Drafts",
        "filename": "Weekly-{{issueNumber}}.md"
      },
      "content": {
        "articles": {
          "topN": 10,
          "minRating": 3
        },
        "tools": {
          "perCategory": 2
        },
        "notes": {
          "groupBy": "tags"
        }
      }
    }
  }
}
```

## 第二步：准备数据源

确保你的数据源目录存在，并包含 Markdown 文件。文件需要包含 frontmatter 元数据：

### 文章示例 (Clippings/article.md)

```markdown
---
title: 我的精彩文章
url: https://example.com/article
rating: 5
tags: [技术, AI]
description: 这是一篇关于 AI 的文章
---

文章内容...
```

### 工具示例 (Tools/优质App.md)

```markdown
---
title: VS Code
url: https://code.visualstudio.com
rating: 5
category: Development
description: 强大的代码编辑器
---

工具详情...
```

### 笔记示例 (Notes/my-note.md)

```markdown
---
title: 我的笔记
created: 2024-01-15
tags: [学习, 笔记]
---

笔记内容...
```

## 第三步：生成内容

### 方式 1：使用 CLI（推荐）

```bash
# 进入 lyra 目录
cd lyra

# 构建项目（首次使用）
pnpm run build

# 生成内容
node dist/cli.js create

# 或使用 pnpm
pnpm run start create
```

### 方式 2：预览模式（不创建文件）

```bash
node dist/cli.js create --dry-run
```

### 方式 3：指定配置文件

```bash
node dist/cli.js create --config ../my-config.json
```

### 方式 4：详细输出

```bash
node dist/cli.js create --verbose
```

## 第四步：查看生成的文件

生成的文件会保存在配置的 `output.path` 目录中，例如：

```
Output/Z° North/Weekly/Drafts/Weekly-1.md
```

文件内容示例：

```markdown
---
id: 20240115120000
title: Weekly #1
type: weekly
issueNumber: 1
date: 2024-01-15
weekStart: 2024-01-08
weekEnd: 2024-01-14
---

# Weekly #1

## 📚 精选文章

- [我的精彩文章](https://example.com/article) - ⭐ 5
  > 这是一篇关于 AI 的文章

## 🛠️ 推荐工具

### Development
- [VS Code](https://code.visualstudio.com) - ⭐ 5
  > 强大的代码编辑器

## 📝 本周笔记

- [我的笔记](path/to/note.md)

## 📊 统计

- 文章: 1
- 工具: 1
- 笔记: 1
```

## 常用命令

### 查看可用模板

```bash
node dist/cli.js list
```

### 查看帮助

```bash
node dist/cli.js --help
node dist/cli.js create --help
```

### 启动定时任务

如果配置了 schedule，可以启动调度器：

```bash
node dist/cli.js schedule
```

## 高级用法

### 1. 使用多个数据源

```json
{
  "sources": {
    "articles": [
      {
        "path": "./Clippings/Tech",
        "priority": 2
      },
      {
        "path": "./Clippings/Business",
        "priority": 1
      }
    ]
  }
}
```

### 2. 添加自定义 Hook

创建 `hooks/custom-score.js`：

```javascript
module.exports = function customArticleScore(context) {
  const { data: articles } = context;
  
  return articles.map(article => ({
    ...article,
    rating: article.rating + 1 // 所有文章评分 +1
  }));
};
```

在配置中引用：

```json
{
  "hooks": {
    "customArticleScore": "./hooks/custom-score.js"
  }
}
```

### 3. 过滤特定文件

```json
{
  "sources": {
    "articles": {
      "path": "./Clippings",
      "include": ["**/*.md"],
      "exclude": ["**/Archive/**", "**/Draft/**"]
    }
  }
}
```

## 故障排除

### 问题：找不到配置文件

**解决方案**：确保配置文件在项目根目录，或使用 `--config` 指定路径

### 问题：没有找到任何内容

**解决方案**：
1. 检查数据源路径是否正确
2. 确保 Markdown 文件包含必需的 frontmatter
3. 检查 `minRating` 设置是否过高

### 问题：生成的文件为空

**解决方案**：
1. 使用 `--dry-run` 查看预览
2. 使用 `--verbose` 查看详细日志
3. 检查模板文件是否存在

## 下一步

- 查看 [README.md](./README.md) 了解完整功能
- 查看 [examples/](./examples/) 目录获取更多配置示例
- 查看 [examples/hooks/](./examples/hooks/) 了解 Hook 用法

## 需要帮助？

- 查看日志输出获取错误信息
- 使用 `--verbose` 选项获取详细调试信息
- 检查配置文件格式是否正确（JSON 语法）
