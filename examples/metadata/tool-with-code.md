---
category: 工具
tools:
  - title: Feed Consolidator
    url: https://example.com/tools/feed-consolidator
    rating: 5
    description: 聚合多源 RSS 并输出统一 Markdown 摘要。
    codeSnippet: |
      const feeds = await loadFeeds(config.sources)
      const items = feeds.flatMap((feed) => feed.items)
      const picked = rank(items).slice(0, 20)
      await writeWeekly(picked)
    language: typescript
---

该工具适合每周回顾内容清单的自动化处理。
