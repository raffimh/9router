# 🔄 9router Update Checklist — Patch Collection (raffimh/9router)

> **WAJIB DIBACA setiap kali 9router menerima update** (via `npm update`, `npx 9router@latest`, atau reinstall).
>
> Update 9router **menimpa file build** (`.next-cli-build/`), sehingga semua patch **HILANG otomatis**.
> Ikuti langkah di bawah SEBELUM menggunakan 9router lagi.

---

## 🩹 Patch yang dikelola di sini

| # | Patch | Masalah | Status upstream (v0.5.55) |
|---|---|---|---|
| 1 | **Vision trimmer** (`capacityAdapter.js`) | History dipangkas `slice(0,6)` tanpa cek budget → model vision derail, menjawab topik lama | ❌ Masih bug |
| 2 | **Qoder quota-112 disable** (`src/sse/services/auth.js`) | Qoder 403/code 112 (quota habis) hanya kena cooldown 2 menit → akun mati dipilih terus | ❌ Masih bug |
| 3 | **Antigravity 403 fingerprint/host** (`open-sse/providers/shared.js`, MITM) | Host daily lama dan User-Agent `darwin/arm64` dapat ditolak Google, terutama di Windows | ❌ Masih bug |
| 4 | **Antigravity dangling functionCall + thinking-only content** (`translator/request/openai-to-gemini.js`) | (a) Tool result kosong (`content:""`/`null`) atau tool call tanpa hasil → `functionCall` tanpa pasangan `functionResponse`; (b) Turn thinking yang terpotong (dikirim client sebagai `{content:"", reasoning_content}`) → content MODEL berisi hanya thought-part. Keduanya → Gemini **400 INVALID_ARGUMENT** permanen untuk session itu sampai `/compact` | ❌ Masih bug |
| 5 | **Capabilities: deepseek-vision + Xiaomi MiMo** (`providers/capabilities.js`) | `deepseek-v4-flash-vision-exp` tidak kena vision (ditelan pattern `*deepseek-v4*` text-only). MiMo: semua varian LLM punya reasoning tapi tidak diset; `mimo-v2.5-pro` keliru dikasih vision (aslinya **text-only** — yang multimodal adalah `mimo-v2.5` base); varian TTS tanya tools/audio-out | ❌ Masih bug |
| 6 | **Usage hilang saat client abort** (`open-sse/utils/stream.js`) | `onStreamComplete`/`saveUsageStats` hanya dipanggil di `flush()` transform stream. Codex menutup koneksi SSE begitu menerima `response.completed` (`DISCONNECT: ResponseAborted`) → `reader.cancel()`+`writer.abort()` melewati `flush()` → usage Antigravity/Gemini **tidak pernah tersimpan ke DB**, sementara provider cepat (glm) selesai normal lewat `flush()` dan tercatat | ❌ Masih bug |
| 7 | **Turn reasoning-only menghentikan task diam-diam** (`open-sse/utils/stream.js`) | Gemini flash kadang stream thought parts lalu finish (STOP, **bukan** MAX_TOKENS) tanpa text/tool call. `response.completed` dengan output kosong → Codex menganggap turn sukses → `task_complete` + `last_agent_message: null` → task berhenti diam-diam di tengah pekerjaan. Terverifikasi live (session Codex 22:55, 178k ctx, 3288 token murni thinking). **Effort level tidak mempengaruhi** — quirk stokastik model, medium tetap bisa kena | ❌ Masih bug |
| 8 | **Hang stream antigravity tidak retryable + deteksi lambat** (`streamHandler.js` + `streamingHandler.js` + `registry/antigravity.js`) | (a) `response.failed` sintetis (onAbortTerminal) hanya dipasang untuk Responses **passthrough** — jalur translate (codex→antigravity) saat stall/abort ditutup polos tanpa terminal event → Codex tidak retry; (b) watchdog stall tunggal 6 menit tidak membedakan koneksi hang (0 byte; TTFT sehat antigravity ~4 detik) vs silence thinking sah di tengah stream. Terverifikasi live: 0 byte selama 6 menit (IN 276k) → task mati | ❌ Masih bug |
| 9 | **`response.completed` tanpa usage → Codex tidak pernah auto-compact** (`translator/response/openai-responses.js`) | Konverter openai→responses tidak menyertakan `response.usage` di `response.completed`. Codex membaca field ini untuk `token_count` (di session live semua `info:null`) dan pemicu auto-compaction. Tanpa itu context terus membengkak melewati window katalog (live: 297k dari 280k!), yang juga menaikkan probabilitas quirk reasoning-only gemini | ❌ Masih bug |
| 10 | **Variasi Tema Dracula Dark Mode** (`globals.css` + `themeStore.js`) | Menambahkan palet warna resmi Dracula (Background `#282a36`, Current Line `#44475a`, Purple `#bd93f9`, Pink `#ff79c6`, Green `#50fa7b`, Yellow `#f1fa8c`, Cyan `#8be9fd`, Red `#ff5555`, Foreground `#f8f8f2`). Terintegrasi ke tombol theme toggle dan profile settings | 🚀 Fitur Baru |

