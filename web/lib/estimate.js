// 실행 1회 예상 비용 계산 — 견적 화면(/api/estimate)과 상한 검사(/api/publish)가 공유한다.
// 두 곳이 다른 값을 쓰면 "견적은 통과인데 실행은 거부" 같은 모순이 생기므로 한 곳에 둔다.
import { PRICE, LIVE_VIDEO, cost, r6 } from './pricing.js';

// 실측 기반 기본 소비량 (2026-08 기준, Opus 4.8 + ElevenLabs + Gemini 이미지).
export const MODEL = {
  // 웹서치 리서치는 길이와 무관하게 거의 고정 — 검색 결과를 읽느라 입력 토큰이 크다.
  researchIn: Number(process.env.EST_RESEARCH_IN || 63000),
  researchOut: Number(process.env.EST_RESEARCH_OUT || 2500),
  // 대본 생성: 입력은 대체로 고정, 출력(사고 토큰 포함)은 분량에 비례.
  scriptIn: Number(process.env.EST_SCRIPT_IN || 7500),
  scriptOutPerMin: Number(process.env.EST_SCRIPT_OUT_PER_MIN || 2500),
  // 나레이션 글자수 — src/lib/anthropic.ts 의 targetChars 와 같은 기준(실측 분당 330자).
  charsPerMin: Number(process.env.EST_CHARS_PER_MIN || 330),
  // 이미지 장수 — 파이프라인의 MAX_IMAGES_PER_RUN 상한과 같은 값으로 맞춘다.
  // (분량이 짧으면 실제로는 더 적게 나오지만, 견적은 최악을 보여주는 쪽이 안전하다.)
  images: Number(process.env.MAX_IMAGES_PER_RUN || 6),
};

/**
 * @param {{minutes:number, research:boolean, researchIn?:number, liveVideo?:boolean, scriptOnly?:boolean, reuseScript?:boolean}} opts
 *   researchIn 을 주면 실측 보정값으로 대체한다.
 *   liveVideo 를 주면 그 값으로, 안 주면 서버 기본값(USE_LIVE_VIDEO)으로 계산한다.
 *   scriptOnly: 대본 미리보기 — 리서치·대본만 돌리고 멈춘다.
 *   reuseScript: 이어만들기 — 미리보기에서 만든 대본을 재사용하므로 리서치·대본 비용이 없다.
 */
export function estimateRun({ minutes, research, researchIn, liveVideo, scriptOnly, reuseScript }) {
  const m = { ...MODEL, ...(researchIn ? { researchIn } : {}) };
  const useLiveVideo = liveVideo === undefined ? LIVE_VIDEO.enabled : Boolean(liveVideo);
  // 미리보기는 대본까지만, 이어만들기는 대본 이후만 — 두 번 합쳐도 한 번 값과 같아야 한다.
  const seedanceSeconds = useLiveVideo && !scriptOnly ? LIVE_VIDEO.clipCount * LIVE_VIDEO.clipSeconds : 0;
  const claudeOn = !reuseScript;

  const usage = {
    claudeIn: claudeOn ? (research ? m.researchIn : 0) + m.scriptIn : 0,
    claudeOut: claudeOn ? (research ? m.researchOut : 0) + Math.round(m.scriptOutPerMin * minutes) : 0,
    ttsChars: scriptOnly ? 0 : Math.round(m.charsPerMin * minutes),
    geminiImages: scriptOnly ? 0 : m.images,
    images: 0,
    seedanceSeconds,
  };

  const breakdown = {
    research: claudeOn && research ? r6((m.researchIn * PRICE.claudeIn + m.researchOut * PRICE.claudeOut) / 1e6) : 0,
    script: claudeOn ? r6((m.scriptIn * PRICE.claudeIn + m.scriptOutPerMin * minutes * PRICE.claudeOut) / 1e6) : 0,
    tts: r6((usage.ttsChars / 1000) * PRICE.tts1k),
    images: r6(usage.geminiImages * PRICE.geminiImage),
    liveVideo: r6(seedanceSeconds * PRICE.seedanceSec),
  };
  const usd = cost(usage);
  return {
    usage,
    breakdown,
    liveVideo: { enabled: useLiveVideo && !scriptOnly, clips: seedanceSeconds ? LIVE_VIDEO.clipCount : 0, seconds: seedanceSeconds },
    scriptOnly: Boolean(scriptOnly),
    reuseScript: Boolean(reuseScript),
    usd: r6(usd),
    krw: Math.round(usd * PRICE.usdKrw),
  };
}
