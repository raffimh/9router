# 🔄 9router Update Checklist — Vision Trimmer Fix

> **WAJIB DIBACA setiap kali 9router menerima update** (via `npm update`, `npx 9router@latest`, atau reinstall).
>
> Update 9router **menimpa file build** (`.next-cli-build/`), sehingga patch vision-trimmer **HILANG otomatis**.
> Ikuti langkah di bawah SEBELUM menggunakan 9router untuk tugas yang melibatkan gambar/vision.

---

## 📋 Ringkasan cepat

| Langkah | Aksi | Waktu |
|---|---|---|
| 1 | Cek apakah upstream sudah fix | 30 detik |
| 2 | Jika belum, re-apply patch | 10 detik |
| 3 | Restart 9router | 10 detik |
| 4 | Verifikasi | 1 menit |

---

## Langkah 1 — Cek: apakah upstream sudah fix?

Jalankan ini dulu. **Jika sudah fix, berhenti — tidak perlu patch.**

```powershell
$content = (Invoke-WebRequest "https://raw.githubusercontent.com/decolua/9router/main/open-sse/services/capacityAdapter.js" -UseBasicParsing).Content
if ($content -match 'HEAD_KEEP') {
    Write-Output "⚠️  BUG MASIH ADA di upstream → lanjut ke Langkah 2"
} else {
    Write-Output "✅ Upstream sudah fix → tidak perlu patch, selesai!"
}
```

**Atau cek manual:** buka `https://github.com/decolua/9router/blob/main/open-sse/services/capacityAdapter.js`, cari kata `HEAD_KEEP`. Kalau tidak ada, berarti sudah diperbaiki.

---

## Langkah 2 — Re-apply patch (jika upstream belum fix)

**Opsi A: Prompt ke agent harness** (paling gampang)

Copy-paste ke opencode / Cline / harness lain:

> Re-apply patch fix vision-trimmer 9router:
> 1. Buka file `%LOCALAPPDATA%\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks\112.js`
> 2. Cari `l.slice(0,6)`. Kalau ada → ganti jadi `l.slice()`. Kalau sudah `l.slice()` → berhenti (sudah aktif).
> 3. Backup dulu file asli dengan suffix `.bak-<tanggal>` sebelum edit.
> 4. Verifikasi: `l.slice(0,6)` harus 0 kemunculan, `l.slice()` harus 1.
> 5. Ingatkan saya restart 9router.
>
> Referensi fix di level source: https://github.com/raffimh/9router branch `patch/fix-vision-trimmer`

**Opsi B: Manual (PowerShell)**

```powershell
$f = "$env:LOCALAPPDATA\nvm\v24.13.1\node_modules\9router\app\.next-cli-build\server\chunks\112.js"
Copy-Item $f "$f.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
$c = Get-Content $f -Raw -Encoding UTF8
$new = $c -replace 'l\.slice\(0,6\)', 'l.slice()'
Set-Content $f $new -Encoding UTF8 -NoNewline

# Verifikasi
$after = Get-Content $f -Raw
"old count: $(([regex]::Matches($after, 'l\.slice\(0,6\)')).Count)  (harus 0)"
"new count: $(([regex]::Matches($after, 'l\.slice\(\)')).Count)  (harus 1)"
```

> ⚠️ **Catatan:** path `v24.13.1` di atas sesuai versi Node yang terpasang saat ini.
> Kalau Anda ganti versi Node, sesuaikan path-nya. Cara cepat cari path aktif:
> ```powershell
> (Get-Process node | Where-Object { $_.CommandLine -match '9router' } | Select-Object -First 1).CommandLine
> ```

---

## Langkah 3 — Restart 9router

Patch tidak aktif sampai 9router di-restart.

```powershell
# Stop proses lama
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '9router' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Start ulang (sesuaikan cara Anda biasa menjalankan 9router)
npx 9router start
```

---

## Langkah 4 — Verifikasi patch aktif

Kirim 1 request bergambar dengan konteks >6 pesan via `auto-9router`, lalu cek dashboard 9router (dengan observability ON). Di requestDetails, jumlah pesan yang dikirim ke model vision harus **UTUH** (misal 17, 25, 36 pesan), **BUKAN** 8-10 pesan.

Kalau masih 8-10 pesan → patch belum aktif, cek lagi Langkah 2-3.

---

## 🧠 Penjelasan singkat bug-nya

`capacityAdapter.vision` memangkas history percakapan dengan `slice(0, 6)` **tanpa mengecek budget token dulu**. Akibatnya, ketika ada >6 pesan sebelum giliran terakhir, semua pesan tengah (termasuk tugas aktif) dibuang — model vision hanya melihat 6 pesan awal + ekor. Ini menyebabkan model menjawab topik lama (misal SSH) alih-alih tugas gambar yang sedang dikerjakan.

Fix: ganti `slice(0, 6)` → `slice()`, sehingga semua pesan dipertahankan. Loop budget yang sudah ada tetap memangkas **hanya** ketika history benar-benar melebihi 80% context window model vision.

**Commit fix (level source):** [`03c17a9b`](../../commit/03c17a9b) di branch `patch/fix-vision-trimmer`
**File patch (level build):** [`fix-vision-trimmer.patch`](./fix-vision-trimmer.patch)

---

## 📁 File di folder ini

| File | Fungsi |
|---|---|
| `fix-vision-trimmer.patch` | Patch untuk file build minified (apply ke `chunks/112.js`) |
| `UPDATE-CHECKLIST.md` | File ini — panduan wajib tiap update |

---

## 🔔 Pengingat otomatis (opsional)

Untuk memastikan tidak lupa, Anda bisa:

1. **Bookmark file ini** di browser / editor.
2. **Set reminder kalender** tiap kali Anda update 9router.
3. **Tambahkan ke todo list agent harness** Anda, misal di opencode: "Setiap update 9router, jalankan checklist di `9router/patches/UPDATE-CHECKLIST.md`".
