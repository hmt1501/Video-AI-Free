# Pipeline TỰ ĐỘNG 1 lệnh — hướng dẫn đầy đủ

Tạo video TikTok hoàn chỉnh (thuyết minh + phụ đề) **không cần agent**: viết kịch bản vào 1 file JSON → chạy 1 lệnh.

Yêu cầu: đã setup xong theo [README.md](README.md) (Orkas-VideoStudio đã build, ffmpeg trên PATH, key Gemini trong `.env`).

## Quy trình 3 bước

```powershell
# 1. Tạo file kịch bản từ template (hoặc nhờ AI viết — xem prompt ở cuối file này)
Copy-Item video-configs\template.json video-configs\video-moi.json
#    ... mở file, điền nội dung ...

# 2. Chạy
node scripts\make-video.mjs video-configs\video-moi.json

# 3. Mở video-<name>\project\render\video-final.mp4 xem, ưng thì đăng
```

Muốn sửa sau khi xem:
- **Sửa lời đọc (narration)** → sửa config, chạy lại lệnh cũ (sẽ TTS lại, tốn quota).
- **Chỉ sửa chữ trên hình / thứ tự / CTA** → chạy lại với `--skip-tts` (tái dùng giọng cũ, 0 quota, nhanh hơn nhiều). ⚠️ KHÔNG dùng `--skip-tts` nếu đã đổi narration — tiếng sẽ không khớp chữ.

## Script tự làm gì

TTS từng câu (giọng Gemini, tự đổi model khi hết quota, tự giãn 21s/request theo rate limit) → đo độ dài từng clip → giãn scene theo lời đọc → trộn 1 track thuyết minh đúng mốc → sinh composition từ template chuẩn (font tiếng Việt nhúng sẵn, cover frame 0 có tiêu đề, đã "né" mọi lỗi QA từng gặp) → render qua QA gate của Orkas-VideoStudio → tự sinh phụ đề SRT (tự né CTA bar) → burn phụ đề → `video-final.mp4`.

Thiết kế cố định của template: nền navy đậm, mỗi scene 1 **chip nhãn lớn** (mốc giờ / "MẸO 1/3"...) + tiêu đề màu accent (tự xoay 5 màu) + card mô tả + progress bar chạy đáy video + nút CTA cuối. 9:16, 1080×1920, 30fps.

## Cấu trúc file JSON

| Trường | Bắt buộc | Giới hạn nên theo | Ghi chú |
|---|---|---|---|
| `name` | ✅ | chữ thường không dấu, gạch nối | tên thư mục output `video-<name>` |
| `voice` | ✅ | 1 trong 30 giọng | nghe thử ở `voices/`; hay dùng: Kore (nữ), Rasalgethi (nam) |
| `style` | ⬜ | 1 câu | chỉ dẫn cách đọc; bỏ trống = giọng TikTok năng lượng mặc định |
| `hook.chip` | ⬜ | ≤ 12 ký tự, IN HOA | nhãn nhỏ trên cùng ("NGHỀ HR") |
| `hook.title` | ✅ | ≤ 20 ký tự | tiêu đề to nhất — hiện ngay frame 0, chính là ẢNH COVER |
| `hook.sub` | ⬜ | ≤ 30 ký tự | dòng phụ dưới tiêu đề |
| `hook.narration` | ✅ | 12–16 từ | câu mở gây tò mò (con số, câu hỏi) |
| `scenes[]` | ✅ | 3–4 scene | mỗi scene 1 ý |
| `scenes[].label` | ✅ | ≤ 10 ký tự | chip to: "08:00", "MẸO 1/3", "BƯỚC 2"... |
| `scenes[].title` | ✅ | ≤ 22 ký tự | tiêu đề scene |
| `scenes[].desc` | ✅ | ≤ 45 ký tự | 1 dòng tóm tắt — KHÔNG chép lại nguyên văn lời đọc |
| `scenes[].narration` | ✅ | 13–16 từ (~5 giây) | scene cuối kết bằng lời kêu gọi follow |
| `cta` | ✅ | ≤ 30 ký tự | chữ trên nút vàng cuối video |

