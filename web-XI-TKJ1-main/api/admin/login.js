// =========================
// API: POST /api/admin/login
// Body: { username, password }
// Sukses -> set-cookie session admin (HttpOnly).
// =========================

const { verifyCredentials, createSessionToken, buildSessionCookie, isOwnerUsername } = require("../../lib/auth");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: "Username dan password wajib diisi." });
    }

    const validUsername = await verifyCredentials(username, password);

    if (!validUsername) {
        return res.status(401).json({ error: "Username atau password salah." });
    }

    const token = createSessionToken(validUsername);
    res.setHeader("Set-Cookie", buildSessionCookie(token, req));

    return res.status(200).json({ ok: true, username: validUsername, isOwner: isOwnerUsername(validUsername) });
};
