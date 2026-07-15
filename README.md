# Video-AI-Free — Pipeline tạo video TikTok bằng Orkas-VideoStudio (hướng Compose, 0đ)

Tạo video TikTok dạng **motion graphics** (HTML + GSAP render ra MP4) bằng [Orkas-VideoStudio](https://github.com/Orkas-AI/Orkas-VideoStudio), điều khiển qua coding agent (Claude Code).
Không dùng AI footage → **không thuộc diện gắn nhãn AI trên TikTok**, và không tốn phí API.

Video demo hoàn chỉnh: `demo-tiktok/project/render/video.mp4` (20s, 1080×1920, 30fps — "3 phím tắt Windows").

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

## Bước tiếp theo (chưa làm)

- **Thuyết minh (TTS)**: cần API key riêng — set `OVS_TTS_BASE_URL / OVS_TTS_API_KEY / OVS_TTS_MODEL / OVS_TTS_VOICE`, chạy `ovs speak` ra `assets/narration.mp3` rồi thêm thẻ `<audio>` vào composition (xem skill `stage-compose`: `node ...\index.js skill stage-compose`). Chi phí ~vài trăm đồng/video.
- **Nhạc nền**: chèn nhạc trending trực tiếp trong app TikTok khi đăng (thường lợi reach hơn nhúng sẵn).
- **Gửi PR bản vá Windows** lên repo gốc Orkas-AI/Orkas-VideoStudio.
