// =========================
// API: /api/admin/auth (gabungan login + logout)
// POST ?action=login  -> body: { username, password }, sukses set-cookie session admin (HttpOnly)
// POST ?action=logout -> hapus cookie session admin
//
// CATATAN: login & logout sengaja digabung ke satu file (bukan dua file
// terpisah seperti sebelumnya) karena paket Vercel Hobby dibatasi
// maksimal 12 Serverless Functions per deployment (1 file di /api = 1
// function). Sebelumnya total ada 13 function (login.js + logout.js
// terpisah) sehingga deploy gagal dengan error "No more than 12
// Serverless Functions...". Pola gabung-lewat-query-param ini sama
// dengan yang sudah dipakai di api/admin/admins.js (resource=activity-log).
// =========================

const {
    verifyCredentials,
    createSessionToken,
    buildSessionCookie,
    buildClearSessionCookie,
    isSuperAdminUsername,
    getAdminInfoByUsername,
    getLoggedInAdmin
} = require("../../lib/auth");
const { logActivity } = require("../../lib/activityLog");

// Ambil query string manual dari req.url (sama seperti di admins.js) —
// req.query hanya otomatis terisi di runtime Vercel, tidak saat dites
// lokal lewat server.js (lihat lib/http.js).
function getQueryParam(req, key) {
    try {
        const url = new URL(req.url, "http://localhost");
        return url.searchParams.get(key);
    } catch {
        return null;
    }
}

async function handleLogin(req, res) {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: "Username dan password wajib diisi." });
    }

    const validUsername = await verifyCredentials(username, password);

    if (!validUsername) {
        await logActivity("login_gagal", String(username || "").trim() || "unknown", "Percobaan login gagal.");
        return res.status(401).json({ error: "Username atau password salah." });
    }

    const token = createSessionToken(validUsername);
    res.setHeader("Set-Cookie", buildSessionCookie(token, req));

    await logActivity("login", validUsername, "Berhasil login ke panel admin.");

    const info = await getAdminInfoByUsername(validUsername);

    return res.status(200).json({
        ok: true,
        username: validUsername,
        isSuperAdmin: isSuperAdminUsername(validUsername),
        role: info.role,
        assignedAbsen: info.assignedAbsen
    });
}

async function handleLogout(req, res) {
    const admin = getLoggedInAdmin(req);
    if (admin) {
        await logActivity("logout", admin, "Keluar dari panel admin.");
    }

    res.setHeader("Set-Cookie", buildClearSessionCookie(req));
    return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const action = getQueryParam(req, "action");

    if (action === "login") return handleLogin(req, res);
    if (action === "logout") return handleLogout(req, res);

    return res.status(400).json({ error: "Parameter action wajib diisi (login/logout)." });
};
