// =========================
// lib/socialAvatar.js
// Ambil foto profil Instagram & TikTok HANYA lewat API resmi (Meta
// Graph API / TikTok Display API), dengan cache tersimpan lewat
// lib/kvStore (pola yang sama dipakai untuk data admin lainnya).
//
// Prinsip: Reliable + Legal + Secure > Realtime.
// - Tidak ada scraping, tidak ada endpoint tidak resmi, tidak ada
//   proxy pihak ketiga.
// - Kalau credential API resmi belum diset di environment variable,
//   fungsi ini TIDAK memaksakan request apa pun — langsung dianggap
//   "tidak tersedia" supaya UI jatuh ke fallback avatar (inisial).
// - Semua credential (access token, client secret) hanya pernah
//   dibaca dari process.env di sisi server. Tidak pernah dikirim ke
//   response atau ke frontend.
// =========================

const { readJson, writeJson } = require("./kvStore");

const CACHE_KEY = "social-avatar-cache.json";

// Avatar yang berhasil diambil dianggap "segar" selama ini — dalam
// rentang ini, tidak ada request baru ke API resmi sama sekali.
const FRESH_MS = 6 * 60 * 60 * 1000; // 6 jam

// Kalau API sedang gagal/lambat, cache lama (meski sudah tidak
// "segar") masih boleh dipakai sampai sebasi ini sebelum akhirnya
// dianggap kadaluarsa dan jatuh ke fallback avatar.
const STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

const HANDLES = {
    instagram: "tkj.1networks_",
    tiktok: "xitkj1smk1npol"
};

function nowMs() {
    return Date.now();
}

async function readCache() {
    const cache = await readJson(CACHE_KEY, {});
    return cache && typeof cache === "object" ? cache : {};
}

async function writeCacheEntry(platform, entry) {
    try {
        const cache = await readCache();
        cache[platform] = entry;
        await writeJson(CACHE_KEY, cache);
    } catch (error) {
        // Cache gagal ditulis bukan hal fatal — request berikutnya
        // cukup mencoba fetch API resmi lagi.
        console.error(`[social] gagal menyimpan cache ${platform}:`, error.message);
    }
}

// -------------------------------------------------------------
// INSTAGRAM — Meta Graph API resmi.
// Hanya berfungsi kalau akun sudah berupa Instagram Business/Creator
// yang tertaut ke Facebook Page, dan Page Access Token (long-lived)
// sudah diset. Kalau belum, fungsi ini tidak melakukan request sama
// sekali (bukan dianggap error, cuma "belum dikonfigurasi").
// -------------------------------------------------------------
async function fetchInstagramLive() {
    const igUserId = process.env.INSTAGRAM_IG_USER_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!igUserId || !accessToken) return null;

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}` +
        `?fields=username,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`instagram-graph-${response.status}`);

    const data = await response.json();
    if (!data || !data.profile_picture_url) throw new Error("instagram-no-avatar");

    return {
        avatarUrl: data.profile_picture_url,
        username: data.username || HANDLES.instagram,
        fetchedAt: nowMs()
    };
}

// -------------------------------------------------------------
// TIKTOK — TikTok Display API (v2) resmi.
// Butuh user access token hasil OAuth (scope user.info.basic) milik
// akun @xitkj1smk1npol sendiri — didapat sekali lewat TikTok Login
// Kit, lalu access/refresh token-nya disimpan di environment
// variable. Refresh token dipakai untuk memperpanjang akses tanpa
// login ulang; token hasil refresh disimpan lewat lib/kvStore
// (bukan di frontend, bukan di kode) supaya tidak hilang setelah
// access token lama kedaluwarsa.
// -------------------------------------------------------------
const TIKTOK_TOKEN_KEY = "tiktok-oauth-tokens.json";

async function getTiktokTokens() {
    const stored = await readJson(TIKTOK_TOKEN_KEY, null);
    if (stored && stored.accessToken) return stored;

    // Belum pernah di-refresh — pakai nilai awal dari environment
    // variable (hasil OAuth pertama kali, diisi manual oleh admin).
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;
    if (!accessToken) return null;
    return { accessToken, refreshToken: refreshToken || null };
}

async function refreshTiktokToken(refreshToken) {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret || !refreshToken) return null;

    const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken
    });

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || !data.access_token) return null;

    const tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken
    };

    try {
        await writeJson(TIKTOK_TOKEN_KEY, tokens);
    } catch (error) {
        console.error("[social] gagal menyimpan token TikTok hasil refresh:", error.message);
    }

    return tokens;
}

async function callTiktokUserInfo(accessToken) {
    const response = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
        {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(5000)
        }
    );
    return response;
}

async function fetchTiktokLive() {
    let tokens = await getTiktokTokens();
    if (!tokens || !tokens.accessToken) return null;

    let response = await callTiktokUserInfo(tokens.accessToken);

    // Access token kedaluwarsa -> coba refresh sekali lewat API resmi.
    if (response.status === 401 && tokens.refreshToken) {
        const refreshed = await refreshTiktokToken(tokens.refreshToken);
        if (!refreshed) throw new Error("tiktok-refresh-failed");
        tokens = refreshed;
        response = await callTiktokUserInfo(tokens.accessToken);
    }

    if (!response.ok) throw new Error(`tiktok-display-${response.status}`);

    const payload = await response.json();
    const info = payload && payload.data && payload.data.user;
    if (!info || !info.avatar_url) throw new Error("tiktok-no-avatar");

    return {
        avatarUrl: info.avatar_url,
        username: HANDLES.tiktok,
        fetchedAt: nowMs()
    };
}

const LIVE_FETCHERS = {
    instagram: fetchInstagramLive,
    tiktok: fetchTiktokLive
};

// -------------------------------------------------------------
// Ambil profil satu platform: cache segar -> cache lama (kalau live
// gagal) -> null (UI akan pakai fallback avatar berbasis inisial).
// -------------------------------------------------------------
async function getSocialProfile(platform) {
    const cache = await readCache();
    const cached = cache[platform];
    const age = cached ? nowMs() - cached.fetchedAt : Infinity;

    if (cached && age < FRESH_MS) {
        return { avatarUrl: cached.avatarUrl, handle: HANDLES[platform] };
    }

    try {
        const live = await LIVE_FETCHERS[platform]();
        if (live) {
            await writeCacheEntry(platform, live);
            return { avatarUrl: live.avatarUrl, handle: HANDLES[platform] };
        }
    } catch (error) {
        // API resmi gagal/timeout — jangan bocorkan detail teknis ke
        // pengunjung, cukup dicatat untuk developer.
        console.error(`[social] fetch live ${platform} gagal:`, error.message);
    }

    // API tidak dikonfigurasi atau sedang gagal: pakai cache lama
    // selama masih dalam masa tenggang, kalau tidak ada -> fallback.
    if (cached && age < STALE_GRACE_MS) {
        return { avatarUrl: cached.avatarUrl, handle: HANDLES[platform] };
    }

    return { avatarUrl: null, handle: HANDLES[platform] };
}

async function getAllSocialProfiles() {
    const [instagram, tiktok] = await Promise.all([
        getSocialProfile("instagram"),
        getSocialProfile("tiktok")
    ]);
    return { instagram, tiktok };
}

module.exports = { getAllSocialProfiles };
