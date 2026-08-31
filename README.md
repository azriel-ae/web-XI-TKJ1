# XI TKJ 1 - Refactor

Versi ini tetap memakai HTML, CSS, JavaScript, dan Bootstrap. Kodenya dipisah berdasarkan tanggung jawab supaya satu section bisa diubah tanpa membongkar seluruh proyek.

## Jalankan lokal

```bash
node server.js
```

Buka `http://localhost:3000`.

Jangan membuka `index.html` langsung lewat `file://`, karena browser biasanya memblokir `fetch()` ke file JSON lokal.

## Mengisi konten

- Data siswa: `data/siswa.json`
- Struktur kelas: `data/struktur.json`
- Daftar galeri: `data/gallery.json`
- Logo: `assets/img/logo/smkn1gempol.png`
- Foto siswa: `assets/img/siswa/siswa1.png` sampai `siswa36.png`
- Foto galeri: `assets/img/galeri/fotokelas1.png` dan seterusnya

## Mengubah UI

Setiap bagian punya file CSS sendiri. Hero berada di `assets/css/hero.css`, daftar siswa di `assets/css/siswa.css`, dan seterusnya. Variabel global seperti warna, radius, dan shadow berada di `assets/css/variables.css`.

## Panel Admin (`/admin`)

Ada ikon kecil (🛡️) di ujung kanan navbar yang menuju `/admin`, atau buka langsung `namadomain.com/admin`. Login ini **opsional** — pengunjung biasa tetap bisa memakai seluruh website tanpa login sama sekali.

Setelah login, admin bisa:
- **Tambah foto galeri** — upload foto, otomatis muncul di section Galeri (tanpa perlu edit `data/gallery.json` manual atau redeploy).
- **Ubah foto siswa** — cari nama siswa, upload foto pengganti.

### Wajib disiapkan kalau di-deploy ke Vercel

Filesystem Vercel bersifat *read-only* saat runtime, jadi foto yang diupload admin **tidak akan tersimpan** tanpa **Vercel Blob Storage**:

1. Buka project ini di Vercel Dashboard → tab **Storage** → **Create Database** → pilih **Blob** → hubungkan ke project.
2. Vercel otomatis mengisi environment variable token-nya — tidak perlu copy manual.
3. Redeploy project.

Tanpa langkah ini, panel admin tetap bisa login, tapi upload foto akan gagal tersimpan permanen di Vercel.

**Kalau punya lebih dari satu Blob store yang di-connect ke project ini:**
Vercel hanya memakai nama `BLOB_READ_WRITE_TOKEN` polos kalau cuma ada **satu** store. Begitu store kedua di-connect ke project yang sama, Vercel otomatis menamai env var token-nya pakai prefix custom (mis. `namastore_READ_WRITE_TOKEN`) supaya tidak bentrok — bukan `BLOB_READ_WRITE_TOKEN` lagi. Kode di `lib/blobData.js` sudah otomatis mendeteksi env var apa pun yang berakhiran `_READ_WRITE_TOKEN`, jadi ini biasanya langsung kebaca tanpa setting tambahan.

Kalau mau pilih store tertentu secara pasti (misal punya 2+ store dan mau pastikan yang mana yang dipakai), buka Vercel Dashboard → Settings → Environment Variables, cari nama variable token Blob-nya, lalu set env var baru:

```
BLOB_TOKEN_ENV_NAME=nama_variable_token_yang_mau_dipakai
```

lalu redeploy. Kalau env var ini diisi, dia yang jadi prioritas utama.

Untuk keamanan, disarankan juga mengisi `SESSION_SECRET` (string acak bebas) di Environment Variables Vercel — lihat `.env.example` untuk detail & cara mengganti password akun admin tanpa mengubah kode.

## Avatar Instagram & TikTok (Kontak Kelas)

Section **Kontak Kelas** menampilkan foto profil Instagram (`@tkj.1networks_`) dan TikTok (`@xitkj1smk1npol`) secara dinamis lewat `/api/social`, yang mengambil data hanya lewat **API resmi** masing-masing platform (Meta Graph API & TikTok Display API) — tidak ada scraping maupun endpoint tidak resmi.

- Kalau environment variable terkait (lihat `.env.example`) belum diisi, avatar otomatis memakai **fallback** berupa inisial `IG`/`TT` sesuai design system. Username dan link tetap tampil normal.
- Hasil dari API resmi disimpan sementara di cache server (lewat mekanisme yang sama dengan `lib/blobData.js`) selama beberapa jam, supaya halaman tidak memicu request baru setiap kali dibuka.
- Kegagalan API (token kedaluwarsa, rate limit, dll.) tidak pernah membuat halaman rusak — otomatis jatuh ke cache terakhir yang masih berlaku, atau ke fallback.

### Coba lokal

Jalan langsung dengan `node server.js` tanpa setup Blob — foto yang diupload lewat `/admin` otomatis disimpan ke `data/gallery-extra.json`, `data/siswa-foto-overrides.json`, dan folder `assets/img/` di komputer sendiri (mode fallback, cuma untuk testing).
