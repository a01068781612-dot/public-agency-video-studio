// 실행 전 예상 비용 — 발행 버튼을 누르기 전에 얼마나 나올지 미리 보여준다.
//
// 소비량 모델은 실제 실행 기록(usage 아티팩트)에서 역산한 값이다. 가능하면 최근 실행들의
// 실측치로 보정(calibrate)하고, 기록이 없으면 아래 기본 상수로만 계산한다.
// 어디까지나 추정이라 실제 청구액과는 차이가 날 수 있다.
import { PRICE, cost, r6 } from '../lib/pricing.js';

// 실측 기반 기본 소비량 (2026-08 기준, Opus 4.8 + ElevenLabs).
const MODEL = {
  // 웹서치 리서치는 길이와 무관하게 거의 고정 — 검색 결과를 읽느라 입력 토큰이 크다.
  researchIn: Number(process.env.EST_RESEARCH_IN || 63000),
  researchOut: Number(process.env.EST_RESEARCH_OUT || 2500),
  // 대본 생성: 입력은 대체로 고정, 출력(사고 토큰 포함)은 분량에 비례.
  scriptIn: Number(process.env.EST_SCRIPT_IN || 7500),
  scriptOutPerMin: Number(process.env.EST_SCRIPT_OUT_PER_MIN || 2500),
  // 나레이션 글자수 — src/lib/anthropic.ts 의 targetChars(분당 460자)와 같은 기준.
  charsPerMin: Number(process.env.EST_CHARS_PER_MIN || 460),
};

export default async function handler(req, res) {
  const q = req.query || {};
  const minutes = Math.max(1, Math.min(20, Number(q.minutes) || 2));
  // 주제를 지정하거나 트렌드 모드면 웹서치를 한다(src/pipeline/run.ts 와 같은 조건).
  const research = q.research === undefined ? true : q.research !== 'false' && q.research !== '0';

  const { calibrated, samples } = await calibrate();
  const m = { ...MODEL, ...calibrated };

  const usage = {
    claudeIn: (research ? m.researchIn : 0) + m.scriptIn,
    claudeOut: (research ? m.researchOut : 0) + Math.round(m.scriptOutPerMin * minutes),
    ttsChars: Math.round(m.charsPerMin * minutes),
    // 이미지 생성 키가 없으면 코드 렌더링으로 대체되므로 0. 키를 넣으면 별도 반영 필요.
    images: 0,
    geminiImages: 0,
  };

  const breakdown = {
    research: research ? r6((m.researchIn * PRICE.claudeIn + m.researchOut * PRICE.claudeOut) / 1e6) : 0,
    script: r6((m.scriptIn * PRICE.claudeIn + m.scriptOutPerMin * minutes * PRICE.claudeOut) / 1e6),
    tts: r6((usage.ttsChars / 1000) * PRICE.tts1k),
  };
  const usd = cost(usage);

  return res.status(200).json({
    minutes,
    research,
    usage,
    breakdown,
    usd: r6(usd),
    krw: Math.round(usd * PRICE.usdKrw),
    calibratedFrom: samples,
    note: samples
      ? `최근 실행 ${samples}건의 실측치로 보정한 추정입니다. 실제 청구액과 다를 수 있습니다.`
      : '실행 기록이 없어 기본 상수로 계산한 추정입니다. 실제 청구액과 다를 수 있습니다.',
  });
}

/**
 * 최근 usage 아티팩트에서 실제 소비량을 읽어 모델을 보정한다.
 * 아티팩트 이름에 분량이 없어서 분당 계수는 역산할 수 없으므로, 길이와 무관한
 * "고정비" 항목(리서치 입력 토큰)만 실측 평균으로 갈아끼운다.
 */
async function calibrate() {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) return { calibrated: {}, samples: 0 };
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/artifacts?per_page=100`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!r.ok) return { calibrated: {}, samples: 0 };
    const { artifacts = [] } = await r.json();
    const num = (name, key) => {
      const mm = name.match(new RegExp(`__${key}-(\\d+)`));
      return mm ? Number(mm[1]) : 0;
    };
    // 웹서치가 실제로 돌아간 실행만 표본으로 쓴다 — 입력 토큰이 크게 튀는 것이 그 신호다.
    // (리서치가 400 으로 조용히 실패하던 시절의 실행은 입력이 작아서 평균을 왜곡한다.)
    const ins = artifacts
      .filter((a) => a.name.startsWith('usage__') && !a.expired)
      .map((a) => num(a.name, 'ci'))
      .filter((v) => v >= 20000)
      .slice(0, 10);
    if (ins.length === 0) return { calibrated: {}, samples: 0 };
    const avgIn = Math.round(ins.reduce((s, v) => s + v, 0) / ins.length);
    // ci 는 리서치 입력 + 대본 입력의 합이라, 대본 입력분을 빼야 리서치 고정비가 된다.
    return { calibrated: { researchIn: Math.max(0, avgIn - MODEL.scriptIn) }, samples: ins.length };
  } catch {
    return { calibrated: {}, samples: 0 };
  }
}
