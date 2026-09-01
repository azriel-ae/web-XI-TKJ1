// =========================
// API: /api/admin/admins (khusus owner: azriel & david)
// GET    -> daftar akun admin (tanpa password)
//           GET ?resource=activity-log -> daftar log aktivitas panel admin
// POST   -> buat akun admin baru (body: { username, password })
// DELETE -> hapus akun admin tambahan (body: { username })
//
// CATATAN: log aktivitas sengaja digabung ke file ini (bukan file API
// terpisah) karena paket Vercel Hobby dibatasi maksimal 12 Serverless
// Functions per deployment (1 file di /api = 1 function). Menambah file
// baru akan melewati batas itu dan bikin deploy gagal.
// =========================

const {
    getLoggedInAdmin,
    isOwnerUsername,
    listAdminAccounts,
    createAdminAccount,
    deleteAdminAccount,
    ROLES,
    normalizeAssignedAbsen
} = require("../../lib/auth");
const { logActivity, getActivityLog } = require("../../lib/activityLog");
const baseSiswa = require("../../data/siswa.json");

// Ambil query string manual dari req.url. Tidak pakai req.query karena
// itu hanya otomatis terisi di runtime Vercel — waktu dites lokal lewat
// server.js, req.query tidak pernah di-set (lihat lib/http.js), jadi
// perlu diparse sendiri supaya perilakunya sama di kedua environment.
function getQueryParam(req, key) {
    try {
        const url = new URL(req.url, "http://localhost");
        return url.searchParams.get(key);
    } catch {
        return null;
    }
}

module.exports = async function handler(req, res) {
    const admin = getLoggedInAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    if (!isOwnerUsername(admin)) {
        return res.status(403).json({ error: "Hanya azriel dan david yang bisa mengelola akun admin." });
    }

    if (req.method === "GET") {
        const resource = getQueryParam(req, "resource");

        if (resource === "activity-log") {
            res.setHeader("Cache-Control", "no-store");
            const log = await getActivityLog();
            return res.status(200).json(log);
        }

        const admins = await listAdminAccounts();
        return res.status(200).json(admins);
    }

    if (req.method === "POST") {
        const body = req.body || {};
        const role = body.role === ROLES.SISWA ? ROLES.SISWA : ROLES.ADMIN;

        let assignedAbsen = [];
        if (role === ROLES.SISWA) {
            assignedAbsen = normalizeAssignedAbsen(body.assignedAbsen);
            if (!assignedAbsen.length) {
                return res.status(400).json({ error: "Pilih minimal satu siswa yang boleh diedit akun ini." });
            }
            // Pastikan semua absen yang dipilih benar-benar ada di data siswa.
            const invalid = assignedAbsen.filter(a => !baseSiswa.some(s => s.absen === a));
            if (invalid.length) {
                return res.status(400).json({ error: `Nomor absen tidak valid: ${invalid.join(", ")}.` });
            }
        }

        try {
            const created = await createAdminAccount(body.username, body.password, admin, { role, assignedAbsen });
            const detailRole = role === ROLES.SISWA
                ? `role siswa (absen: ${assignedAbsen.join(", ")})`
                : "role admin";
            await logActivity("admin_create", admin, `Membuat akun admin baru: "${created.username}" (${detailRole}).`);
            return res.status(200).json({ ok: true, username: created.username, role: created.role, assignedAbsen: created.assignedAbsen });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === "DELETE") {
        const body = req.body || {};
        if (!body.username) {
            return res.status(400).json({ error: "Username wajib diisi." });
        }
        try {
            await deleteAdminAccount(body.username);
            await logActivity("admin_delete", admin, `Menghapus akun admin: "${body.username}".`);
            return res.status(200).json({ ok: true });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: "Method tidak diizinkan" });
};
