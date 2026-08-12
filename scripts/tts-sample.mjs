// 나레이션 목소리 시청 — 여러 음성으로 같은 문장을 읽혀 wav 로 저장한다.
// Gemini TTS 는 음성이 30종이라 문서 설명만으로는 고를 수 없어서, 실제로 들어보고 정한다.
//   node scripts/tts-sample.mjs "읽을 문장" Kore,Puck,Aoede
import fs from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const text = process.argv[2] || '고용노동부가 청년 일자리 지원 대책을 발표했습니다. 지난해 신규 입사한 청년 6만 5천여 명이 대상입니다.';
const voices = (process.argv[3] || 'Kore').split(',').map((v) => v.trim()).filter(Boolean);
const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY 없음'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

await fs.mkdir('out/voices', { recursive: true });
console.log(`모델: ${model} · 문장 ${text.length}자 · 음성 ${voices.length}종`);

for (const voice of voices) {
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `다음 문장을 한국어 뉴스 나레이션처럼 또박또박, 차분하고 신뢰감 있게 읽어라:\n\n${text}` }] }],
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) { console.log(`  ❌ ${voice}: 오디오 없음 (finish=${res.candidates?.[0]?.finishReason})`); continue; }
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
    const pcm = Buffer.from(part.inlineData.data, 'base64');
    await fs.writeFile(`out/voices/${voice}.wav`, wav(pcm, rate));
    const sec = pcm.length / (rate * 2);
    const u = res.usageMetadata || {};
    console.log(`  ✅ ${voice}: ${sec.toFixed(1)}초 · 초당 ${(text.length / sec).toFixed(2)}자 · 토큰 입력 ${u.promptTokenCount} / 출력 ${u.candidatesTokenCount}`);
  } catch (e) {
    console.log(`  ❌ ${voice}: ${e.message?.slice(0, 200)}`);
  }
}
