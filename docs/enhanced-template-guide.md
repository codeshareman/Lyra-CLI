# Enhanced Weekly 模板用户指南

本文档介绍增强周报模板的配置方法和使用建议。

## 1. 模板启用

在配置中设置：

```json
{
  "templates": {
    "weekly": {
      "enabled": true,
      "templateVersion": "enhanced",
      "template": {
        "path": "./templates/weekly.hbs"
      }
    }
  }
}
```

## 2. 九大内容模块

| 模块键 | 默认图标 | 说明 |
|---|---|---|
| `weeklyUpdates` | 📅 | 本周动态、里程碑、阶段进展 |
| `reading` | 📚 | 文章、书籍、精读输入 |
| `tech` | 🛠️ | 工具、代码、技术实践 |
| `life` | 🖼️ | 生活瞬间、照片记录 |
| `products` | 📦 | 好物和产品推荐 |
| `food` | 🍴 | 饮食记录 |
| `exercise` | 🏸 | 运动记录 |
| `music` | 🎵 | 音乐推荐 |
| `thoughts` | 💬 | 随感和反思 |

## 3. 模块开关与筛选

示例：只启用部分模块，并给 reading 设置筛选。

```json
{
  "modules": {
    "weeklyUpdates": { "enabled": true, "icon": "📅" },
    "reading": {
      "enabled": true,
      "icon": "📚",
      "filter": {
        "categories": ["文章", "书籍"],
        "tags": ["deep-dive"],
        "minRating": 4
      }
    },
    "tech": { "enabled": true, "icon": "🛠️" },
    "life": { "enabled": false, "icon": "🖼️" }
  }
}
```

支持的筛选字段：

- `categories: string[]`
- `tags: string[]`
- `dateRange: { start, end }`
- `minRating: number`

## 4. 视觉元素配置

```json
{
  "visual": {
    "coverImage": "https://example.com/cover.jpg",
    "backgroundImage": "https://example.com/bg.jpg",
    "goldenQuote": {
      "content": "Consistency beats intensity.",
      "author": "Team"
    }
  }
}
```

说明：

- `coverImage` 与 `backgroundImage` 支持 URL 或本地路径。
- 无效图片路径会记录警告，不会中断生成。

## 5. 多平台导出

```json
{
  "export": {
    "formats": ["markdown", "html", "wechat"],
    "wechat": {
      "validateImages": true,
      "imageProxyUrl": "https://images.weserv.nl/?url={url}",
      "inaccessibleImageDomains": ["images.unsplash.com", "raw.githubusercontent.com"],
      "imageOptimization": {
        "maxWidth": 1200,
        "quality": 82,
        "format": "webp"
      }
    }
  }
}
```

导出行为：

- `markdown`: 原样输出
- `html`: Markdown 转 HTML 并注入样式
- `wechat`: 按微信公众号样式优化并可校验图片

图片可访问性与加载优化：

- `imageProxyUrl`: 通过代理 URL 模板重写图片地址（`{url}` 为原始图片 URL）。
- `inaccessibleImageDomains`: 标记潜在受限网络域名，导出时会给出提示。
- `imageOptimization`: 为导出图片追加压缩参数（宽度、质量、格式）。

## 6. 元数据示例

可直接参考：

- `examples/metadata/article-with-cover.md`
- `examples/metadata/tool-with-code.md`
- `examples/metadata/life-moment.md`
- `examples/metadata/exercise-record.md`
- `examples/metadata/music-recommendation.md`

## 7. 最佳实践

1. 先从 `config-minimal-enhanced.json` 起步，确认流程通畅后再扩展字段。
2. 模块筛选尽量从宽到严，先保证内容完整，再逐步提高质量阈值。
3. 微信导出建议开启 `validateImages`，提前发现本地路径与潜在受限网络域名。
4. 若读者不翻墙，建议设置 `imageProxyUrl` 并为大图配置 `imageOptimization`。
5. 对超大数据集（>100 条）建议关注日志中的处理进度信息。
6. 如果已切到 COS 直连并且尚未配置图片代理服务，可直接使用 `examples/config-cos-direct.json`。

## 8. 验证与排错

- 使用 `schemas/enhanced-config.schema.json` 进行编辑器校验。
- 生成失败时打开 `--verbose` 查看详细错误。
- 配置迁移问题可对照 `docs/migration-guide.md`。
