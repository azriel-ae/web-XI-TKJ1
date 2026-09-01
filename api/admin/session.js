// =========================
// API: GET /api/admin/session
// Return status login admin saat ini (dibaca dari cookie sesi).
// =========================

const { getLoggedInAdminInfo, isOwnerUsername } = require("../../lib/auth");
const { isKvEnabled } = require("../../lib/kvStore");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const adminInfo = await getLoggedInAdminInfo(req);
    // Dikirim ke frontend supaya panel admin bisa kasih peringatan kalau
    // database (Vercel KV) belum disambungkan -> data (log aktivitas,
    // akun admin tambahan, foto upload, override data siswa) hanya
    // tersimpan sementara di satu instance serverless dan TIDAK sinkron
    // antar perangkat/region (ini penyebab paling umum "akun baru dibuat
    // tapi tidak muncul lagi").
    const kvEnabled = isKvEnabled();

    if (!adminInfo) {
        return res.status(200).json({ loggedIn: false, kvEnabled });
    }

    return res.status(200).json({
        loggedIn: true,
        username: adminInfo.username,
        isOwner: isOwnerUsername(adminInfo.username),
        role: adminInfo.role,
        assignedAbsen: adminInfo.assignedAbsen,
        kvEnabled
    });
};
