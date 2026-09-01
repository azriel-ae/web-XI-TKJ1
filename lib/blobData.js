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
// Kalau BLOB_READ_WRITE_TOKEN belum diset (misal saat coba jalan
// lokal dengan `node server.js` tanpa setup Blob), otomatis fallback
// nulis ke disk lokal (data/*.json + assets/img/...) supaya tetap
// bisa dites di komputer sendiri.
// =========================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function isBlobEnabled() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
    if (isBlobEnabled()) {
        const { head } = await getBlobModule();
        try {
            const info = await head(`data/${key}`);
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

    if (isBlobEnabled()) {
        const { put } = await getBlobModule();
        await put(`data/${key}`, json, {
            access: "public",
            contentType: "application/json; charset=utf-8",
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 0
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
    if (isBlobEnabled()) {
        const { put } = await getBlobModule();
        const result = await put(`${folder}/${filename}`, buffer, {
            access: "public",
            contentType,
            addRandomSuffix: true
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
    if (isBlobEnabled() && /^https?:\/\//.test(urlOrPath)) {
        const { del } = await getBlobModule();
        try {
            await del(urlOrPath);
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
    readJson,
    writeJson,
    uploadImage,
    deleteImage
};
