// 웹앱 → GitHub Actions 트리거 (repository_dispatch).
// GITHUB_TOKEN 은 서버(함수)에만 있고 브라우저에 노출되지 않는다.
// 허용값 목록은 src/lib/artStyle.ts / src/lib/tone.ts 의 프리셋 id 와 일치해야 한다.
// (여기서 걸러진 값만 워크플로로 넘어가고, 나머지는 기본값으로 떨어진다.)
import { PRICE, LIMITS, VEO } from '../lib/pricing.js';
import { fetchUsageRuns, spentOnDay } from '../lib/usage.js';
import { estimateRun } from '../lib/estimate.js';

// 'false'(문자열)도 거짓으로 취급 — JSON 으로 오가며 문자열이 되는 경우가 많다.
const truthyFlag = (v) => v === true || v === 'true' || v === 1 || v === '1';

const ART_STYLES = ['auto', 'isometric', 'comic', 'watercolor', 'cinematic', 'retro', 'clay', 'pixar'];
const TONES = ['documentary', 'humorous', 'storytelling', 'mystery'];
// src/lib/agency.ts 의 id 목록과 동일하게 유지 (web/ 은 src/ 를 import 하지 않는 별도 배포 대상이라 중복 보관).
const AGENCIES = [
  'moef', 'moe', 'msit', 'mofa', 'unikorea', 'moj', 'mnd', 'mois', 'mpva', 'mcst',
  'mafra', 'motie', 'mohw', 'me', 'moel', 'mogef', 'molit', 'mof', 'mss',
  'mpm', 'moleg', 'mfds',
  'nts', 'customs', 'pps', 'kostat', 'spo', 'mma', 'dapa', 'police', 'nfa', 'khs',
  'rda', 'kfs', 'kipo', 'kdca', 'kma', 'kcg', 'saemangeum', 'nacc', 'kasa', 'okva',
  'ftc', 'fsc', 'acrc', 'kcc', 'pipc', 'nssc',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 만 허용됩니다' });
  }
  const { GITHUB_TOKEN, GITHUB_REPO, APP_PASSWORD } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: '서버 환경변수(GITHUB_TOKEN, GITHUB_REPO) 미설정' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (APP_PASSWORD && body.password !== APP_PASSWORD) {
    return res.status(401).json({ error: '앱 비밀번호가 올바르지 않습니다' });
  }

  // ── 비용 안전장치 ── 트리거하기 전에 막는다. 일단 실행되면 중간에 세울 방법이 없다.
  if (!LIMITS.spendEnabled) {
    return res.status(403).json({
      error: '비용 차단(SPEND_ENABLED=false)이 켜져 있어 실행할 수 없습니다.',
      hint: '다시 쓰려면 Vercel 환경변수 SPEND_ENABLED 를 true 로 되돌리세요.',
    });
  }

  const willResearch = String(body.topic || '').trim() !== '' || body.mode === 'trend';
  // 실사 클립은 필수 구성이라, 값이 안 오면(캐시된 옛 화면 등) 서버 기본값(켜짐)을 따른다.
  // false 로 떨어뜨리면 견적은 Veo 없이 내고 파이프라인은 Veo 를 돌려 상한 검사가 헛돈다.
  const wantsVeo = body.veo === undefined ? VEO.enabled : truthyFlag(body.veo);
  // 대본 미리보기(대본까지만) / 이어만들기(미리보기 대본 재사용) — 비용이 서로 다르다.
  const previewOnly = truthyFlag(body.preview);
  const resumeRunId = String(body.resumeRun || '').replace(/\D/g, '');
  const est = estimateRun({
    minutes: Math.max(1, Math.min(20, Number(body.minutes) || 1)),
    research: willResearch,
    veo: wantsVeo,
    scriptOnly: previewOnly,
    reuseScript: Boolean(resumeRunId),
  });
  if (est.krw > LIMITS.perRunKrw) {
    return res.status(403).json({
      error: `예상 비용 ${est.krw.toLocaleString()}원이 1회 상한 ${LIMITS.perRunKrw.toLocaleString()}원을 넘습니다.`,
      hint: '길이를 줄이거나, 상한(LIMIT_PER_RUN_KRW)을 조정하세요.',
      estimateKrw: est.krw,
      limitKrw: LIMITS.perRunKrw,
    });
  }

  // 하루 누적 — 아티팩트 집계라 조회 실패 시엔 통과시킨다(집계 불가로 실행을 막지는 않는다).
  try {
    const runs = await fetchUsageRuns({ token: GITHUB_TOKEN, repo: GITHUB_REPO });
    const spentKrw = Math.round(spentOnDay(runs) * PRICE.usdKrw);
    if (spentKrw + est.krw > LIMITS.perDayKrw) {
      return res.status(403).json({
        error: `오늘 이미 ${spentKrw.toLocaleString()}원을 썼습니다. 이번 실행(${est.krw.toLocaleString()}원)을 더하면 하루 상한 ${LIMITS.perDayKrw.toLocaleString()}원을 넘습니다.`,
        hint: '내일 다시 실행하거나, 상한(LIMIT_PER_DAY_KRW)을 조정하세요.',
        spentTodayKrw: spentKrw,
        estimateKrw: est.krw,
        limitKrw: LIMITS.perDayKrw,
      });
    }
  } catch {
    /* 집계 실패는 무시 — 상한 검사 때문에 정상 실행이 막히면 더 곤란하다 */
  }

  // 키 이름을 하나만 받으면, 다른 이름으로 보낸 값이 "조용히 무시"된다.
  // 실제로 do_upload 로 보낸 요청이 upload 로 안 잡혀 DO_UPLOAD=false 가 되면서
  // 20분짜리 렌더를 마치고도 업로드가 안 된 적이 있다. 별칭을 함께 받는다.
  const pick = (...keys) => {
    for (const k of keys) if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
    return undefined;
  };
  // repository_dispatch 의 client_payload 는 "최상위 속성 10개"가 한도다(전체 크기는 256KB로 넉넉하다).
  // 항목을 평평하게 늘어놓다가 16개가 되어 422 로 거부됐다 — 설정을 cfg 하나로 감싸 한 개만 쓴다.
  // 워크플로도 github.event.client_payload.cfg.* 로 읽는다.
  const cfg = {
    // 뉴스 스크립트급 긴 브리핑(타임코드별 섹션 + 참고자료 링크 포함)도 안 잘리게 넉넉히 허용
    // (200자 제한이 "충실 반영" 기능을 무력화시켰던 전례가 있음). GitHub repository_dispatch
    // client_payload 한도(256KB)에 비하면 여전히 작아 안전하다.
    topic: String(body.topic || '').slice(0, 20000),
    content_mode: ['auto', 'trend', 'basics'].includes(pick('mode', 'content_mode')) ? pick('mode', 'content_mode') : 'auto',
    content_level: ['basic', 'intermediate', 'expert'].includes(pick('level', 'content_level')) ? pick('level', 'content_level') : 'expert',
    // 기본은 업로드 안 함 — 유료 업로드는 명시적으로 켤 때만.
    do_upload: truthyFlag(pick('upload', 'do_upload')) ? 'true' : 'false',
    // 길이는 1분 고정이 기본 — 값이 안 오면 예전 기본값(10분)으로 떨어져 비용이 10배가 된다.
    target_minutes: String(Math.max(1, Math.min(20, Number(pick('minutes', 'target_minutes')) || 1))),
    // 업로드 대상 채널 (default | ch2). 알 수 없는 값은 default 로 안전 처리.
    channel: ['default', 'ch2'].includes(body.channel) ? body.channel : 'default',
    // 공개 상태. 리뷰 흐름은 'unlisted'(미등록)로 올려 확인 후 발행. 빈 값이면 워크플로 기본값.
    privacy: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : '',
    // 영상 스타일(=렌더 엔진). illustrated=2D 벡터 | deck3d=3D 기하학 | signal=데이터 중심.
    style: ['illustrated', 'deck3d', 'signal', 'signal3d'].includes(body.style) ? body.style : '',
    // 나레이션 배속(0.8~1.4). 비우면 워크플로 기본값.
    speed: pick('speed', 'narration_speed') ? String(Math.max(0.8, Math.min(1.4, Number(pick('speed', 'narration_speed')) || 1))) : '',
    // 씬 일러스트 화풍(src/lib/artStyle.ts). 'auto' 는 회차마다 날짜로 회전.
    // 목록에 없는 값은 빈 값으로 떨어뜨려 워크플로 기본값(기존 흑백 등각)을 쓰게 한다.
    art_style: ART_STYLES.includes(pick('art', 'art_style')) ? pick('art', 'art_style') : '',
    // 나레이션 말투(src/lib/tone.ts).
    narration_tone: TONES.includes(pick('tone', 'narration_tone')) ? pick('tone', 'narration_tone') : '',
    // 홍보 타겟 기관(src/lib/agency.ts). 목록에 없는 값은 빈 값으로 떨어뜨려 특정 기관 없음으로 처리.
    agency: AGENCIES.includes(body.agency) ? body.agency : '',
    // 화면 비율: 16:9(가로) | 9:16(세로 쇼츠). 알 수 없는 값은 빈 값 → 워크플로 기본값(16:9).
    aspect: ['16:9', '9:16'].includes(body.aspect) ? body.aspect : '',
    // Veo 실사 클립 사용 여부. 켜면 클립당 요금이 붙으므로 명시적으로 켤 때만 'true'.
    use_veo: wantsVeo ? 'true' : 'false',
    // 대본까지만 만들고 멈춘다(약 130원). 나레이션·이미지·실사·업로드를 건너뛴다.
    preview_only: previewOnly ? 'true' : 'false',
    // 미리보기 실행 ID — 그 실행의 대본을 이어받아 나머지만 만든다.
    resume_run_id: resumeRunId,
  };
  const client_payload = { cfg };

  // 알 수 없는 키가 섞여 오면 조용히 버리지 말고 응답에 알려준다(오타로 인한 설정 유실 방지).
  const KNOWN = new Set([
    'topic', 'mode', 'content_mode', 'level', 'content_level', 'upload', 'do_upload',
    'minutes', 'target_minutes', 'channel', 'privacy', 'style', 'speed', 'narration_speed', 'password',
    'art', 'art_style', 'tone', 'narration_tone', 'agency', 'aspect', 'veo',
    'preview', 'resumeRun',
  ]);
  const ignored = Object.keys(body).filter((k) => !KNOWN.has(k));

  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'publish-video', client_payload }),
  });

  if (r.status !== 204) {
    const detail = await r.text().catch(() => '');
    return res.status(502).json({ error: `GitHub 트리거 실패 (${r.status})`, detail: detail.slice(0, 300) });
  }
  return res.status(200).json({
    ok: true,
    // 실제로 무엇이 전달됐는지 되돌려준다 — 업로드 여부/스타일이 의도와 다른지 즉시 확인 가능.
    applied: {
      do_upload: cfg.do_upload,
      style: cfg.style || '(워크플로 기본값)',
      privacy: cfg.privacy || '(워크플로 기본값)',
      target_minutes: cfg.target_minutes,
      speed: cfg.speed || '(워크플로 기본값)',
      art_style: cfg.art_style || '(워크플로 기본값)',
      narration_tone: cfg.narration_tone || '(워크플로 기본값)',
      agency: cfg.agency || '(지정 안 함)',
      aspect: cfg.aspect || '(워크플로 기본값)',
      use_veo: cfg.use_veo,
      preview_only: cfg.preview_only,
      resume_run_id: cfg.resume_run_id || '(없음)',
    },
    ...(ignored.length ? { ignoredKeys: ignored } : {}),
  });
}
