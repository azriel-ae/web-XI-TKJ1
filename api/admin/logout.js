// =========================
// API: POST /api/admin/logout
// =========================

const { buildClearSessionCookie, getLoggedInAdmin } = require("../../lib/auth");
const { logActivity } = require("../../lib/activityLog");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const admin = getLoggedInAdmin(req);
    if (admin) {
        await logActivity("logout", admin, "Keluar dari panel admin.");
    }

    res.setHeader("Set-Cookie", buildClearSessionCookie(req));
    return res.status(200).json({ ok: true });
};