Quy tắc chung:
- **Cấm ký tự `&`, `<`, `>`, `"`** trong mọi nội dung (QA đối chiếu chữ nguyên văn).
- Trong `narration`, viết số thành chữ đọc được: "90 phần trăm" (không phải "90%"), "Windows cộng V" (không phải "Win+V"). Trong `title`/`desc`/`label` thì ngược lại — viết "90%" cho gọn.
- Tổng thời lượng ≈ tổng số từ narration ÷ 2.7 + 3 giây. Nhắm 20–35 giây (~70–90 từ tổng).

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `het quota TTS o tat ca model` | Free tier hết 10 request/ngày/model — chờ quota reset (nửa đêm giờ Mỹ) hoặc bật billing |
| `ffmpeg mix loi ... PATH` | Mở terminal MỚI sau khi cài ffmpeg |
| `draft gate FAIL` | Đọc file `final-report.json` nó chỉ ra — thường do nội dung quá dài tràn khung; rút gọn `title`/`desc` rồi chạy lại `--skip-tts` |
| `khong thay ovs CLI` | Chưa build Orkas-VideoStudio — làm theo README.md |
| Muốn thiết kế riêng theo chủ đề | Template auto là cố định; thiết kế custom (keycap, đồng hồ...) thì dùng Claude Code theo [HUONG-DAN-TAO-VIDEO.md](HUONG-DAN-TAO-VIDEO.md) |

---

## Prompt nhờ AI viết kịch bản (dán vào ChatGPT / Claude / Gemini kèm topic)

Copy nguyên khối dưới, thay dòng `CHỦ ĐỀ:` rồi gửi. AI trả về JSON → lưu thành `video-configs/<name>.json` → chạy lệnh. Đọc lướt JSON trước khi chạy, sửa câu chữ nếu muốn.

```text
Bạn là người viết kịch bản video TikTok ngắn dạng faceless motion-graphics cho khán giả Việt Nam.

CHỦ ĐỀ: <điền chủ đề của bạn vào đây>

Hãy viết kịch bản thành MỘT file JSON đúng schema sau, chỉ trả về JSON hợp lệ (không giải thích, không markdown):

{
  "name": "<ten-video: chu thuong khong dau, noi bang gach ngang>",
  "voice": "Kore",
  "hook": {
    "chip": "<nhãn ngắn IN HOA, tối đa 12 ký tự>",
    "title": "<tiêu đề to gây tò mò, tối đa 20 ký tự — đây là ảnh cover>",
    "sub": "<dòng phụ, tối đa 30 ký tự>",
    "narration": "<câu mở 12-16 từ, gây tò mò bằng con số hoặc câu hỏi>"
  },
  "scenes": [
    {
      "label": "<chip lớn tối đa 10 ký tự: mốc giờ, MẸO 1/3, BƯỚC 1...>",
      "title": "<tiêu đề scene, tối đa 22 ký tự>",
      "desc": "<1 dòng tóm tắt tối đa 45 ký tự, KHÔNG chép lại lời đọc>",
      "narration": "<lời đọc 13-16 từ, đúng 1 ý>"
    }
  ],
  "cta": "<lời kêu gọi trên nút, tối đa 30 ký tự, bắt đầu bằng Follow>"
}

Quy tắc bắt buộc:
1. Đúng 3 hoặc 4 phần tử trong "scenes". Mỗi scene đúng 1 ý, các scene không trùng ý nhau.
2. Narration của scene CUỐI CÙNG phải kết thúc bằng lời kêu gọi follow tự nhiên (ví dụ: "... Follow để xem thêm nhé!").
3. Trong narration: viết số thành chữ đọc được ("90 phần trăm" thay vì "90%", "Windows cộng V" thay vì "Win+V"). Trong title/desc/label thì viết gọn ("90%").
4. TUYỆT ĐỐI không dùng các ký tự & < > " trong mọi giá trị text. Không dùng emoji.
5. Tiếng Việt có dấu chuẩn, giọng văn trẻ trung tự nhiên, không sáo rỗng.
6. Tổng số từ của tất cả narration trong khoảng 70-90 từ (video 25-35 giây).
7. Nếu chủ đề hợp với mốc thời gian thì dùng label dạng giờ ("08:00"), hợp với danh sách thì dùng "MẸO 1/3" hoặc "BƯỚC 1", chọn loại phù hợp và thống nhất cả video.
```

Sau khi có file JSON: `node scripts\make-video.mjs video-configs\<ten-file>.json`
