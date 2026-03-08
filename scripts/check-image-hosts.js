#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const args = process.argv.slice(2);

function readArgValue(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }
  return args[index + 1];
}

const targetDir = readArgValue('--dir', 'Weekly');
const allowFromArg = readArgValue('--allow', '');
const allowFromEnv = process.env.IMAGE_ALLOWED_HOSTS || '';
const allowRaw = allowFromArg || allowFromEnv;

const allowedHosts = new Set(
  (allowRaw || 'znorth-1300857483.cos.ap-chengdu.myqcloud.com,img.mrzzz.top')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
);

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const childFiles = await collectMarkdownFiles(fullPath);
      files.push(...childFiles);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function sanitizeUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  let cleaned = rawUrl.trim();

  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const firstToken = cleaned.split(/\s+/)[0];
  return firstToken || '';
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function collectImageLinks(content) {
  const matches = [];
  const markdownImageRegex = /!\[[^\]]*]\(([^)]+)\)/g;
  const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;

  let match = markdownImageRegex.exec(content);
  while (match) {
    matches.push({
      rawUrl: match[1],
      index: match.index,
      source: 'markdown',
    });
    match = markdownImageRegex.exec(content);
  }

  match = htmlImageRegex.exec(content);
  while (match) {
    matches.push({
      rawUrl: match[1],
      index: match.index,
      source: 'html',
    });
    match = htmlImageRegex.exec(content);
  }

  return matches;
}

function parseHttpHost(urlText) {
  try {
    const parsed = new URL(urlText);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}

async function main() {
  const resolvedDir = path.resolve(process.cwd(), targetDir);
  const exists = await pathExists(resolvedDir);

  if (!exists) {
    console.log(
      `[check:image-hosts] 目录不存在，已跳过: ${resolvedDir}`
    );
    process.exit(0);
  }

  const markdownFiles = await collectMarkdownFiles(resolvedDir);
  if (markdownFiles.length === 0) {
    console.log(
      `[check:image-hosts] 未找到 Markdown 文件，已跳过: ${resolvedDir}`
    );
    process.exit(0);
  }

  const violations = [];
  let scannedLinkCount = 0;

  for (const filePath of markdownFiles) {
    const content = await fs.readFile(filePath, 'utf-8');
    const links = collectImageLinks(content);

    for (const link of links) {
      const normalizedUrl = sanitizeUrl(link.rawUrl);
      const host = parseHttpHost(normalizedUrl);
      if (!host) {
        continue;
      }

      scannedLinkCount += 1;
      if (allowedHosts.has(host)) {
        continue;
      }

      const line = getLineNumber(content, link.index);
      violations.push({
        filePath,
        line,
        host,
        url: normalizedUrl,
        source: link.source,
      });
    }
  }

  console.log(
    `[check:image-hosts] 扫描完成: ${markdownFiles.length} 个文件, ${scannedLinkCount} 条 HTTP(S) 图片链接`
  );
  console.log(
    `[check:image-hosts] 允许域名: ${Array.from(allowedHosts).join(', ')}`
  );

  if (violations.length === 0) {
    console.log('[check:image-hosts] 通过: 未发现非白名单图片域名');
    process.exit(0);
  }

  console.error(`[check:image-hosts] 发现 ${violations.length} 条非白名单图片链接:`);
  for (const item of violations) {
    const relativePath = path.relative(process.cwd(), item.filePath);
    console.error(
      `- ${relativePath}:${item.line} [${item.source}] ${item.host} -> ${item.url}`
    );
  }

  process.exit(1);
}

main().catch((error) => {
  console.error('[check:image-hosts] 执行失败:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
