# Đảo Câu Cá (Tiny Tides)

Game câu cá 3D low-poly cho YouTube Playables, dựng theo tài liệu *“Thiết kế game câu cá 3D – YouTube Playables”*.
Three.js + Vite, điều khiển một chạm, chạy được cả màn dọc và ngang.

```bash
npm install
npm run dev          # chơi thử: http://localhost:5173
npm run build        # bản nộp Playables → thư mục dist/ (tự kiểm tra tên file hợp lệ)
npm run preview      # chạy thử bản build
npm run playables    # build + preview: dùng http://localhost:4173 cho Playables Test Suite
```

> Đừng chạy Test Suite trên bản dev (cổng 5173): Vite dev nạp `/@vite/client`, `*.js?v=…`
> nên luôn trượt mục *“filenames must only contain supported characters”*. Hãy test bản build.

```bash
npm run check-data   # kiểm tra 100 loài cá khớp phụ lục & công thức giá
npm run reel-sim     # mô phỏng pha kéo cá để chỉnh cân bằng
```

## Đã làm theo tài liệu

| Mục trong tài liệu | Trạng thái |
|---|---|
| Vòng chơi: quăng (giữ tích lực) → chờ cắn 3–10 s → chạm trong 0,6 s (chạm chuẩn +10% giá) → kéo bằng thanh căng dây (vùng đỏ quá thời gian chịu của cần thì đứt) → kết quả → về cảng | Đủ |
| 5 vùng biển, mỗi vùng 1 đảo cảng + 2–3 điểm câu, chu kỳ ngày/đêm 12 phút, thời tiết nắng/mưa/bão | Đủ (vùng 4 mưa thành tuyết, vùng 5 có tro bụi) |
| 100 loài, cơ cấu độ hiếm 8/6/4/1/1, tỉ lệ 62/24/12/1,5/0,5%, giá theo phụ lục | Đủ, `fish.json` khớp phụ lục |
| 4 cỡ cá (Nhỏ/Vừa/Lớn/Khổng lồ), Fishdex ghi cả 4 cỡ, cá Khổng lồ chiếm 2 ô | Đủ |
| Điều kiện xuất hiện (đêm/mưa/bão); loài không đủ điều kiện thì chia tỉ lệ cho loài cùng nhóm | Đủ |
| Lực cần ≥ Độ khó − 2 mới kéo được | Đủ (cá quá sức gần như chắc chắn đứt dây) |
| Cần câu 10 cấp, kho 10 cấp, 6 loại mồi (nhân trọng số rồi chuẩn hóa), giá mồi ×1→×8 theo vùng | Đủ |
| 5 thuyền mở vùng, cần đủ xu + ≥10 loài vùng trước, bản đồ, cảnh thuyền chạy 3D, 30% sự kiện biển (đàn cá / rương trôi / bão) | Đủ |
| Skin thuyền mở bằng thành tích | 6 skin (20 loài mỗi vùng, 5 boss) |
| Nhiệm vụ hằng ngày, mốc Fishdex mỗi 10 loài, bán liên tục cùng loài −5%/con (tối đa −30%) hồi sau 1 ngày trong game | Đủ |
| Playables: `firstFrameReady`, `gameReady`, dừng khi pause, tôn trọng tắt tiếng, `saveData`/`loadData`, không gọi mạng ngoài, dọc + ngang | Đủ (xem `src/sdk.js`) |
| Toàn bộ nội dung trong JSON | `src/data/*.json` |

## Cấu trúc

