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

Filesystem Vercel bersifat *read-only* & sementara saat runtime (tiap function bisa jalan di instance berbeda-beda), jadi akun admin, log aktivitas, override data/foto siswa, dan foto galeri yang ditambah lewat panel `/admin` **tidak akan tersimpan** tanpa penyimpanan permanen. Vercel KV yang dulu dipakai **sudah dihapus** — sekarang datanya disimpan permanen lewat **commit ke GitHub repo** (GitHub Contents API):

1. Buat Personal Access Token di GitHub (Settings → Developer settings → Fine-grained tokens) dengan akses read+write "Contents" ke repo tujuan.
2. Di Vercel Dashboard → **Settings → Environment Variables**, isi:
   - `GITHUB_TOKEN` = token di atas
   - `GITHUB_REPO` = `owner/nama-repo` (mis. `azriel-ae/web-XI-TKJ1`)
3. Redeploy project.

> ⚠️ **Kalau repo yang dipakai untuk `GITHUB_REPO` bersifat PUBLIC**, semua data yang tersimpan lewat sini — termasuk password hash akun admin & log aktivitas — bisa dibaca siapa saja lewat github.com. Pastikan repo-nya **private**, atau pakai repo lain yang private khusus untuk penyimpanan data (boleh beda dari repo situs ini, cukup ganti `GITHUB_REPO`). Lihat `.env.example` dan komentar di `lib/kvStore.js` untuk detail.

Tanpa langkah ini, panel admin tetap bisa login, tapi semua perubahan (akun baru, upload foto, edit data siswa) akan hilang lagi begitu Vercel memindahkan request ke instance server lain — biasanya kelihatan sebagai "sudah ditambah tapi tidak muncul lagi". Panel admin akan menampilkan peringatan ke owner kalau penyimpanan GitHub belum tersambung.

**Log aktivitas otomatis terhapus setelah 30 hari** (data akun admin TIDAK ikut terhapus, tetap permanen selamanya).

Untuk keamanan, disarankan juga mengisi `SESSION_SECRET` (string acak bebas) di Environment Variables Vercel — lihat `.env.example` untuk detail & cara mengganti password akun admin tanpa mengubah kode.

## Avatar Instagram & TikTok (Kontak Kelas)

Section **Kontak Kelas** menampilkan foto profil Instagram (`@tkj.1networks_`) dan TikTok (`@xitkj1smk1npol`) secara dinamis lewat `/api/social`, yang mengambil data hanya lewat **API resmi** masing-masing platform (Meta Graph API & TikTok Display API) — tidak ada scraping maupun endpoint tidak resmi.

- Kalau environment variable terkait (lihat `.env.example`) belum diisi, avatar otomatis memakai **fallback** berupa inisial `IG`/`TT` sesuai design system. Username dan link tetap tampil normal.
- Hasil dari API resmi disimpan sementara di cache server (lewat mekanisme yang sama dengan `lib/kvStore.js`) selama beberapa jam, supaya halaman tidak memicu request baru setiap kali dibuka.
- Kegagalan API (token kedaluwarsa, rate limit, dll.) tidak pernah membuat halaman rusak — otomatis jatuh ke cache terakhir yang masih berlaku, atau ke fallback.

### Coba lokal

Jalan langsung dengan `node server.js` tanpa setup KV — data & foto yang diupload lewat `/admin` otomatis disimpan ke `data/gallery-extra.json`, `data/siswa-foto-overrides.json`, `data-private/` (akun admin & log aktivitas), dan folder `assets/img/` di komputer sendiri (mode fallback, cuma untuk testing — persist selama komputer itu terus menjalankan `node server.js`).
