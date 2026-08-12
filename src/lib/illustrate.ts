import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config, PUBLIC_DIR, ASPECT, WIDTH, HEIGHT } from '../config.js';
import { buildIllustrationPrompt, resolveArtStyle, type ArtStyle } from './artStyle.js';
import { generateImage } from './imagegen.js';

/** 일러스트 저장 폴더 (staticFile 로 참조하기 위해 public 아래). */
export const IMG_DIR = path.join(PUBLIC_DIR, 'img');

/**
 * 씬별 일러스트를 생성해 public/img/{id}.png 에 저장한다.
 *
 * 화풍은 ART_STYLE 로 고른다(src/lib/artStyle.ts). 예전에는 흑백 등각 라인아트가
 * 코드에 하드코딩돼 있어서 모든 영상이 같은 그림체로 나왔다.
 *
 * @param dark true 면 다크(짙은 배경) 변형으로 그린다(manifest.theme==='dark'일 때).
 * @returns { [sceneId]: 'img/{id}.png' } 상대경로 맵. 키 없으면 생성 실패(폴백은 호출부).
 */
export async function generateIllustrations(
  scenes: { id: string; illustration?: string; heading: string }[],
  dark = false,
  /**
   * 이 영상 전체의 맥락(주제·대상기관). 씬 묘사만으로는 어느 나라 무슨 현장인지 알 수 없어
   * 주제에서 벗어난 그림이 나온다 — 그림이 어긋나면 그 그림으로 만드는 실사 클립까지 함께 어긋난다.
   */
  context?: { topic?: string; agencyLabel?: string },
): Promise<Record<string, string>> {
  const provider = config.imageProvider === 'gemini' ? 'gemini' : 'openai';
  // provider 별로 필요한 키가 다르다. 없으면 조용히 건너뛰고 호출부가 폴백한다.
  if (provider === 'gemini' ? !config.geminiApiKey : !config.openaiApiKey) return {};

  const style: ArtStyle = resolveArtStyle(config.artStyle);
  fs.mkdirSync(IMG_DIR, { recursive: true });
  console.log(`  · 일러스트 화풍: ${style.label} (${style.id}) / provider=${provider}`);

  const out: Record<string, string> = {};
  // 이미지 API 레이트리밋을 고려해 소규모 동시성(3)으로 처리.
  const CONCURRENCY = 3;
  let idx = 0;
  async function worker() {
    while (idx < scenes.length) {
      const i = idx++;
      const scene = scenes[i];
      const base = (scene.illustration || scene.heading || 'a simple concept about AI').trim();
      // 씬 묘사 앞에 영상 전체의 맥락을 붙인다. 같은 "회의 장면"이라도 무슨 주제의 어느 기관
      // 회의인지가 붙어야 주제에서 벗어나지 않는다(맥락 없이 뽑았을 때 미국 소방서가 나온 적이 있다).
      const ctx = [
        context?.agencyLabel
          ? `Context: a public information video for ${context.agencyLabel}, a South Korean government agency.`
          : '',
        context?.topic ? `The video is about: ${context.topic}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const subject = ctx ? `${ctx} This shot shows: ${base}` : base;
      try {
        const buf = await generateImage({
          prompt: buildIllustrationPrompt(style, subject, dark),
          step: 'illustration',
          provider,
          // 세로 영상이면 그림도 세로로 뽑아야 한다 — 가로 그림을 세로로 크롭하면
          // 화면 대부분이 잘려나가 무엇을 그렸는지 알 수 없게 된다.
          aspect: ASPECT,
        });
        const rel = `img/${scene.id}.png`;
        // 모델마다 나오는 비율이 조금씩 달라(OpenAI mini 는 3:2) 최종 해상도로 맞춰 크롭한다.
        await sharp(buf)
          .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
          .png()
          .toFile(path.join(PUBLIC_DIR, rel));
        out[scene.id] = rel;
        console.log(`    · 일러스트 ${i + 1}/${scenes.length} (${scene.id}) 생성`);
      } catch (e) {
        console.warn(`    · 일러스트 ${scene.id} 실패(무시):`, (e as Error).message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));
  return out;
}
