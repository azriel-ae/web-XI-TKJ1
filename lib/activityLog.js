// =========================
// lib/activityLog.js
// Pencatatan aktivitas di panel admin (login, logout, upload galeri,
// hapus foto, ubah data siswa, kelola akun admin, dsb).
//
// Disimpan lewat penyimpanan yang sama dengan data admin lain
// (lib/blobData.js), jadi otomatis persist lewat Vercel Blob kalau
// BLOB_READ_WRITE_TOKEN sudah diset, atau fallback ke disk lokal
// saat dites di komputer sendiri.
//
// Hanya owner (azriel & david) yang boleh membaca log ini — lihat
// api/admin/activity-log.js.
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
        const existing = await readJson(LOG_KEY, []);
        const entries = Array.isArray(existing) ? existing : [];

        entries.unshift({
            id: crypto.randomUUID(),
            actor: actor || "unknown",
            action,
            detail: detail || "",
            at: new Date().toISOString()
        });

        if (entries.length > MAX_LOG_ENTRIES) entries.length = MAX_LOG_ENTRIES;

        await writeJson(LOG_KEY, entries);
    } catch (error) {
        console.error("Gagal mencatat activity log:", error.message);
    }
}

async function getActivityLog() {
    const log = await readJson(LOG_KEY, []);
    return Array.isArray(log) ? log : [];
}

module.exports = {
    logActivity,
    getActivityLog
};
