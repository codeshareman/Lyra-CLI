# Legacy 到 Enhanced 迁移指南

本文档说明如何将旧版 `weekly` 配置迁移到增强周报模板（`enhanced-weekly`）。

## 目标

- 保持旧配置可运行
- 渐进式启用增强能力（9 模块、视觉配置、多格式导出）
- 降低迁移风险，支持按模块分阶段上线

## 一、最小迁移步骤

1. 保留原有 `templates.weekly` 结构。
2. 添加 `templateVersion: "enhanced"`。
3. 将模板路径改为 `./templates/weekly.hbs`。
4. 保留原有 `articles/tools/notes` 数据源；按需新增 `life/food/exercise/music`。
5. 增加 `export.formats`（建议先从 `['markdown']` 开始）。

## 二、字段对照

| Legacy 字段 | Enhanced 对应字段 | 说明 |
|---|---|---|
| `template.path: ./templates/weekly.hbs` | `template.path: ./templates/weekly.hbs` | 模板文件切换 |
| `content.articles.minRating` | `modules.reading.filter.minRating` | 可继续保留旧字段，迁移后建议下沉到模块级筛选 |
| `content.articles.topN` | `modules.reading.filter.topN`（扩展字段）或 `content.articles.topN` | 两种方式可并存 |
| 无 | `visual.coverImage/backgroundImage/goldenQuote` | 新增视觉能力 |
| 无 | `export.formats` | 多平台导出开关 |

## 三、迁移前后示例

### Legacy 示例

```json
{
  "templates": {
    "weekly": {
      "enabled": true,
      "template": { "path": "./templates/weekly.hbs" },
      "sources": {
        "articles": "./Clippings",
        "tools": "./Tools",
        "notes": "./Permanent Notes"
      },
      "output": {
        "path": "./Weekly",
        "filename": "Weekly-{{issueNumber}}.md"
      },
      "content": {
        "articles": { "topN": 10, "minRating": 3 },
        "tools": { "perCategory": 2 },
        "notes": { "groupBy": "none" }
      }
    }
  }
}
```

### Enhanced 示例

```json
{
  "templates": {
    "weekly": {
      "enabled": true,
      "templateVersion": "enhanced",
      "template": { "path": "./templates/weekly.hbs" },
      "sources": {
        "articles": "./Clippings",
        "tools": "./Tools",
        "notes": "./Permanent Notes",
        "life": "./Life"
      },
      "output": {
        "path": "./Weekly",
        "filename": "Enhanced-Weekly-{{issueNumber}}.md"
      },
      "content": {
        "articles": { "topN": 20, "minRating": 3 },
        "tools": { "perCategory": 3 },
        "notes": { "groupBy": "none" }
      },
      "modules": {
        "reading": { "enabled": true, "icon": "📚" },
        "tech": { "enabled": true, "icon": "🛠️" }
      },
      "export": {
        "formats": ["markdown", "wechat"],
        "wechat": {
          "validateImages": true,
          "imageProxyUrl": "https://images.weserv.nl/?url={url}",
          "imageOptimization": { "maxWidth": 1200, "quality": 82, "format": "webp" }
        }
      }
    }
  }
}
```

## 四、向后兼容说明

- 系统支持旧配置自动迁移逻辑。
- 当配置显式设置 `templateVersion` 时，以显式值为准。
- 未识别分类会自动路由到 `thoughts` 模块，避免内容丢失。
- 无效图片路径为告警，不阻断生成流程。

## 五、推荐迁移策略

1. 先切模板，不改业务数据源（低风险）。
2. 再启用 `modules` 的筛选规则。
3. 最后启用 `export.formats` 多平台输出和 AI 摘要。

## 六、配套资源

- 完整配置示例：`examples/config-enhanced-weekly.json`
- 最小配置示例：`examples/config-minimal-enhanced.json`
- 选择性模块示例：`examples/config-selective-modules.json`
- COS 直连示例：`examples/config-cos-direct.json`
- Schema：`schemas/enhanced-config.schema.json`
