const crypto = require("crypto");
const { readJson, writeJson } = require("./blobData");

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 jam

const OWNER_USERNAMES = ["azriel", "david"];

function isOwnerUsername(username) {
    return OWNER_USERNAMES.includes(String(username || "").toLowerCase());
}

const DEFAULT_ADMIN_USERS = [
    {
        username: "azriel",
        passwordHash:
            "6ba3a763ad8cceb7ca5ece45b01d943d:6ba8306311a230d728a6671b684934ae579cd79011b5bae09d713f6f18406c8616ed8d89909a6c11596deeaa44444d9fac50c97db9a9a006021fb207474ec3e4"
    },
    {
        username: "david",
        passwordHash:
            "66f14ab5e98de0133fd8c72223d23332:961e394bab4db44e67ae6d62f67f93cacf78b3ad62c203ed01b866520cc7e36ee21f90044dddc1d058e13ead70f24a28cc2b5344e44b70e7ea7dce8117cbaad6"
    }
];

const ADMIN_EXTRA_KEY = "admin-extra.json";

function loadBaseAdminUsers() {
    if (process.env.ADMIN_USERS) {
        try {
            const parsed = JSON.parse(process.env.ADMIN_USERS);
            if (Array.isArray(parsed) && parsed.length) return parsed;
        } catch (error) {
            console.error("ADMIN_USERS env tidak valid JSON, pakai default:", error.message);
        }
    }
    return DEFAULT_ADMIN_USERS;
}

// Akun admin tambahan yang dibuat lewat panel (disimpan via blobData).
async function loadExtraAdminUsers() {
    const extra = await readJson(ADMIN_EXTRA_KEY, []);
    return Array.isArray(extra) ? extra : [];
}

// Gabungan semua akun admin yang valid untuk login: bawaan (default/env) + tambahan.
async function loadAllAdminUsers() {
    const base = loadBaseAdminUsers();
    const extra = await loadExtraAdminUsers();
    return [...base, ...extra];
}

// Daftar ringkas untuk ditampilkan di panel "Kelola Akun Admin"
// (tanpa passwordHash). Menandai mana yang owner (azriel/david, tak bisa dihapus)
// dan mana yang bisa dihapus (akun tambahan).
async function listAdminAccounts() {
    const base = loadBaseAdminUsers();
    const extra = await loadExtraAdminUsers();

    const baseList = base.map(u => ({
        username: u.username,
        isOwner: isOwnerUsername(u.username),
        removable: false,
        createdAt: null
    }));

    const extraList = extra.map(u => ({
        username: u.username,
        isOwner: isOwnerUsername(u.username),
        removable: !isOwnerUsername(u.username),
        createdAt: u.createdAt || null,
        createdBy: u.createdBy || null
    }));

    return [...baseList, ...extraList];
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

// Buat akun admin baru (hanya boleh dipanggil setelah pemanggil memverifikasi
// bahwa yang membuat adalah owner — lihat api/admin/admins.js).
async function createAdminAccount(username, password, createdBy) {
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername) throw new Error("Username wajib diisi.");
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) {
        throw new Error("Username 3-32 karakter, hanya huruf/angka/._- .");
    }
    if (!password || String(password).length < 4) {
        throw new Error("Password minimal 4 karakter.");
    }

    const all = await loadAllAdminUsers();
    const exists = all.some(u => String(u.username).toLowerCase() === cleanUsername.toLowerCase());
    if (exists) throw new Error("Username sudah dipakai.");

    const extra = await loadExtraAdminUsers();
    extra.push({
        username: cleanUsername,
        passwordHash: hashPassword(String(password)),
        createdBy: createdBy || null,
        createdAt: new Date().toISOString()
    });
    await writeJson(ADMIN_EXTRA_KEY, extra);

    return { username: cleanUsername };
}

// Hapus akun admin tambahan (tidak bisa menghapus akun bawaan/owner).
async function deleteAdminAccount(username) {
    const cleanUsername = String(username || "").trim().toLowerCase();
    if (isOwnerUsername(cleanUsername)) {
        throw new Error("Akun owner (azriel/david) tidak bisa dihapus.");
    }

    const base = loadBaseAdminUsers();
    if (base.some(u => String(u.username).toLowerCase() === cleanUsername)) {
        throw new Error("Akun bawaan tidak bisa dihapus lewat panel.");
    }

    const extra = await loadExtraAdminUsers();
    const remaining = extra.filter(u => String(u.username).toLowerCase() !== cleanUsername);
    if (remaining.length === extra.length) {
        throw new Error("Akun admin tidak ditemukan.");
    }
    await writeJson(ADMIN_EXTRA_KEY, remaining);
}

