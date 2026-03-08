# Content Generator CLI 使用指南

## 🚀 快速开始

### 安装
```bash
npm install -g @captain_z/lyra
```

### 基本使用
```bash
# 启动交互式界面（推荐新手使用）
lyra

# 快速生成weekly内容
lyra weekly

# 预览模式
lyra weekly --dry-run

# 查看所有可用模板
lyra list

# 初始化配置文件
lyra init
```

## 📋 命令概览

### 主要命令

| 命令 | 别名 | 描述 | 示例 |
|------|------|------|------|
| `lyra` | - | 启动交互式界面 | `lyra` |
| `lyra <template>` | - | 直接生成指定模板内容 | `lyra weekly` |
| `lyra create [template]` | `lyra c` | 生成内容文档 | `lyra create weekly` |
| `lyra list` | `lyra ls` | 列出可用模板 | `lyra list` |
| `lyra init` | - | 初始化配置文件 | `lyra init` |
| `lyra config` | - | 配置管理 | `lyra config --show` |
| `lyra schedule` | `lyra sched` | 启动调度器 | `lyra schedule` |
| `lyra check-images` | `lyra check-img` | 检查图片域名白名单 | `lyra check-images --dir ./Weekly` |
| `lyra check-metadata` | `lyra check-meta` | 检查并整理元数据与 tags | `lyra check-metadata --path ../ZNorth --fix-tags` |
| `lyra article` | `lyra a` | 生成文章 Prompt / 自动提议题 | `lyra article --module 生活志 --auto-idea --requirements "900字以内"` |
| `lyra prompt` | `lyra p` | 兼容别名（等同 `lyra article`） | `lyra prompt --module 生活志 --auto-idea` |

### 常用选项

| 选项 | 描述 | 示例 |
|------|------|------|
| `-d, --dry-run` | 预览模式，不创建文件 | `lyra weekly --dry-run` |
| `-v, --verbose` | 详细日志输出 | `lyra weekly --verbose` |
| `-c, --config <path>` | 指定配置文件路径 | `lyra weekly -c ./my-config.json` |
| `--date <date>` | 指定基准日期 | `lyra weekly --date 2026-03-01` |
| `-h, --help` | 显示帮助信息 | `lyra --help` |

## 🎯 使用场景

### 1. 新手入门
```bash
# 1. 启动交互式界面，跟随提示操作
lyra

# 2. 或者直接初始化配置
lyra init

# 3. 生成第一个内容
lyra weekly
```

### 2. 日常使用
```bash
# 快速生成weekly内容
lyra weekly

# 预览内容（不创建文件）
lyra weekly --dry-run

# 生成指定日期的内容
lyra weekly --date 2026-03-01
```

### 3. 高级用户
```bash
# 使用自定义配置文件
lyra weekly -c ./custom-config.json

# 启用详细日志
lyra weekly --verbose

# 强制重新生成AI摘要
lyra weekly --regenerate-summaries
```

### 4. 自动化场景
```bash
# 启动调度器（定时自动生成）
lyra schedule

# 预览调度任务
lyra schedule --dry-run

# 后台运行调度器
lyra schedule --daemon

# 发布前检查图片域名
lyra check-images --dir ./Weekly
```

### 5. 元数据与标签整理（单文件/目录）
```bash
# 目录检查
lyra check-metadata --path ../ZNorth

# 自动清洗重复 tags
lyra check-metadata --path ../ZNorth --fix-tags

# 单文件整理
lyra check-metadata --path ./Input/Notes/today.md --fix-tags

# AI 根据内容补全 tags
lyra check-metadata --path ../ZNorth --fix-tags --ai-tags --provider openai
```

### 5. 低负担写作场景（议题 -> Prompt）
```bash
# 查看主题模板
lyra article --list

# 无 idea 时默认进入推荐模式
lyra article --module 生活志

# 从 Areas + Input 自动提议题
lyra article --module 声图志 --suggest --from ../Input,../Learning --limit 8

# 自动选题 + 生成 prompt（最小决策成本）
lyra article --module 生活志 --auto-idea --requirements "900字以内，具体，不讲空话"

# 明确指定模块和写作意图
lyra article --module 生活志 --idea "这周通勤观察" --requirements "第一人称，700-1000字"

# 使用自定义 Prompt profiles
lyra article --profiles ./examples/prompt-profiles.example.json --module 声图志 --idea "街头声音观察"
```

## ⚙️ 配置管理

### 查看当前配置
```bash
lyra config --show
```

### 验证配置文件
```bash
lyra config --validate
```

### 查看配置文件位置
```bash
lyra config
```

## 🔧 故障排除

### 常见问题

1. **未找到配置文件**
   ```bash
   # 解决方案：初始化配置文件
   lyra init
   ```

2. **模板不存在**
   ```bash
   # 解决方案：查看可用模板
   lyra list
   ```

3. **生成失败**
   ```bash
   # 解决方案：启用详细日志查看错误详情
   lyra weekly --verbose
   ```

### 获取帮助
```bash
# 查看主帮助
lyra --help

# 查看特定命令帮助
lyra create --help
lyra schedule --help
```

## 💡 最佳实践

1. **首次使用建议使用交互式界面**：`lyra`
2. **定期验证配置文件**：`lyra config --validate`
3. **使用预览模式测试**：`lyra weekly --dry-run`
4. **启用详细日志调试问题**：`lyra weekly --verbose`
5. **使用调度器实现自动化**：`lyra schedule`

## 🚀 高级功能

### 自定义配置文件位置
CLI会自动查找以下配置文件（按优先级）：
- `.content-generatorrc.json`
- `.content-generatorrc.js`
- `content-generator.config.json`
- `content-generator.config.js`

### 环境变量支持
可以通过环境变量覆盖配置：
```bash
export CONTENT_GENERATOR_CONFIG=/path/to/config.json
lyra weekly
```

### 调度器配置
在配置文件中添加schedule配置：
```json
{
  "templates": {
    "weekly": {
      "schedule": {
        "enabled": true,
        "cron": "0 9 * * 1"
      }
    }
  }
}
```

## 📚 更多资源

- [GitHub Repository](https://github.com/your-repo/lyra)
- [配置文件详细说明](./CONFIG.md)
- [模板开发指南](./TEMPLATE_GUIDE.md)
- [API文档](./API.md)
