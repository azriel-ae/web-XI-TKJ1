// =========================
// API: /api/admin/admins (khusus owner: azriel & david)
// GET    -> daftar akun admin (tanpa password)
// POST   -> buat akun admin baru (body: { username, password })
// DELETE -> hapus akun admin tambahan (body: { username })
// =========================

const {
    getLoggedInAdmin,
    isOwnerUsername,
    listAdminAccounts,
    createAdminAccount,
    deleteAdminAccount
} = require("../../lib/auth");
const { logActivity } = require("../../lib/activityLog");

module.exports = async function handler(req, res) {
    const admin = getLoggedInAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    if (!isOwnerUsername(admin)) {
        return res.status(403).json({ error: "Hanya azriel dan david yang bisa mengelola akun admin." });
    }

    if (req.method === "GET") {
        const admins = await listAdminAccounts();
        return res.status(200).json(admins);
    }

    if (req.method === "POST") {
        const body = req.body || {};
        try {
            const created = await createAdminAccount(body.username, body.password, admin);
            await logActivity("admin_create", admin, `Membuat akun admin baru: "${created.username}".`);
            return res.status(200).json({ ok: true, username: created.username });
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