Semua fix hidup di **satu branch integrasi: `patched`** di fork [`raffimh/9router`](https://github.com/raffimh/9router).

```
master (= upstream v0.5.55, sync otomatis)
└── patched  ← SATU branch untuk semua fix
      ├── fix(capacityAdapter): keep full history (vision trimmer)
      ├── docs(patches): file patch + checklist ini
      ├── fix(auth): disable Qoder connection on quota exhaustion
      ├── fix(antigravity): use sandbox host + platform-matched IDE fingerprint
      ├── fix(antigravity): always pair functionCall with functionResponse
      ├── fix(stream): finalize usage accounting in cancel() when client aborts SSE stream
      └── fix(stream): replace terminal event on gemini-family reasoning-only turns
```

> Catatan: ada juga commit "fix(stream): retryable stall failure + first-byte watchdog"
> (patch #8) di branch yang sama.

> 📌 Fix lama tidak akan hilang: semuanya commit permanen di `patched`.
> Fix baru di masa depan = tambah commit baru di branch yang sama.

---

## 📋 Ringkasan cepat tiap update

| Langkah | Aksi | Waktu |
|---|---|---|
| 1 | Cek apakah upstream sudah menyerap tiap fix | 1 menit |
| 2 | Re-apply patch yang masih diperlukan ke instalasi npm | 30 detik |
| 3 | Restart 9router | 10 detik |
| 4 | Verifikasi | 1 menit |
| 5 | (Opsional) Sync fork + rebase branch `patched` | 1 menit |

---

## Langkah 1 — Cek: fix mana yang masih dibutuhkan?

### 1a. Vision trimmer

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/open-sse/services/capacityAdapter.js" -UseBasicParsing).Content
if ($content -match 'HEAD_KEEP') {
    Write-Output "⚠️  Vision trimmer: BUG MASIH ADA → patch dibutuhkan"
} else {
    Write-Output "✅ Vision trimmer: upstream sudah fix → skip patch-nya"
}
```

Atau manual: buka `https://github.com/decolua/9router/blob/main/open-sse/services/capacityAdapter.js`, cari kata `HEAD_KEEP`.

### 1b. Qoder quota-112 disable

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/src/sse/services/auth.js" -UseBasicParsing).Content
if ($content -match 'isQoderQuotaExhausted|Qoder quota exhausted') {
    Write-Output "✅ Qoder 112: upstream sudah fix → skip patch-nya"
} else {
    Write-Output "⚠️  Qoder 112: BUG MASIH ADA → patch dibutuhkan"
}
```

### 1c. Antigravity dangling functionCall

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/open-sse/translator/request/openai-to-gemini.js" -UseBasicParsing).Content
if ($content -match 'hasActualResponses') {
    Write-Output "⚠️  Antigravity pairing: BUG MASIH ADA → patch dibutuhkan"
} else {
    Write-Output "✅ Antigravity pairing: upstream sudah fix → skip patch-nya"
}
```

### 1d. Capabilities deepseek-vision / MiMo

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/open-sse/providers/capabilities.js" -UseBasicParsing).Content
if ($content -match '\*deepseek\*vision\*' -and $content -match '\*mimo\*v2\.5\*pro\*') {
    Write-Output "✅ Capabilities vision/MiMo: upstream sudah fix → skip patch-nya"
} else {
    Write-Output "⚠️  Capabilities vision/MiMo: BUG MASIH ADA → patch dibutuhkan"
}
```

### 1e. Usage saat client abort

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/open-sse/utils/stream.js" -UseBasicParsing).Content
if ($content -match 'finalizeUsageTracking') {
    Write-Output "✅ Cancel-usage: upstream sudah fix → skip patch-nya"
} else {
    Write-Output "⚠️  Cancel-usage: BUG MASIH ADA → patch dibutuhkan"
}
```

### 1f. Turn reasoning-only

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/open-sse/utils/stream.js" -UseBasicParsing).Content
if ($content -match 'reasoning-only turn') {
    Write-Output "✅ Reasoning-only: upstream sudah fix → skip patch-nya"
} else {
    Write-Output "⚠️  Reasoning-only: BUG MASIH ADA → patch dibutuhkan"
}
```

---

## Langkah 2 — Re-apply patch ke instalasi npm

> ⚠️ Path `v24.13.1` di bawah sesuai versi Node saat ini. Kalau ganti versi Node,
> cari path aktif dengan:
> ```powershell
> (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '9router' } | Select-Object -First 1).CommandLine
> ```

### 2a. Vision trimmer → patch file build minified

**Opsi A: Prompt ke agent harness** (paling gampang)

Copy-paste ke opencode / Cline / harness lain:

> Re-apply patch fix vision-trimmer 9router:
> 1. Buka file `%LOCALAPPDATA%\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks\112.js` (nama chunk bisa berbeda tiap versi — cari file yang mengandung `l.slice(0,6)`).
> 2. Ganti `l.slice(0,6)` → `l.slice()`. Kalau sudah `l.slice()` → berhenti (sudah aktif).
> 3. Backup dulu file asli dengan suffix `.bak-<tanggal>` sebelum edit.
> 4. Verifikasi: `l.slice(0,6)` harus 0 kemunculan di seluruh folder chunks, `l.slice()` tepat 1.
> 5. Ingatkan saya restart 9router.

**Opsi B: Manual (PowerShell)**

```powershell
$dir = "$env:LOCALAPPDATA\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks"
$f = Get-ChildItem "$dir\*.js" -File | ForEach-Object {
    if ((Get-Content $_.FullName -Raw) -match 'l\.slice\(0,6\)') { $_.FullName }
}
if (-not $f) { Write-Output "✅ Vision patch sudah aktif (atau struktur berubah)"; return }
Copy-Item $f "$f.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
$c = Get-Content $f -Raw -Encoding UTF8
Set-Content $f ($c -replace 'l\.slice\(0,6\)', 'l.slice()') -Encoding UTF8 -NoNewline
Write-Output "✅ Patched: $f"
```

File patch git-format juga tersedia: [`fix-vision-trimmer.patch`](./fix-vision-trimmer.patch)

### 2b. Qoder quota-112 → patch file build minified

Patch ini mengubah `src/sse/services/auth.js` (source). Di instalasi npm, kodenya
ter-bundle di salah satu chunk. Cara re-apply paling aman: **prompt agent harness**,
karena nama chunk dan bentuk minified bisa berubah tiap versi:

> Re-apply patch Qoder quota-112 disable ke build 9router:
> 1. Di folder `%LOCALAPPDATA%\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks`, cari chunk yang mengandung fungsi `markAccountUnavailable` (atau penanganan error 403 provider). Backup file itu dulu.
> 2. Tambahkan logika: jika provider = qoder DAN status = 403 DAN errorText mengandung `"code":"112"` → set koneksi `isActive:false`, `testStatus:"unavailable"`, dan return `shouldFallback:true, cooldownMs:0` (tanpa timed lock).
> 3. Referensi implementasi source-level: https://github.com/raffimh/9router branch `patched`, commit "fix(auth): disable Qoder connection on quota exhaustion" — fungsi `isQoderQuotaExhausted` di `src/sse/services/auth.js`.
> 4. Verifikasi: string `Qoder quota exhausted` muncul di chunk tersebut.

> 💡 Alternatif lebih bersih: build 9router dari fork branch `patched`
> (`npm install && npm run build`), sehingga semua fix langsung termasuk.
> Lebih lama, tapi tidak perlu patch manual sama sekali.

### 2c. Antigravity 403 → rebuild source dengan patch branch

Patch ini mengubah source-level routing Antigravity:

- memakai `daily-cloudcode-pa.sandbox.googleapis.com` sebagai host chat utama;
- menambahkan host sandbox ke MITM/DNS routing;
- memakai User-Agent `antigravity/ide/2.1.1 windows/amd64` pada Windows (atau pasangan OS/arsitektur host);
- memperbarui probe koneksi agar tidak kembali ke fingerprint lama.

Build ulang dari branch `patched` agar perubahan masuk ke bundle. Jangan hanya mengganti
file OAuth onboarding; jalur chat dan MITM juga harus ikut ter-build.

### 2d. Antigravity dangling functionCall → patch build atau rebuild

Fix ini mengubah logika konverter (bukan one-liner), jadi untuk instalasi npm
gunakan **prompt agent harness** atau **build dari fork**:

> Re-apply patch fix antigravity dangling-functionCall ke build 9router:
> 1. Di folder `%LOCALAPPDATA%\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks`, cari chunk yang mengandung `hasActualResponses`. Backup file itu dulu.
> 2. Referensi implementasi source-level: https://github.com/raffimh/9router branch `patched`, commit "fix(antigravity): always pair functionCall with functionResponse" — `open-sse/translator/request/openai-to-gemini.js`.
> 3. Perubahan inti: (a) keberadaan response dicek `fid in toolResponses` (bukan truthiness), (b) tool result `""`/`null` tetap menghasilkan `functionResponse` `{result:""}`, (c) tool call tanpa pesan hasil sama sekali mendapat `functionResponse` sintetis `"(no tool result returned)"`, (d) `args` JSON tak valid fallback `{}`.
> 4. Verifikasi: string `no tool result returned` muncul di chunk tersebut.

### 2e. Capabilities deepseek-vision / MiMo → patch file build minified

Tabel pattern ada di **chunk `412.js` dan `6306.js`** (nama bisa berbeda — cari chunk
yang mengandung `*mimo*v2.5*`). Backup dulu, lalu dua penggantian:

> Re-apply patch capabilities deepseek-vision + MiMo ke build 9router:
> 1. Cari chunk yang mengandung `*mimo*v2.5*` (ada 2 file). Backup keduanya.
> 2. Sebelum `{pattern:"*deepseek-v4*",caps:{reasoning:!0,thinkingFormat:"deepseek",contextWindow:1e6,maxOutput:384e3}}` sisipkan `{pattern:"*deepseek*vision*",caps:{vision:!0,reasoning:!0,thinkingFormat:"deepseek",contextWindow:1e6,maxOutput:384e3}},`
> 3. Ganti tiga entri mimo (`*mimo*v2.5*`, `*mimo*omni*`, `*mimo*`) dengan tujuh entri: `*mimo*tts*` (tools:!1,audioOutput:!0,8192), `*mimo*v2.5*pro*` & `*mimo*v2-pro*` (reasoning:!0,1048576), `*mimo*v2-flash*` (reasoning:!0,262144), `*mimo*v2.5*` (vision+audio+video+reasoning,1048576), `*mimo*omni*` (vision+audio+reasoning,262144), `*mimo*` (vision+reasoning,262144). Urutan penting: pro/tts sebelum v2.5.
> 4. `node --check` kedua file; verifikasi `*deepseek*vision*` dan `*mimo*v2.5*pro*` muncul.
> 5. Referensi source: commit "fix(capabilities): correct deepseek-vision and Xiaomi MiMo patterns".

### 2f. Usage saat client abort → patch build minified

Fix mengubah `open-sse/utils/stream.js`: logika finalisasi usage dipindah ke helper
`finalizeUsageTracking()` (guard sekali-jalan) yang dipanggil dari `flush()` DAN
hook `cancel()` baru pada TransformStream. Di build npm, kodenya ada di **chunk
`8895.js`** (nama bisa berbeda — cari chunk yang mengandung `Error in flush`).

> Re-apply patch fix cancel-usage ke build 9router:
> 1. Cari chunk yang mengandung `Error in flush` di `.next-cli-build\server\chunks`. Backup (sudah ada `.bak-cancel-usage` untuk 8895.js v0.5.55).
> 2. Referensi source: https://github.com/raffimh/9router branch `patched`, commit "fix(stream): finalize usage accounting in cancel() when client aborts SSE stream" — `open-sse/utils/stream.js` (helper `finalizeUsageTracking` + hook `cancel`).
> 3. Perubahan inti minified (nama variabel bisa beda per versi): (a) deklarasikan `_sf=!1` + arrow `_fin` setelah deklarasi `streamDoneSent` — isi: `trackPendingRequest(...,!1)`, estimasi usage bila belum ada, `logUsage`/`appendRequestLog`, panggil `onStreamComplete(content/thinking, usage, ttft)`; (b) hapus pemanggilan `trackPendingRequest` dan blok log/onStreamComplete duplikat di kedua cabang `flush`; (c) tambahkan method `cancel(a){dbg(...),_fin()}` pada object literal TransformStream.
> 4. Verifikasi: `node --check <chunk>` lulus; string `Error in finalizeUsageTracking` dan `cancel | provider=` muncul di chunk.
> 5. Regression test: `tests/unit/stream-cancel-usage.test.js` (4 test) di repo tests.

### 2g. Turn reasoning-only → patch build minified

Fix mengubah `open-sse/utils/stream.js`: saat item terminal hendak
di-emit pada stream gemini-family dan turn terbukti reasoning-only
(accumulatedContent kosong, tidak ada tool call, thinking non-kosong):
- Pada **Codex** (`sourceFormat === OPENAI_RESPONSES`): ganti `response.completed` dengan `response.failed` retryable (`formatIncompleteOpenAIResponsesStreamFailure`) + `[DONE]`.
- Pada **OpenCode / SDK standar** (`sourceFormat === OPENAI`): ganti chunk `finish_reason: "stop"` kosong dengan error chunk SSE (`{"error":{"message":"...","type":"stream_disconnected"}}`) + `[DONE]`, sehingga library client (Vercel AI SDK) memicu retry otomatis dan tidak menghentikan turn diam-diam.

Di build npm: chunk yang sama dengan patch #6 (**`8895.js`**, cari `Error in flush`).

**PENTING (Antigravity Envelope):** Antigravity membungkus setiap chunk dalam
`{ response: { candidates: [...] } }`. Di jalur akumulasi thinking/content stream.js,
wajib unwrap `(p.response?.candidates || p.candidates)` agar `accumulatedThinking`
benar-benar bertambah pada stream Antigravity. Tanpa unwrap ini, thinking terbaca 0
dan guard reasoning-only tidak akan pernah terpicu!

> Re-apply patch reasoning-only-turn ke build 9router:
> 1. Cari chunk yang mengandung `Error in flush` (sama dengan patch #6). Backup (`.bak-ronly` sudah ada untuk 8895.js v0.5.55).
> 2. Referensi source: https://github.com/raffimh/9router branch `patched`, commit "fix(stream): extend reasoning-only turn protection to OpenAI-format clients (OpenCode)".
> 3. Inti:
>    (a) Di jalur akumulasi `p.candidates?.[0]?.content?.parts`, ubah menjadi `(p.response?.candidates||p.candidates)?.[0]?.content?.parts`.
>    (b) **hoist** ke scope fungsi (sebelum `return new TransformStream`): `const _gf = targetFormat∈{GEMINI,GEMINI_CLI,VERTEX,ANTIGRAVITY}`, `const _pv = provider`;
>    (c) di loop items translate-mode (setelah filter `hasValuableContent`, sebelum injeksi usage), guard: `(sourceFormat===OPENAI_RESPONSES || sourceFormat===OPENAI) && _gf && !streamDoneSent && (sourceFormat===OPENAI_RESPONSES ? item?.event==="response.completed" : !!item?.choices?.[0]?.finish_reason) && accumulatedContent.length===0 && !(state?.geminiToolCallCount>0) && accumulatedThinking.length>0` → enqueue synthetic failure (Responses) atau error chunk (OpenAI) + `data: [DONE]\n\n`, set `openAIResponsesTerminalSeen=streamDoneSent=true`, `continue`.
>    ⚠️ **PENTING (pelajaran v1 → ReferenceError TDZ live):** di dalam loop items minified, nama scope-luar TER-SHADOW oleh deklarasi lokal di akhir body (`let c=formatSSE(...)`, `let p=parsedLine`, dst). JANGAN mereferensikan `c`/`p` mentah di dalam loop — selalu hoist ke const baru di scope fungsi dulu. String `reasoning-only turn` harus direferensikan via nama hoisted.
> 4. Verifikasi: `node --check` lulus; string `reasoning-only turn` muncul di chunk; **dan** pastikan tidak ada referensi `c`/`p` telanjang di dalam blok guard.
> 5. Regression test: `tests/unit/reasoning-only-turn.test.js` (7 test termasuk OpenAI format & Antigravity envelope).


### 2h. Stall retryable + first-byte watchdog → patch build minified

Fix mengubah 3 file: `open-sse/utils/streamHandler.js` (param `firstByteTimeoutMs`
di `pipeWithDisconnect`; armStall memakai timeout pendek selama `chunkCount===0`),
`open-sse/handlers/chatCore/streamingHandler.js` (`onAbortTerminal` untuk SEMUA
klien Responses, bukan hanya passthrough; pass `PROVIDERS[provider]?.stallFirstByteMs`),
`open-sse/providers/registry/antigravity.js` (transport `stallFirstByteMs: 120000`).

Di build npm:
- **8895.js L4** (streamingHandler): kondisi `M=p===OPENAI_RESPONSES&&q===OPENAI_RESPONSES?j.Hr:null` → `M=p===OPENAI_RESPONSES?j.Hr:null`; tambah `_fb=PROVIDERS[b]?.stallFirstByteMs||null` dan pass sebagai arg ke-6 pipeWithDisconnect.
- **8895.js L13** (pipeWithDisconnect): signature + `let _t=h`, armStall pakai `0===j&&_fb?_fb:h`.
- **1901.js / 4953.js / 5285.js** (registry antigravity): sisip `stallFirstByteMs:12e4,` setelah `format:"antigravity",` (muncul di 3 chunk — patch semuanya).

> ⚠️ TDZ/shadowing: pakai nama fresh (`_fb`,`_t`) — jangan referensikan `c`/`p` mentah di dalam fungsi minified.
> Verifikasi: `node --check` semua chunk; string `stallFirstByteMs` muncul di 8895 + 3 chunk registry.
> Regression test: `tests/unit/stall-first-byte.test.js` (2 test).

### 2i. Usage di response.completed → patch build minified

Fix mengubah `open-sse/translator/response/openai-responses.js`: helper `toResponsesUsage`
(konversi prompt_tokens/cached/reasoning → bentuk Responses) + `sendCompleted`
menyertakan `usage` di `response.completed`; capture `chunk.usage` intermediate
di entry streaming. Di build npm: **chunk `8499.js`** (cari fungsi yang meng-emit
`response.completed` dengan `status:"completed",background:!1,error:null` —
sendCompleted minified).

> Re-apply patch usage-in-completed ke build 9router:
> 1. Cari chunk yang mengandung `completedSent` (8499.js v0.5.55). Backup (`.bak-usage`).
> 2. Referensi source: fork commit "fix(responses): embed usage in response.completed so clients track context".
> 3. Inti: di sendCompleted, sebelum emit, baca `state.usage`; bila ada, konversi ke `{input_tokens, input_tokens_details:{cached_tokens}, output_tokens, output_tokens_details:{reasoning_tokens}, total_tokens}` dan spread ke object `response` (`..._ru?{usage:_ru}:{}`).
> 4. Verifikasi: `node --check`; test end-to-end — event `token_count` Codex kini berisi info (bukan null), dan di context besar Codex otomatis memicu "compacting".
> 5. Regression test: `tests/unit/reasoning-only-turn.test.js` (test "embeds token usage").

---

## Langkah 3 — Restart 9router

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '9router' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# lalu start ulang seperti biasa, misal:
npx 9router start
```

---

## Langkah 4 — Verifikasi

| Fix | Cara cek | Hasil yang diharapkan |
|---|---|---|
| Vision trimmer | Request bergambar dengan konteks >6 pesan via `auto-9router`, lihat requestDetails di dashboard | Pesan ke model vision **UTUH** (17/25/36 pesan), bukan 8-10 |
| Qoder 112 | Cek chunk build mengandung string `Qoder quota exhausted` | String ditemukan |
| Antigravity 403 | Cek log request dan host MITM setelah restart | Chat diarahkan ke host sandbox, tanpa `CONSUMER_INVALID` |
| Antigravity pairing | Session panjang dengan banyak tool call (termasuk tool ber-output kosong) via `antigravity/gemini-*` | Tidak ada 400 INVALID_ARGUMENT permanen; `/compact` tidak lagi dibutuhkan |
| Capabilities vision/MiMo | `curl $NINEROUTER_URL/v1/models` → cek caps `sumopod/mimo-v2.5-pro` dan model `*deepseek*vision*` | mimo-v2.5-pro: `reasoning:true, vision:false`; deepseek-vision: `vision:true, reasoning:true` |
| Cancel-usage | Jalankan sesi Codex via `antigravity/*` (pastikan log `DISCONNECT: ResponseAborted` muncul), lalu cek Usage/History di dashboard | Baris usage model antigravity **muncul** dengan token IN/OUT meski stream di-abort client |
| Reasoning-only turn | Sesi Codex panjang via `antigravity/gemini-*`; kalau model kena quirk reasoning-only, log 9router menampilkan `reasoning-only turn ... replacing response.completed with response.failed` | Codex me-retry otomatis ("stream error; retrying") dan task **berlanjut**, tidak berhenti diam-diam |
| Stall retryable + first-byte | Stream antigravity hang (0 byte) → log `STALL TIMEOUT 120000ms | chunks=0`; stream stall di tengah tetap 360000ms | Hang terdeteksi 2 menit (bukan 6) dan Codex menerima `response.failed` → auto-retry |
| Usage di response.completed | Session Codex via 9router: event `token_count` di rollout kini berisi info; pada context mendekati window, Codex otomatis memicu compaction ("compacting…") | `token_count.info` tidak lagi null; prompt token berhenti tumbuh tak terbatas |

```powershell
# Cek cepat di build
Get-ChildItem "$env:LOCALAPPDATA\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks\*.js" -File | ForEach-Object {
    $c = Get-Content $_.FullName -Raw -Encoding UTF8
    if ($c -match 'Qoder quota exhausted') { "✅ qoder-112 aktif di $($_.Name)" }
}
$sisa = Get-ChildItem "$env:LOCALAPPDATA\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks\*.js" -File | Where-Object { (Get-Content $_.FullName -Raw) -match 'l\.slice\(0,6\)' }
if (-not $sisa) { Write-Output "✅ vision-trimmer aktif" } else { Write-Output "❌ vision BELUM di-patch" }
```

---

## Langkah 5 — (Opsional) Sync fork + rebase branch `patched`

Supaya fork tetap rapi dan `patched` selalu di atas master terbaru:

```powershell
cd <lokasi-clone-fork>
git fetch origin                    # fork Anda sudah auto-sync dari upstream
git checkout patched
git rebase origin/master
git push --force-with-lease origin patched
```

Kalau ada **konflik rebase** → artinya upstream mengubah kode di sekitar patch.
Itu biasanya pertanda upstream sudah menangani bug-nya dengan cara lain;
periksa dulu sebelum melanjutkan.

**Menambah fix baru di masa depan:**

```powershell
git checkout patched
# ... edit source + tes ...
git commit -m "fix(...): penjelasan"
git push origin patched
```

---

## 🧠 Penjelasan singkat tiap bug

### Vision trimmer
`capacityAdapter.vision` memangkas history dengan `slice(0, 6)` **tanpa mengecek
budget token dulu**. Ketika ada >6 pesan sebelum giliran terakhir, semua pesan tengah
(termasuk tugas aktif) dibuang — model vision hanya melihat 6 pesan awal + ekor,
sehingga menjawab topik lama alih-alih tugas gambar.
Fix: `slice(0,6)` → `slice()`; loop budget yang ada tetap memangkas hanya saat
history melebihi 80% context window model vision.

### Qoder quota-112
Qoder melaporkan quota habis sebagai payload SSE ber-HTTP-200 dengan envelope
pertama `statusCodeValue: 403` + body `"code":"112"`. Tanpa fix, auth service hanya
memberi cooldown 2 menit, sehingga pool memilih akun mati itu terus-menerus.
Fix: perlakukan 403+code-112 sebagai sinyal account-wide — nonaktifkan koneksi
(`isActive=false`, `testStatus=unavailable`) dan fallback ke akun/model berikutnya.
Hanya code 112 yang trigger; code 10605 (queue throttle) dan pricingUrl tetap
transient di jalur cooldown biasa.

### Antigravity dangling functionCall + thinking-only content
Dua bug konverter `openai→antigravity` yang sama-sama menghasilkan
**400 INVALID_ARGUMENT deterministik** (payload-based → semua akun gagal,
glm fallback tidak terkena, `/compact` memulihkan karena menulis ulang history):

**(a) Dangling functionCall** — keberadaan tool result dicek dengan
**truthiness**; tool result `content:""`/`null` (bash tanpa stdout, tool batal)
dianggap "tidak ada response" → `functionCall` terkirim tanpa `functionResponse`.
Fix: selalu emit `functionResponse` per call (`Object.hasOwn` untuk cek
keberadaan; placeholder `"(no tool result returned)"` bila hasil tak pernah
dikirim; `args ?? {}` untuk argumen JSON invalid).

**(b) Thinking-only content** — turn Gemini THINK:high yang terpotong
(maxOutputTokens habis saat thinking, tanpa text/tool) dikirim ulang client
sebagai `{content:"", reasoning_content}` → konverter membuat content MODEL
yang HANYA berisi thought-part + signature-part kosong → ditolak Google.
Terverifikasi live: reasoning-only → 400; reasoning+text → 200;
reasoning+tool_calls → 200. Ini penyebab utama pola "session panjang →
400 permanen": makin panjang session + THINK:high, makin besar peluang
ada turn thinking-only di history.
Fix: content assistant hanya dikirim bila punya minimal satu part
non-thought (text/functionCall).

Regresi dijaga oleh `tests/translator/openai-to-antigravity-pairing.test.js` (8 test).

### Usage hilang saat client abort
Semua pencatatan usage streaming (`saveUsageStats` via `onStreamComplete`,
`trackPendingRequest`, `appendRequestLog`) hanya dipicu dari `flush()` pada
TransformStream di `open-sse/utils/stream.js`. Per spec Streams, `flush()` hanya
jalan kalau upstream berakhir normal; ketika client membatalkan stream
(`reader.cancel()` + `writer.abort()` di `createDisconnectAwareStream`),
`flush()` DILEWATI. Codex menutup SSE begitu kebutuhannya terpenuhi
(`DISCONNECT: ResponseAborted`), dan provider lambat-nya-selesai (Antigravity
Gemini) paling sering kena: usage-nya tidak pernah masuk DB, sedangkan provider
cepat (glm) sempat menyelesaikan `flush()` sebelum abort sehingga tercatat.
Fix: helper `finalizeUsageTracking()` (guard sekali-jalan) dipanggil dari
`flush()` dan dari hook `cancel()` baru; estimasi token tetap jalan bila
provider belum mengirim usage.

Regresi dijaga oleh `tests/unit/stream-cancel-usage.test.js` (4 test).

### Turn reasoning-only menghentikan task diam-diam
Gemini flash (terverifikasi pada `gemini-3.7-flash-high`, context 178k) kadang
stream thought parts lalu berhenti dengan `finishReason: STOP` — **bukan**
MAX_TOKENS (jatah 64k baru terpakai 3288) — tanpa menghasilkan text atau tool
call. `response.completed` dengan output kosong diperlakukan Codex sebagai
turn sukses: `task_complete` + `last_agent_message: null` → task berhenti
di tengah pekerjaan tanpa error. Effort/thinking level tidak menghilangkan
quirk ini (hanya mengubah probabilitas).
Fix: di stream gemini-family → openai-responses, bila terminal event hendak
terkirim dan turn terbukti reasoning-only, ganti dengan `response.failed`
retryable (helper `formatIncompleteOpenAIResponsesStreamFailure`, kode
`stream_disconnected`) + `[DONE]` → Codex me-retry request otomatis dan
task berlanjut.

Regresi dijaga oleh `tests/unit/reasoning-only-turn.test.js` (4 test).

---

## 🗂️ Struktur branch fork

| Branch | Isi | Status |
|---|---|---|
| `patched` | **Semua fix** (vision + qoder + antigravity 403 + antigravity pairing + capabilities + cancel-usage + reasoning-only + docs ini) | ✅ Branch kerja utama |
| `patch/fix-vision-trimmer` | Fix vision saja (calon PR ke upstream) | Referensi |
| `fix-qoder-112-disable-account` | Fix qoder saja (calon PR ke upstream) | Referensi |
| ~~`qoder-403-112-fallback`~~ | Dihapus — bagian SSE probe-nya sudah diserap upstream v0.5.55 | 🗑️ (arsip lokal: tag `archive/qoder-403-112-fallback`) |

---

## 📁 File di folder ini

| File | Fungsi |
|---|---|
| `fix-vision-trimmer.patch` | Patch git-format untuk build minified (vision trimmer) |
| `UPDATE-CHECKLIST.md` | File ini — panduan wajib tiap update |

---

## 🔔 Pengingat otomatis (opsional)

1. **Bookmark file ini** di browser / editor.
2. **Set reminder** tiap kali Anda update 9router.
3. **Tambahkan ke instruksi agent harness** Anda, misal di opencode:
   "Setiap update 9router, jalankan checklist di `9router/patches/UPDATE-CHECKLIST.md`".
