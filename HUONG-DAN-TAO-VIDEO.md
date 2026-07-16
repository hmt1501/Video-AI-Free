# Hướng dẫn tạo một video TikTok hoàn chỉnh (từ ý tưởng → MP4 có thuyết minh + phụ đề)

Playbook cho các video TIẾP THEO, dựa trên quy trình đã chạy thành công với video demo.
Yêu cầu: đã setup xong theo [README.md](README.md) (`ovs doctor` trả về `ok: true`, có key trong `.env`).

> **Cách nhanh nhất**: dán checklist này cho Claude Code kèm chủ đề, nó tự làm hết.
> Đọc tiếp nếu muốn hiểu/can thiệp từng bước.

---

## Bước 0 — Quyết định 4 thứ TRƯỚC khi làm

| Quyết định | Khuyến nghị | Ghi chú |
|---|---|---|
| **Chủ đề + góc khai thác** | 1 chủ đề hẹp, có "gap kiến thức" | "3 phím tắt ít người biết" tốt hơn "hướng dẫn dùng Windows" |
| **Thời lượng** | 20–35 giây | Dưới 20s khó nhồi 3 ý; trên 45s tụt retention nếu không có kịch tính |
| **Số scene** | 4–6 (hook + 3–4 ý + CTA) | Mỗi scene đúng 1 ý. CTA có thể gộp vào scene cuối |
| **Giọng đọc** | `Kore` (nữ, rõ, năng lượng) | Thử giọng khác: đổi `--voice` (Puck, Zephyr, Charon, Fenrir...) — chạy thử 1 câu trước khi làm cả video |

## Bước 1 — Viết kịch bản (script)

Viết ra 2 cột cho MỖI scene: **lời đọc** và **chữ trên hình** (không giống nhau!).

Quy tắc lời đọc (narration):
- Tốc độ TTS thực tế đo được ≈ **2.5–3 từ/giây** → câu 15 từ ≈ 5–6 giây. Tính trước tổng thời lượng từ đây.
- Hook (scene 1) phải nêu lý do xem trong ≤ 1 câu: con số + sự tò mò ("3 phím tắt mà 90% người dùng không hề biết").
- Viết số dạng chữ đọc được: "90 phần trăm" thay vì "90%" (TTS đọc ổn hơn), "Windows cộng V" thay vì "Win+V".
- Câu cuối là CTA: "Follow để..."

Quy tắc chữ trên hình (on-screen copy):
- Tiêu đề scene ≤ 5 từ, mô tả ≤ 12–16 từ. Chữ trên hình là TÓM TẮT của lời đọc, không phải bản chép lại.
- Chữ nào ghi trong `design-contract.json` phải xuất hiện NGUYÊN VĂN trong HTML (QA đối chiếu từng chuỗi).

## Bước 2 — Tạo workspace từ template

```powershell
# Từ gốc repo:
Copy-Item -Recurse demo-tiktok video-<ten-chu-de>
cd video-<ten-chu-de>
# Xoá sản phẩm cũ, GIỮ fonts + gsap:
Remove-Item -Recurse -Force project\render, project\composition\qa, project\composition\assets\tts, project\composition\assets\narration.mp3
```

Giữ nguyên: `assets/fonts/` (Be Vietnam Pro — bắt buộc cho tiếng Việt), `assets/vendor/gsap.min.js`.

## Bước 3 — Sinh giọng đọc TRƯỚC, đo giây, rồi mới chốt timeline

Làm audio trước hình — vì scene phải giãn theo lời đọc, không ép ngược lại.

```powershell
# Mỗi scene 1 câu (chạy từ gốc repo):
node scripts\tts-gemini.mjs --text "<lời đọc scene 1>" --out video-<ten>\project\composition\assets\tts\s1.wav --voice Kore --style "Đọc bằng tiếng Việt, giọng trẻ trung năng lượng cao, tốc độ nhanh vừa phải như video TikTok"
# ... lặp cho s2, s3, s4
```

Script in ra `"seconds"` của từng clip. Từ đó tính timeline:

```
duration_scene  = seconds_clip + 0.5   (scene cuối: + 1.5–2s để CTA đứng được)
start_scene_N   = start_(N-1) + duration_(N-1)
narration bắt đầu tại: start_scene + 0.25s
TỔNG = duration root của composition (làm tròn 0.5s)
```

Ghép thành 1 track (mốc `adelay` = (start_scene + 0.25) × 1000, đơn vị ms):

```powershell
cd video-<ten>\project\composition\assets
ffmpeg -y -i tts\s1.wav -i tts\s2.wav -i tts\s3.wav -i tts\s4.wav -filter_complex "[0]adelay=250|250[a0];[1]adelay=<ms>|<ms>[a1];[2]adelay=<ms>|<ms>[a2];[3]adelay=<ms>|<ms>[a3];[a0][a1][a2][a3]amix=inputs=4:normalize=0,apad=whole_dur=<TỔNG>[out]" -map "[out]" -ar 44100 -b:a 192k narration.mp3
```

Kiểm tra: `ffprobe -v error -show_entries format=duration -of csv=p=0 narration.mp3` phải ra đúng TỔNG.

