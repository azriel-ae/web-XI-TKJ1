// =========================
// lib/kvStore.js
// Penyimpanan data tambahan (akun admin, log aktivitas, override data/foto
// siswa, foto galeri) yang ditulis oleh admin lewat panel /admin.
//
// Di Vercel, filesystem deployment bersifat read-only & sementara (tiap
// serverless function bisa jalan di instance yang berbeda-beda, jadi
// tulisan ke disk lokal TIDAK bisa diandalkan untuk data yang perlu
// permanen & konsisten di semua request).
//
// SEBELUMNYA sempat pakai Vercel KV (dihapus), lalu pindah ke GitHub
// Contents API. Sekarang penyimpanan permanennya pindah lagi ke
// VERCEL BLOB (public): setiap tulis data = 1 file di Blob store project
// ini, dibaca/ditimpa langsung lewat package resmi "@vercel/blob".
//
// ------------------------------------------------------------------
// PENTING SOAL PRIVASI/KEAMANAN:
// Blob di sini dibuat dengan access "public" (sesuai permintaan) dan
// nama path yang TETAP/predictable (addRandomSuffix: false) supaya bisa
// ditimpa (overwrite) di key yang sama setiap kali data diubah. Artinya
// siapa pun yang tahu/menebak URL blob-nya (pola: <base>/<scope>/<key>)
// BISA membaca isinya langsung, TERMASUK folder "private" (data akun
// admin & password hash, log aktivitas) — beda dengan Vercel Blob mode
// "private" yang sebenarnya tersedia di SDK tapi sengaja tidak dipakai
// di sini karena diminta "public aja".
//
// Kalau nanti mau lebih aman tanpa ubah banyak kode, tinggal ganti
// `access: "public"` di bawah jadi `access: "private"` dan baca lewat
// `blob.get(pathname, { access: "private", token })` — blob private
// hanya bisa dibaca lewat SDK + token, tidak bisa diakses langsung
// lewat URL publik.
// ------------------------------------------------------------------
//
// Cara setup (sekali saja):
//   1. Buka dashboard Vercel -> project ini -> tab Storage -> Create
//      Database -> pilih Blob -> Connect ke project ini.
//   2. Vercel otomatis menambahkan env var BLOB_READ_WRITE_TOKEN ke
//      project (tidak perlu diisi manual).
//   3. Redeploy project supaya env var-nya kepakai.
//
// Kalau BLOB_READ_WRITE_TOKEN sama sekali tidak diset (mis. saat coba
// jalan lokal dengan `node server.js` tanpa setup apa pun), otomatis
// fallback nulis ke disk lokal (data/*.json, data-private/*.json,
// assets/img/...) supaya tetap bisa dites di komputer sendiri TANPA
// perlu setup apa pun.
// ------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const blob = require("@vercel/blob");

const ROOT = path.join(__dirname, "..");
const BASE_PATH = (process.env.BLOB_BASE_PATH || "data-store")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "") || "data-store";

const IMAGE_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
};

function contentTypeForFilename(filename) {
    const ext = path.extname(String(filename || "")).toLowerCase();
    return IMAGE_CONTENT_TYPES[ext] || "application/octet-stream";
}

// -------------------------------------------------------------
// Deteksi kredensial Blob yang tersedia di environment saat ini.
// Return null kalau tidak ada (berarti fallback ke disk lokal).
// -------------------------------------------------------------
function resolveBlobConfig() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return null;
    return { token };
}

function isKvEnabled() {
    return Boolean(resolveBlobConfig());
}

function scopedPath(scope, key) {
    // scope: "public" atau "private" (lihat catatan keamanan di atas —
    // ini HANYA penamaan folder, BUKAN kontrol akses nyata karena mode
    // Blob yang dipakai di sini adalah "public").
    return `${BASE_PATH}/${scope}/${key}`;
}

