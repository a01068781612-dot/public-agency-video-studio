// 기관 상징(로고)을 위키미디어 공용에서 내려받아 public/agencies/ 에 넣는다.
//
//   node scripts/fetch-agency-logos.mjs          내려받기
//   node scripts/fetch-agency-logos.mjs --check  현재 상태만 확인
//
// 왜 위키미디어인가: 각 기관 홈페이지는 상징 파일 위치가 제각각이고 로그인·자바스크립트를
// 요구하는 곳도 있어 자동 수집이 불안정하다. 위키미디어 공용은 안정적인 URL(Special:FilePath)로
// SVG 를 원하는 크기의 PNG 로 즉시 렌더해 준다.
//
// 2016년 3월 정부상징 통합으로 대부분의 중앙행정기관은 같은 태극 상징을 쓰므로 gov.png
// 한 장이면 커버되고, 통합에서 제외된 기관만 개별로 받는다(src/lib/agency.ts 의 ownSymbol).
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = 'public/agencies';
const UA = 'pavs2-agency-logo-fetch/1.0 (public information video pipeline)';
const WIDTH = 512;

/** 파일명 → 위키미디어 공용 파일 제목. 검색 결과를 눈으로 확인하고 고정해 둔 목록이다. */
const LOGOS = {
  // 통합 정부상징 — ownSymbol 이 아닌 모든 기관이 이걸 쓴다.
  'gov.png': 'Emblem of the Government of the Republic of Korea.svg',
  // 통합에서 제외돼 고유 상징을 유지하는 기관들.
  'mnd.png': 'Emblem of the Ministry of National Defense (South Korea).svg',
  'police.png': 'Emblem of the Korean National Police Agency.svg',
  'nfa.png': 'National Fire Agency of the Republic of Korea Logo (vertical).svg',
  'spo.png': 'Emblem of the Prosecution Service of Korea.svg',
  'kcg.png': 'Emblem of Korean Coast Guard.svg',
};

const filePathUrl = (title) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=${WIDTH}`;

/** PNG 매직 넘버 확인 — 오류 페이지(HTML)를 이미지로 저장하는 사고를 막는다. */
const isPng = (buf) => buf.length > 1000 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

async function main() {
  const checkOnly = process.argv.includes('--check');
  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const [file, title] of Object.entries(LOGOS)) {
    const dest = path.join(OUT_DIR, file);
    const exists = await fs
      .stat(dest)
      .then((s) => s.size)
      .catch(() => 0);

    if (checkOnly) {
      console.log(exists ? `✅ ${file} (${Math.round(exists / 1024)}KB)` : `❌ ${file} 없음`);
      continue;
    }
    if (exists) {
      console.log(`⏭️  ${file} 이미 있음 (${Math.round(exists / 1024)}KB)`);
      continue;
    }

    try {
      // 연속 요청은 429(레이트리밋)로 막힌다 — 간격을 두고, 걸리면 몇 번 더 기다렸다 시도한다.
      let res;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 4000 * attempt));
        res = await fetch(filePathUrl(title), { headers: { 'User-Agent': UA }, redirect: 'follow' });
        if (res.status !== 429) break;
      }
      if (!res || !res.ok) {
        console.log(`❌ ${file}: HTTP ${res?.status} — ${title}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isPng(buf)) {
        console.log(`❌ ${file}: PNG 가 아님 (${buf.length}바이트) — ${title}`);
        continue;
      }
      await fs.writeFile(dest, buf);
      console.log(`✅ ${file} (${Math.round(buf.length / 1024)}KB) ← ${title}`);
      await new Promise((r) => setTimeout(r, 1500)); // 다음 요청까지 간격
    } catch (e) {
      console.log(`❌ ${file}: ${e.message}`);
    }
  }

  console.log(
    '\n출처: 위키미디어 공용. 정부상징·기관 상징은 공공저작물이지만 기관별 사용 조건(공공누리 등)이\n' +
      '다를 수 있으니, 대외 배포 영상에 쓰기 전에 해당 기관의 상징물 사용 지침을 확인할 것.',
  );
}

await main();
