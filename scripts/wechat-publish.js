#!/usr/bin/env node
/*
 * WeChat draft/publish helper.
 *
 * Usage:
 *   node scripts/wechat-publish.js --config wechat_publish.json --content article.html --mode draft --dry-run
 *   node scripts/wechat-publish.js --config wechat_publish.json --content article.html --mode publish --execute
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { config: null, content: null, env: null, mode: 'draft', execute: false, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--config') {
      args.config = argv[i + 1];
      i += 1;
    } else if (key === '--content') {
      args.content = argv[i + 1];
      i += 1;
    } else if (key === '--env') {
      args.env = argv[i + 1];
      i += 1;
    } else if (key === '--mode') {
      args.mode = argv[i + 1];
      i += 1;
    } else if (key === '--execute') {
      args.execute = true;
    } else if (key === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

function loadEnv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const idx = normalized.indexOf('=');
    if (idx === -1) return;
    const key = normalized.slice(0, idx).trim();
    const value = normalized.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  });
}

function buildDraftPayload(config, html) {
  return {
    articles: [
      {
        title: config.title,
        author: config.author || '',
        digest: config.digest || '',
        content: html,
        content_source_url: config.source_url || '',
        thumb_media_id: config.thumb_media_id || '',
        need_open_comment: Number(config.need_open_comment || 0),
        only_fans_can_comment: Number(config.only_fans_can_comment || 0),
      },
    ],
  };
}

async function requestJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.config || !args.content) {
    console.error('Missing --config or --content');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(args.config, 'utf-8'));
  loadEnv(args.env || config.env_file || '.env');

  const html = fs.readFileSync(args.content, 'utf-8');
  const payload = buildDraftPayload(config, html);

  if (args.dryRun) {
    console.log(JSON.stringify({ mode: args.mode, draftPayload: payload }, null, 2));
    return;
  }

  if (!args.execute) {
    console.error('Missing --execute');
    process.exit(1);
  }

  const accessToken = config.access_token || process.env.WECHAT_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('Missing access token');
    process.exit(2);
  }

  const baseUrl = config.api_base || 'https://api.weixin.qq.com/cgi-bin';
  const draftAdd = config.draft_add_endpoint || '/draft/add';
  const draftUrl = `${baseUrl.replace(/\/$/, '')}${draftAdd}?access_token=${accessToken}`;
  const draftResult = await requestJson(draftUrl, payload);

  if (args.mode !== 'publish') {
    console.log(JSON.stringify({ draftResult }, null, 2));
    return;
  }

  const mediaId = draftResult.media_id || draftResult.mediaId;
  if (!mediaId) {
    throw new Error('Draft creation did not return media_id');
  }

  const publishEndpoint = config.publish_endpoint || '/freepublish/submit';
  const publishUrl = `${baseUrl.replace(/\/$/, '')}${publishEndpoint}?access_token=${accessToken}`;
  const publishResult = await requestJson(publishUrl, { media_id: mediaId });
  console.log(JSON.stringify({ draftResult, publishResult }, null, 2));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(2);
});
