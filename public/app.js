/* ===========================================================
   SLATE — AI Scene Prompt Generator
   Frontend logic (state, rendering, calls to local Express backend)
=========================================================== */

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
const state = {
  step: 0,
  title: "",
  synopsis: "",
  genre: [],
  mood: "",
  durationTotal: 60,
  sceneCount: "", // "" = auto
  characters: [
    { name: "", age: "", physical: "", clothing: "", personality: "" },
  ],
  location: "",
  era: "",
  timeOfDay: "",
  weather: "",
  visualStyle: "",
  visualRef: "",
  imgPlatform: "GEMINI AI",
  vidPlatform: "Google FLow VEO 3",
  aspectRatio: "9:16",
  cameraStyle: "",
  lens: "",
  avoid: "",
  // outputType: "both" (gambar+video / image-to-video), "image" (hanya gambar),
  // "video" (hanya video / text-to-video langsung, tanpa gambar dasar)
  outputType: "both",
  needsNarration: false,
  narrationMode: "Full Otomatis",
  narrationLang: "Bahasa Indonesia",
  narrationDraft: "",
  shortForm: false,
  hookType: "",
  closingType: "",
  extraNotes: "",
  // results
  storyBible: null,
  scenes: [], // planned scenes
  sceneResults: {}, // index -> generated content
  generating: false,
  planError: "",
};

const TABS = [
  "Cerita & Genre",
  "Karakter",
  "Setting & Visual",
  "Platform & Teknis",
  "Narasi & Hook",
  "Catatan",
  "Generate",
];

/* ---------------------------------------------------------
   OUTPUT TYPE HELPERS
--------------------------------------------------------- */
function outputTypeLabel(t) {
  if (t === "image") return "Hanya Gambar";
  if (t === "video") return "Hanya Video (text-to-video)";
  return "Gambar + Video (image-to-video)";
}

/* ---------------------------------------------------------
   SYSTEM RULES (condensed from master system prompt)
   Dibuat sebagai fungsi karena isinya berubah sesuai outputType
   ("both" / "image" / "video") — lihat OUTPUT-MODE-SPEC.md untuk
   penjelasan lengkap kenapa 3 mode ini dipisah.
--------------------------------------------------------- */
function getRulesPlanning(outputType) {
  const modeNote =
    {
      both: "Setiap scene menghasilkan 1 gambar dasar dahulu, baru digerakkan jadi video (image-to-video).",
      image:
        "Setiap scene HANYA menghasilkan 1 gambar diam (still). TIDAK ADA video, gerakan kamera, atau audio di scene manapun.",
      video:
        "Setiap scene HANYA menghasilkan 1 video langsung (text-to-video), TANPA gambar dasar terpisah.",
    }[outputType] || "";

  const platformNoteInstruction =
    outputType === "image"
      ? `"platform_notes": "1-2 kalimat Bahasa Indonesia: apakah platform image generator yang dipilih user cocok untuk gaya visual, jumlah karakter, dan kompleksitas cerita ini."`
      : outputType === "video"
        ? `"platform_notes": "1-2 kalimat Bahasa Indonesia: apakah platform video yang dipilih user mendukung text-to-video (generate video langsung tanpa gambar dasar), serta apakah mendukung audio/dialog native dan lip-sync (platform yang mendukung: Kling AI, Google Veo, Pika (fitur audio), Luma). Jika tidak mendukung, sebutkan jelas dan tawarkan alternatif pasca-produksi (voiceover terpisah lewat TTS mis. ElevenLabs; lip-sync lewat Sync Labs/HeyGen/D-ID)."`
        : `"platform_notes": "1-2 kalimat Bahasa Indonesia: apakah kombinasi platform image+video yang dipilih user cocok, dan apakah platform video yang dipilih mendukung audio/dialog native serta lip-sync (platform yang mendukung: Kling AI, Google Veo, Pika (fitur audio), Luma). Jika tidak mendukung audio dan/atau lip-sync, sebutkan jelas dan tawarkan alternatif pasca-produksi (voiceover terpisah lewat TTS mis. ElevenLabs; lip-sync lewat Sync Labs/HeyGen/D-ID; atau hindari close-up mulut saat bicara)."`;

  return `Kamu adalah AI Prompt Engineer untuk konten AI generatif (gambar dan/atau video). Tugasmu SEKARANG: memecah sebuah ide cerita menjadi breakdown scene (belum menulis prompt detail).

MODE OUTPUT UNTUK PROJECT INI: ${modeNote}

ATURAN BREAKDOWN:
- Bagi cerita menjadi beat naratif kecil (pembukaan, konflik, klimaks, resolusi) sesuai target durasi total dan jumlah scene yang diminta (rule of thumb: 1 scene ≈ 3-8 detik). Jika jumlah scene tidak ditentukan user, hitung sendiri berdasarkan durasi.
- Jika format short-form dipilih: scene pertama WAJIB berfungsi sebagai hook (tag "HOOK") sesuai jenis hook yang diminta, dan scene terakhir WAJIB berfungsi sebagai closing (tag "CLOSING") sesuai jenis closing yang diminta.
- Tetapkan story bible yang akan dipakai konsisten di semua scene: deskripsi tetap tiap karakter (gabungkan fisik+pakaian+ekspresi khas jadi satu kalimat padat per karakter, akan ditulis ulang kata-per-kata di setiap scene), token gaya visual & color grading yang konsisten, dan catatan gaya/referensi tambahan dari user yang harus konsisten muncul di scene relevan.
- Jika info tidak lengkap, buat asumsi kreatif masuk akal yang sesuai genre/mood, jangan berhenti.
- Total durasi seluruh scene harus mendekati durasi target.

Balas HANYA dengan JSON valid (tanpa markdown fences, tanpa teks lain), dengan schema persis:
{
  "story_bible": {
    "characters_summary": "deskripsi tiap karakter, gabungan fisik+pakaian+ekspresi, dipisah per karakter dengan ' | ', dalam Bahasa Inggris, siap tempel berulang ke prompt",
    "visual_style_tokens": "token gaya & medium & quality tags, Bahasa Inggris, mis. 'cinematic photography, 35mm film grain, 8k, sharp focus'",
    "color_grade_tokens": "token lighting & color grading konsisten, Bahasa Inggris",
    "additional_notes_tokens": "detail wajib dari catatan tambahan user (poin 14), Bahasa Inggris, kosongkan jika tidak ada"
  },
  "scenes": [
    {"index":1,"title":"judul singkat scene dalam Bahasa Indonesia","duration_sec":6,"beat":"1-2 kalimat deskripsi apa yang terjadi di scene ini, Bahasa Indonesia","tag":"HOOK"}
  ],
  "total_duration_sec": 48,
  ${platformNoteInstruction}
}
"tag" hanya diisi "HOOK", "CLOSING", atau null. Jangan tambah field lain.`;
}

