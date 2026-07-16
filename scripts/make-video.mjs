#!/usr/bin/env node
/**
 * One-command TikTok video generator (no agent needed).
 *
 * Usage:
 *   node scripts/make-video.mjs video-configs/my-video.json
 *   node scripts/make-video.mjs video-configs/my-video.json --skip-tts   (reuse existing wavs)
 *
 * Reads a JSON config (see video-configs/hr-day.json), then:
 *   TTS per scene -> measure -> timeline -> generate composition (HTML +
 *   design-contract + scene-map) -> mix narration -> ovs draft gate (high)
 *   -> auto SRT -> burnsubs -> video-final.mp4
 *
 * Requirements: ffmpeg on PATH, Orkas-VideoStudio built at ../Orkas-VideoStudio
 * (override with OVS_CLI env), GEMINI_API_KEY in env/.env/config (see tts-gemini.mjs).
 * NOTE: avoid "&", "<", ">" in config texts (QA copy-matching is literal).
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OVS_CLI = process.env.OVS_CLI || join(ROOT, 'Orkas-VideoStudio', 'packages', 'cli', 'dist', 'index.js');
const TTS_SCRIPT = join(ROOT, 'scripts', 'tts-gemini.mjs');
const TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'];
const ACCENTS = ['#4cc2ff', '#b18cff', '#ffb84c', '#ff7a6b', '#8aff80'];
const RPM_SLEEP_MS = 21000;

const die = (m) => { console.error(`\n[make-video] LOI: ${m}`); process.exit(1); };
const log = (m) => console.log(`[make-video] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = (n) => Math.round(n * 10) / 10;

// ---------- config ----------
const cfgPath = process.argv[2];
if (!cfgPath) die('cach dung: node scripts/make-video.mjs <config.json> [--skip-tts]');
const skipTts = process.argv.includes('--skip-tts');
const cfg = JSON.parse(readFileSync(resolve(cfgPath), 'utf8'));
for (const k of ['name', 'voice', 'hook', 'scenes', 'cta']) if (!cfg[k]) die(`config thieu truong "${k}"`);
if (!cfg.hook.title || !cfg.hook.narration) die('hook can title + narration');
for (const [i, s] of cfg.scenes.entries())
  for (const k of ['label', 'title', 'desc', 'narration']) if (!s[k]) die(`scenes[${i}] thieu "${k}"`);
const style = cfg.style || 'Đọc bằng tiếng Việt, giọng trẻ trung năng lượng cao, tốc độ nhanh vừa phải như video TikTok';

const work = join(ROOT, `video-${cfg.name}`);
const comp = join(work, 'project', 'composition');
const rend = join(work, 'project', 'render');
mkdirSync(join(comp, 'assets', 'tts'), { recursive: true });
mkdirSync(rend, { recursive: true });
for (const d of ['fonts', 'vendor']) {
  const src = join(ROOT, 'demo-tiktok', 'project', 'composition', 'assets', d);
  if (!existsSync(join(comp, 'assets', d))) cpSync(src, join(comp, 'assets', d), { recursive: true });
}
if (!existsSync(OVS_CLI)) die(`khong thay ovs CLI tai ${OVS_CLI} — build Orkas-VideoStudio truoc (xem README)`);

// ---------- 1. TTS + measure ----------
const lines = [{ id: 'hook', text: cfg.hook.narration }, ...cfg.scenes.map((s, i) => ({ id: `sc${i + 1}`, text: s.narration }))];
const wavSeconds = {};
for (const [li, l] of lines.entries()) {
  const out = join(comp, 'assets', 'tts', `${l.id}.wav`);
  if (skipTts && existsSync(out)) { wavSeconds[l.id] = (statSync(out).size - 44) / 48000; continue; }
  let ok = false;
  for (const model of TTS_MODELS) {
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const r = spawnSync(process.execPath, [TTS_SCRIPT, '--text', l.text, '--out', out, '--voice', cfg.voice, '--style', style], {
        env: { ...process.env, GEMINI_TTS_MODEL: model }, encoding: 'utf8',
      });
      if (r.status === 0) { ok = true; break; }
      if (!/429/.test(r.stderr || '')) die(`TTS loi (${l.id}): ${(r.stderr || '').slice(0, 300)}`);
      log(`quota 429 (${model}, ${l.id}) — cho 30s roi thu lai...`);
      await sleep(30000);
    }
    if (ok) break;
    log(`het quota model, chuyen model tiep theo...`);
  }
  if (!ok) die(`het quota TTS o tat ca model cho "${l.id}" — thu lai sau khi quota reset (nua dem gio Thai Binh Duong)`);
  wavSeconds[l.id] = (statSync(out).size - 44) / 48000;
  log(`TTS ${l.id}: ${wavSeconds[l.id].toFixed(2)}s`);
  if (li < lines.length - 1) await sleep(RPM_SLEEP_MS);
}

// ---------- 2. timeline ----------
const scenes = []; // {id, start, dur, narrAt}
let t = 0;
for (const [i, l] of lines.entries()) {
  const isLast = i === lines.length - 1;
  const dur = r1(wavSeconds[l.id] + (isLast ? 2.0 : 0.5));
  scenes.push({ id: l.id, start: r1(t), dur, narrAt: r1(t + 0.25), narrSec: wavSeconds[l.id] });
  t = r1(t + dur);
}
const TOTAL = t;
log(`timeline: ${scenes.map((s) => s.dur).join(' / ')} = ${TOTAL}s`);

// ---------- 3. mix narration ----------
{
  const inputs = lines.flatMap((l) => ['-i', join(comp, 'assets', 'tts', `${l.id}.wav`)]);
  const delays = scenes.map((s, i) => `[${i}]adelay=${Math.round(s.narrAt * 1000)}|${Math.round(s.narrAt * 1000)}[a${i}]`).join(';');
  const mix = scenes.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${scenes.length}:normalize=0,apad=whole_dur=${TOTAL}[out]`;
  const r = spawnSync('ffmpeg', ['-y', ...inputs, '-filter_complex', `${delays};${mix}`, '-map', '[out]', '-ar', '44100', '-b:a', '192k', join(comp, 'assets', 'narration.mp3'), '-loglevel', 'error'], { encoding: 'utf8' });
  if (r.status !== 0) die(`ffmpeg mix loi: ${r.stderr}\n(ffmpeg co tren PATH chua? mo terminal moi sau khi cai)`);
  log('narration.mp3 da tron xong');
}

// ---------- 4. generate composition ----------
const A = (i) => ACCENTS[i % ACCENTS.length];
const hookA = A(0);
const sceneHtml = cfg.scenes.map((s, i) => {
  const sc = scenes[i + 1];
  const a = A(i);
  const high = i % 2 === 1; // alternate layout
  const innerStyle = high ? 'justify-content: flex-start; padding-top: 320px; gap: 60px;' : 'justify-content: center; gap: 60px;';
  const isLast = i === cfg.scenes.length - 1;
  return `
      <div id="sc${i + 1}" class="clip" data-start="${sc.start}" data-duration="${sc.dur}" data-track-index="1">
        <div class="inner" style="${innerStyle}${isLast ? ' padding-bottom: 260px;' : ''}">
          <div class="labelchip lbl${i + 1}" style="color: ${a};"><span class="dot" style="background: ${a};"></span>${esc(s.label)}</div>
          <div class="title trow${i + 1}" style="color: ${a};${high ? ' margin-top: 90px;' : ''}">${esc(s.title)}</div>
          <div class="desc-card dcard${i + 1}"><div class="body-line">${esc(s.desc)}</div></div>
        </div>${isLast ? `\n        <div class="cta-bar cta-el" style="background: ${a};">${esc(cfg.cta)}</div>` : ''}
      </div>`;
}).join('\n');

const sceneTl = cfg.scenes.map((s, i) => {
  const sc = scenes[i + 1];
  const end = r1(sc.start + sc.dur);
  const isLast = i === cfg.scenes.length - 1;
  let js = `
      tl.from(".lbl${i + 1}", { opacity: 0, scale: 0.7, y: -50, duration: 0.55, ease: "back.out(1.7)" }, ${r1(sc.start + 0.05)})
        .from(".trow${i + 1}", { opacity: 0, y: 70, duration: 0.55, ease: "power3.out" }, ${r1(sc.start + 0.35)})
        .from(".dcard${i + 1}", { opacity: 0, y: 70, duration: 0.55, ease: "power3.out" }, ${r1(sc.start + 0.65)})
        .to(".lbl${i + 1}", { y: -14, duration: 0.7, yoyo: true, repeat: 1, ease: "sine.inOut" }, ${r1(sc.start + 1.5)});`;
  if (!isLast) js += `
      tl.to("#sc${i + 1} .inner", { opacity: 0, y: -40, duration: 0.4, ease: "power2.in" }, ${r1(end - 0.45)})
        .set("#sc${i + 1} .inner", { opacity: 0 }, ${end});`;
  else js += `
      tl.from(".cta-el", { opacity: 0, y: 160, duration: 0.6, ease: "power3.out" }, ${r1(TOTAL - 1.6)})
        .to(".cta-el", { scale: 1.04, duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" }, ${r1(TOTAL - 0.8)});`;
  return js;
}).join('\n');

const hookEnd = r1(scenes[0].start + scenes[0].dur);
writeFileSync(join(comp, 'index.html'), `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="./assets/vendor/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Be Vietnam Pro"; src: url("./assets/fonts/BeVietnamPro-SemiBold.ttf") format("truetype"); font-weight: 500 600; }
      @font-face { font-family: "Be Vietnam Pro"; src: url("./assets/fonts/BeVietnamPro-ExtraBold.ttf") format("truetype"); font-weight: 700 800; }
      @font-face { font-family: "Be Vietnam Pro"; src: url("./assets/fonts/BeVietnamPro-Black.ttf") format("truetype"); font-weight: 900; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #0b0f1a; }
      body { font-family: "Be Vietnam Pro", Arial, sans-serif; color: #f4f7ff; }
      .clip { position: absolute; inset: 0; }
      .inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; }
      .chip { display: inline-block; padding: 18px 44px; border-radius: 999px; border: 3px solid #8b93b0; color: #8b93b0; font-size: 48px; font-weight: 800; letter-spacing: 6px; }
      .labelchip { display: inline-flex; align-items: center; gap: 28px; padding: 30px 64px; background: linear-gradient(180deg, #2a3350, #1b2138); border: 3px solid #3a4568; border-radius: 36px; box-shadow: 0 14px 0 #0e1326, 0 24px 40px rgba(0,0,0,0.55); font-size: 110px; font-weight: 900; letter-spacing: 3px; }
      .labelchip .dot { width: 24px; height: 24px; border-radius: 50%; }
      .title { font-size: 100px; font-weight: 900; line-height: 1.12; text-align: center; max-width: 920px; }
      .body-line { font-size: 54px; font-weight: 600; color: #f4f7ff; text-align: center; max-width: 888px; line-height: 1.35; }
      .desc-card { background: rgba(27,33,56,0.85); border: 3px solid #3a4568; border-radius: 36px; padding: 44px 56px; max-width: 888px; }
      .cta-bar { position: absolute; left: 96px; right: 96px; bottom: 160px; color: #14100a; border-radius: 36px; padding: 44px 32px; font-size: 56px; font-weight: 900; text-align: center; }
      .barwrap { position: absolute; left: 96px; right: 96px; bottom: 92px; height: 12px; border-radius: 999px; background: rgba(139,147,176,0.28); overflow: hidden; }
      .barfill { width: 100%; height: 100%; border-radius: 999px; background: linear-gradient(90deg, ${ACCENTS.slice(0, 4).join(', ')}); transform-origin: left center; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <audio id="narration" src="./assets/narration.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="0" data-volume="1"></audio>
      <div id="bar" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="2"><div class="barwrap"><div class="barfill"></div></div></div>
      <div id="hook" class="clip" data-start="0" data-duration="${scenes[0].dur}" data-track-index="1">
        <div class="inner" style="justify-content: center; gap: 56px;">
          ${cfg.hook.chip ? `<div class="chip hook-chip">${esc(cfg.hook.chip)}</div>` : ''}
          <div class="title hook-title" style="font-size: 138px;">${esc(cfg.hook.title)}</div>
          ${cfg.hook.sub ? `<div class="body-line hook-sub" style="font-size: 60px; font-weight: 800; color: ${hookA};">${esc(cfg.hook.sub)}</div>` : ''}
        </div>
      </div>
${sceneHtml}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.set(".barfill", { scaleX: 0 }, 0).to(".barfill", { scaleX: 1, duration: ${TOTAL}, ease: "none" }, 0);
      tl.from(".hook-title", { scale: 0.9, y: 70, duration: 0.6, ease: "power3.out" }, 0.0)${cfg.hook.chip ? `
        .from(".hook-chip", { opacity: 0, y: -40, duration: 0.5, ease: "power3.out" }, 0.1)` : ''}${cfg.hook.sub ? `
        .from(".hook-sub", { opacity: 0, y: 60, duration: 0.55, ease: "power3.out" }, 0.35)` : ''}
        .to("#hook .inner", { opacity: 0, y: -40, duration: 0.4, ease: "power2.in" }, ${r1(hookEnd - 0.45)})
        .set("#hook .inner", { opacity: 0 }, ${hookEnd});
${sceneTl}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`);

writeFileSync(join(comp, 'design-contract.json'), JSON.stringify({
  canvas: { aspect_ratio: '9:16', width: 1080, height: 1920, duration: TOTAL, fps: 30, language: 'vi' },
  aesthetic: {
    subject_world: cfg.subject || cfg.name,
    audience: cfg.audience || 'Vietnamese TikTok viewers',
    one_job: cfg.one_job || `Deliver "${cfg.hook.title}" fast enough to earn a follow`,
    tone: 'energetic, fast-paced',
    signature_device: 'Oversized label chips per scene with a persistent bottom progress bar',
    aesthetic_risk: 'Chips could read as static labels if pop-in motion is too subtle',
    anti_template_check: 'Rejected plain centered title cards; recurring label-chip device plus per-scene accent rotation and a video-long progress bar',
  },
  scenes: [
    { id: 'hook', start: scenes[0].start, duration: scenes[0].dur, copy: [cfg.hook.chip, cfg.hook.title, cfg.hook.sub].filter(Boolean), visual_focus: 'stacked type hook', layout: 'full-frame stacked type' },
    ...cfg.scenes.map((s, i) => ({
      id: `sc${i + 1}`, start: scenes[i + 1].start, duration: scenes[i + 1].dur,
      copy: [s.label, s.title, s.desc, ...(i === cfg.scenes.length - 1 ? [cfg.cta] : [])],
      visual_focus: 'label chip, title, description card', layout: i % 2 === 1 ? 'chip high, card low' : 'chip center, card below',
    })),
  ],
  layout_boxes: { safe_text_box: 'x 96..984, y 260..1660', visual_box: 'center band', caption_box: 'bottom band for SRT + progress bar', max_labels_per_scene: 3 },
  typography_tokens: { roles: { title: '100-138px w900', label: '110px w900 chip', body: '54px w600' }, floors: { title_min_px: 72, body_min_px: 42, safe_margin_px: 96, max_text_blocks_per_scene: 2 } },
  color_tokens: {
    background: { value: '#0b0f1a', rationale: 'dark navy brand base' },
    surface: { value: '#1b2138', rationale: 'chips and cards' },
    text: { value: '#f4f7ff', rationale: 'primary type' },
    muted: { value: '#8b93b0', rationale: 'secondary' },
    ...Object.fromEntries(cfg.scenes.map((_, i) => [`accent_${i + 1}`, { value: A(i), rationale: `scene ${i + 1} accent` }])),
  },
  motion_budget: { max_animated_groups_per_scene: 3, allowed_transitions: ['fade', 'slide-up', 'chip-pop', 'progress-fill'], easing: 'power3.out', moving_groups: 'inner, label chip, card/CTA, progress fill', meaning: 'chip pop marks each new beat; the bar is elapsed time' },
  scene_variation: 'hook stacked type; scenes alternate chip position and rotate accents; final scene adds CTA bar; progress bar persists',
  audio: { narration_owner: 'compose', path: 'assets/narration.mp3', target_duration: TOTAL, render_silent: false, tts: `Gemini TTS voice ${cfg.voice}, per-scene clips mixed at +0.25s offsets` },
}, null, 2));

writeFileSync(join(comp, 'scene-map.json'), JSON.stringify({
  canvas: { width: 1080, height: 1920, duration: TOTAL, language: 'vi' },
  audio: { narration: 'assets/narration.mp3' },
  scenes: [
    { id: 'hook', start: scenes[0].start, duration: scenes[0].dur, headline: cfg.hook.title, narration: cfg.hook.narration },
    ...cfg.scenes.map((s, i) => ({ id: `sc${i + 1}`, start: scenes[i + 1].start, duration: scenes[i + 1].dur, headline: s.title, narration: s.narration })),
  ],
}, null, 2));
log('composition da sinh xong (index.html + design-contract + scene-map)');

// ---------- 5. render through the QA gate ----------
{
  const r = spawnSync(process.execPath, [OVS_CLI, 'draft', join(work, 'project', 'composition'), '--out', join(rend, 'video-voiced.mp4'), '--quality', 'high', '--report', join(rend, 'final-report.json'), '--findings', join(comp, 'qa', 'inspect.json')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let ok = false;
  try { ok = JSON.parse((r.stdout || '').trim()).ok === true; } catch {}
  if (!ok) die(`draft gate FAIL — xem ${join(rend, 'final-report.json')}\n${(r.stdout || r.stderr || '').slice(0, 1500)}`);
  log('render + QA gate: OK');
}

// ---------- 6. auto SRT + burnsubs ----------
function fmt(sec) {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
}
const cues = [];
for (const [i, l] of lines.entries()) {
  const sc = scenes[i];
  const isLast = i === lines.length - 1;
  const capEnd = isLast ? TOTAL - 1.7 : sc.narrAt + sc.narrSec; // never overlap the CTA bar
  const words = l.text.replace(/\s+/g, ' ').trim().split(' ');
  const chunks = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 34) { chunks.push(cur.trim()); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) chunks.push(cur);
  const totalChars = chunks.reduce((a, c) => a + c.length, 0);
  let tcur = sc.narrAt;
  for (const c of chunks) {
    const dur = Math.max(0.9, (capEnd - sc.narrAt) * (c.length / totalChars));
    const end = Math.min(capEnd, tcur + dur);
    const mid = c.length > 22 ? c.lastIndexOf(' ', Math.floor(c.length / 2) + 6) : -1;
    cues.push(`${cues.length + 1}\n${fmt(tcur)} --> ${fmt(end)}\n${mid > 0 ? c.slice(0, mid) + '\n' + c.slice(mid + 1) : c}\n`);
    tcur = end;
    if (tcur >= capEnd) break;
  }
}
writeFileSync(join(rend, 'subtitles.srt'), cues.join('\n'));
{
  const r = spawnSync(process.execPath, [OVS_CLI, 'edit', 'burnsubs', join(rend, 'video-voiced.mp4'), '--srt', join(rend, 'subtitles.srt'), '--out', join(rend, 'video-final.mp4')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) die(`burnsubs loi: ${(r.stderr || r.stdout || '').slice(0, 800)}`);
}

log('');
log('====================================================');
log(`XONG! Video: ${join(rend, 'video-final.mp4')}`);
log(`Thoi luong: ${TOTAL}s · Frame QA: ${join(rend, 'draft-evidence')}`);
log('====================================================');
