/* deck.json(각 비트에 say 포함) → 나레이션 입힌 3D mp4.
   각 비트를 ElevenLabs TTS → 오디오 길이로 그 비트의 dwell 시간 결정 → deck-timed 엔진을
   그 길이에 맞춰 프레임렌더 → 나레이션(비트별 클립+간격) mux.
   사용: ELEVENLABS_API_KEY=.. ELEVENLABS_VOICE_ID=.. node narrate-deck.mjs deck.json out.mp4
   deck.json: { "palette":"noir", "slides":[ ... say 포함 ... ] }  (flow 노드는 {label, say}) */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const FFMPEG = require('ffmpeg-static');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = Number(process.env.FPS || 24), W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const PAD = 0.5;           // 비트 사이 숨쉬기(초)
const MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const KEY = process.env.ELEVENLABS_API_KEY, VOICE = process.env.ELEVENLABS_VOICE_ID;

const [deckPath, outPath] = process.argv.slice(2);
if (!deckPath || !outPath) { console.error('사용: node narrate-deck.mjs deck.json out.mp4'); process.exit(1); }
if (!KEY || !VOICE) { console.error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID 필요'); process.exit(1); }

const work = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'narr-'));
const framesDir = path.join(work, 'frames'); fs.mkdirSync(framesDir);

const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
const palette = deck.palette || 'noir';
const slides = deck.slides || [];

// deck-timed 와 동일한 비트 순서로 flatten (say 를 가진 객체에 dur 를 되꽂는다)
const beats = [];
slides.forEach((s) => {
  if (s.type === 'flow') (s.nodes || []).forEach((n) => beats.push({ obj: (typeof n === 'string' ? (n = { label: n }) : n), say: n.say || n.label }));
  else beats.push({ obj: s, say: s.say || s.title || s.head || s.quote || '' });
});
console.log(`비트 ${beats.length}개 · TTS(${VOICE})…`);

function ffDuration(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

// 1) 비트별 TTS + 길이
const clips = [];
for (let i = 0; i < beats.length; i++) {
  const b = beats[i];
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: b.say, model_id: MODEL }),
  });
  if (!res.ok) { console.error('TTS 실패', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  const clip = path.join(work, `c${String(i).padStart(3, '0')}.mp3`);
  fs.writeFileSync(clip, buf);
  const d = ffDuration(clip) || Math.max(2, b.say.length / 6.6);
  b.obj.dur = d + PAD;                 // 이 비트의 dwell = 오디오 + 숨쉬기
  clips.push({ clip, dur: d });
  process.stdout.write(`\r  ${i + 1}/${beats.length} (${d.toFixed(1)}s)`);
}
console.log('');
const TOTAL = beats.reduce((a, b) => a + b.obj.dur, 0);
console.log('총 길이', TOTAL.toFixed(1), 's');

// 2) 타임드 HTML 조립(three + 폰트 + deck-timed + 주입 DECK)
const lib = fs.readFileSync(path.join(HERE, 'three-lib.js'), 'utf8');
const engine = fs.readFileSync(path.join(HERE, 'deck-timed.js'), 'utf8');
const b64 = fs.readFileSync(path.join(HERE, 'pretendard.woff2')).toString('base64');
const ff = `@font-face{font-family:'Pretendard';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
const inject = `window.PALETTE_NAME=${JSON.stringify(palette)};window.DECK_DATA=${JSON.stringify(slides)};`;
const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${ff}
*{margin:0;padding:0}html,body{overflow:hidden;font-family:'Pretendard',sans-serif}#gl{position:fixed;inset:0;width:100vw;height:100vh}
#cap{position:fixed;left:50%;bottom:7%;transform:translateX(-50%);z-index:5;color:#eef2f8;font-weight:600;font-size:32px;text-align:center;max-width:78vw;text-shadow:0 4px 22px rgba(0,0,0,.7);background:rgba(255,255,255,.04);padding:14px 32px;border-radius:14px;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.11)}</style></head>
<body><canvas id="gl"></canvas><div id="cap"></div><script>${lib}</script><script>${inject}</script><script>${engine}</script></body></html>`;
const htmlPath = path.join(work, 'deck.html'); fs.writeFileSync(htmlPath, html);

// 3) 프레임 렌더
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const D = await page.evaluate(() => window.__DURATION);
const N = Math.round(D * FPS);
console.log('프레임 렌더', N, '장');
for (let i = 0; i < N; i++) { await page.evaluate(t => window.__setTime(t), i / FPS); await page.waitForTimeout(30); await page.screenshot({ path: path.join(framesDir, 'f' + String(i).padStart(5, '0') + '.png') }); if (i % 40 === 0) process.stdout.write(`\r  ${i}/${N}`); }
await browser.close();
console.log('\n나레이션 합성…');

// 4) 나레이션 트랙(클립 + PAD 무음 교차) → filter_complex concat
const inputs = []; const parts = [];
clips.forEach((c, i) => { inputs.push('-i', c.clip); parts.push(`[${i}:a]`); });
const silIdx = clips.length; inputs.push('-f', 'lavfi', '-t', String(PAD), '-i', 'anullsrc=r=44100:cl=stereo');
// clip0 sil clip1 sil ... 순서로 concat
const seq = []; clips.forEach((c, i) => { seq.push(`[${i}:a]`); seq.push(`[${silIdx}:a]`); });
const narr = path.join(work, 'narr.m4a');
const fc = `${seq.join('')}concat=n=${seq.length}:v=0:a=1[a]`;
let r = spawnSync(FFMPEG, ['-hide_banner', '-y', ...inputs, '-filter_complex', fc, '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', narr], { encoding: 'utf8' });
if (r.status !== 0) { console.error('나레이션 합성 실패:', (r.stderr || '').slice(-500)); process.exit(1); }

// 5) 영상 + 나레이션 mux
r = spawnSync(FFMPEG, ['-hide_banner', '-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png'), '-i', narr,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outPath], { stdio: 'inherit' });
fs.rmSync(work, { recursive: true, force: true });
if (r.status !== 0) { console.error('mux 실패'); process.exit(1); }
console.log('완료:', outPath);