function getRulesScene(outputType) {
  if (outputType === "image") {
    return `Kamu adalah AI Prompt Engineer untuk platform image generation (Midjourney/Flux/SDXL/DALL-E). Tugasmu SEKARANG: menulis prompt gambar LENGKAP untuk SATU scene saja. Mode output project ini HANYA GAMBAR — jangan pernah membuat video_prompt, camera movement, atau narasi/audio, karena tidak akan ada video yang dihasilkan.

KAIDAH PROMPT GAMBAR (image_prompt) — satu paragraf padat, Bahasa Inggris, urutan:
1. Subjek & aksi — siapa, sedang apa, ekspresi apa (tulis ulang persis deskripsi karakter dari characters_summary yang relevan dengan scene ini, kata-per-kata sama, agar konsisten)
2. Environment (lokasi, waktu, cuaca, atmosfer)
3. Gaya & medium (pakai visual_style_tokens)
4. Lighting & color grading (pakai color_grade_tokens)
5. Komposisi & sudut kamera sesuai preferensi kamera user
6. Quality/technical tags sesuai platform image yang dipilih user (mis. Midjourney pakai parameter --ar --style --v; Flux/SDXL/DALL-E gaya deskriptif natural language)
Sisipkan juga additional_notes_tokens jika relevan dengan scene ini.

image_negative_prompt: elemen visual yang harus dihindari (gabungkan elemen dari user + elemen umum yang merusak gambar), Bahasa Inggris, dipisah koma.

Balas HANYA dengan JSON valid (tanpa markdown fence, tanpa teks lain), schema persis:
{
  "scene_title": "judul singkat scene",
  "image_prompt": "...",
  "image_negative_prompt": "..."
}`;
  }

  if (outputType === "video") {
    return `Kamu adalah AI Prompt Engineer untuk platform text-to-video (Runway/Pika/Kling/Luma/Google Veo dalam mode text-to-video, TANPA gambar dasar). Tugasmu SEKARANG: menulis SATU prompt video yang LENGKAP untuk SATU scene saja. Mode output project ini HANYA VIDEO langsung — TIDAK ADA gambar dasar terpisah, sehingga video_prompt WAJIB memuat deskripsi visual PENUH sekaligus gerakan (gabungan dari yang biasanya dipisah jadi image_prompt + video_prompt di workflow image-to-video). Jangan buat image_prompt.

KAIDAH PROMPT VIDEO (video_prompt) — satu paragraf padat, Bahasa Inggris, urutan:
1. Subjek & aksi (tulis ulang persis deskripsi karakter dari characters_summary yang relevan, kata-per-kata sama, agar konsisten)
2. Environment (lokasi, waktu, cuaca, atmosfer)
3. Gaya & medium (pakai visual_style_tokens)
4. Lighting & color grading (pakai color_grade_tokens)
5. Camera movement & komposisi/sudut kamera awal sesuai preferensi user
6. Subject motion — apa yang bergerak dan bagaimana. Jika scene ini punya narasi/dialog yang diucapkan karakter yang tampil, WAJIB tambahkan instruksi lip-sync eksplisit (mis. "mouth movements precisely synced with spoken dialogue (lip-sync)")
7. Pacing/speed, efek tambahan bila perlu (particle, smoke, light flicker, dst)
8. Duration & continuity — sebutkan durasi klip
Sisipkan additional_notes_tokens jika relevan. Sertakan narasi/dialog di prompt ini (bukan field terpisah dari struktur visual) dalam format instruksi audio eksplisit, mis. voiceover (nada/karakter suara): "isi kalimat", jika scene ini butuh narasi.

video_negative_prompt: elemen visual/artifact/gerakan yang harus dihindari (mis. morphing wajah, jump cut aneh, dst), Bahasa Inggris, dipisah koma.

KAIDAH NARASI (field narration terpisah, untuk ditampilkan ke user):
- Ikuti mode yang dipilih: "Manual" (pakai draft user apa adanya, rapikan hanya typo), "Manual + Enhance AI" (pertahankan inti pesan draft user tapi tulis ulang jadi natural sesuai mood), atau "Full Otomatis" (tulis dialog/narasi baru dari nol sesuai kepribadian karakter & mood scene, ±2-3 kata per detik durasi scene).
- Tulis narration dalam bahasa yang diminta user, sebagai kalimat yang akan diucapkan/didengar (audio/dubbing), TIDAK sebagai caption.
- Jika scene ini tidak butuh narasi, isi narration dengan null.

Balas HANYA dengan JSON valid (tanpa markdown fence, tanpa teks lain), schema persis:
{
  "scene_title": "judul singkat scene",
  "video_prompt": "...",
  "video_negative_prompt": "...",
  "narration": "voiceover (...): \\"...\\""
}
Jika tidak ada narasi, set "narration": null.`;
  }

  // outputType === "both" (default, workflow image-to-video)
  return `Kamu adalah AI Prompt Engineer untuk platform image generation (Midjourney/Flux/SDXL/DALL-E) dan video generation image-to-video (Runway/Pika/Kling/Luma). Tugasmu SEKARANG: menulis prompt LENGKAP untuk SATU scene saja, berdasarkan story bible dan beat scene yang diberikan.

KAIDAH PROMPT GAMBAR (image_prompt) — satu paragraf padat, Bahasa Inggris, urutan:
1. Subjek & aksi (tulis ulang persis deskripsi karakter dari characters_summary yang relevan dengan scene ini, kata-per-kata sama, agar konsisten)
2. Environment (lokasi, waktu, cuaca, atmosfer)
3. Gaya & medium (pakai visual_style_tokens)
4. Lighting & color grading (pakai color_grade_tokens)
5. Komposisi & sudut kamera sesuai preferensi kamera user
6. Quality/technical tags sesuai platform image yang dipilih user (mis. Midjourney pakai parameter --ar --style --v; Flux/SDXL/DALL-E gaya deskriptif natural language)
Sisipkan juga additional_notes_tokens jika relevan dengan scene ini (mis. desain/antropomorfisme objek yang harus konsisten).

image_negative_prompt: elemen visual yang harus dihindari (gabungkan elemen dari user + elemen umum yang merusak gambar), Bahasa Inggris, dipisah koma.

KAIDAH PROMPT VIDEO (video_prompt) — fokus ke gerakan saja, JANGAN mengulang deskripsi visual detail (karena base image sudah menentukan komposisi), Bahasa Inggris, urutan:
1. Camera movement
2. Subject motion — jika scene ini punya narasi/dialog yang diucapkan karakter yang tampil, WAJIB tambahkan instruksi lip-sync eksplisit (mis. "mouth movements precisely synced with spoken dialogue (lip-sync)")
3. Pacing/speed
4. Efek tambahan bila perlu (particle, smoke, light flicker, dst)
5. Duration & continuity — sebutkan durasi klip, jaga gerakan logis dari komposisi gambar, JANGAN minta perubahan identitas/wardrobe drastis
Sertakan narasi/dialog di SINI (bukan di image_prompt) jika scene ini butuh narasi, dalam format instruksi audio eksplisit, mis. voiceover (nada/karakter suara): "isi kalimat", agar dipahami sebagai audio/dubbing bukan caption.

video_negative_prompt: artifact/gerakan yang harus dihindari (mis. morphing wajah, jump cut aneh, dst), Bahasa Inggris, dipisah koma.

KAIDAH NARASI (field narration terpisah, untuk ditampilkan ke user):
- Ikuti mode yang dipilih: "Manual" (pakai draft user apa adanya, rapikan hanya typo), "Manual + Enhance AI" (pertahankan inti pesan draft user tapi tulis ulang jadi natural sesuai mood), atau "Full Otomatis" (tulis dialog/narasi baru dari nol sesuai kepribadian karakter & mood scene, ±2-3 kata per detik durasi scene).
- Tulis narration dalam bahasa yang diminta user (narration_lang), sebagai kalimat yang akan diucapkan/didengar (audio/dubbing), TIDAK sebagai caption.
- Jika scene ini tidak butuh narasi (needs_narration=false, atau beat tidak melibatkan dialog), isi narration dengan null.
- Jaga gaya bicara karakter konsisten dengan scene lain (akan dicek manual oleh user).

Balas HANYA dengan JSON valid (tanpa markdown fence, tanpa teks lain), schema persis:
{
  "scene_title": "judul singkat scene",
  "image_prompt": "...",
  "image_negative_prompt": "...",
  "video_prompt": "...",
  "video_negative_prompt": "...",
  "narration": "voiceover (...): \\"...\\""
}
Jika tidak ada narasi, set "narration": null.`;
}

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */
function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg || "Disalin ke clipboard";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1400);
}
function copyText(txt, label) {
  navigator.clipboard
    .writeText(txt)
    .then(() => toast(label ? label + " disalin" : "Disalin ke clipboard"));
}

