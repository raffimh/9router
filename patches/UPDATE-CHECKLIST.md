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

Semua fix hidup di **satu branch integrasi: `patched`** di fork [`raffimh/9router`](https://github.com/raffimh/9router).

```
master (= upstream v0.5.55, sync otomatis)
└── patched  ← SATU branch untuk semua fix
      ├── fix(capacityAdapter): keep full history (vision trimmer)
      ├── docs(patches): file patch + checklist ini
      ├── fix(auth): disable Qoder connection on quota exhaustion
      ├── fix(antigravity): use sandbox host + platform-matched IDE fingerprint
      └── fix(antigravity): always pair functionCall with functionResponse
```

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

---

## 🗂️ Struktur branch fork

| Branch | Isi | Status |
|---|---|---|
| `patched` | **Semua fix** (vision + qoder + antigravity 403 + antigravity pairing + docs ini) | ✅ Branch kerja utama |
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
