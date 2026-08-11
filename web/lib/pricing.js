// 단가표와 비용 계산 — 사후 집계(/api/cost)와 사전 견적(/api/estimate)이 같은 값을 쓰도록
// 한 곳에 모아둔다. (예전엔 cost.js 안에만 있어서, 견적을 따로 만들면 단가가 갈라질 수밖에 없었다.)
//
// 단가는 계정 요금제마다 다르므로 환경변수로 받는다. 아래 기본값은 공개 정가 기준의
// "대략치"이므로, 정확한 금액이 필요하면 Vercel 환경변수로 실제 단가를 넣어야 한다.
export const PRICE = {
  // Claude Opus 4.8 — 100만 토큰당 달러
  claudeIn: Number(process.env.PRICE_CLAUDE_IN || 5),
  claudeOut: Number(process.env.PRICE_CLAUDE_OUT || 25),
  // 리서치용 저가 모델 — 100만 토큰당 달러
  openaiIn: Number(process.env.PRICE_OPENAI_IN || 0.4),
  openaiOut: Number(process.env.PRICE_OPENAI_OUT || 1.6),
  // 썸네일 이미지(OpenAI) — 장당 달러
  image: Number(process.env.PRICE_IMAGE || 0.19),
  // Gemini 이미지(Nano Banana 2, 1K) — 장당 달러. 공개 정가 기준 대략치.
  geminiImage: Number(process.env.PRICE_GEMINI_IMAGE || 0.067),
  // TTS — 1000자당 달러
  tts1k: Number(process.env.PRICE_TTS_1K || 0.22),
  usdKrw: Number(process.env.USD_KRW || 1380),
};

// 비용 상한 — 넘으면 실행을 아예 시작하지 않는다. 원화로 잡고 내부에서 달러로 환산한다
// (사용자가 체감하는 단위가 원화라, 환율이 바뀌어도 의도한 한도가 유지되게).
export const LIMITS = {
  // 유료 실행 전면 차단 스위치(비상정지).
  spendEnabled: String(process.env.SPEND_ENABLED || 'true').toLowerCase() !== 'false',
  // 실행 1회 예상 비용 상한(원). 견적이 이보다 크면 트리거를 거부한다.
  perRunKrw: Number(process.env.LIMIT_PER_RUN_KRW || 1500),
  // 하루 누적 사용액 상한(원). 오늘 이미 이만큼 썼으면 더 실행하지 않는다.
  perDayKrw: Number(process.env.LIMIT_PER_DAY_KRW || 5000),
};

/** 사용량 합계 → 달러. 필드가 없으면 0으로 친다. */
export function cost(t) {
  return (
    (((t.claudeIn || 0) * PRICE.claudeIn + (t.claudeOut || 0) * PRICE.claudeOut) / 1e6) +
    (((t.openaiIn || 0) * PRICE.openaiIn + (t.openaiOut || 0) * PRICE.openaiOut) / 1e6) +
    ((t.images || 0) * PRICE.image) +
    ((t.geminiImages || 0) * PRICE.geminiImage) +
    (((t.ttsChars || 0) / 1000) * PRICE.tts1k)
  );
}

export const r6 = (n) => Math.round(n * 1e6) / 1e6;