/* ---------------------------------------------------------
   BACKEND CALL — Express + Gemini (menggantikan pemanggilan
   langsung ke Google AI API dari browser; lihat index.js)
--------------------------------------------------------- */
async function callGemini(system, userMsg) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation: [{ role: "user", text: `${system}\n\n${userMsg}` }],
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || `Server error (${res.status})`);
  }

  const text = (data.result || "").trim();
  if (!text) {
    throw new Error("Server tidak mengembalikan output.");
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Raw server response:", text);
    throw new Error("Server mengembalikan JSON yang tidak valid.");
  }
}

function buildUserContextSummary() {
  const chars =
    state.characters
      .filter((c) => c.name || c.physical)
      .map(
        (c) =>
          `- ${c.name || "(tanpa nama)"}: usia ${c.age || "-"}, fisik: ${c.physical || "-"}, pakaian: ${c.clothing || "-"}, kepribadian/ekspresi: ${c.personality || "-"}`,
      )
      .join("\n") ||
    "- (tidak ada detail karakter spesifik, buat asumsi sesuai genre)";

  const platformLines = [];
  if (state.outputType !== "video")
    platformLines.push(`PLATFORM IMAGE: ${state.imgPlatform}`);
  if (state.outputType !== "image")
    platformLines.push(`PLATFORM VIDEO: ${state.vidPlatform}`);

  const narrationLines =
    state.outputType === "image"
      ? ""
      : `\nBUTUH NARASI/DIALOG: ${state.needsNarration ? "Ya" : "Tidak"}
MODE NARASI: ${state.narrationMode}
BAHASA NARASI: ${state.narrationLang}
DRAFT/POIN NARASI DARI USER: ${state.narrationDraft || "-"}`;

  return `JUDUL/TEMA: ${state.title || "-"}
SINOPSIS: ${state.synopsis || "-"}
GENRE: ${state.genre.join(", ") || "-"}
MOOD: ${state.mood || "-"}
DURASI TOTAL TARGET: ${state.durationTotal} detik
JUMLAH SCENE DIMINTA: ${state.sceneCount || "auto (hitung sendiri)"}
KARAKTER:
${chars}
SETTING/LOKASI: ${state.location || "-"}
ERA/WAKTU: ${state.era || "-"} | WAKTU HARI: ${state.timeOfDay || "-"} | CUACA: ${state.weather || "-"}
GAYA VISUAL: ${state.visualStyle || "-"} (referensi: ${state.visualRef || "-"})
JENIS OUTPUT: ${outputTypeLabel(state.outputType)}
${platformLines.join("\n")}
ASPECT RATIO: ${state.aspectRatio}
CAMERA STYLE: ${state.cameraStyle || "-"} (lensa: ${state.lens || "-"})
ELEMEN DIHINDARI (global negative): ${state.avoid || "-"}${narrationLines}
FORMAT SHORT-FORM (butuh hook/closing): ${state.shortForm ? "Ya" : "Tidak"}
JENIS HOOK DIINGINKAN: ${state.hookType || "(standar sesuai genre)"}
JENIS CLOSING DIINGINKAN: ${state.closingType || "(standar sesuai genre)"}
CATATAN GAYA/REFERENSI TAMBAHAN: ${state.extraNotes || "-"}`;
}