function getSessionSecret() {
    // Disarankan set SESSION_SECRET di Environment Variables Vercel.
    // Fallback dipakai supaya tetap jalan out-of-the-box untuk dev/lokal.
    return process.env.SESSION_SECRET || "xi-tkj1-dev-secret-ganti-di-production";
}

function timingSafeEqualHex(aHex, bHex) {
    // PENTING: jangan decode via Buffer.from(x, "hex") untuk perbandingan ini.
    // Buffer.from(..., "hex") bersifat lenient: berhenti diam-diam saat ketemu
    // karakter non-hex alih-alih error, sehingga string yang "dipalsukan"
    // (mis. ditambah karakter sampah di akhir) bisa ke-decode jadi buffer yang
    // sama panjang & isinya dengan versi asli -> lolos validasi secara salah.
    // Solusi: bandingkan sebagai teks (byte UTF-8 dari string hex itu sendiri).
    const a = Buffer.from(String(aHex), "utf8");
    const b = Buffer.from(String(bHex), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Verifikasi username + password polos terhadap daftar admin (bawaan + tambahan).
// Return username jika valid, null jika tidak.
async function verifyCredentials(username, password) {
    if (!username || !password) return null;
    const users = await loadAllAdminUsers();
    const user = users.find(
        u => String(u.username).toLowerCase() === String(username).toLowerCase()
    );
    if (!user || !user.passwordHash || !user.passwordHash.includes(":")) return null;

    const [salt, expectedHash] = user.passwordHash.split(":");
    let actualHash;
    try {
        actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
    } catch {
        return null;
    }

    return timingSafeEqualHex(actualHash, expectedHash) ? user.username : null;
}

function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function base64urlDecode(input) {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
}

// Buat token sesi yang ditandatangani (mirip JWT ringkas), tanpa perlu
// menyimpan state di server. Payload berisi username + waktu kadaluarsa.
function createSessionToken(username) {
    const payload = {
        u: username,
        exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    };
    const payloadPart = base64url(JSON.stringify(payload));
    const signature = crypto
        .createHmac("sha256", getSessionSecret())
        .update(payloadPart)
        .digest("hex");
    return `${payloadPart}.${signature}`;
}

// Verifikasi token sesi. Return username jika valid & belum kadaluarsa, else null.
function verifySessionToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const [payloadPart, signature] = token.split(".");
    if (!payloadPart || !signature) return null;

    const expectedSignature = crypto
        .createHmac("sha256", getSessionSecret())
        .update(payloadPart)
        .digest("hex");

    if (!timingSafeEqualHex(signature, expectedSignature)) return null;

    try {
        const payload = JSON.parse(base64urlDecode(payloadPart));
        if (!payload.u || !payload.exp || Date.now() > payload.exp) return null;
        return payload.u;
    } catch {
        return null;
    }
}

function parseCookies(cookieHeader) {
    const result = {};
    if (!cookieHeader) return result;
    cookieHeader.split(";").forEach(part => {
        const idx = part.indexOf("=");
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) result[key] = decodeURIComponent(value);
    });
    return result;
}

// Ambil username admin yang sedang login dari request (via cookie). null jika belum login.
function getLoggedInAdmin(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    return verifySessionToken(token);
}

function buildSessionCookie(token, req) {
    const isHttps =
        req.headers["x-forwarded-proto"] === "https" ||
        (req.socket && req.socket.encrypted);
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`
    ];
    if (isHttps) parts.push("Secure");
    return parts.join("; ");
}

function buildClearSessionCookie(req) {
    const isHttps =
        req.headers["x-forwarded-proto"] === "https" ||
        (req.socket && req.socket.encrypted);
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=0"
    ];
    if (isHttps) parts.push("Secure");
    return parts.join("; ");
}

module.exports = {
    SESSION_COOKIE_NAME,
    OWNER_USERNAMES,
    isOwnerUsername,
    verifyCredentials,
    listAdminAccounts,
    createAdminAccount,
    deleteAdminAccount,
    createSessionToken,
    verifySessionToken,
    parseCookies,
    getLoggedInAdmin,
    buildSessionCookie,
    buildClearSessionCookie
};
