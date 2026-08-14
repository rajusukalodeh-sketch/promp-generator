# SPEC — Jenis Output: Gambar / Video / Gambar+Video

## Latar belakang

Versi awal SLATE (mengikuti `system-prompt-video-scene-generator.md` apa
adanya) mengasumsikan **setiap scene selalu menghasilkan 2 aset**: 1 gambar
dasar → digerakkan jadi 1 video (workflow *image-to-video*). Di praktiknya
tidak semua kebutuhan seperti itu:

- Kadang user cuma butuh **satu set gambar** (mis. storyboard, moodboard,
  carousel Instagram, ilustrasi) — tidak ada niat generate video sama sekali.
- Kadang user sudah punya alur cerita dan mau langsung **generate video**
  tanpa melalui tahap gambar dasar — pakai platform yang mendukung
  *text-to-video* (Kling, Veo, Runway, Pika, Luma versi text-to-video).
- Workflow lama (gambar+video) tetap dibutuhkan untuk kasus yang memang
  ingin kontrol komposisi lewat gambar dulu baru digerakkan.

Spec ini menambahkan pilihan **Jenis Output** di step "Platform & Teknis",
dengan tiga mode: `both`, `image`, `video`.

## Tiga mode

| Mode | `state.outputType` | Apa yang dihasilkan tiap scene | Kapan dipakai |
|---|---|---|---|
| Gambar + Video | `both` | 1 gambar dasar + 1 prompt video (fokus gerakan, image-to-video) | Default — perlu gambar & video, komposisi dikontrol lewat gambar |
| Hanya Gambar | `image` | 1 gambar saja | Storyboard, moodboard, carousel, ilustrasi — tidak ada video sama sekali |
| Hanya Video | `video` | 1 video saja, langsung (text-to-video) | Sudah tahu mau generate video langsung, tanpa tahap gambar dasar |

## Perbedaan struktur prompt per mode

### `both` (perilaku lama, tidak berubah)
- `image_prompt`: deskripsi visual lengkap (subjek, environment, gaya,
  lighting, komposisi, quality tags).
- `video_prompt`: **hanya gerakan** — camera movement, subject motion,
  pacing, efek, durasi. Tidak mengulang deskripsi visual karena gambar
  dasar sudah menentukan komposisi.
- `narration`: opsional, ditempatkan di prompt video (elemen audio/temporal).

### `image` (baru)
- Hanya `image_prompt` + `image_negative_prompt`.
- Tidak ada `video_prompt`, tidak ada `narration` — karena tidak ada video
  yang diputar, tidak ada audio/dubbing yang perlu diucapkan.
- Step "Narasi & Hook/Closing" otomatis menyembunyikan bagian narasi saat
  mode ini aktif (lihat `step4()` di `app.js`).
- Step "Platform & Teknis" hanya menampilkan dropdown platform image,
  dropdown platform video disembunyikan.

### `video` (baru)
- Hanya `video_prompt` + `video_negative_prompt` (+ `narration` opsional).
- **Perbedaan penting dari mode `both`**: karena tidak ada gambar dasar
  terpisah, `video_prompt` di mode ini **wajib memuat deskripsi visual
  penuh** (subjek & aksi, environment, gaya, lighting, komposisi kamera)
  **digabung** dengan instruksi gerakan (camera movement, subject motion,
  pacing, efek, durasi) — semacam gabungan `image_prompt` + `video_prompt`
  dari mode `both`, ditulis sebagai satu paragraf padat untuk platform
  text-to-video.
- Step "Platform & Teknis" hanya menampilkan dropdown platform video,
  dropdown platform image disembunyikan.

## Kenapa tidak satu skema JSON generik dengan field nullable?

Bisa saja pakai satu skema `{scene_title, image_prompt, image_negative_prompt,
video_prompt, video_negative_prompt, narration}` untuk semua mode dan minta
model mengosongkan field yang tidak relevan. Tapi itu berisiko: model
kadang tetap mengisi `video_prompt` gaya "motion-only" walau mode-nya
`video` (text-to-video, yang butuh deskripsi visual penuh), atau
menambahkan `narration` di mode `image`. Karena itu instruksi sistem
(`getRulesPlanning` / `getRulesScene` di `app.js`) dibuat **per mode**
dengan skema JSON yang field-nya memang berbeda — lebih ketat dan lebih
kecil kemungkinan model "bocor" ke field yang tidak seharusnya ada.

Efek sampingnya: rendering di frontend (`renderSceneCard`,
`buildFullMarkdown`) cukup mengecek **field mana yang ada** di hasil
(`res.image_prompt`, `res.video_prompt`, `res.narration`) — tidak perlu
percabangan berdasarkan `outputType` di banyak tempat, karena bentuk
data itu sendiri sudah merepresentasikan mode yang dipilih.

## Bagian UI yang berubah (`public/app.js`)

1. **State**: `state.outputType` (`"both" | "image" | "video"`), default `"both"`.
2. **Step 3 — Platform & Teknis** (`step3()`): chip selector Jenis Output di
   paling atas; dropdown platform image/video ditampilkan kondisional.
3. **Step 4 — Narasi & Hook/Closing** (`step4()`): seluruh blok
   narasi/dialog disembunyikan saat `outputType === "image"`.
4. **Step 6 — Generate** (`step6()`): ringkasan slate menampilkan baris
   "JENIS OUTPUT" dan baris "PLATFORM"/"NARASI" menyesuaikan mode.
5. **`renderSceneCard()`**: blok "Prompt Gambar" hanya muncul jika
   `res.image_prompt` ada; blok "Prompt Video" hanya muncul jika
   `res.video_prompt` ada (labelnya juga berbeda: "image-to-video" vs
   "text-to-video"); blok narasi hanya muncul jika `res.narration` ada.
6. **`buildFullMarkdown()`**: export teks (tombol "Copy Semua Sebagai
   Teks") mengikuti pola yang sama — hanya menulis section yang memang
   ada isinya.
7. **`buildUserContextSummary()` & konteks per-scene di `runOneScene()`**:
   baris `PLATFORM IMAGE` / `PLATFORM VIDEO` dan blok narasi hanya
   disertakan sesuai mode, supaya prompt yang dikirim ke backend tidak
   membingungkan model dengan info yang tidak relevan.

## Hook & Closing tetap berlaku di semua mode

Toggle "Format short/reels" (hook di scene pertama, closing di scene
terakhir) tetap tersedia untuk ketiga mode — termasuk `image`, karena
konsepnya (scene pembuka yang menarik perhatian, scene penutup yang jadi
kesimpulan/CTA) tetap relevan untuk rangkaian gambar (mis. carousel),
bukan cuma video.

## Catatan tentang backend (`index.js`)

Backend Express yang dipakai (`POST /api/chat`) punya `systemInstruction`
tetap: *"jawab dalam bahasa indonesia, gunakan gaya bahasa manusia..."*.
Ini didesain untuk chat biasa, bukan untuk memaksa output JSON ketat.
Karena itu instruksi mode (`getRulesPlanning` / `getRulesScene`) dan aturan
skema JSON **digabung langsung ke dalam pesan `user`** yang dikirim
(`callGemini()` menyusun `${system}\n\n${userMsg}` sebagai satu teks),
bukan dikirim lewat parameter `systemInstruction` terpisah — karena
endpoint saat ini hanya punya satu `systemInstruction` global yang
dikontrol di sisi server. Jika ke depannya butuh instruksi sistem yang
benar-benar dinamis per request, `index.js` perlu diubah supaya
`systemInstruction` bisa dikirim dari frontend (dengan validasi/whitelist
di server, jangan percaya begitu saja instruksi dari client).
