// =========================
// API: GET /api/admin/activity-log (khusus owner: azriel & david)
// Return daftar log aktivitas panel admin, terbaru duluan.
// =========================

const { getLoggedInAdmin, isOwnerUsername } = require("../../lib/auth");
const { getActivityLog } = require("../../lib/activityLog");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const admin = getLoggedInAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    // Sama seperti /api/admin/admins: jangan percaya apa pun dari frontend,
    // cek ulang role di backend terhadap identitas dari session cookie.
    if (!isOwnerUsername(admin)) {
        return res.status(403).json({ error: "Hanya azriel dan david yang bisa melihat log aktivitas." });
    }

    res.setHeader("Cache-Control", "no-store");
    const log = await getActivityLog();
    return res.status(200).json(log);
};
