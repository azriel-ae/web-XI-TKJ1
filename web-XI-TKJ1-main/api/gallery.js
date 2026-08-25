// =========================
// API: GET /api/gallery
// Gabungan data galeri bawaan (data/gallery.json, ikut ter-deploy)
// dengan foto tambahan yang diupload admin (disimpan terpisah karena
// filesystem Vercel read-only saat runtime).
// =========================

const baseGallery = require("../data/gallery.json");
const { readJson } = require("../lib/blobData");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const extra = await readJson("gallery-extra.json", []);
    const combined = [...baseGallery, ...(Array.isArray(extra) ? extra : [])];

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(combined);
};
