// =========================
// lib/blobData.js
// Penyimpanan data tambahan (foto galeri baru, override foto siswa)
// yang ditulis oleh admin lewat panel /admin.
//
// Di Vercel, filesystem deployment bersifat read-only & sementara,
// jadi data tambahan dari admin TIDAK bisa ditulis ke file JSON biasa
// yang ikut di-deploy. Solusinya pakai Vercel Blob Storage (persist,
// diakses lewat HTTP, tidak butuh database terpisah).
//
// Kalau token Blob belum diset (misal saat coba jalan lokal dengan
// `node server.js` tanpa setup Blob), otomatis fallback nulis ke
// disk lokal (data/*.json + assets/img/...) supaya tetap bisa dites
// di komputer sendiri.
//
// Catatan soal nama environment variable:
// Vercel hanya mengisi nama `BLOB_READ_WRITE_TOKEN` polos kalau CUMA
// ADA SATU Blob store yang terhubung ke project ini. Begitu ada Blob
// store KEDUA yang di-connect ke project yang sama, Vercel otomatis
// mengganti nama env var-nya pakai prefix (mis. `store_READ_WRITE_TOKEN`,
// `gudang_foto_READ_WRITE_TOKEN`, dst) supaya tidak bentrok — karena
// nama env var harus unik per project. Kalau kode cuma baca
// `process.env.BLOB_READ_WRITE_TOKEN` secara hardcode, ini bikin
// panel admin bilang "Vercel Blob belum tersambung" padahal blob-nya
// sebenarnya sudah connect, cuma tokennya kesimpan di nama variable
// lain. Kalau punya 2+ store dan mau pilih salah satu secara pasti,
// set env var `BLOB_TOKEN_ENV_NAME` = nama variable token yang mau
// dipakai (mis. `gudang_foto_READ_WRITE_TOKEN`).
// =========================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Cari token Blob di env, tidak terpatok ke nama `BLOB_READ_WRITE_TOKEN` saja.
function resolveBlobToken() {
    // 1) Nama default Vercel kalau cuma 1 store yang di-connect.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
        return { token: process.env.BLOB_READ_WRITE_TOKEN, envName: "BLOB_READ_WRITE_TOKEN" };
    }

    // 2) User secara eksplisit menentukan store mana yang dipakai
    //    (berguna kalau ada lebih dari satu store dan mau pilih spesifik).
    const explicitName = process.env.BLOB_TOKEN_ENV_NAME;
    if (explicitName && process.env[explicitName]) {
        return { token: process.env[explicitName], envName: explicitName };
    }

    // 3) Fallback: scan semua env var, cari yang polanya token Blob
    //    (nama custom yang Vercel bikin otomatis saat ada 2+ store).
    const candidateName = Object.keys(process.env).find((key) =>
        /_READ_WRITE_TOKEN$/i.test(key) && key !== "BLOB_TOKEN_ENV_NAME"
    );
    if (candidateName) {
        return { token: process.env[candidateName], envName: candidateName };
    }

    return { token: null, envName: null };
}

function isBlobEnabled() {
    return Boolean(resolveBlobToken().token);
}

let blobModulePromise = null;
function getBlobModule() {
    if (!blobModulePromise) blobModulePromise = import("@vercel/blob");
    return blobModulePromise;
}

// -------------------------------------------------------------
// JSON "dokumen" kecil yang bisa ditimpa (data tambahan galeri,
// override foto siswa). Key = nama file, mis. "gallery-extra.json".
// -------------------------------------------------------------

async function readJson(key, fallbackValue) {
    const { token } = resolveBlobToken();
    if (token) {
        const { head } = await getBlobModule();
        try {
            const info = await head(`data/${key}`, { token });
            const response = await fetch(info.url, { cache: "no-store" });
            if (!response.ok) return fallbackValue;
            return await response.json();
        } catch (error) {
            // Belum pernah ditulis sama sekali -> pakai fallback.
            return fallbackValue;
        }
    }

    const filePath = path.join(ROOT, "data", key);
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

async function writeJson(key, data) {
    const json = JSON.stringify(data, null, 2);
    const { token } = resolveBlobToken();

    if (token) {
        const { put } = await getBlobModule();
        await put(`data/${key}`, json, {
            access: "public",
            contentType: "application/json; charset=utf-8",
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 0,
            token
        });
        return;
    }

    const filePath = path.join(ROOT, "data", key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, json, "utf8");
}

// -------------------------------------------------------------
// Upload file gambar (buffer) ke folder tertentu.
// Return: URL/path yang bisa langsung dipakai di <img src="...">.
// -------------------------------------------------------------

async function uploadImage(folder, filename, buffer, contentType) {
    const { token } = resolveBlobToken();
    if (token) {
        const { put } = await getBlobModule();
        const result = await put(`${folder}/${filename}`, buffer, {
            access: "public",
            contentType,
            addRandomSuffix: true,
            token
        });
        return result.url;
    }

    const dir = path.join(ROOT, "assets", "img", folder);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return `assets/img/${folder}/${filename}`;
}

// Hapus file gambar yang pernah diupload lewat uploadImage (dukung mode blob & lokal).
async function deleteImage(urlOrPath) {
    const { token } = resolveBlobToken();
    if (token && /^https?:\/\//.test(urlOrPath)) {
        const { del } = await getBlobModule();
        try {
            await del(urlOrPath, { token });
        } catch (error) {
            console.error("Gagal hapus blob:", error.message);
        }
        return;
    }

    if (!/^https?:\/\//.test(urlOrPath)) {
        const filePath = path.join(ROOT, urlOrPath);
        if (filePath.startsWith(ROOT + path.sep)) {
            fs.unlink(filePath, () => {});
        }
    }
}

module.exports = {
    isBlobEnabled,
    resolveBlobToken,
    readJson,
    writeJson,
    uploadImage,
    deleteImage
};
