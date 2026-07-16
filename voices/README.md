# Thư viện giọng đọc Gemini TTS — file nghe thử

Mỗi file là 1 câu tiếng Việt do chính giọng đó đọc, tự giới thiệu tên mình:
*"Xin chào! Mình là giọng đọc [Tên]. Follow kênh để xem thêm mẹo hay mỗi ngày nhé!"*

**Cách dùng giọng đã chọn** (thay tên vào `--voice`):

```powershell
node scripts\tts-gemini.mjs --text "..." --out out.wav --voice Kore --style "Đọc bằng tiếng Việt, giọng trẻ trung năng lượng cao, tốc độ nhanh vừa phải như video TikTok"
```

`--style` chỉnh được thêm nhiều thứ trên cùng 1 giọng: tốc độ, cảm xúc, thì thầm, hào hứng... nên hãy chọn giọng theo *chất giọng* rồi tinh chỉnh bằng style.

## Trạng thái file mẫu

- ✅ **Đã có mẫu (18)**: Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Algieba, Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Despina, Erinome, Algenib, Rasalgethi
- ⏳ **Chưa có mẫu (12, hết quota ngày — chạy lại hôm sau)**: Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

Lệnh sinh nốt 12 giọng còn thiếu (chạy khi quota reset, ~5 phút):

```powershell
$missing = @("Laomedeia","Achernar","Alnilam","Schedar","Gacrux","Pulcherrima","Achird","Zubenelgenubi","Vindemiatrix","Sadachbia","Sadaltager","Sulafat")
foreach ($v in $missing) {
  node scripts\tts-gemini.mjs --text "Xin chào! Mình là giọng đọc $v. Follow kênh để xem thêm mẹo hay mỗi ngày nhé!" --out "voices\$v.wav" --voice $v --style "Đọc bằng tiếng Việt tự nhiên"
  ffmpeg -y -i "voices\$v.wav" -b:a 64k "voices\$v.mp3" -loglevel error; Remove-Item "voices\$v.wav"
  Start-Sleep -Seconds 21   # 3 request/phút
}
# 10 giọng đầu chạy model mặc định; 2 giọng cuối nếu 429 thì: $env:GEMINI_TTS_MODEL="gemini-3.1-flash-tts-preview"
```

## Danh sách giọng (mô tả theo tài liệu Gemini)

| Giọng | Chất giọng | Giới tính (cảm nhận)* | Gợi ý dùng cho |
|---|---|---|---|
| Zephyr | Tươi sáng (Bright) | Nữ | Video tips, lifestyle |
| Puck | Sôi nổi (Upbeat) | Nam | Video giải trí, meme |
| Charon | Kiểu thông tin (Informative) | Nam | Tin tức, giải thích |
| **Kore** | Chắc chắn (Firm) | Nữ | **Đang dùng cho demo** — tips, hướng dẫn |
| Fenrir | Hào hứng (Excitable) | Nam | Reaction, thể thao |
| Leda | Trẻ trung (Youthful) | Nữ | Nội dung gen Z |
| Orus | Chắc chắn (Firm) | Nam | Hướng dẫn, review |
| Aoede | Nhẹ nhàng thoáng (Breezy) | Nữ | Lifestyle, du lịch |
| Callirrhoe | Thư thái (Easy-going) | Nữ | Vlog, kể chuyện |
| Autonoe | Tươi sáng (Bright) | Nữ | Tips, quảng bá |
| Enceladus | Hơi thở nhẹ (Breathy) | Nam | Kể chuyện đêm khuya |
| Iapetus | Rõ ràng (Clear) | Nam | Giải thích kỹ thuật |
| Umbriel | Thư thái (Easy-going) | Nam | Vlog, podcast |
| Algieba | Mượt (Smooth) | Nam | Review sản phẩm |
| Despina | Mượt (Smooth) | Nữ | Beauty, lifestyle |
| Erinome | Rõ ràng (Clear) | Nữ | Hướng dẫn, giáo dục |
| Algenib | Khàn (Gravelly) | Nam | Nội dung "chất", xe cộ |
| Rasalgethi | Kiểu thông tin (Informative) | Nam | Tin tức, phân tích |
| Laomedeia | Sôi nổi (Upbeat) | Nữ | Giải trí, trend |
| Achernar | Êm (Soft) | Nữ | Chữa lành, thiền |
| Alnilam | Chắc chắn (Firm) | Nam | Thể hình, kỷ luật |
| Schedar | Đều đặn (Even) | Nam | Tài liệu, tổng hợp |
| Gacrux | Trưởng thành (Mature) | Nữ | Sức khỏe, tài chính |
| Pulcherrima | Dứt khoát (Forward) | Nữ | Quan điểm, phản biện |
| Achird | Thân thiện (Friendly) | Nam | Vlog đời thường |
| Zubenelgenubi | Suồng sã (Casual) | Nam | Chuyện phiếm, hài |
| Vindemiatrix | Dịu dàng (Gentle) | Nữ | Mẹ & bé, nấu ăn |
| Sadachbia | Sống động (Lively) | Nam | Trend, thử thách |
| Sadaltager | Am hiểu (Knowledgeable) | Nam | Kiến thức chuyên sâu |
| Sulafat | Ấm (Warm) | Nữ | Kể chuyện, tâm sự |

\* Giới tính là cảm nhận khi nghe, không phải phân loại chính thức — hãy nghe file mẫu để chọn.

## Lưu ý quota free tier (đo thực tế 07/2026)

- Mỗi model TTS bị giới hạn riêng: **~3 request/phút và ~10 request/ngày** (free tier).
- Các model dùng được (đổi qua env `GEMINI_TTS_MODEL`): `gemini-2.5-flash-preview-tts` (mặc định), `gemini-3.1-flash-tts-preview`, `gemini-2.5-pro-preview-tts` — quota tính RIÊNG từng model, hết quota model này thì chuyển model khác.
- 1 video 4 scene = 4 request → free tier đủ ~2 video/ngày/model, tối đa ~6 video/ngày nếu xoay 3 model. Làm nhiều hơn thì bật billing (giá rất rẻ).
