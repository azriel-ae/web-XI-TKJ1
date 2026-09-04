// =========================
// lib/activityLog.js
// Pencatatan aktivitas di panel admin (login, logout, upload galeri,
// hapus foto, ubah data siswa, kelola akun admin, dsb).
//
// Disimpan lewat lib/kvStore.js (Vercel Blob public, lihat catatan di
// kvStore.js) supaya tidak hilang lagi di deployment Vercel. CATATAN:
// karena Blob-nya public, log ini SECARA TEKNIS bisa diakses langsung
// lewat URL Blob kalau seseorang tahu/menebak pathname-nya — akses lewat
// panel admin sendiri tetap dijaga login DAN dicek isSuperAdminUsername
// (hanya azriel & david) lewat api/admin/admins.js (resource=activity-log).
//
// Kalau BLOB_READ_WRITE_TOKEN belum ter-setup di environment, otomatis
// fallback ke disk lokal di folder data/ supaya tetap bisa dites lokal.
//
// -------------------------------------------------------------
// RETENSI 30 HARI: entri log yang lebih tua dari 30 hari otomatis dibuang
// (baik saat ditampilkan maupun saat disimpan ulang) supaya log tidak
// menumpuk selamanya. Ini HANYA berlaku untuk log aktivitas di file ini —
// data akun admin (disimpan terpisah lewat lib/auth.js, key
// "admin-extra.json") TIDAK pernah ikut kena penghapusan otomatis ini,
// tetap permanen selamanya.
// -------------------------------------------------------------

const crypto = require("crypto");
const { readJson, writeJson } = require("./kvStore");

const LOG_KEY = "activity-log.json";
const MAX_LOG_ENTRIES = 500; // batasi biar file log tidak membengkak selamanya
const RETENTION_DAYS = 30; // entri lebih tua dari ini otomatis hilang

function pruneExpired(entries) {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return entries.filter(entry => {
        const t = Date.parse(entry && entry.at);
        // Entri dengan tanggal rusak/tidak terbaca sengaja DIPERTAHANKAN
        // (lebih aman daripada diam-diam terhapus karena bug parsing).
        return Number.isNaN(t) ? true : t >= cutoff;
    });
}

// Catat satu kejadian. Sengaja "fire-and-forget" dari sisi pemanggil:
// kalau pencatatan log gagal (mis. penyimpanan lagi error), itu TIDAK
// boleh menggagalkan aksi utama (login/upload/dst) yang sedang dicatat.
async function logActivity(action, actor, detail) {
    try {
        const existing = await readJson(LOG_KEY, []);
        let entries = Array.isArray(existing) ? existing : [];

        // Buang entri >30 hari sebelum entri baru ditambahkan, supaya data
        // aktivitas lama otomatis "hilang" begitu ada aktivitas baru.
        entries = pruneExpired(entries);

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
    const entries = Array.isArray(log) ? log : [];
    // Disaring lagi di sisi baca juga, supaya entri >30 hari tetap tidak
    // tampil walau kebetulan belum ada aktivitas baru yang memicu prune di atas.
    return pruneExpired(entries);
}

module.exports = {
    logActivity,
    getActivityLog
};
