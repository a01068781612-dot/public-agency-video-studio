import { GoogleGenAI } from '@google/genai';
import { config, ASPECT } from '../config.js';
import { recordUsage } from './usage.js';

/**
 * Veo 3.1 Lite 로 짧은 실사 클립을 만든다.
 *
 * ★핵심: 텍스트가 아니라 "이미 만든 이미지"를 넣어 움직이게 한다(image-to-video)★
 * 텍스트에서 새로 뽑으면 같은 장면인데도 앞뒤 이미지와 인물·색감·구도가 따로 놀아
 * 한 영상 안에서 튄다. 나노바나나로 만든 그 컷을 그대로 시작 프레임으로 주면
 * 정지 이미지와 움직이는 클립이 이어져 보이고, 한국 배경·기관 맥락도 그대로 유지된다.
 *
 * 음성은 끈다 — 나레이션은 ElevenLabs 가 담당하고, Veo 음성을 켜면 겹친다.
 *
 * ★API 형태는 @google/genai 2.15.0 의 타입 정의(genai.d.ts)에서 확인한 것이다★
 * generateVideos 는 즉시 끝나지 않고 오퍼레이션을 돌려주므로 폴링해야 한다.
 */

/** Veo API 가 허용하는 클립 길이(초). 5초는 없다 — 대본이 이 중에서 고른다. */
export const ALLOWED_CLIP_SECONDS = [4, 6, 8] as const;
export type ClipSeconds = (typeof ALLOWED_CLIP_SECONDS)[number];

/** 대본이 이상한 값을 줘도 API 가 받는 값으로 맞춘다(가까운 허용값으로 스냅). */
export function normalizeClipSeconds(v: unknown): ClipSeconds {
  const n = Number(v);
  if (!Number.isFinite(n)) return 4;
  return ALLOWED_CLIP_SECONDS.reduce((best, cur) =>
    Math.abs(cur - n) < Math.abs(best - n) ? cur : best,
  ) as ClipSeconds;
}

export type VideoClipRequest = {
  /** 시작 프레임이 될 이미지(PNG 버퍼). 나노바나나가 만든 그 컷. */
  imagePng: Buffer;
  /** 어떻게 움직일지 — 장면 묘사가 아니라 "카메라·피사체의 움직임"을 적는다. */
  motionPrompt: string;
  seconds: ClipSeconds;
};

const POLL_INTERVAL_MS = 8000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5분 넘게 안 끝나면 포기하고 이미지로 폴백

/**
 * 클립 한 개를 만들어 mp4 버퍼로 돌려준다. 실패하면 예외 — 호출부가 컷 단위로 잡아
 * 그 컷만 정지 이미지로 떨어뜨릴 수 있게 한다.
 */
export async function generateVideoClip(req: VideoClipRequest): Promise<Buffer> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY 가 없습니다');
  const ai = new GoogleGenAI({ apiKey });
  const model = config.veoModel;

  // 그림에 닻을 내린다. 움직임만 적어 보내면 Veo 가 그림에 무엇이 있는지 모른 채
  // 장면을 새로 지어내, 시작 프레임만 같고 내용이 딴 데로 새는 클립이 나왔다.
  // "주어진 이미지를 이어서 움직이게 하라"는 제약을 프롬프트에 명시한다.
  const anchored = [
    'Animate the provided image as the first frame of a live-action video clip.',
    'Keep the same subject, people, setting, framing and color as the image — do not invent new objects, new locations, or on-screen text.',
    `Motion: ${req.motionPrompt}`,
    'Realistic, subtle, continuous motion only. No scene change, no cuts, no camera teleporting.',
  ].join(' ');

  let op = await ai.models.generateVideos({
    model,
    // 최상위 prompt/image 인자는 deprecated(2026-07-31 이후 제거 예정) — source 로 넘긴다.
    source: {
      prompt: anchored,
      image: { imageBytes: req.imagePng.toString('base64'), mimeType: 'image/png' },
    },
    config: {
      numberOfVideos: 1,
      durationSeconds: req.seconds,
      aspectRatio: ASPECT, // '16:9' | '9:16'
      resolution: '720p', // 1080p 는 초당 단가가 약 1.6배
      // generateAudio 는 Developer API 모드에서 지원되지 않는다(Vertex 전용) — 보내면 SDK 가 막는다.
      // 그래서 Veo 가 소리를 같이 만들 수 있는데, 렌더러에서 muted 로 재생해 나레이션과 겹치지 않게 한다.
    },
  });

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!op.done) {
    if (Date.now() > deadline) throw new Error(`Veo 클립 생성 시간 초과(${POLL_TIMEOUT_MS / 1000}초)`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    op = await ai.operations.getVideosOperation({ operation: op });
  }

  const video = op.response?.generatedVideos?.[0]?.video;
  if (!video) {
    const why = op.response?.raiMediaFilteredReasons?.join(', ');
    throw new Error(why ? `Veo 가 클립을 반환하지 않음(안전 필터: ${why})` : 'Veo 응답에 영상이 없습니다');
  }

  // 초 단위로 과금되므로 요청한 길이를 그대로 사용량에 기록한다.
  recordUsage({ kind: 'veo-video', step: 'liveaction', model, seconds: req.seconds });

  if (video.videoBytes) return Buffer.from(video.videoBytes, 'base64');
  if (video.uri) {
    // uri 로 오는 경우가 있어 직접 받아온다(키를 붙여야 접근 가능).
    const sep = video.uri.includes('?') ? '&' : '?';
    const res = await fetch(`${video.uri}${sep}key=${apiKey}`);
    if (!res.ok) throw new Error(`Veo 영상 다운로드 실패 (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Veo 응답에 영상 데이터가 없습니다');
}
