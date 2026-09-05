// =========================
// lib/socialAvatar.js
// Foto profil Instagram & TikTok kelas: SEPENUHNYA diatur manual oleh
// admin lewat panel /admin (upload, ganti, atau hapus foto), TIDAK
// diambil otomatis lewat API resmi mana pun.
//
// Kenapa begini:
// - Foto profil sosmed kelas jarang berubah, jadi tidak perlu
//   realtime lewat API.
// - Menghindari ketergantungan pada kredensial API pihak ketiga
//   (Meta Graph API / TikTok Display API) yang butuh setup OAuth,
//   bisa kedaluwarsa, dan kompleks untuk kelas sekolah.
// - Kalau admin belum pernah upload foto untuk sebuah platform (atau
//   sudah menghapusnya), avatarUrl dikirim null supaya frontend jatuh
//   ke fallback avatar (inisial) — bukan gambar rusak.
//
// Foto yang diupload disimpan lewat lib/kvStore (Vercel Blob / disk
// lokal, pola yang sama dipakai untuk foto galeri & foto siswa).
// =========================

const { readJson, writeJson, uploadImage, deleteImage } = require("./kvStore");

const STORE_KEY = "social-avatar.json";

const HANDLES = {
    instagram: "tkj.1networks_",
    tiktok: "xitkj1smk1npol"
};

const PLATFORMS = Object.keys(HANDLES);

function isValidPlatform(platform) {
    return PLATFORMS.includes(String(platform || "").toLowerCase());
}

async function readStore() {
    const store = await readJson(STORE_KEY, {});
    return store && typeof store === "object" ? store : {};
}

// Foto yang ditampilkan ke publik (index.html) untuk satu platform.
async function getSocialProfile(platform) {
    const store = await readStore();
    const entry = store[platform];
    return {
        avatarUrl: (entry && entry.avatarUrl) || null,
        handle: HANDLES[platform]
    };
}

async function getAllSocialProfiles() {
    const [instagram, tiktok] = await Promise.all([
        getSocialProfile("instagram"),
        getSocialProfile("tiktok")
    ]);
    return { instagram, tiktok };
}

// -------------------------------------------------------------
// Dipakai panel admin (lihat api/admin/social.js): atur/ganti foto
// profil satu platform. HANYA boleh dipanggil setelah pemanggil
// memverifikasi bahwa yang mengakses adalah admin yang sudah login.
// -------------------------------------------------------------
async function setSocialAvatar(platform, buffer, contentType, ext, updatedBy) {
    const key = String(platform || "").toLowerCase();
    if (!isValidPlatform(key)) throw new Error("Platform tidak dikenal.");

    const store = await readStore();
    const previous = store[key];

    const filename = `${key}-${Date.now()}.${ext}`;
    const avatarUrl = await uploadImage("social", filename, buffer, contentType);

    store[key] = {
        avatarUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy || null
    };
    await writeJson(STORE_KEY, store);

    // Hapus foto lama (kalau ada) supaya tidak menumpuk file yang
    // sudah tidak terpakai di storage.
    if (previous && previous.avatarUrl) {
        await deleteImage(previous.avatarUrl);
    }

    return { avatarUrl, handle: HANDLES[key] };
}

// Dipakai panel admin: hapus foto profil satu platform -> frontend
// otomatis jatuh ke fallback avatar (inisial).
async function deleteSocialAvatar(platform) {
    const key = String(platform || "").toLowerCase();
    if (!isValidPlatform(key)) throw new Error("Platform tidak dikenal.");

    const store = await readStore();
    const previous = store[key];
    if (!previous) return;

    delete store[key];
    await writeJson(STORE_KEY, store);

    if (previous.avatarUrl) {
        await deleteImage(previous.avatarUrl);
    }
}

module.exports = {
    HANDLES,
    isValidPlatform,
    getAllSocialProfiles,
    setSocialAvatar,
    deleteSocialAvatar
};
