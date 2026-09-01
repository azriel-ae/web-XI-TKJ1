// =========================
// API: GET /api/img?key=folder/nama-file.ext
// Menyajikan foto yang diupload admin (galeri / foto siswa) yang
// disimpan lewat lib/kvStore.js. Dibuat sebagai endpoint terpisah
// (bukan file statis) karena di mode KV, gambarnya tersimpan di
// database, bukan di disk.
// =========================

const { readImage } = require("../lib/kvStore");

function getQueryParam(req, key) {
    try {
        const url = new URL(req.url, "http://localhost");
        return url.searchParams.get(key);
    } catch {
        return null;
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.statusCode = 405;
        return res.end("Method tidak diizinkan");
    }

    const key = getQueryParam(req, "key");
    if (!key) {
        res.statusCode = 400;
        return res.end("Parameter key wajib diisi.");
    }

    const image = await readImage(key);
    if (!image) {
        res.statusCode = 404;
        return res.end("Gambar tidak ditemukan.");
    }

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.statusCode = 200;
    return res.end(image.buffer);
};
