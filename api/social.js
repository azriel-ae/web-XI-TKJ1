// =========================
// API: GET /api/social
// Foto profil Instagram & TikTok kelas — foto diatur manual oleh
// admin lewat panel /admin (lihat api/admin/social.js), BUKAN diambil
// lewat API pihak ketiga mana pun. Kalau admin belum pernah upload
// foto untuk sebuah platform, avatarUrl dikirim null supaya frontend
// menampilkan fallback avatar (inisial) — bukan gambar rusak.
// =========================

const { getAllSocialProfiles } = require("../lib/socialAvatar");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    try {
        const profiles = await getAllSocialProfiles();

        // Cache ringan di CDN/browser saja — foto ini diubah lewat
        // panel admin, bukan tiap saat, tapi tetap jangan terlalu lama
        // supaya perubahan admin cepat terlihat pengunjung.
        res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
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
