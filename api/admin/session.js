// =========================
// API: GET /api/admin/session
// Return status login admin saat ini (dibaca dari cookie sesi).
// =========================

const { getLoggedInAdmin, isOwnerUsername } = require("../../lib/auth");
const { isBlobEnabled } = require("../../lib/blobData");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const username = getLoggedInAdmin(req);
    // Dikirim ke frontend supaya panel admin bisa kasih peringatan kalau
    // Vercel Blob belum disambungkan -> data (log aktivitas, akun admin
    // tambahan, foto upload) hanya tersimpan sementara di satu instance
    // serverless dan TIDAK sinkron antar perangkat/region (ini penyebab
    // paling umum "di laptop ada datanya, di HP kosong").
    const blobEnabled = isBlobEnabled();

    if (!username) {
        return res.status(200).json({ loggedIn: false, blobEnabled });
    }

    return res.status(200).json({ loggedIn: true, username, isOwner: isOwnerUsername(username), blobEnabled });
};