// -------------------------------------------------------------
// JSON "dokumen" kecil yang bisa ditimpa (akun admin, log aktivitas,
// override data/foto siswa, galeri tambahan). Key = nama file, mis.
// "gallery-extra.json".
// -------------------------------------------------------------
async function readJson(key, fallbackValue, options) {
    const opts = options || {};

    const config = resolveBlobConfig();
    if (config) {
        try {
            const pathname = scopedPath(opts.private ? "private" : "public", key);
            const result = await blob.get(pathname, { access: "public", token: config.token });
            if (!result || !result.stream) return fallbackValue;
            const chunks = [];
            for await (const chunk of result.stream) chunks.push(chunk);
            return JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch (error) {
            console.error(`[kvStore] gagal baca "${key}" dari Blob:`, error.message);
            return fallbackValue;
        }
    }

    const filePath = path.join(ROOT, opts.private ? "data-private" : "data", key);
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

async function writeJson(key, data, options) {
    const opts = options || {};
    const json = JSON.stringify(data, null, 2);

    const config = resolveBlobConfig();
    if (config) {
        const pathname = scopedPath(opts.private ? "private" : "public", key);
        await blob.put(pathname, json, {
            access: "public",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/json",
            token: config.token
        });
        return;
    }

    const filePath = path.join(ROOT, opts.private ? "data-private" : "data", key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, json, "utf8");
}

// -------------------------------------------------------------
// Upload file gambar (buffer). Return: URL yang bisa langsung dipakai
// di <img src="...">.
//
// Mode Blob: gambar diupload langsung ke Vercel Blob (public), URL
// yang dikembalikan adalah URL publik blob-nya langsung (tidak perlu
// proxy lewat /api/img lagi). Mode lokal (tanpa Blob): ditulis
// langsung ke assets/img/... seperti biasa.
// -------------------------------------------------------------
async function uploadImage(folder, filename, buffer, contentType) {
    const relativePath = `${folder}/${filename}`;

    const config = resolveBlobConfig();
    if (config) {
        const pathname = `${BASE_PATH}/images/${relativePath}`;
        const result = await blob.put(pathname, buffer, {
            access: "public",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType,
            token: config.token
        });
        return result.url;
    }

    const dir = path.join(ROOT, "assets", "img", folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `assets/img/${folder}/${filename}`;
}

// Hapus file gambar yang pernah diupload lewat uploadImage (dukung mode
// Blob, mode /api/img lama peninggalan GitHub, & mode lokal).
async function deleteImage(urlOrPath) {
    if (!urlOrPath) return;

    if (/\.blob\.vercel-storage\.com\//.test(urlOrPath)) {
        const config = resolveBlobConfig();
        if (config) {
            try {
                await blob.del(urlOrPath, { token: config.token });
            } catch (error) {
                console.error("[kvStore] gagal hapus gambar dari Blob:", error.message);
            }
        }
        return;
    }

    // Peninggalan mode GitHub lama (/api/img?key=...) — sudah tidak dipakai
    // untuk upload baru, tapi dibiarkan supaya tidak error kalau masih ada
    // data lama yang mengacu ke sini.
    if (/^\/api\/img\?key=/.test(urlOrPath)) return;

    if (!/^https?:\/\//.test(urlOrPath)) {
        const filePath = path.join(ROOT, urlOrPath);
        if (filePath.startsWith(ROOT + path.sep)) {
            fs.unlink(filePath, () => {});
        }
    }
}

// Baca kembali gambar yang diupload lewat uploadImage, dipakai oleh
// api/img.js HANYA untuk mode lokal / data lama peninggalan mode GitHub
// yang masih memakai format "folder/nama-file.ext" tanpa URL Blob penuh.
async function readImage(relativePath) {
    if (!relativePath || relativePath.includes("..")) return null;

    const filePath = path.join(ROOT, "assets", "img", relativePath);
    try {
        const buffer = fs.readFileSync(filePath);
        return { buffer, contentType: contentTypeForFilename(filePath) };
    } catch {
        return null;
    }
}

module.exports = {
    isKvEnabled,
    readJson,
    writeJson,
    uploadImage,
    deleteImage,
    readImage
};
