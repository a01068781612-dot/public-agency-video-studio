import Replicate from 'replicate';
import { config } from '../config.js';
import { recordUsage } from './usage.js';

/**
 * 시댄스(Seedance) 2.5 로 짧은 실사 클립을 만든다. Replicate(bytedance/seedance-2.5)를 통해 호출한다.
 *
 * ★핵심: 텍스트가 아니라 "이미 만든 이미지"를 넣어 움직이게 한다(image-to-video)★
 * 텍스트에서 새로 뽑으면 같은 장면인데도 앞뒤 이미지와 인물·색감·구도가 따로 놀아
 * 한 영상 안에서 튄다. 나노바나나로 만든 그 컷을 그대로 시작 프레임으로 주면
 * 정지 이미지와 움직이는 클립이 이어져 보이고, 한국 배경·기관 맥락도 그대로 유지된다.
 *
 * 오디오는 끈다 — 나레이션은 별도 TTS 가 담당하고, 시댄스가 만드는 소리를 켜면 겹친다.
 *
 * ★입력 스키마는 Replicate 모델 페이지(replicate.com/bytedance/seedance-2.5)의
 * openapi_schema 에서 직접 확인한 필드명이다★ image 를 주면(이미지→영상) aspect_ratio 는
 * 'adaptive' 고정이어야 한다(모델이 입력 이미지의 비율을 그대로 따라간다).
 */

/** 시댄스 2.5 가 허용하는 클립 길이 범위(초). duration=-1(모델이 알아서 정함)은 쓰지 않는다. */
export const MIN_CLIP_SECONDS = 4;
export const MAX_CLIP_SECONDS = 30;

/** 대본이 이상한 값을 줘도 API 가 받는 범위로 맞춘다(정수로 반올림 후 4~30 사이로 자름). */
export function normalizeClipSeconds(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return MIN_CLIP_SECONDS;
  return Math.min(MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, n));
}

export type VideoClipRequest = {
  /** 시작 프레임이 될 이미지(PNG 버퍼). 나노바나나가 만든 그 컷. */
  imagePng: Buffer;
  /** 어떻게 움직일지 — 장면 묘사가 아니라 "카메라·피사체의 움직임"을 적는다. */
  motionPrompt: string;
  seconds: number;
};

/**
 * 클립 한 개를 만들어 mp4 버퍼로 돌려준다. 실패하면 예외 — 호출부가 컷 단위로 잡아
 * 그 컷만 정지 이미지로 떨어뜨릴 수 있게 한다.
 */
export async function generateVideoClip(req: VideoClipRequest): Promise<Buffer> {
  const token = config.replicateApiToken;
  if (!token) throw new Error('REPLICATE_API_TOKEN 가 없습니다');
  const replicate = new Replicate({ auth: token });
  const model = config.seedanceModel;

  // 그림에 닻을 내린다. 움직임만 적어 보내면 모델이 그림에 무엇이 있는지 모른 채
  // 장면을 새로 지어내, 시작 프레임만 같고 내용이 딴 데로 새는 클립이 나왔다.
  // "주어진 이미지를 이어서 움직이게 하라"는 제약을 프롬프트에 명시한다.
  const anchored = [
    'Animate the provided image as the first frame of a live-action video clip.',
    'Keep the same subject, people, setting, framing and color as the image — do not invent new objects, new locations, or on-screen text.',
    `Motion: ${req.motionPrompt}`,
    'Realistic, subtle, continuous motion only. No scene change, no cuts, no camera teleporting.',
  ].join(' ');

  const seconds = normalizeClipSeconds(req.seconds);
  const output = await replicate.run(model as `${string}/${string}`, {
    input: {
      prompt: anchored,
      image: `data:image/png;base64,${req.imagePng.toString('base64')}`,
      duration: seconds,
      resolution: config.seedanceResolution, // '480p'(기본, 최저가) | '720p'
      // 이미지(첫 프레임)를 주는 모드는 모델이 aspect_ratio='adaptive'를 요구한다 —
      // 입력 이미지의 비율(16:9/9:16)을 그대로 따라가므로 별도 지정이 필요 없다.
      aspect_ratio: 'adaptive',
      generate_audio: false,
      watermark: false,
    },
  });

  recordUsage({ kind: 'seedance-video', step: 'liveaction', model, seconds });

  // FileOutput(ReadableStream 구현체) 또는 그 배열로 온다 — 이 모델은 출력이 uri 문자열
  // 하나뿐이라 배열이면 첫 항목만 쓴다.
  const file = Array.isArray(output) ? output[0] : output;
  if (!file) throw new Error('시댄스 응답에 영상이 없습니다');
  if (typeof file === 'string') {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`시댄스 영상 다운로드 실패 (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  const blob = await (file as { blob: () => Promise<Blob> }).blob();
  return Buffer.from(await blob.arrayBuffer());
}
