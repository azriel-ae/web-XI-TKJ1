// =========================
// API: GET /api/social
// Foto profil Instagram & TikTok kelas, diambil lewat API resmi
// (kalau sudah dikonfigurasi) dengan cache di server. Kalau API
// resmi tidak tersedia/gagal, avatarUrl dikirim null supaya
// frontend menampilkan fallback avatar (inisial) — bukan gambar
// rusak dan bukan pesan error teknis.
// =========================

const { getAllSocialProfiles } = require("../lib/socialAvatar");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    try {
        const profiles = await getAllSocialProfiles();

        // Cache di CDN/browser juga supaya tidak setiap kunjungan
        // memicu pengecekan ke server — data ini jarang berubah.
        res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
        return res.status(200).json(profiles);
    } catch (error) {
        console.error("[api/social] error tak terduga:", error.message);
        // Tetap balas 200 dengan fallback null supaya halaman tidak
        // pernah rusak gara-gara endpoint ini.
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
            instagram: { avatarUrl: null, handle: "tkj.1networks_" },
            tiktok: { avatarUrl: null, handle: "xitkj1smk1npol" }
        });
    }
};
