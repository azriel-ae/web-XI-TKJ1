// =========================
// API: GET /api/admin/session
// Return status login admin saat ini (dibaca dari cookie sesi).
// =========================

const { getLoggedInAdminInfo, isOwnerUsername } = require("../../lib/auth");
const { isBlobEnabled, isPrivateBlobEnabled } = require("../../lib/blobData");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const adminInfo = await getLoggedInAdminInfo(req);
    // Dikirim ke frontend supaya panel admin bisa kasih peringatan kalau
    // Vercel Blob belum disambungkan -> data (log aktivitas, akun admin
    // tambahan, foto upload) hanya tersimpan sementara di satu instance
    // serverless dan TIDAK sinkron antar perangkat/region (ini penyebab
    // paling umum "di laptop ada datanya, di HP kosong").
    const blobEnabled = isBlobEnabled();
    // Status store Blob "Private" (khusus activity log & akun admin
    // tambahan - lihat lib/blobData.js). Hanya relevan buat owner, dikirim
    // ke semua supaya bentuk response konsisten.
    const privateBlobEnabled = isPrivateBlobEnabled();

    if (!adminInfo) {
        return res.status(200).json({ loggedIn: false, blobEnabled, privateBlobEnabled });
    }

    return res.status(200).json({
        loggedIn: true,
        username: adminInfo.username,
        isOwner: isOwnerUsername(adminInfo.username),
        role: adminInfo.role,
        assignedAbsen: adminInfo.assignedAbsen,
        blobEnabled,
        privateBlobEnabled
    });
};
