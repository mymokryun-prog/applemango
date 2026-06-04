/**
 * 애플망고톡 앱 아이콘 생성 스크립트
 * 실행: node scripts/generate-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'public', 'icons');

mkdirSync(ICONS_DIR, { recursive: true });

const svgSrc = readFileSync(join(__dirname, 'icon-master.svg'), 'utf8');

// sharp로 PNG 생성
async function generateWithSharp() {
  const sharp = (await import('sharp')).default;

  const sizes = [
    { size: 192,  name: 'icon-192.png' },
    { size: 512,  name: 'icon-512.png' },
    { size: 1024, name: 'icon-1024.png' },
    { size: 180,  name: 'apple-touch-icon.png' },  // iOS
    { size: 32,   name: 'favicon-32.png' },
  ];

  for (const { size, name } of sizes) {
    const outPath = join(ICONS_DIR, name);
    await sharp(Buffer.from(svgSrc))
      .resize(size, size)
      .png({ quality: 100, compressionLevel: 6 })
      .toFile(outPath);
    console.log(`✅ ${name} (${size}×${size})`);
  }

  // JPG 버전도 생성 (카카오톡 공유용)
  await sharp(Buffer.from(svgSrc))
    .resize(1024, 1024)
    .jpeg({ quality: 95 })
    .toFile(join(ICONS_DIR, 'icon-1024.jpg'));
  console.log('✅ icon-1024.jpg (1024×1024)');

  // SVG 원본도 유지 (manifest 호환)
  writeFileSync(join(ICONS_DIR, 'icon-192.svg'), svgSrc.replace('width="1024" height="1024"', 'width="192" height="192"'));
  writeFileSync(join(ICONS_DIR, 'icon-512.svg'), svgSrc.replace('width="1024" height="1024"', 'width="512" height="512"'));
  console.log('✅ SVG 아이콘 업데이트 완료');
}

// @resvg/resvg-js 폴백 (sharp 없을 때)
async function generateWithResvg() {
  const { Resvg } = await import('@resvg/resvg-js');
  const sizes = [
    { size: 192,  name: 'icon-192.png' },
    { size: 512,  name: 'icon-512.png' },
    { size: 1024, name: 'icon-1024.png' },
    { size: 180,  name: 'apple-touch-icon.png' },
  ];
  for (const { size, name } of sizes) {
    const resvg = new Resvg(svgSrc, { fitTo: { mode: 'width', value: size } });
    const pngData = resvg.render();
    writeFileSync(join(ICONS_DIR, name), pngData.asPng());
    console.log(`✅ ${name} (${size}×${size})`);
  }
}

async function main() {
  console.log('🍎🥭 애플망고톡 아이콘 생성 중...\n');
  try {
    await generateWithSharp();
  } catch (e) {
    console.warn('sharp 사용 불가, resvg로 전환:', e.message);
    try {
      await generateWithResvg();
    } catch (e2) {
      console.error('변환 실패:', e2.message);
      console.log('\n💡 수동 변환 방법:');
      console.log('   scripts/icon-master.svg 파일을 브라우저에서 열어');
      console.log('   https://svgtopng.com 에 업로드하거나,');
      console.log('   Chrome → 우클릭 → 다른 이름으로 저장 후');
      console.log('   https://www.img2go.com/resize-image 에서 리사이즈하세요.');
      process.exit(1);
    }
  }

  console.log('\n📁 저장 위치: public/icons/');
  console.log('📱 완성된 파일:');
  console.log('   icon-192.png  — PWA 아이콘 (Android 홈화면)');
  console.log('   icon-512.png  — PWA 아이콘 (스플래시)');
  console.log('   icon-1024.png — 고해상도 (App Store 등)');
  console.log('   icon-1024.jpg — JPG 버전 (카카오톡 공유)');
  console.log('   apple-touch-icon.png — iOS 홈화면 아이콘');
  console.log('\n✅ manifest.webmanifest 업데이트도 필요하면 아래 명령:');
  console.log('   node scripts/update-manifest.mjs');
}

main();