```
src/
  data/            fish, regions, baits, rods, storage, boats, quests, balance (.json)
  main.js          khởi động, vòng lặp, nhập liệu, pause/resume
  game.js          điều phối: cảng ↔ điểm câu ↔ đi biển, mua bán, nâng cấp, lưu game
  fishing.js       vòng câu (quăng, chờ, móc, kéo, kết quả) + hình ảnh/âm thanh
  reel.js          vật lý pha kéo cá (thuần, dùng chung với tools/reel-sim.mjs)
  logic.js         luật: gặp cá, cỡ, giá, kho, bán, Fishdex, nhiệm vụ, skin
  world.js         đồng hồ ngày/đêm, thời tiết
  sdk.js           lớp bọc YouTube Playables SDK (fallback localStorage)
  audio.js         âm thanh tổng hợp bằng WebAudio (không có file âm thanh)
  scene/           Three.js: stage, nước (shader), trời, đảo 5 chủ đề, thuyền, cần/dây/phao, model cá, hiệu ứng
  ui/              HUD + các bảng (cảng, Fishdex, kho, bản đồ, kết quả)
tools/             check-data.mjs, reel-sim.mjs
```

## Chỉnh cân bằng

- Giá, tỉ lệ, độ khó từng loài: `src/data/fish.json`.
- Hệ số độ hiếm, cỡ cá, thời gian chờ cắn, chạm chuẩn, chống lạm phát, sự kiện biển, thưởng: `src/data/balance.json`.
- Cảm giác kéo cá: khối `reel` trong `balance.json`, chạy `npm run reel-sim` để xem tỉ lệ thắng/đứt dây và thời gian kéo theo 4 kiểu người chơi. Mức hiện tại (người mới phản xạ 0,35 s): cá dễ ~100%, cá ở giới hạn (Độ khó = Lực + 2) 84–95%, boss ở giới hạn 72–83%; người “giữ mãi không nhả” bị đứt dây gần như luôn luôn. Thời gian kéo 12–35 s.
- Muốn nộp đúng phạm vi MVP (2 vùng, 40 loài): đặt `"releasedRegions": 2` trong `balance.json` — vùng 3–5 hiện “Sắp ra mắt”.

## Những chỗ tài liệu chưa nói rõ – đã chọn như sau

- **Phạm vi**: làm luôn cả 5 vùng vì nội dung đều là dữ liệu; MVP chỉ cần đổi `releasedRegions`.
- **Model cá/đảo/thuyền sinh bằng code** thay cho `.glb` nén Draco: không phải tải asset, bản build ~176 KB (gzip). Có thể thay bằng model thật sau mà không đổi logic.
- **Điều kiện “chỉ điểm câu nào đó”**: phụ lục chỉ có đêm/mưa/bão (17/100 loài, không phải ~30%). Điểm câu được làm thành “hay gặp”: một số loài có trọng số ×1,8 ở điểm đó (`spots[].favor` trong `regions.json`).
- **Chạm chuẩn** = chạm trong 0,3 s đầu của cửa sổ 0,6 s.
- **Mua thuyền**: cần ≥10 loài ở *vùng ngay trước* vùng thuyền mở.
- **Đi nhiều chặng**: thời gian = thời gian 1 chặng của thuyền tốt nhất × (1 + 0,5 × số chặng thêm). Giữ màn hình để tăng tốc.
- **Nhiệm vụ hằng ngày**: 3 nhiệm vụ/ngày thật, mỗi cái thưởng ≈ 7 con cá vùng cao nhất (tổng ≈ 20 như tài liệu). Mốc Fishdex thưởng ≈ 10 con cá của vùng tương ứng.
- **Âm thanh**: hiệu ứng và tiếng sóng tổng hợp bằng WebAudio; chưa có nhạc nền (tài liệu cho phép “tải sau”).

## Việc còn nên làm trước khi nộp

- Chơi thử trên điện thoại thật (đã kiểm thử tự động trên Chrome headless, khung 1280×720 và 390×844) và tinh chỉnh `balance.json`.
- Đối chiếu giới hạn dung lượng/yêu cầu trong tài liệu YouTube Playables mới nhất (tài liệu thiết kế cũng ghi chú cần kiểm tra lại).
- Thêm biểu tượng/ảnh bìa theo yêu cầu nộp của Playables.