## Bước 4 — Cập nhật 3 file composition

Sửa theo timeline vừa chốt (cả 3 file phải KHỚP NHAU, QA đối chiếu chéo):

1. **`design-contract.json`** — đổi: chủ đề/aesthetic (nhớ điền `anti_template_check`: nói rõ đã bỏ lối thiết kế generic nào, thay bằng "signature device" gì gắn với chủ đề), danh sách scene (start/duration/copy), màu accent, `audio.target_duration`.
2. **`index.html`** — nội dung từng scene + toàn bộ mốc thời gian:
   - Root: `data-duration="<TỔNG>"`; mỗi clip: `data-start`/`data-duration` theo timeline.
   - Thẻ audio trong root: `<audio src="./assets/narration.mp3" data-start="0" data-duration="<TỔNG>" data-track-index="0" data-volume="1">`.
   - GSAP: entrance đầu scene, hiệu ứng nhấn ~1.5s sau đó, exit fade tại (cuối scene − 0.45s), và `tl.set(..., {opacity:0}, <cuối scene>)`.
3. **`scene-map.json`** — canvas.duration = TỔNG; mỗi scene: `id, start, duration, headline, narration` (đúng nguyên văn câu đã TTS).

Checklist kỹ thuật (QA sẽ chặn nếu sai — chi tiết trong [README.md](README.md)):
frame 0 không được trống (tiêu đề hook hiện sẵn, chỉ animate scale/y) · fromTo cần `immediateRender: false` · copy khớp nguyên văn · font local · timeline `paused: true` đăng ký vào `window.__timelines["main"]`.

## Bước 5 — Render qua QA gate

```powershell
cd video-<ten>
# Draft trước (nhanh):
node ..\Orkas-VideoStudio\packages\cli\dist\index.js draft project/composition --out project/render/draft.mp4 --quality draft --report project/render/draft-report.json --findings project/composition/qa/inspect.json
```

- Gate fail → đọc `issues` trong output, sửa đúng file nó chỉ (`repair_target`), chạy lại. Tối đa 2 lần sửa; nếu bị khoá vì lỗi môi trường thì xoá `project/composition/qa/draft-repair-state.json`.
- Gate pass → mở `draft.mp4` + xem các ảnh trong `project/render/draft-evidence/` (soi: chữ có bị tràn/đè, font tiếng Việt có lai serif, hiệu ứng có hiện sai lúc).
- Ưng rồi thì render final:

```powershell
node ..\Orkas-VideoStudio\packages\cli\dist\index.js draft project/composition --out project/render/video-voiced.mp4 --quality high --report project/render/final-report.json --findings project/composition/qa/final-inspect.json
```

## Bước 6 — Phụ đề

Viết `project/render/subtitles.srt` theo mốc narration (mốc bắt đầu = lúc câu được đọc, xem Bước 3):
- Mỗi cue ≤ 2 dòng, mỗi dòng ≤ ~30 ký tự. Câu dài tách thành 2 cue.
- **Không viết cue trùng nội dung với chữ to đang hiện trên hình** (nhất là CTA bar cuối) — chữ sẽ đè nhau.

```powershell
node ..\Orkas-VideoStudio\packages\cli\dist\index.js edit burnsubs project/render/video-voiced.mp4 --srt project/render/subtitles.srt --out project/render/video-final.mp4
```

Kiểm tra lần cuối: trích 2–3 frame lúc có phụ đề (`ffmpeg -ss <giây> -i video-final.mp4 -frames:v 1 check.png`) soi chồng chữ, rồi mở video nghe toàn bộ 1 lần (khớp tiếng-hình, không hụt câu).

## Bước 7 — Đăng TikTok

- Upload `video-final.mp4` thủ công qua app/web.
- **Không cần bật nhãn AI** — video là motion graphics, không phải AI footage. (Nếu video nào sau này có dùng ảnh/cảnh AI thì phải bật nhãn.)
- Chèn nhạc nền trending trong app, volume thấp (~20%) để không át giọng đọc.
- Cover: TikTok mặc định lấy frame đầu — hook đã được thiết kế hiện sẵn từ frame 0 nên cứ để mặc định.
- Caption + 3–5 hashtag đúng ngách; đăng khung giờ đều đặn nếu làm series.

---

## Prompt mẫu giao cho Claude Code (mỗi video mới)

```text
Làm một video TikTok mới theo HUONG-DAN-TAO-VIDEO.md trong repo này.
Chủ đề: <CHỦ ĐỀ CỦA BẠN>
Thời lượng mục tiêu: ~25 giây, 4 scene (hook + 3 ý + CTA gộp scene cuối), giọng Kore.
Yêu cầu: viết kịch bản (lời đọc + chữ trên hình) và đưa tôi duyệt TRƯỚC khi sinh TTS;
sau khi tôi duyệt thì làm tiếp một mạch đến video-final.mp4 (render qua draft gate,
tự soi frame kiểm tra, burn phụ đề), xong báo lại kèm đường dẫn file.
```

Bước "duyệt kịch bản" đáng giữ lại: sửa 1 câu chữ trước khi TTS mất 10 giây, sửa sau khi đã render mất vài phút.
