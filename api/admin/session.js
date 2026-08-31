// =========================
// API: GET /api/admin/session
// Return status login admin saat ini (dibaca dari cookie sesi).
// =========================

const { getLoggedInAdmin, isOwnerUsername } = require("../../lib/auth");
const { resolveBlobToken } = require("../../lib/blobData");

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
    //
    // resolveBlobToken() tidak cuma cek `BLOB_READ_WRITE_TOKEN` polos,
    // tapi juga env var custom yang Vercel bikin otomatis kalau ada
    // lebih dari satu Blob store yang di-connect ke project ini
    // (mis. `namastore_READ_WRITE_TOKEN`). envName dikirim juga (owner
    // saja) supaya gampang dicek variable mana yang sebenarnya kepakai.
    const { token, envName } = resolveBlobToken();
    const blobEnabled = Boolean(token);
    const isOwner = username ? isOwnerUsername(username) : false;

    if (!username) {
        return res.status(200).json({ loggedIn: false, blobEnabled });
    }

    return res.status(200).json({
        loggedIn: true,
        username,
        isOwner,
        blobEnabled,
        ...(isOwner ? { blobEnvName: envName } : {})
    });
};
