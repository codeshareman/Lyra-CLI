#!/usr/bin/env node
/*
 * Cover image generator stub.
 *
 * Usage:
 *   node scripts/generate-cover-image.js --input cover_input.json
 *
 * Input JSON fields:
 *   title, content, prompt, ratio, outputPath
 *
 * Behavior:
 * - If COVER_IMAGE_ENDPOINT is set, POST JSON to the endpoint and expect { imageBase64, mime }.
 * - Otherwise, write a simple SVG placeholder sized to the requested ratio.
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { input: null };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--input') {
      args.input = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function ratioToSize(ratio) {
  if (ratio === '16:9') {
    return { width: 1600, height: 900 };
  }
  return { width: 1600, height: 1200 };
}

function writeSvgPlaceholder(outputPath, payload) {
  const ratio = payload.ratio || '4:3';
  const { width, height } = ratioToSize(ratio);
  const title = String(payload.title || 'Untitled').slice(0, 80);
  const prompt = String(payload.prompt || '').slice(0, 180);
  const bg = ratio === '16:9' ? '#0f172a' : '#111827';
  const fg = '#e2e8f0';
  const sub = '#94a3b8';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}" />
      <stop offset="100%" stop-color="#1f2937" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)" />
  <g font-family="Arial, sans-serif">
    <text x="80" y="160" fill="${fg}" font-size="54" font-weight="700">${title}</text>
    <text x="80" y="230" fill="${sub}" font-size="26">Ratio: ${ratio}</text>
    <text x="80" y="300" fill="${sub}" font-size="22">${prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
  </g>
</svg>`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg, 'utf-8');
}

async function requestEndpoint(endpoint, payload) {
  const res = await fetch(endpoint, {
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
  if (!args.input) {
    console.error('Missing --input');
    process.exit(1);
  }
  const raw = fs.readFileSync(args.input, 'utf-8');
  const payload = JSON.parse(raw);
  const outputPath = payload.outputPath;
  if (!outputPath) {
    console.error('Missing outputPath in input');
    process.exit(1);
  }

  const endpoint = process.env.COVER_IMAGE_ENDPOINT;
  if (endpoint) {
    const result = await requestEndpoint(endpoint, payload);
    const imageBase64 = result.imageBase64;
    if (!imageBase64) {
      throw new Error('Endpoint response missing imageBase64');
    }
    const buffer = Buffer.from(imageBase64, 'base64');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  } else {
    writeSvgPlaceholder(outputPath, payload);
  }

  process.stdout.write(JSON.stringify({ coverImage: outputPath }));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(2);
});
