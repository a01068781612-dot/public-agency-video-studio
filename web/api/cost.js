// 누적 비용 — 실행마다 남긴 "사용량 아티팩트"의 이름을 합산한다.
// 아티팩트 이름에 숫자를 넣어두면 zip 을 풀지 않고 목록 조회만으로 집계할 수 있다
// (서버리스 함수에서 파일을 내려받아 압축을 푸는 건 느리고 비싸다).
//
// 단가/계산은 사전 견적(/api/estimate)과 공유한다 — 두 화면이 다른 금액을 보이면 안 되므로.
import { PRICE, cost, r6 } from '../lib/pricing.js';

export default async function handler(req, res) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }

  // 아티팩트는 보존기간이 지나면 사라진다 — 그 이전 실행은 집계에서 빠진다는 뜻이라 함께 알린다.
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/artifacts?per_page=100`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `아티팩트 조회 실패 (${r.status})`, detail: detail.slice(0, 200) });
  }
  const { artifacts = [] } = await r.json();

  const num = (name, key) => {
    const m = name.match(new RegExp(`__${key}-(\\d+)`));
    return m ? Number(m[1]) : 0;
  };

  const runs = [];
  let ci = 0, co = 0, oi = 0, oo = 0, img = 0, gimg = 0, tts = 0;
  for (const a of artifacts) {
    if (!a.name.startsWith('usage__') || a.expired) continue;
    const e = {
      at: a.created_at,
      claudeIn: num(a.name, 'ci'), claudeOut: num(a.name, 'co'),
      openaiIn: num(a.name, 'oi'), openaiOut: num(a.name, 'oo'),
      images: num(a.name, 'img'), geminiImages: num(a.name, 'gimg'), ttsChars: num(a.name, 'tts'),
    };
    e.usd = cost(e);
    runs.push(e);
    ci += e.claudeIn; co += e.claudeOut; oi += e.openaiIn; oo += e.openaiOut;
    img += e.images; gimg += e.geminiImages; tts += e.ttsChars;
  }

  const total = { claudeIn: ci, claudeOut: co, openaiIn: oi, openaiOut: oo, images: img, geminiImages: gimg, ttsChars: tts };
  const usd = cost(total);

  return res.status(200).json({
    runs: runs.length,
    total,
    breakdown: {
      claude: r6(((ci * PRICE.claudeIn) + (co * PRICE.claudeOut)) / 1e6),
      openai: r6(((oi * PRICE.openaiIn) + (oo * PRICE.openaiOut)) / 1e6),
      image: r6(img * PRICE.image),
      geminiImage: r6(gimg * PRICE.geminiImage),
      tts: r6((tts / 1000) * PRICE.tts1k),
    },
    usd: r6(usd),
    krw: Math.round(usd * PRICE.usdKrw),
    price: PRICE,
    note: '아티팩트 보존기간(90일)이 지난 실행은 집계에서 빠집니다. 단가는 환경변수로 조정하세요.',
    recent: runs.slice(0, 20),
  });
}

