import { config } from '../config.js';
import { synthesizeSpeech as synthesizeWithElevenLabs } from './elevenlabs.js';
import { synthesizeWithGemini } from './gemtts.js';

/**
 * 나레이션 생성 진입점 — provider 를 여기서 한 번만 고른다.
 *
 * 파일 확장자가 provider 마다 다르다(ElevenLabs=mp3, Gemini=wav). 호출부가 확장자를
 * 직접 만들면 provider 를 바꿀 때마다 경로가 어긋나므로, 확장자도 여기서 알려준다.
 */
export const audioExt = (): 'mp3' | 'wav' => (config.ttsProvider === 'gemini' ? 'wav' : 'mp3');

export function synthesizeSpeech(params: { text: string; outPath: string }): Promise<{ durationSec: number }> {
  return config.ttsProvider === 'gemini' ? synthesizeWithGemini(params) : synthesizeWithElevenLabs(params);
}