/* ---------------------------------------------------------
   RENDER: FORM STEPS
--------------------------------------------------------- */
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(renderTabs());
  const panel = document.createElement("div");
  panel.className = "panel active";
  panel.appendChild(renderStep(state.step));
  app.appendChild(panel);
}

function renderTabs() {
  const wrap = el(`<div class="tabs"></div>`);
  TABS.forEach((t, i) => {
    const b = el(
      `<button class="tab ${i === state.step ? "active" : ""} ${i < state.step ? "done" : ""}"><span class="n">${String(i + 1).padStart(2, "0")}</span>${t}</button>`,
    );
    b.onclick = () => {
      state.step = i;
      render();
    };
    wrap.appendChild(b);
  });
  return wrap;
}

function stepWrap(
  title,
  sub,
  contentEl,
  { back = true, next = true, nextLabel = "Lanjut →", onNext = null } = {},
) {
  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<h2 class="sect-title">${title}</h2>`));
  wrap.appendChild(el(`<p class="sect-sub">${sub}</p>`));
  wrap.appendChild(contentEl);
  const nav = el(`<div class="navrow"></div>`);
  const backBtn = el(`<button class="btn ghost">← Kembali</button>`);
  backBtn.style.visibility = back && state.step > 0 ? "visible" : "hidden";
  backBtn.onclick = () => {
    state.step = Math.max(0, state.step - 1);
    render();
  };
  nav.appendChild(backBtn);
  if (next) {
    const nextBtn = el(`<button class="btn primary">${nextLabel}</button>`);
    nextBtn.onclick = () => {
      if (onNext) onNext();
      state.step = Math.min(TABS.length - 1, state.step + 1);
      render();
    };
    nav.appendChild(nextBtn);
  } else {
    nav.appendChild(el(`<span></span>`));
  }
  wrap.appendChild(nav);
  return wrap;
}

function renderStep(i) {
  if (i === 0) return step0();
  if (i === 1) return step1();
  if (i === 2) return step2();
  if (i === 3) return step3();
  if (i === 4) return step4();
  if (i === 5) return step5();
  if (i === 6) return step6();
}

/* STEP 0 — Cerita & Genre */
function step0() {
  const c = el(`<div></div>`);
  c.appendChild(
    field(
      "Judul / Tema Cerita",
      "text",
      "title",
      "mis. Kereta-kereta yang bisa berbicara mencari rumah baru",
    ),
  );
  c.appendChild(
    fieldTextarea(
      "Sinopsis Singkat",
      "synopsis",
      "Ceritakan alurnya dalam 2-4 kalimat — siapa, konflik apa, bagaimana berakhir",
      3,
    ),
  );

  c.appendChild(
    el(`<div class="field"><label>Genre (bisa lebih dari satu)</label></div>`),
  );
  const genres = [
    "Drama",
    "Horor",
    "Fantasi",
    "Cyberpunk",
    "Slice of Life",
    "Iklan Produk",
    "Komedi",
    "Aksi/Laga",
    "Romance",
    "Dokumenter",
    "Sci-Fi",
    "Dongeng Anak",
  ];
  const chipRow = el(`<div class="chiprow"></div>`);
  genres.forEach((g) => {
    const chip = el(
      `<div class="chip ${state.genre.includes(g) ? "sel" : ""}">${g}</div>`,
    );
    chip.onclick = () => {
      if (state.genre.includes(g))
        state.genre = state.genre.filter((x) => x !== g);
      else state.genre.push(g);
      render();
    };
    chipRow.appendChild(chip);
  });
  c.appendChild(chipRow);

  const row = el(`<div class="row2" style="margin-top:18px"></div>`);
  row.appendChild(
    field(
      "Mood / Nada Emosi",
      "text",
      "mood",
      "mis. hangat & nostalgik, gelap & mencekam, energik",
    ),
  );
  const durField = el(`<div class="field"></div>`);
  durField.innerHTML = `<label>Durasi Total (detik)</label>`;
  const durInput = el(
    `<input type="number" min="6" step="1" value="${state.durationTotal}">`,
  );
  durInput.oninput = (e) =>
    (state.durationTotal = parseInt(e.target.value || 0));
  durField.appendChild(durInput);
  row.appendChild(durField);
  c.appendChild(row);

  const scField = el(
    `<div class="field"><label>Jumlah Scene (kosongkan untuk auto-hitung)</label></div>`,
  );
  const scInput = el(
    `<input type="number" min="1" value="${state.sceneCount}" placeholder="auto">`,
  );
  scInput.oninput = (e) => (state.sceneCount = e.target.value);
  scField.appendChild(scInput);
  c.appendChild(scField);

  return stepWrap(
    "Cerita & Genre",
    "Mulai dari ide besar: apa yang diceritakan, nadanya seperti apa, dan berapa lama.",
    c,
  );
}

/* STEP 1 — Karakter */
function step1() {
  const c = el(`<div></div>`);
  c.appendChild(
    el(
      `<p class="sect-sub" style="margin-top:-14px">Detail karakter akan ditulis ulang kata-per-kata di setiap scene yang memuatnya — semakin spesifik, semakin konsisten wajah & kostumnya di tiap gambar/video.</p>`,
    ),
  );

  const list = el(`<div></div>`);
  state.characters.forEach((ch, idx) => {
    const card = el(`<div class="charcard"></div>`);
    if (state.characters.length > 1) {
      const rm = el(`<button class="rm">✕ hapus</button>`);
      rm.onclick = () => {
        state.characters.splice(idx, 1);
        render();
      };
      card.appendChild(rm);
    }
    const row = el(`<div class="row2"></div>`);
    row.appendChild(
      fieldInline("Nama", "text", ch.name, (v) => (ch.name = v), "mis. Kaito"),
    );
    row.appendChild(
      fieldInline(
        "Usia",
        "text",
        ch.age,
        (v) => (ch.age = v),
        "mis. 28 tahun",
      ),
    );
    card.appendChild(row);
    card.appendChild(
      fieldInline(
        "Deskripsi Fisik (wajah, rambut, tubuh)",
        "text",
        ch.physical,
        (v) => (ch.physical = v),
        "mis. wajah oval, rambut hitam sebahu berantakan, mata cokelat tajam, tubuh atletis",
      ),
    );
    card.appendChild(
      fieldInline(
        "Pakaian / Kostum",
        "text",
        ch.clothing,
        (v) => (ch.clothing = v),
        "mis. jaket kulit cokelat lusuh, kaos abu-abu, celana cargo hitam",
      ),
    );
    card.appendChild(
      fieldInline(
        "Kepribadian / Ekspresi Khas",
        "text",
        ch.personality,
        (v) => (ch.personality = v),
        "mis. tenang tapi waspada, sering menyipitkan mata saat curiga",
      ),
    );
    list.appendChild(card);
  });
  c.appendChild(list);

  const addBtn = el(`<button class="addbtn">+ Tambah Karakter</button>`);
  addBtn.onclick = () => {
    state.characters.push({
      name: "",
      age: "",
      physical: "",
      clothing: "",
      personality: "",
    });
    render();
  };
  c.appendChild(addBtn);

  return stepWrap(
    "Karakter Utama",
    "Bisa lebih dari satu karakter — isi sedetail mungkin.",
    c,
  );
}

/* STEP 2 — Setting & Visual */
function step2() {
  const c = el(`<div></div>`);
  c.appendChild(
    field(
      "Lokasi / Setting",
      "text",
      "location",
      "mis. stasiun kereta tua di pinggiran kota, hutan pinus",
    ),
  );
  const row = el(`<div class="row3"></div>`);
  row.appendChild(
    fieldInline(
      "Era / Waktu Cerita",
      "text",
      state.era,
      (v) => (state.era = v),
      "mis. masa kini, 1920-an, masa depan",
    ),
  );
  row.appendChild(
    fieldInline(
      "Waktu Hari",
      "text",
      state.timeOfDay,
      (v) => (state.timeOfDay = v),
      "mis. senja, malam hari",
    ),
  );
  row.appendChild(
    fieldInline(
      "Cuaca",
      "text",
      state.weather,
      (v) => (state.weather = v),
      "mis. gerimis, kabut tipis",
    ),
  );
  c.appendChild(row);

  c.appendChild(el(`<div class="field"><label>Gaya Visual</label></div>`));
  const styles = [
    "Cinematic Realistic",
    "Anime Key Visual",
    "3D Octane Render",
    "Watercolor",
    "Cyberpunk Neon",
    "Studio Ghibli-esque",
    "Film Noir B&W",
    "Claymation",
    "Vintage Film Photography",
  ];
  const chipRow = el(`<div class="chiprow"></div>`);
  styles.forEach((s) => {
    const chip = el(
      `<div class="chip ${state.visualStyle === s ? "sel" : ""}">${s}</div>`,
    );
    chip.onclick = () => {
      state.visualStyle = s;
      render();
    };
    chipRow.appendChild(chip);
  });
  c.appendChild(chipRow);
  c.appendChild(
    field(
      "Referensi Visual (opsional)",
      "text",
      "visualRef",
      "mis. seperti film Spirited Away, atau fotografer Wes Anderson",
    ),
  );

  return stepWrap(
    "Setting & Gaya Visual",
    "Dunia tempat cerita ini terjadi, dan bagaimana rasanya secara visual.",
    c,
  );
}

/* STEP 3 — Platform & Teknis */
function step3() {
  const c = el(`<div></div>`);

  // JENIS OUTPUT — gambar saja / video saja / gambar+video
  c.appendChild(el(`<div class="field"><label>Jenis Output</label></div>`));
  const outputOptions = [
    { key: "both", label: "Gambar + Video (image-to-video)" },
    { key: "image", label: "Hanya Gambar" },
    { key: "video", label: "Hanya Video (text-to-video)" },
  ];
  const outChipRow = el(`<div class="chiprow"></div>`);
  outputOptions.forEach((o) => {
    const chip = el(
      `<div class="chip ${state.outputType === o.key ? "sel" : ""}">${o.label}</div>`,
    );
    chip.onclick = () => {
      state.outputType = o.key;
      render();
    };
    outChipRow.appendChild(chip);
  });
  c.appendChild(outChipRow);
  c.appendChild(
    el(
      `<p class="hint" style="margin:6px 0 20px 0">Gambar + Video: tiap scene menghasilkan 1 gambar dasar lalu digerakkan jadi video. Hanya Gambar: tiap scene cukup 1 gambar diam, tanpa gerakan/audio. Hanya Video: tiap scene langsung jadi video (text-to-video) tanpa gambar dasar terpisah — prompt videonya jadi lebih lengkap/deskriptif.</p>`,
    ),
  );

  const row = el(`<div class="row2"></div>`);
  if (state.outputType !== "video") {
    row.appendChild(
      selectField(
        "Platform Image Generator",
        ["Gemini AI","Midjourney v6/v7", "Flux", "SDXL", "DALL-E 3"],
        state.imgPlatform,
        (v) => (state.imgPlatform = v),
      ),
    );
  }
  if (state.outputType !== "image") {
    row.appendChild(
      selectField(
        "Platform Video Generator",
        [
          "Google Veo",
          "Kling AI",
          "Runway Gen-3/4",
          "Pika",
          "Luma Dream Machine",
        ],
        state.vidPlatform,
        (v) => (state.vidPlatform = v),
      ),
    );
  }
  c.appendChild(row);

  const row2 = el(`<div class="row2"></div>`);
  row2.appendChild(
    selectField(
      "Aspect Ratio",
      ["9:16 (vertical/reels)", "16:9 (landscape)", "1:1 (square)"],
      state.aspectRatio === "9:16"
        ? "9:16 (vertical/reels)"
        : state.aspectRatio,
      (v) => (state.aspectRatio = v.split(" ")[0]),
    ),
  );
  row2.appendChild(
    fieldInline(
      "Camera Style",
      "text",
      state.cameraStyle,
      (v) => (state.cameraStyle = v),
      "mis. sinematik, handheld, drone, statis",
    ),
  );
  c.appendChild(row2);

  c.appendChild(
    field(
      "Preferensi Lensa (opsional)",
      "text",
      "lens",
      "mis. wide angle, close-up, telephoto",
    ),
  );
  c.appendChild(
    fieldTextarea(
      "Elemen yang Harus Dihindari (negative prompt global)",
      "avoid",
      "mis. teks/watermark, tangan cacat, wajah blur, logo brand lain",
      2,
    ),
  );

  return stepWrap(
    "Platform & Teknis",
    "Platform yang dipakai menentukan gaya penulisan prompt.",
    c,
  );
}

/* STEP 4 — Narasi & Hook/Closing */
function step4() {
  const c = el(`<div></div>`);

  if (state.outputType === "image") {
    c.appendChild(
      el(
        `<p class="hint" style="margin-bottom:16px">Mode output saat ini "Hanya Gambar" — bagian narasi/dialog audio dilewati karena tidak ada video/suara yang dihasilkan.</p>`,
      ),
    );
  } else {
    const tRow = el(`<div class="toggle-row"></div>`);
    const tgl = el(
      `<div class="toggle ${state.needsNarration ? "on" : ""}"><div class="dot"></div></div>`,
    );
    tgl.onclick = () => {
      state.needsNarration = !state.needsNarration;
      render();
    };
    tRow.appendChild(tgl);
    tRow.appendChild(
      el(
        `<div class="toggle-label">Video ini butuh narasi / dialog karakter</div>`,
      ),
    );
    c.appendChild(tRow);

    if (state.needsNarration) {
      const row = el(`<div class="row2"></div>`);
      row.appendChild(
        selectField(
          "Mode Pembuatan Narasi",
          ["Manual", "Manual + Enhance AI", "Full Otomatis"],
          state.narrationMode,
          (v) => (state.narrationMode = v),
        ),
      );
      row.appendChild(
        fieldInline(
          "Bahasa Narasi/Dialog",
          "text",
          state.narrationLang,
          (v) => (state.narrationLang = v),
          "mis. Bahasa Indonesia, English",
        ),
      );
      c.appendChild(row);
      c.appendChild(
        fieldTextarea(
          "Draft / Poin Narasi (untuk mode Manual atau Manual+Enhance)",
          "narrationDraft",
          "Tulis kalimat lengkap (Manual) atau poin-poin kasar (Enhance) per scene bila sudah ada bayangan — kosongkan jika mode Full Otomatis",
          3,
        ),
      );
    }
  }

  const tRow2 = el(`<div class="toggle-row" style="margin-top:22px"></div>`);
  const tgl2 = el(
    `<div class="toggle ${state.shortForm ? "on" : ""}"><div class="dot"></div></div>`,
  );
  tgl2.onclick = () => {
    state.shortForm = !state.shortForm;
    render();
  };
  tRow2.appendChild(tgl2);
  tRow2.appendChild(
    el(
      `<div class="toggle-label">Format short/reels — butuh hook pembuka & closing/CTA penutup</div>`,
    ),
  );
  c.appendChild(tRow2);

  if (state.shortForm) {
    const row = el(`<div class="row2"></div>`);
    row.appendChild(
      fieldInline(
        "Jenis Hook",
        "text",
        state.hookType,
        (v) => (state.hookType = v),
        "mis. langsung ke klimaks, pertanyaan provokatif, visual mengejutkan",
      ),
    );
    row.appendChild(
      fieldInline(
        "Jenis Closing",
        "text",
        state.closingType,
        (v) => (state.closingType = v),
        "mis. CTA follow, plot twist, cliffhanger part 2",
      ),
    );
    c.appendChild(row);
    c.appendChild(
      el(
        `<p class="hint">Kosongkan untuk pakai hook/closing standar sesuai genre.</p>`,
      ),
    );
  }

  return stepWrap(
    "Narasi & Hook/Closing",
    "Apakah ada suara yang diucapkan, dan bagaimana video ini membuka & menutup perhatian penonton.",
    c,
  );
}

/* STEP 5 — Catatan tambahan */
function step5() {
  const c = el(`<div></div>`);
  c.appendChild(
    fieldTextarea(
      "Catatan Gaya / Referensi Tambahan (opsional)",
      "extraNotes",
      "Ruang bebas untuk detail kreatif spesifik yang harus konsisten di semua scene. Contoh: daftar objek yang wajib muncul, atau detail desain khusus (mis. 'setiap kereta punya wajah — mulut, hidung, mata — dan bisa berbicara').",
      5,
    ),
  );
  return stepWrap(
    "Catatan Tambahan",
    "Detail ini akan ditulis ulang persis sama di setiap scene yang relevan, sama seperti deskripsi karakter.",
    c,
    { nextLabel: "Lihat Ringkasan →" },
  );
}

/* STEP 6 — Generate */
function step6() {
  const c = el(`<div></div>`);

  const slate = el(`<div class="slate"></div>`);
  slate.appendChild(el(`<div class="slate-top"></div>`));
  const body = el(`<div class="slate-body"></div>`);
  body.appendChild(
    row2(
      "JUDUL",
      state.title || "(belum diisi — akan diasumsikan otomatis)",
    ),
  );
  body.appendChild(
    row2(
      "GENRE / MOOD",
      `${state.genre.join(", ") || "-"} — ${state.mood || "-"}`,
    ),
  );
  body.appendChild(
    row2(
      "DURASI TARGET",
      `${state.durationTotal} detik${state.sceneCount ? ` · ${state.sceneCount} scene` : " · scene auto"}`,
    ),
  );
  body.appendChild(
    row2(
      "KARAKTER",
      `${state.characters.filter((c) => c.name).length || state.characters.length} karakter`,
    ),
  );
  body.appendChild(row2("JENIS OUTPUT", outputTypeLabel(state.outputType)));
  body.appendChild(
    row2(
      "PLATFORM",
      state.outputType === "both"
        ? `${state.imgPlatform} → ${state.vidPlatform} · ${state.aspectRatio}`
        : state.outputType === "image"
          ? `${state.imgPlatform} (gambar saja) · ${state.aspectRatio}`
          : `${state.vidPlatform} (video saja, text-to-video) · ${state.aspectRatio}`,
    ),
  );
  body.appendChild(
    row2(
      "NARASI",
      state.outputType === "image"
        ? "Tidak berlaku (mode gambar saja)"
        : state.needsNarration
          ? `Ya (${state.narrationMode}, ${state.narrationLang})`
          : "Tidak",
    ),
  );
  body.appendChild(
    row2(
      "FORMAT",
      state.shortForm ? "Short-form (hook + closing)" : "Standar",
    ),
  );
  slate.appendChild(body);
  c.appendChild(slate);

  if (state.planError) {
    c.appendChild(el(`<div class="errbox">⚠ ${state.planError}</div>`));
  }

  if (!state.generating && state.scenes.length === 0) {
    const genBtn = el(
      `<button class="btn primary" style="width:100%;padding:16px;font-size:14px">▶ GENERATE SCENE BREAKDOWN</button>`,
    );
    genBtn.onclick = runPlanning;
    c.appendChild(genBtn);
  }

  if (state.generating && state.scenes.length === 0) {
    c.appendChild(
      el(
        `<div class="loadbox"><div class="spin"></div> Menyusun breakdown scene & story bible...</div>`,
      ),
    );
  }

  if (state.scenes.length > 0) {
    c.appendChild(renderScenesArea());
  }

  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<h2 class="sect-title">Generate</h2>`));
  wrap.appendChild(
    el(
      `<p class="sect-sub">Slate akan menyusun breakdown scene dulu, lalu menulis prompt satu-per-satu (gambar dan/atau video sesuai jenis output yang dipilih) supaya detail dan konsisten.</p>`,
    ),
  );
  wrap.appendChild(c);

  const nav = el(`<div class="navrow"></div>`);
  const backBtn = el(`<button class="btn ghost">← Kembali</button>`);
  backBtn.onclick = () => {
    state.step = 5;
    render();
  };
  nav.appendChild(backBtn);
  nav.appendChild(el(`<span></span>`));
  wrap.appendChild(nav);

  return wrap;
}

