# Video-AI-Free — Pipeline tạo video TikTok bằng Orkas-VideoStudio (hướng Compose, 0đ)

Tạo video TikTok dạng **motion graphics** (HTML + GSAP render ra MP4) bằng [Orkas-VideoStudio](https://github.com/Orkas-AI/Orkas-VideoStudio), điều khiển qua coding agent (Claude Code).
Không dùng AI footage → **không thuộc diện gắn nhãn AI trên TikTok**, và không tốn phí API.

Video demo hoàn chỉnh: `demo-tiktok/project/render/video-final.mp4` (24s, 1080×1920, 30fps — "3 phím tắt Windows", **có thuyết minh tiếng Việt + phụ đề burn sẵn**). Các bản trung gian: `video-voiced.mp4` (có tiếng, chưa phụ đề), `video.mp4` (bản câm 20s đầu tiên).

## Cấu trúc repo

```
patches/orkas-windows-fixes.patch   # 2 bản vá bắt buộc để Orkas-VideoStudio chạy trên Windows
demo-tiktok/
  project/composition/
    index.html                      # composition: 4 scene, animation GSAP timeline
    design-contract.json            # hợp đồng thiết kế (QA gate đối chiếu với HTML)
    assets/fonts/                   # Be Vietnam Pro (bắt buộc nhúng font cho tiếng Việt)
  project/render/
    video.mp4                       # bản final chất lượng cao
    draft.mp4                       # bản draft
    draft-evidence/                 # frame QA tự động trích ra
```

## Setup từ đầu (máy mới)

Yêu cầu: **Node.js ≥ 20**, Git. Sau đó:

```powershell
# 1. FFmpeg + pnpm
winget install --id Gyan.FFmpeg -e
npm install -g pnpm
# Mở terminal MỚI sau khi cài ffmpeg (để PATH cập nhật)

# 2. Clone Orkas-VideoStudio (commit đã test: ddfef19) và áp bản vá Windows
git clone https://github.com/Orkas-AI/Orkas-VideoStudio.git
cd Orkas-VideoStudio
git checkout ddfef19baa5d6d5303fc7fee8936c7a2c5791c78
git apply ..\patches\orkas-windows-fixes.patch

# 3. Build
pnpm install
pnpm build

# 4. Kiểm tra môi trường — phải thấy "ok": true
node packages\cli\dist\index.js doctor
```

> Nếu upstream đã merge fix Windows (kiểm tra `binaries.ts`/`spawn.ts` trên repo gốc) thì bỏ bước `git apply` và dùng thẳng bản mới nhất.

## Render video

```powershell
cd demo-tiktok
# Draft (nhanh, để duyệt):
node ..\Orkas-VideoStudio\packages\cli\dist\index.js draft project/composition --out project/render/draft.mp4 --quality draft --report project/render/draft-report.json --findings project/composition/qa/inspect.json
# Final (chất lượng cao):
node ..\Orkas-VideoStudio\packages\cli\dist\index.js draft project/composition --out project/render/video.mp4 --quality high --report project/render/final-report.json --findings project/composition/qa/final-inspect.json
```

Lệnh `draft` là QA gate: nó lint HTML, đối chiếu `design-contract.json`, render, rồi tự trích frame kiểm tra. Nếu fail nó trả về lỗi cụ thể kèm gợi ý sửa. Gate giới hạn 2 lần sửa liên tiếp — nếu bị khoá `E_REPAIR_BUDGET_EXCEEDED` do lỗi môi trường (không phải lỗi nội dung), xoá `project/composition/qa/draft-repair-state.json` rồi chạy lại.

## Làm video MỚI — checklist các lỗi đã gặp và cách né

Copy thư mục `demo-tiktok` làm template, sửa `index.html` + `design-contract.json`. Các quy tắc rút ra từ thực tế (QA gate sẽ bắt nếu vi phạm):

1. **Font tiếng Việt phải nhúng local** — Chromium headless của renderer thiếu glyph tiếng Việt (dấu bị lai font serif). Giữ `@font-face` trỏ vào `assets/fonts/BeVietnamPro-*.ttf`. Không được dùng font/CSS/JS từ CDN (gate chặn remote resource).
2. **Frame đầu tiên không được trống** (lỗi `EMPTY_HOOK_FRAME`) — frame 0 chính là ảnh cover TikTok. Đừng cho mọi element fade-in từ `opacity: 0` tại t=0; tiêu đề hook nên hiện sẵn, chỉ animate scale/vị trí.
3. **Mỗi scene fade-out phải có hard-kill** (lỗi `gsap_exit_missing_hard_kill`): sau tween exit thêm `tl.set("#sX .inner", { opacity: 0 }, <giây-kết-thúc-scene>)`.
4. **Tween `fromTo` (hiệu ứng pulse/ring) phải có `immediateRender: false`** — không thì trạng thái "from" hiện tĩnh suốt cả scene.
5. **Copy trong `design-contract.json` phải xuất hiện NGUYÊN VĂN trong 1 element** của HTML (lỗi `HTML_MISSING_SCENE_COPY`) — đừng tách câu bằng `<span>`.
6. **Timeline GSAP phải `paused: true`** và đăng ký vào `window.__timelines["main"]`; mọi tween đặt thời gian tuyệt đối; không dùng `setInterval`/CSS animation.
7. Canvas 9:16 = 1080×1920, khai báo giống nhau ở 3 chỗ: meta viewport, CSS body, `data-width/height` của root.

## Chính sách TikTok (tóm tắt, cập nhật 07/2026)

- Video Compose (motion graphics, edit footage thật) = **không phải synthetic media**, không cần nhãn AI.
- Nếu sau này dùng AI footage (Generate line): **phải bật nhãn AI** — TikTok xác nhận nhãn không giảm reach; nội dung AI *không khai báo* mới bị gỡ/hạn chế.

## Thuyết minh (TTS) + phụ đề — quy trình đã chạy

TTS dùng **Gemini TTS** (key Google AI Studio) qua script `scripts/tts-gemini.mjs` (vì `ovs speak` chỉ nhận endpoint kiểu OpenAI, Gemini không tương thích).

**Cấu hình key (KHÔNG commit key vào git):** copy `.env.example` thành `.env` ở gốc repo và điền key (`GEMINI_API_KEY=...`) — file `.env` đã nằm trong `.gitignore`. Ngoài ra script cũng nhận env var `GEMINI_API_KEY`, hoặc file `%USERPROFILE%\.config\orkas-video-studio\gemini.json` nội dung `{"apiKey":"<key>"}` (ưu tiên theo thứ tự: env var → `.env` → file config).

Quy trình cho một video mới có thuyết minh:

```powershell
# 1. Sinh từng câu thuyết minh (1 câu / scene) → WAV 24kHz
node scripts\tts-gemini.mjs --text "Nội dung câu 1" --out ...\assets\tts\s1.wav --voice Kore --style "Đọc bằng tiếng Việt, giọng trẻ trung năng lượng cao, tốc độ nhanh vừa phải như video TikTok"

# 2. Xem độ dài từng clip (script in ra "seconds") → GIÃN SCENE THEO LỜI ĐỌC (không ép ngược lại):
#    scene_duration ≈ clip_seconds + 0.5s; narration đặt lệch +0.25s sau đầu scene

# 3. Ghép thành 1 track khớp timeline (adelay = mốc đầu scene + 250ms):
ffmpeg -y -i tts\s1.wav -i tts\s2.wav ... -filter_complex "[0]adelay=250|250[a0];[1]adelay=4850|4850[a1];...;[a0][a1]...amix=inputs=4:normalize=0,apad=whole_dur=24[out]" -map "[out]" -ar 44100 -b:a 192k narration.mp3

# 4. Trong composition: thêm <audio src="./assets/narration.mp3" data-start="0" data-duration="24" data-track-index="0" data-volume="1"> vào root,
#    cập nhật data-duration root + các scene, VIẾT scene-map.json (bắt buộc khi có narration: mỗi scene có text + start/duration),
#    cập nhật audio section trong design-contract.json (render_silent: false)

# 5. Render qua draft gate như thường → video-voiced.mp4

# 6. Phụ đề: viết file .srt theo mốc thời gian narration, rồi burn:
node ..\Orkas-VideoStudio\packages\cli\dist\index.js edit burnsubs project/render/video-voiced.mp4 --srt project/render/subtitles.srt --out project/render/video-final.mp4
```

Lỗi đã gặp: **đừng viết cue phụ đề trùng nội dung với CTA bar cuối video** — chữ đè lên nhau. Phần nào đã có chữ to trên hình thì phụ đề bỏ qua hoặc kết thúc sớm.

## Bước tiếp theo (chưa làm)

- **Nhạc nền**: chèn nhạc trending trực tiếp trong app TikTok khi đăng (thường lợi reach hơn nhúng sẵn).
- **Gửi PR bản vá Windows** lên repo gốc Orkas-AI/Orkas-VideoStudio.
