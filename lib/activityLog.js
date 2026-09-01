// =========================
// lib/activityLog.js
// Pencatatan aktivitas di panel admin (login, logout, upload galeri,
// hapus foto, ubah data siswa, kelola akun admin, dsb).
//
// Disimpan lewat lib/blobData.js dengan flag { private: true }, jadi:
//   - Kalau ada store Blob "Private" ter-connect (env PRIVATE_BLOB_*),
//     log ditulis ke sana dengan access:"private" -> TIDAK bisa dibuka
//     langsung lewat URL blob oleh siapapun, harus lewat endpoint API
//     yang sudah dijaga login (lihat api/admin/admins.js, resource=
//     activity-log) DAN dicek isOwnerUsername (hanya azriel & david).
//   - Kalau store private belum ada, fallback ke disk lokal di folder
//     data-private/ (bukan data/) supaya tidak ikut ke-serve sebagai
//     file statis publik saat dites lokal.
//
// PENTING: log ini sengaja TIDAK memakai store Blob "public" yang sama
// dengan gallery/foto siswa, karena blob public bisa diakses siapa saja
// yang tahu/menebak URL-nya, walau endpoint API-nya sendiri sudah
// dibatasi login+role. Lihat lib/blobData.js untuk detail setup store
// private-nya (butuh dibuat & di-connect manual di dashboard Vercel
// dengan prefix env var "PRIVATE_").
//
// Hanya owner (azriel & david) yang boleh membaca log ini — lihat
// api/admin/admins.js (resource=activity-log).
// =========================

const crypto = require("crypto");
const { readJson, writeJson } = require("./blobData");

const LOG_KEY = "activity-log.json";
const MAX_LOG_ENTRIES = 500; // batasi biar file log tidak membengkak selamanya

// Catat satu kejadian. Sengaja "fire-and-forget" dari sisi pemanggil:
// kalau pencatatan log gagal (mis. penyimpanan lagi error), itu TIDAK
// boleh menggagalkan aksi utama (login/upload/dst) yang sedang dicatat.
async function logActivity(action, actor, detail) {
    try {
        const existing = await readJson(LOG_KEY, [], { private: true });
        const entries = Array.isArray(existing) ? existing : [];

        entries.unshift({
            id: crypto.randomUUID(),
            actor: actor || "unknown",
            action,
            detail: detail || "",
            at: new Date().toISOString()
        });

        if (entries.length > MAX_LOG_ENTRIES) entries.length = MAX_LOG_ENTRIES;

        await writeJson(LOG_KEY, entries, { private: true });
    } catch (error) {
        console.error("Gagal mencatat activity log:", error.message);
    }
}

async function getActivityLog() {
    const log = await readJson(LOG_KEY, [], { private: true });
    return Array.isArray(log) ? log : [];
}

module.exports = {
    logActivity,
    getActivityLog
};
