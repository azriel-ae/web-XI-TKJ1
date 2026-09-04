const crypto = require("crypto");
const { readJson, writeJson } = require("./kvStore");

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 jam

const OWNER_USERNAMES = ["azriel", "david"];

// =========================
// Sistem role:
// - super_admin : owner (azriel & david). Akses penuh, tidak bisa dihapus.
// - admin       : fitur terbatas — tidak bisa kelola akun admin, tidak bisa
//                 lihat log aktivitas, tidak bisa hapus foto galeri. Tapi
//                 bebas mengedit data/foto siswa manapun & upload galeri.
// - siswa       : hanya boleh mengedit data & foto siswa yang absennya
//                 sudah dipilihkan oleh owner saat akun dibuat. Tidak bisa
//                 kelola admin/log, tidak bisa hapus foto galeri.
// =========================
const ROLES = {
    SUPER_ADMIN: "super_admin",
    ADMIN: "admin",
    SISWA: "siswa"
};
const VALID_ROLES = Object.values(ROLES);

function isOwnerUsername(username) {
    return OWNER_USERNAMES.includes(String(username || "").toLowerCase());
}

// Role "sebenarnya" dari sebuah akun: owner selalu dipaksa jadi super_admin
// apapun yang tersimpan (jaga-jaga kalau data lama tidak punya field role).
function resolveRole(user) {
    if (isOwnerUsername(user && user.username)) return ROLES.SUPER_ADMIN;
    const role = user && user.role;
    return VALID_ROLES.includes(role) ? role : ROLES.ADMIN;
}

// Normalisasi daftar absen yang boleh diedit akun ber-role siswa.
function normalizeAssignedAbsen(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    list.forEach(v => {
        const n = Number(v);
        if (Number.isInteger(n) && n > 0) seen.add(n);
    });
    return Array.from(seen);
}

const DEFAULT_ADMIN_USERS = [
    {
        username: "azriel",
        role: ROLES.SUPER_ADMIN,
        passwordHash:
            "6ba3a763ad8cceb7ca5ece45b01d943d:6ba8306311a230d728a6671b684934ae579cd79011b5bae09d713f6f18406c8616ed8d89909a6c11596deeaa44444d9fac50c97db9a9a006021fb207474ec3e4"
    },
    {
        username: "david",
        role: ROLES.SUPER_ADMIN,
        passwordHash:
            "66f14ab5e98de0133fd8c72223d23332:961e394bab4db44e67ae6d62f67f93cacf78b3ad62c203ed01b866520cc7e36ee21f90044dddc1d058e13ead70f24a28cc2b5344e44b70e7ea7dce8117cbaad6"
    }
];

const ADMIN_EXTRA_KEY = "admin-extra.json";

// Password akun owner (azriel/david) yang sudah pernah diganti lewat panel.
// Akun owner sendiri hardcode di DEFAULT_ADMIN_USERS/ADMIN_USERS (kode/env),
// jadi passwordHash barunya TIDAK bisa ditulis balik ke sana. Sebagai
// gantinya, kalau owner ganti password, hash barunya disimpan terpisah di
// sini (kvStore) dan dipakai untuk "menimpa" passwordHash bawaan saat login
// & verifikasi. Key: username owner (lowercase) -> { passwordHash, updatedAt, updatedBy }.
const OWNER_PASSWORD_KEY = "admin-owner-passwords.json";

// Data akun admin tambahan (berisi passwordHash!) selalu disimpan lewat
// kvStore (lihat lib/kvStore.js) supaya permanen di deployment Vercel.

async function loadOwnerPasswordOverrides() {
    const overrides = await readJson(OWNER_PASSWORD_KEY, {});
    return overrides && typeof overrides === "object" ? overrides : {};
}

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

// Akun admin tambahan yang dibuat lewat panel (disimpan via kvStore).
async function loadExtraAdminUsers() {
    const extra = await readJson(ADMIN_EXTRA_KEY, []);
    return Array.isArray(extra) ? extra : [];
}

// Gabungan semua akun admin yang valid untuk login: bawaan (default/env,
// dengan passwordHash owner ditimpa kalau sudah pernah diganti lewat panel)
// + tambahan.
async function loadAllAdminUsers() {
    const base = loadBaseAdminUsers();
    const overrides = await loadOwnerPasswordOverrides();
    const baseWithOwnerOverrides = base.map(u => {
        const override = isOwnerUsername(u.username)
            ? overrides[String(u.username).toLowerCase()]
            : null;
        return override && override.passwordHash
            ? { ...u, passwordHash: override.passwordHash }
            : u;
    });
    const extra = await loadExtraAdminUsers();
    return [...baseWithOwnerOverrides, ...extra];
}

