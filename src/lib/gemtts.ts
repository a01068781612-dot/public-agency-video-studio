import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { recordUsage } from './usage.js';

/**
 * Gemini TTS 나레이션.
 *
 * ElevenLabs 를 쓰다 한국어 원어민 목소리에서 막혔다 — 무료 요금제는 라이브러리 음성을
 * API 로 못 쓰고("Free users cannot use library voices via the API"), 바로 쓸 수 있는
 * 22개는 전부 영어 성우라 한국어를 읽히면 억양이 어색했다.
 *
 * Gemini TTS 는 한국어를 지원하고, 이미지 생성에 쓰는 GEMINI_API_KEY 를 그대로 쓴다
 * (새 계정·새 결제 없음). 아직 preview 라 모델 ID 가 바뀔 수 있어 환경변수로 빼 뒀다.
 */

/** 출력은 헤더 없는 PCM(16bit LE, 모노)이라 재생 가능한 파일로 만들려면 WAV 헤더를 붙여야 한다. */
function wavFromPcm(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2; // 모노 16bit = 2바이트/샘플
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt 청크 크기
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 채널 1
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // 블록 정렬
  header.writeUInt16LE(16, 34); // 비트 심도
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** mimeType 예: "audio/L16;codec=pcm;rate=24000" — 샘플레이트를 여기서 읽는다. */
function sampleRateOf(mimeType: string | undefined): number {
  const m = /rate=(\d+)/.exec(mimeType ?? '');
  return m ? Number(m[1]) : 24000;
}

export async function synthesizeWithGemini(params: {
  text: string;
  outPath: string;
}): Promise<{ durationSec: number }> {
  const { text, outPath } = params;
  const apiKey = config.geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY 가 없습니다 (TTS_PROVIDER=gemini)');
  const ai = new GoogleGenAI({ apiKey });
  const model = config.geminiTtsModel;

  const res = await ai.models.generateContent({
    model,
    // 읽는 방식까지 프롬프트로 지시할 수 있다. 보도·홍보용이라 또박또박 차분하게 시킨다.
    contents: [{ role: 'user', parts: [{ text: `다음 문장을 한국어 뉴스 나레이션처럼 또박또박, 차분하고 신뢰감 있게 읽어라:\n\n${text}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.geminiTtsVoice } } },
    },
  });

  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) {
    throw new Error(`Gemini TTS 실패: 오디오가 없습니다 (finishReason=${res.candidates?.[0]?.finishReason ?? '?'})`);
  }
  const rate = sampleRateOf(part?.inlineData?.mimeType);
  const pcm = Buffer.from(b64, 'base64');
  const wav = wavFromPcm(pcm, rate);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, wav);

  // PCM 은 길이가 바이트 수로 정확히 정해진다 — 파일을 다시 파싱할 필요가 없다.
  const durationSec = pcm.length / (rate * 2);
  if (!(durationSec > 0)) throw new Error(`오디오 길이를 측정할 수 없습니다: ${outPath}`);

  // 오디오는 토큰으로 과금된다. 실제 사용량을 그대로 적어 두면 추정이 필요 없다.
  recordUsage({
    kind: 'gemini-tts',
    step: 'narration',
    model,
    chars: text.length,
    inputTokens: res.usageMetadata?.promptTokenCount,
    outputTokens: res.usageMetadata?.candidatesTokenCount,
  });

  return { durationSec };
}
