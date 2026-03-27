#!/usr/bin/env node
/**
 * PWA アイコン生成スクリプト
 * sharp の SVG→PNG 変換を使用してアイコンを生成する
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// SVG テンプレート生成関数
function makeSvg(size, text, bgColor = '#2563eb') {
  const fontSize = Math.round(size * 0.5);
  const r = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${r}" cy="${r}" r="${r}" fill="${bgColor}"/>
  <text
    x="${r}"
    y="${r}"
    font-family="'Noto Sans JP', 'Yu Gothic', 'Hiragino Sans', sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    dominant-baseline="central"
  >${text}</text>
</svg>`;
}

async function generateIcon(size, text, filename, bgColor = '#2563eb') {
  const svg = makeSvg(size, text, bgColor);
  const outputPath = path.join(OUTPUT_DIR, filename);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
  console.log(`Generated: ${filename} (${size}x${size})`);
}

async function main() {
  // 出力ディレクトリ確認
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // メインアイコン (icon-{size}x{size}.png)
  const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];
  for (const size of iconSizes) {
    await generateIcon(size, '災', `icon-${size}x${size}.png`);
  }

  // バッジアイコン (通知バッジ用)
  await generateIcon(72, '災', 'badge-72x72.png');

  // ショートカットアイコン
  await generateIcon(96, '震', 'earthquake-96x96.png');
  await generateIcon(96, '避', 'shelter-96x96.png');

  // favicon.ico (32x32 PNG を favicon.ico として保存)
  const faviconPath = path.join(__dirname, '..', 'public', 'favicon.ico');
  const svg32 = makeSvg(32, '災');
  await sharp(Buffer.from(svg32))
    .png()
    .toFile(faviconPath);
  console.log('Generated: favicon.ico (32x32 PNG)');

  console.log('\nAll icons generated successfully!');
}

main().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