function row2(k, v) {
  return el(`<div class="row"><span>${k}</span><b>${escapeHtml(v)}</b></div>`);
}

function renderScenesArea() {
  const wrap = el(`<div style="margin-top:24px"></div>`);
  state.scenes.forEach((sc) => {
    wrap.appendChild(renderSceneCard(sc));
  });

  if (
    state.storyBible &&
    state.storyBible.platform_notes &&
    Object.keys(state.sceneResults).length === state.scenes.length
  ) {
    const sum = el(`<div class="summary"></div>`);
    sum.appendChild(el(`<h3>Ringkasan Produksi</h3>`));
    const totalGen = state.scenes.reduce(
      (a, s) => a + (s.duration_sec || 0),
      0,
    );
    sum.appendChild(
      el(
        `<p><span class="k">Durasi</span> · ${totalGen} detik dihasilkan (target ${state.durationTotal} detik)</p>`,
      ),
    );
    const hook = state.scenes.find((s) => s.tag === "HOOK");
    const closing = state.scenes.find((s) => s.tag === "CLOSING");
    if (hook || closing) {
      sum.appendChild(
        el(
          `<p><span class="k">Hook / Closing</span> · ${hook ? `Scene ${hook.index} = HOOK` : "-"} · ${closing ? `Scene ${closing.index} = CLOSING` : "-"}</p>`,
        ),
      );
    }
    sum.appendChild(
      el(
        `<p><span class="k">Platform</span> · ${escapeHtml(state.storyBible.platform_notes)}</p>`,
      ),
    );
    const copyAllBtn = el(
      `<button class="btn primary" style="margin-top:8px">📋 Copy Semua Sebagai Teks</button>`,
    );
    copyAllBtn.onclick = () => copyText(buildFullMarkdown(), "Semua scene");
    sum.appendChild(copyAllBtn);
    wrap.appendChild(sum);
  }

  return wrap;
}

