// =========================
// API: POST /api/admin/logout
// =========================

const { buildClearSessionCookie } = require("../../lib/auth");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    res.setHeader("Set-Cookie", buildClearSessionCookie(req));
    return res.status(200).json({ ok: true });
};
