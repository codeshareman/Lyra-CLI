# Lyra

[中文文档 (Simplified Chinese)](https://github.com/codeshareman/Lyra/blob/main/README.zh-CN.md)

Lyra is a CLI toolkit for Markdown-first content production. It helps you generate weekly content, assemble article prompts, and keep frontmatter metadata (especially tags) clean and consistent.

Package name: `@captain_z/lyra`  
CLI command: `lyra`

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
- [Metadata and Tag Governance](#metadata-and-tag-governance)
- [Configuration Discovery](#configuration-discovery)
- [Minimal Config Example](#minimal-config-example)
- [Versioning](#versioning)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Project Links](#project-links)
- [License](#license)

## Features

- Template-driven content generation (`weekly` and more)
- Prompt assembly via `lyra article` / `lyra prompt`
- Scheduler support with `lyra schedule`
- Image host auditing via `lyra check-images`
- Metadata and tag governance via `lyra check-metadata`

## Installation

```bash
# Global install
npm install -g @captain_z/lyra

# Local install
npm install @captain_z/lyra
```

## Quick Start

```bash
# 1) Initialize config
lyra init

# 2) List available templates
lyra list

# 3) Preview generation (no file output)
lyra weekly --dry-run

# 4) Generate content
lyra weekly
```

## Command Reference

| Command | Alias | Description |
|---|---|---|
| `lyra` | - | Launch interactive mode |
| `lyra <template>` | - | Quick generation by template |
| `lyra create [template]` | `lyra c` | Explicit generation command |
| `lyra list` | `lyra ls` | List registered templates |
| `lyra init` | - | Initialize config file |
| `lyra config` | - | Show/validate config |
| `lyra schedule` | `lyra sched` | Run scheduler |
| `lyra check-images` | `lyra check-img` | Check image hosts against allowlist |
| `lyra check-metadata` | `lyra check-meta` | Validate/organize frontmatter and tags |
| `lyra article` | `lyra a` | Build article prompt |
| `lyra prompt` | `lyra p` | Backward-compatible alias of `article` |

## Metadata and Tag Governance

`lyra check-metadata` supports both directory and single-file input, with automatic dedupe and optional AI-assisted tag generation.

```bash
# Check directory only (no write)
lyra check-metadata --path ../your-notes-repo

# Normalize tags (dedupe/trim/split delimiters)
lyra check-metadata --path ../your-notes-repo --fix-tags

# Normalize a single file
lyra check-metadata --path ./Input/Notes/today.md --fix-tags

# Normalize + AI enrich tags based on content
lyra check-metadata --path ../your-notes-repo --fix-tags --ai-tags --provider openai
```

Common options:

- `--path <path>`: directory or single Markdown file
- `--fix-tags`: normalize tags (dedupe, trim, delimiter cleanup)
- `--ai-tags`: generate/enrich tags from title and body content
- `--max-tags <n>`: max tags per file (default `8`)
- `--min-tags <n>`: min tags per file (default `1`)
- `--dry-run`: preview only, no write

Provider notes:

- `openai`: requires `OPENAI_API_KEY`
- `anthropic`: requires `ANTHROPIC_API_KEY`
- `gemini`: requires `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- `local`: uses local model endpoint

## Configuration Discovery

Lyra searches upward from current directory for these config files:

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

## Minimal Config Example

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

## Versioning

Lyra follows semantic versioning (`MAJOR.MINOR.PATCH`):

- `MAJOR`: breaking changes
- `MINOR`: backward-compatible features
- `PATCH`: backward-compatible fixes

For frequent publishing, increment at least `PATCH` for every release.

## Troubleshooting

### Publish Config (Multi-Article + Module Matching)

- Prefer dedicated `wechat.publish.json` / `zhihu.publish.json` files
- Publish config should only include platform publish fields (AI follows `.lyrarc.json`)

```json
{
  "lyraConfig": "./.lyrarc.json",
  "title": "Default Title",
  "author": "Lyra",
  "digest": "Default digest",
  "thumb_image_path": "./Output/Z° North/Publish/default-cover.png",
  "cover_source_order": ["ai", "unsplash", "placeholder"],
  "articles": [
    {
      "title": "Weekly #12",
      "module": "weekly",
      "contentFile": "./Output/Z° North/Z°N Weekly/drafts/2026-03-16-weekly.html"
    },
    {
      "title": "Life Notes",
      "contentFile": "./Output/Z° North/Z°N 生活志/drafts/2026-03-16-life.html"
    }
  ]
}
```

Publish command:
```bash
lyra publish --config ./wechat.publish.json
```

### `npm publish` fails at `prepublishOnly`

If publish fails during `npm run build` with `EPERM` on `dist`, rebuild from clean state and check permissions:

```bash
rm -rf dist
npm run build
```

### Config file not found

```bash
lyra init
```

### Unexpected output quality

```bash
lyra weekly --dry-run --verbose
```

## Documentation

- [CLI Guide](https://github.com/codeshareman/Lyra/blob/main/CLI_GUIDE.md)
- [Quick Start](https://github.com/codeshareman/Lyra/blob/main/QUICK_START.md)
- [Enhanced Template Guide](https://github.com/codeshareman/Lyra/blob/main/docs/enhanced-template-guide.md)
- [Migration Guide (Legacy -> Enhanced)](https://github.com/codeshareman/Lyra/blob/main/docs/migration-guide.md)
- [Enhanced Config Schema](https://github.com/codeshareman/Lyra/blob/main/schemas/enhanced-config.schema.json)

## Project Links

- Repository: https://github.com/codeshareman/Lyra
- Homepage: https://github.com/codeshareman/Lyra#readme
- Bugs: https://github.com/codeshareman/Lyra/issues

## License

MIT