function renderSceneCard(sc) {
  const res = state.sceneResults[sc.index];
  const scene = el(`<div class="scene"></div>`);
  scene.appendChild(el(`<div class="sprocket"></div>`));
  const body = el(`<div class="scene-body"></div>`);

  const head = el(`<div class="scene-head"></div>`);
  const tagHtml =
    sc.tag === "HOOK"
      ? `<span class="tag hook">HOOK</span>`
      : sc.tag === "CLOSING"
        ? `<span class="tag closing">CLOSING</span>`
        : "";
  head.appendChild(
    el(
      `<div class="scene-title">Scene ${sc.index} — ${escapeHtml(res ? res.scene_title : sc.title)} ${tagHtml}</div>`,
    ),
  );
  head.appendChild(
    el(`<div class="scene-meta">durasi ${sc.duration_sec}s</div>`),
  );
  body.appendChild(head);
  body.appendChild(
    el(
      `<p style="font-size:12.5px;color:#7d7364;margin:-6px 0 14px 0">${escapeHtml(sc.beat)}</p>`,
    ),
  );

  if (!res && state.generating) {
    body.appendChild(
      el(
        `<div class="loadbox" style="color:#a97a3d"><div class="spin" style="border-top-color:#a97a3d"></div> Menulis prompt scene ini...</div>`,
      ),
    );
  } else if (!res) {
    const genOne = el(`<button class="miniact">▶ Generate scene ini</button>`);
    genOne.onclick = () => runOneScene(sc);
    body.appendChild(genOne);
  } else {
    // Blok ditampilkan sesuai field yang benar-benar ada di hasil —
    // otomatis menyesuaikan jenis output (gambar saja / video saja / keduanya)
    if (res.image_prompt) {
      body.appendChild(promptBlock("Prompt Gambar", res.image_prompt, false));
      body.appendChild(
        promptBlock(
          "Negative Prompt (Gambar)",
          res.image_negative_prompt,
          true,
        ),
      );
    }
    if (res.video_prompt) {
      const vidLabel =
        state.outputType === "video"
          ? "Prompt Video (text-to-video)"
          : "Prompt Video (image-to-video)";
      body.appendChild(promptBlock(vidLabel, res.video_prompt, false));
      body.appendChild(
        promptBlock(
          "Negative Prompt (Video)",
          res.video_negative_prompt,
          true,
        ),
      );
    }
    if (res.narration) {
      body.appendChild(
        promptBlock("Narasi / Dialog (Audio)", res.narration, false, true),
      );
    }
    const actions = el(`<div class="scene-actions"></div>`);
    const regen = el(`<button class="miniact">↻ Generate ulang scene ini</button>`);
    regen.onclick = () => runOneScene(sc, true);
    actions.appendChild(regen);
    body.appendChild(actions);
  }

  scene.appendChild(body);
  return scene;
}