// Daftar ringkas untuk ditampilkan di panel "Kelola Akun Admin"
// (tanpa passwordHash). Menandai mana yang owner (azriel/david, tak bisa dihapus)
// dan mana yang bisa dihapus (akun tambahan). Termasuk role & (untuk role
// siswa) daftar absen yang boleh diedit akun tersebut.
async function listAdminAccounts() {
    const base = loadBaseAdminUsers();
    const extra = await loadExtraAdminUsers();

    const baseList = base.map(u => ({
        username: u.username,
        role: resolveRole(u),
        isOwner: isOwnerUsername(u.username),
        assignedAbsen: [],
        removable: false,
        createdAt: null
    }));

    const extraList = extra.map(u => ({
        username: u.username,
        role: resolveRole(u),
        isOwner: isOwnerUsername(u.username),
        assignedAbsen: resolveRole(u) === ROLES.SISWA ? normalizeAssignedAbsen(u.assignedAbsen) : [],
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
// options.role: "admin" (default) atau "siswa".
// options.assignedAbsen: wajib diisi (array nomor absen, minimal 1) kalau role "siswa" —
// validasi bahwa absen tsb benar-benar ada dilakukan di api/admin/admins.js
// (yang punya akses ke data/siswa.json), bukan di sini.
async function createAdminAccount(username, password, createdBy, options) {
    const opts = options || {};
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername) throw new Error("Username wajib diisi.");
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) {
        throw new Error("Username 3-32 karakter, hanya huruf/angka/._- .");
    }
    if (!password || String(password).length < 4) {
        throw new Error("Password minimal 4 karakter.");
    }

    const role = VALID_ROLES.includes(opts.role) && opts.role !== ROLES.SUPER_ADMIN
        ? opts.role
        : ROLES.ADMIN;

    const assignedAbsen = role === ROLES.SISWA ? normalizeAssignedAbsen(opts.assignedAbsen) : [];
    if (role === ROLES.SISWA && !assignedAbsen.length) {
        throw new Error("Pilih minimal satu siswa yang boleh diedit akun ini.");
    }

    if (isOwnerUsername(cleanUsername)) {
        throw new Error("Username tersebut sudah dipakai untuk akun owner.");
    }

    const all = await loadAllAdminUsers();
    const exists = all.some(u => String(u.username).toLowerCase() === cleanUsername.toLowerCase());
    if (exists) throw new Error("Username sudah dipakai.");

    const extra = await loadExtraAdminUsers();
    extra.push({
        username: cleanUsername,
        role,
        assignedAbsen,
        passwordHash: hashPassword(String(password)),
        createdBy: createdBy || null,
        createdAt: new Date().toISOString()
    });
    await writeJson(ADMIN_EXTRA_KEY, extra);

    return { username: cleanUsername, role, assignedAbsen };
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

// Ubah username dan/atau password akun admin tambahan yang sudah ada
// (dibuat lewat panel). Hanya boleh dipanggil setelah pemanggil
// diverifikasi owner (lihat api/admin/admins.js). Bisa dipakai untuk
// akun yang sudah ada sekarang maupun akun-akun baru yang dibuat
// setelah ini — selama akunnya termasuk "extra" (bukan akun
// bawaan/owner yang di-hardcode).
// options: { newUsername?, newPassword? } — minimal salah satu diisi.
async function updateAdminAccount(username, options, editedBy) {
    const opts = options || {};
    const cleanUsername = String(username || "").trim().toLowerCase();

    // Akun owner (azriel/david): username-nya tetap terkunci (hardcode di
    // kode/env), tapi PASSWORD-nya boleh diganti lewat panel. Fungsi ini
    // sendiri hanya bisa dipanggil setelah pemanggil diverifikasi sebagai
    // owner (lihat api/admin/admins.js) — jadi otomatis hanya azriel/david
    // yang bisa memicu perubahan ini.
    if (isOwnerUsername(cleanUsername)) {
        return updateOwnerPassword(cleanUsername, opts.newPassword, options, editedBy);
    }

    const base = loadBaseAdminUsers();
    if (base.some(u => String(u.username).toLowerCase() === cleanUsername)) {
        throw new Error("Akun bawaan (diset lewat env ADMIN_USERS) tidak bisa diubah lewat panel.");
    }

    const hasNewUsername = opts.newUsername !== undefined && opts.newUsername !== null && String(opts.newUsername).trim() !== "";
    const hasNewPassword = opts.newPassword !== undefined && opts.newPassword !== null && String(opts.newPassword) !== "";

    if (!hasNewUsername && !hasNewPassword) {
        throw new Error("Isi username baru dan/atau password baru terlebih dahulu.");
    }

    const extra = await loadExtraAdminUsers();
    const index = extra.findIndex(u => String(u.username).toLowerCase() === cleanUsername);
    if (index === -1) {
        throw new Error("Akun admin tidak ditemukan.");
    }

    const target = { ...extra[index] };

    if (hasNewUsername) {
        const newUsername = String(opts.newUsername).trim();
        if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(newUsername)) {
            throw new Error("Username 3-32 karakter, hanya huruf/angka/._- .");
        }
        if (isOwnerUsername(newUsername)) {
            throw new Error("Username tersebut sudah dipakai untuk akun owner.");
        }
        const allOthers = [...base, ...extra.filter((_, i) => i !== index)];
        const usernameTaken = allOthers.some(u => String(u.username).toLowerCase() === newUsername.toLowerCase());
        if (usernameTaken) {
            throw new Error("Username sudah dipakai.");
        }
        target.username = newUsername;
    }

    if (hasNewPassword) {
        if (String(opts.newPassword).length < 4) {
            throw new Error("Password minimal 4 karakter.");
        }
        target.passwordHash = hashPassword(String(opts.newPassword));
    }

    target.updatedAt = new Date().toISOString();
    target.updatedBy = editedBy || null;

    extra[index] = target;
    await writeJson(ADMIN_EXTRA_KEY, extra);

    return { username: target.username, role: resolveRole(target), assignedAbsen: normalizeAssignedAbsen(target.assignedAbsen) };
}

// Ubah password akun owner (azriel/david). Username owner TIDAK bisa diubah
// (hardcode di kode/env, dipakai di banyak tempat sebagai penanda "super
// admin"), jadi kalau ada percobaan mengirim newUsername yang beda, tolak
// eksplisit supaya jelas alih-alih diam-diam diabaikan. Hanya boleh dipanggil
// setelah pemanggil diverifikasi owner (lihat api/admin/admins.js).
async function updateOwnerPassword(username, newPassword, options, editedBy) {
    const opts = options || {};
    const cleanUsername = String(username || "").trim().toLowerCase();

    const hasNewUsername = opts.newUsername !== undefined && opts.newUsername !== null && String(opts.newUsername).trim() !== "";
    if (hasNewUsername && String(opts.newUsername).trim().toLowerCase() !== cleanUsername) {
        throw new Error("Username akun owner (azriel/david) tidak bisa diubah, hanya password.");
    }

    const hasNewPassword = newPassword !== undefined && newPassword !== null && String(newPassword) !== "";
    if (!hasNewPassword) {
        throw new Error("Isi password baru untuk mengubah akun owner.");
    }
    if (String(newPassword).length < 4) {
        throw new Error("Password minimal 4 karakter.");
    }

    const overrides = await loadOwnerPasswordOverrides();
    overrides[cleanUsername] = {
        passwordHash: hashPassword(String(newPassword)),
        updatedAt: new Date().toISOString(),
        updatedBy: editedBy || null
    };
    await writeJson(OWNER_PASSWORD_KEY, overrides);

    return { username: cleanUsername, role: ROLES.SUPER_ADMIN, assignedAbsen: [] };
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

// Sama seperti getLoggedInAdmin, tapi juga mengembalikan role & (untuk role
// siswa) daftar absen yang boleh diedit. Dipakai di endpoint yang perlu
// menegakkan batasan per-role (mis. siswa-data, siswa-foto). Selalu ambil
// dari sumber tepercaya (cookie sesi + data akun tersimpan) — JANGAN PERNAH
// percaya role yang dikirim dari body/frontend.
async function getLoggedInAdminInfo(req) {
    const username = getLoggedInAdmin(req);
    if (!username) return null;

    if (isOwnerUsername(username)) {
        return { username, role: ROLES.SUPER_ADMIN, assignedAbsen: [] };
    }

    const all = await loadAllAdminUsers();
    const user = all.find(u => String(u.username).toLowerCase() === String(username).toLowerCase());
    if (!user) return null; // akun sudah dihapus tapi cookie sesi masih ada

    return {
        username,
        role: resolveRole(user),
        assignedAbsen: resolveRole(user) === ROLES.SISWA ? normalizeAssignedAbsen(user.assignedAbsen) : []
    };
}

// Ambil role & assignedAbsen untuk sebuah username yang SUDAH diverifikasi
// valid (mis. langsung setelah verifyCredentials sukses saat login). Beda
// dengan getLoggedInAdminInfo yang membaca username dari cookie request.
async function getAdminInfoByUsername(username) {
    if (isOwnerUsername(username)) {
        return { username, role: ROLES.SUPER_ADMIN, assignedAbsen: [] };
    }
    const all = await loadAllAdminUsers();
    const user = all.find(u => String(u.username).toLowerCase() === String(username).toLowerCase());
    if (!user) return { username, role: ROLES.ADMIN, assignedAbsen: [] };
    return {
        username,
        role: resolveRole(user),
        assignedAbsen: resolveRole(user) === ROLES.SISWA ? normalizeAssignedAbsen(user.assignedAbsen) : []
    };
}

// Cek apakah sebuah akun (hasil getLoggedInAdminInfo) boleh mengedit data/foto
// siswa dengan nomor absen tertentu.
function canEditSiswa(adminInfo, absen) {
    if (!adminInfo) return false;
    if (adminInfo.role === ROLES.SISWA) {
        return adminInfo.assignedAbsen.includes(Number(absen));
    }
    // super_admin & admin biasa: bebas mengedit siswa manapun.
    return true;
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
    ROLES,
    VALID_ROLES,
    isOwnerUsername,
    resolveRole,
    normalizeAssignedAbsen,
    verifyCredentials,
    listAdminAccounts,
    createAdminAccount,
    deleteAdminAccount,
    updateAdminAccount,
    updateOwnerPassword,
    createSessionToken,
    verifySessionToken,
    parseCookies,
    getLoggedInAdmin,
    getLoggedInAdminInfo,
    getAdminInfoByUsername,
    canEditSiswa,
    buildSessionCookie,
    buildClearSessionCookie
};
