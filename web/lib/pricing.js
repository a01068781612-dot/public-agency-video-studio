// 단가표와 비용 계산 — 사후 집계(/api/cost)와 사전 견적(/api/estimate)이 같은 값을 쓰도록
// 한 곳에 모아둔다. (예전엔 cost.js 안에만 있어서, 견적을 따로 만들면 단가가 갈라질 수밖에 없었다.)
//
// 단가는 계정 요금제마다 다르므로 환경변수로 받는다. 아래 기본값은 공개 정가 기준의
// "대략치"이므로, 정확한 금액이 필요하면 Vercel 환경변수로 실제 단가를 넣어야 한다.
export const PRICE = {
  // Claude Haiku 4.5 (CLAUDE_MODEL 기본값) — 100만 토큰당 달러.
  // 모델을 바꾸면 여기도 같이 바꿔야 견적이 맞는다: Opus 5/4.8 은 5/25, Sonnet 5 는 2/10.
  claudeIn: Number(process.env.PRICE_CLAUDE_IN || 1),
  claudeOut: Number(process.env.PRICE_CLAUDE_OUT || 5),
  // 리서치용 저가 모델 — 100만 토큰당 달러
  openaiIn: Number(process.env.PRICE_OPENAI_IN || 0.4),
  openaiOut: Number(process.env.PRICE_OPENAI_OUT || 1.6),
  // 썸네일 이미지(OpenAI) — 장당 달러
  image: Number(process.env.PRICE_IMAGE || 0.19),
  // Gemini 이미지(Nano Banana 2, 1K) — 장당 달러. 공개 정가 기준 대략치.
  geminiImage: Number(process.env.PRICE_GEMINI_IMAGE || 0.067),
  // TTS — 1000자당 달러. Gemini TTS 실측 기준(59자 → 출력 222토큰, 출력 $10/1M).
  // ElevenLabs 로 되돌리면 0.22 로 바꿔야 한다.
  tts1k: Number(process.env.PRICE_TTS_1K || 0.037),
  // 시댄스(Seedance) 2.5 실사 영상 — 초당 달러. 480p 기준(BytePlus/Replicate 원가), 720p 는 약 0.2312.
  seedanceSec: Number(process.env.PRICE_SEEDANCE_SEC || 0.1028),
  usdKrw: Number(process.env.USD_KRW || 1380),
};

// 실사 클립 설정 — 파이프라인의 LIVE_VIDEO_*/SEEDANCE_* 환경변수와 같은 값을 봐야 견적이 맞는다.
// 시댄스 2.5는 4~30초 사이 정수를 받는다(이전 Veo 는 4·6·8초 고정 단계였다).
export const LIVE_VIDEO = {
  // 실사 클립은 선택이 아니라 필수 구성이므로 기본값이 켜짐이다(견적에 항상 포함된다).
  enabled: String(process.env.USE_LIVE_VIDEO || 'true').toLowerCase() === 'true',
  // 짧은 액센트가 아니라 거의 전체가 실사인 캠페인이라 개수는 적게, 길이는 길게(2개×25초).
  clipCount: Number(process.env.LIVE_VIDEO_CLIP_COUNT || 2),
  clipSeconds: Number(process.env.LIVE_VIDEO_CLIP_SECONDS || 25),
};

// 비용 상한 — 넘으면 실행을 아예 시작하지 않는다. 원화로 잡고 내부에서 달러로 환산한다
// (사용자가 체감하는 단위가 원화라, 환율이 바뀌어도 의도한 한도가 유지되게).
export const LIMITS = {
  // 유료 실행 전면 차단 스위치(비상정지).
  spendEnabled: String(process.env.SPEND_ENABLED || 'true').toLowerCase() !== 'false',
  // 실행 1회 예상 비용 상한(원). 견적이 이보다 크면 트리거를 거부한다.
  // 실사 클립을 "짧은 액센트"(6개×4초=24초)에서 "영상 대부분"(2개×25초=50초)으로 늘리면서
  // 1분 영상 견적이 약 7,800원까지 올랐다(Veo 때는 약 2,400원). 실비에 여유를 얹어
  // 9,000원으로 둔다(오차로 막히지 않을 만큼만 — DAILY_VIDEO_LIMIT=1 이 이미 남발을 막는다).
  perRunKrw: Number(process.env.LIMIT_PER_RUN_KRW || 9000),
  // 하루 누적 사용액 상한(원). 오늘 이미 이만큼 썼으면 더 실행하지 않는다.
  // 영상 1편(~7,800원) + 대본 미리보기 몇 번(각 ~130원)이 여유 있게 들어가게 10,000원.
  perDayKrw: Number(process.env.LIMIT_PER_DAY_KRW || 10000),
  // 하루에 만들 수 있는 영상 개수 상한(대본 미리보기는 세지 않는다).
  dailyVideoLimit: Number(process.env.DAILY_VIDEO_LIMIT || 1),
  // 캠페인 종료일(KST). 코드는 남겨두고 날짜로만 잠근다 — src/config.ts 의 같은 이름 값과
  // 반드시 같이 맞춰야 한다(웹앱은 트리거 전에 막고, 파이프라인은 우회 실행을 막는 이중 잠금).
  videoGenExpiresAt: process.env.VIDEO_GEN_EXPIRES_AT || '2026-09-30',
};

/** 오늘(KST)이 캠페인 종료일을 지났는지. */
export function isVideoGenExpired(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const todayKst = kst.toISOString().slice(0, 10);
  return todayKst > LIMITS.videoGenExpiresAt;
}

/** 사용량 합계 → 달러. 필드가 없으면 0으로 친다. */
export function cost(t) {
  return (
    (((t.claudeIn || 0) * PRICE.claudeIn + (t.claudeOut || 0) * PRICE.claudeOut) / 1e6) +
    (((t.openaiIn || 0) * PRICE.openaiIn + (t.openaiOut || 0) * PRICE.openaiOut) / 1e6) +
    ((t.images || 0) * PRICE.image) +
    ((t.geminiImages || 0) * PRICE.geminiImage) +
    (((t.ttsChars || 0) / 1000) * PRICE.tts1k) +
    ((t.seedanceSeconds || 0) * PRICE.seedanceSec)
  );
}

export const r6 = (n) => Math.round(n * 1e6) / 1e6;