function promptBlock(label, text, isNeg, isNarr) {
  const b = el(
    `<div class="promptblock ${isNeg ? "negrow" : ""} ${isNarr ? "narration" : ""}"></div>`,
  );
  const lbl = el(`<div class="lbl"><span>${label}</span></div>`);
  const btn = el(`<button class="copybtn">copy</button>`);
  btn.onclick = () => copyText(text, label);
  lbl.appendChild(btn);
  b.appendChild(lbl);
  b.appendChild(el(`<pre>${escapeHtml(text)}</pre>`));
  return b;
}

function escapeHtml(s) {
  if (s === undefined || s === null) return "";
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}

/* ---------------------------------------------------------
   FORM FIELD BUILDERS
--------------------------------------------------------- */
function field(label, type, key, placeholder) {
  const f = el(`<div class="field"><label>${label}</label></div>`);
  const input = el(
    `<input type="${type}" placeholder="${placeholder || ""}" value="${escapeHtml(state[key])}">`,
  );
  input.oninput = (e) => (state[key] = e.target.value);
  f.appendChild(input);
  return f;
}
function fieldInline(label, type, val, onChange, placeholder) {
  const f = el(`<div class="field"><label>${label}</label></div>`);
  const input = el(
    `<input type="${type}" placeholder="${placeholder || ""}" value="${escapeHtml(val)}">`,
  );
  input.oninput = (e) => onChange(e.target.value);
  f.appendChild(input);
  return f;
}
function fieldTextarea(label, key, placeholder, rows) {
  const f = el(`<div class="field"><label>${label}</label></div>`);
  const ta = el(
    `<textarea rows="${rows || 3}" placeholder="${placeholder || ""}">${escapeHtml(state[key])}</textarea>`,
  );
  ta.oninput = (e) => (state[key] = e.target.value);
  f.appendChild(ta);
  return f;
}
function selectField(label, options, current, onChange) {
  const f = el(`<div class="field"><label>${label}</label></div>`);
  const sel = el(`<select></select>`);
  options.forEach((o) => {
    const opt = el(`<option ${o === current ? "selected" : ""}>${o}</option>`);
    sel.appendChild(opt);
  });
  sel.onchange = (e) => onChange(e.target.value);
  f.appendChild(sel);
  return f;
}

