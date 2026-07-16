#!/usr/bin/env node
/**
 * Gemini TTS helper: synthesize one narration line to a WAV file.
 *
 * Usage:
 *   node scripts/tts-gemini.mjs --text "Xin chào" --out out.wav [--voice Kore] [--style "Đọc với giọng năng lượng"]
 *
 * The API key is read from (first hit wins):
 *   1. GEMINI_API_KEY env var
 *   2. .env next to this script's repo root (GEMINI_API_KEY=...) — gitignored
 *   3. %USERPROFILE%/.config/orkas-video-studio/gemini.json ({"apiKey": "..."})
 * Output: 24 kHz 16-bit mono WAV.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  for (const envPath of [join(process.cwd(), '.env'), join(repoRoot, '.env')]) {
    try {
      const m = /^\s*GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m.exec(readFileSync(envPath, 'utf8'));
      if (m) return m[1];
    } catch {}
  }
  try {
    const p = join(homedir(), '.config', 'orkas-video-studio', 'gemini.json');
    return JSON.parse(readFileSync(p, 'utf8')).apiKey;
  } catch {
    console.error('No GEMINI_API_KEY found: set the env var, put GEMINI_API_KEY=... in .env at the repo root, or create ~/.config/orkas-video-studio/gemini.json');
    process.exit(1);
  }
}

function wavHeader(pcmBytes, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcmBytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcmBytes, 40);
  return h;
}

const text = arg('text');
const out = arg('out');
const voice = arg('voice', 'Kore');
const style = arg('style', '');
if (!text || !out) {
  console.error('Required: --text "..." --out file.wav');
  process.exit(1);
}

const prompt = style ? `${style}: ${text}` : text;
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  }),
});
if (!res.ok) {
  console.error(`Gemini TTS HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
const body = await res.json();
const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) {
  console.error(`No audio in response: ${JSON.stringify(body).slice(0, 500)}`);
  process.exit(1);
}
const mime = part.inlineData.mimeType || '';
const rate = Number(/rate=(\d+)/.exec(mime)?.[1] || 24000);
const pcm = Buffer.from(part.inlineData.data, 'base64');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
console.log(JSON.stringify({ ok: true, out, seconds: pcm.length / (rate * 2), mime }));