/* ---------------------------------------------------------
   GENERATION LOGIC
--------------------------------------------------------- */
async function runPlanning() {
  state.generating = true;
  state.planError = "";
  render();
  try {
    const plan = await callGemini(
      getRulesPlanning(state.outputType),
      buildUserContextSummary(),
    );
    state.storyBible = plan.story_bible;
    state.scenes = plan.scenes || [];
    state.storyBible.platform_notes = plan.platform_notes || "";
    state.sceneResults = {};
    render();
    // run scenes sequentially
    for (const sc of state.scenes) {
      await runOneScene(sc, false, true);
    }
  } catch (err) {
    state.planError =
      "Gagal menyusun breakdown: " + err.message + ". Coba klik generate lagi.";
  }
  state.generating = false;
  render();
}

async function runOneScene(sc, isRegen, silent) {
  if (!silent) {
    state.generating = true;
    render();
  }
  try {
    const platformLines = [];
    if (state.outputType !== "video")
      platformLines.push(`PLATFORM IMAGE: ${state.imgPlatform}`);
    if (state.outputType !== "image")
      platformLines.push(`PLATFORM VIDEO: ${state.vidPlatform}`);

    const narrationLines =
      state.outputType === "image"
        ? ""
        : `
BUTUH NARASI: ${state.needsNarration ? "Ya" : "Tidak"}
MODE NARASI: ${state.narrationMode}
BAHASA NARASI: ${state.narrationLang}
DRAFT NARASI USER (jika ada, untuk scene manapun yang relevan): ${state.narrationDraft || "-"}`;

    const ctx = `STORY BIBLE:
- Deskripsi Karakter: ${state.storyBible.characters_summary}
- Visual Style Tokens: ${state.storyBible.visual_style_tokens}
- Color Grade Tokens: ${state.storyBible.color_grade_tokens}
- Catatan Tambahan Wajib: ${state.storyBible.additional_notes_tokens}

SETTING GLOBAL: ${state.location || "-"}, era ${state.era || "-"}, waktu ${state.timeOfDay || "-"}, cuaca ${state.weather || "-"}
CAMERA STYLE: ${state.cameraStyle || "-"} (lensa: ${state.lens || "-"})
ASPECT RATIO: ${state.aspectRatio}
JENIS OUTPUT: ${outputTypeLabel(state.outputType)}
${platformLines.join("\n")}
NEGATIVE GLOBAL (gabungkan ke negative prompt): ${state.avoid || "-"}${narrationLines}

SCENE INI:
- Index: ${sc.index}
- Judul: ${sc.title}
- Durasi: ${sc.duration_sec} detik
- Tag: ${sc.tag || "-"}
- Beat/kejadian: ${sc.beat}`;
    const result = await callGemini(getRulesScene(state.outputType), ctx);
    state.sceneResults[sc.index] = result;
  } catch (err) {
    state.sceneResults[sc.index] = null;
    state.planError = `Gagal generate scene ${sc.index}: ${err.message}`;
  }
  if (!silent) {
    state.generating = false;
  }
  render();
}

function buildFullMarkdown() {
  let out = `${state.title || "Untitled Project"}\nTarget durasi: ${state.durationTotal}s | Output: ${outputTypeLabel(state.outputType)} | Aspect: ${state.aspectRatio}\n\n`;
  state.scenes.forEach((sc) => {
    const r = state.sceneResults[sc.index];
    if (!r) return;
    out += `Scene ${sc.index} — ${r.scene_title}${sc.tag ? ` [${sc.tag}]` : ""} (durasi: ${sc.duration_sec} detik)\n\n`;
    if (r.image_prompt) {
      out += `• Prompt untuk generate gambar:\n${r.image_prompt}\nNegative prompt: ${r.image_negative_prompt}\n\n`;
    }
    if (r.video_prompt) {
      out += `• Prompt untuk generate video${state.outputType === "video" ? " (text-to-video)" : " dari gambar"}:\n${r.video_prompt}\nNegative prompt: ${r.video_negative_prompt}\n\n`;
    }
    if (r.narration) {
      out += `• Narasi/Dialog (audio/dubbing): ${r.narration}\n\n`;
    }
    out += `---\n\n`;
  });
  if (state.storyBible) {
    out += `Ringkasan: ${state.storyBible.platform_notes}\n`;
  }
  return out;
}

render();
