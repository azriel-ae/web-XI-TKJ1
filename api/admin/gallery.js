// =========================
// API: /api/admin/gallery (gabungan galeri + foto profil sosmed)
// ?resource=... (opsional, default "gallery"):
//   - "gallery" (default) -> POST tambah foto galeri, DELETE hapus foto galeri (body: { id })
//   - "social"            -> POST atur/ganti foto profil Instagram/TikTok (body: { platform, foto }),
//                             DELETE hapus foto profil (body: { platform })
//
// CATATAN: digabung ke satu file/function (bukan file /api terpisah)
// untuk menghemat kuota Serverless Functions di paket Vercel Hobby
// (maksimal 12 function per deployment, project ini sengaja membatasi
// diri di 11 supaya masih ada sisa ruang). Pola gabung-lewat-query-param
// ini sama dengan api/admin/auth.js, api/admin/admins.js, dan
// api/admin/siswa.js. Fitur foto sosmed SENGAJA ditumpangkan di file &
// function ini (bukan file /api baru) supaya jumlah total Serverless
// Functions tidak bertambah.
// =========================

const crypto = require("crypto");
const { getLoggedInAdmin, isSuperAdminUsername } = require("../../lib/auth");
const { readJson, writeJson, uploadImage, deleteImage } = require("../../lib/kvStore");
const { decodeImagePayload, safeFileNamePart } = require("../../lib/http");
const { setSocialAvatar, deleteSocialAvatar, isValidPlatform, HANDLES } = require("../../lib/socialAvatar");
const { logActivity } = require("../../lib/activityLog");

const SOCIAL_PLATFORM_LABELS = {
    instagram: "Instagram",
    tiktok: "TikTok"
};

function getQueryParam(req, key) {
    try {
        const url = new URL(req.url, "http://localhost");
        return url.searchParams.get(key);
    } catch {
        return null;
    }
}

async function handleGalleryPost(req, res, admin) {
    const body = req.body || {};

    let image;
    try {
        image = decodeImagePayload(body.foto);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const judul = String(body.judul || "").trim().slice(0, 100) || "Foto Galeri";
    const namePart = safeFileNamePart(body.foto && body.foto.name, "galeri");
    const filename = `${Date.now()}-${namePart.replace(/\.[a-zA-Z0-9]+$/, "")}.${image.ext}`;

    let fotoUrl;
    try {
        fotoUrl = await uploadImage("galeri", filename, image.buffer, image.contentType);
    } catch (error) {
        console.error("Upload galeri error:", error);
        return res.status(500).json({ error: "Gagal mengupload foto. Coba lagi." });
    }

    const extra = await readJson("gallery-extra.json", []);
    const entry = {
        id: crypto.randomUUID(),
        judul,
        foto: fotoUrl,
        uploadedBy: admin,
        uploadedAt: new Date().toISOString()
    };
    extra.push(entry);
    await writeJson("gallery-extra.json", extra);

    await logActivity("gallery_upload", admin, `Upload foto galeri: "${judul}".`);

    return res.status(200).json({ ok: true, item: entry });
}

async function handleGalleryDelete(req, res, admin) {
    // Hanya super_admin (azriel & david) yang boleh menghapus foto galeri.
    // Jangan pernah percaya role/permission yang dikirim dari frontend —
    // selalu cek ulang di sini terhadap identitas yang berasal dari
    // session cookie yang sudah diverifikasi (getLoggedInAdmin di atas).
    if (!isSuperAdminUsername(admin)) {
        return res.status(403).json({ error: "Anda tidak memiliki izin untuk menghapus foto." });
    }

    const body = req.body || {};
    const id = body.id;
    if (!id) {
        return res.status(400).json({ error: "id foto wajib diisi." });
    }

    const extra = await readJson("gallery-extra.json", []);
    const target = extra.find(item => item.id === id);
    if (!target) {
        return res.status(404).json({ error: "Foto tidak ditemukan (mungkin sudah dihapus)." });
    }

    const remaining = extra.filter(item => item.id !== id);
    await writeJson("gallery-extra.json", remaining);
    await deleteImage(target.foto);

    await logActivity("gallery_delete", admin, `Hapus foto galeri: "${target.judul || id}".`);

    return res.status(200).json({ ok: true });
}

async function handleSocialPost(req, res, admin) {
    const body = req.body || {};
    const platform = String(body.platform || "").toLowerCase();
    if (!isValidPlatform(platform)) {
        return res.status(400).json({ error: "Platform tidak dikenal. Gunakan instagram atau tiktok." });
    }

    let image;
    try {
        image = decodeImagePayload(body.foto);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const result = await setSocialAvatar(platform, image.buffer, image.contentType, image.ext, admin);
        await logActivity(
            "social_avatar_update",
            admin,
            `Ubah foto profil ${SOCIAL_PLATFORM_LABELS[platform] || platform} (@${HANDLES[platform]}).`
        );
        return res.status(200).json({ ok: true, platform, ...result });
    } catch (error) {
        console.error("Update foto sosmed error:", error);
        return res.status(500).json({ error: "Gagal mengupload foto. Coba lagi." });
    }
}

async function handleSocialDelete(req, res, admin) {
    const body = req.body || {};
    const platform = String(body.platform || "").toLowerCase();
    if (!isValidPlatform(platform)) {
        return res.status(400).json({ error: "Platform tidak dikenal. Gunakan instagram atau tiktok." });
    }

    try {
        await deleteSocialAvatar(platform);
        await logActivity(
            "social_avatar_delete",
            admin,
            `Hapus foto profil ${SOCIAL_PLATFORM_LABELS[platform] || platform} (@${HANDLES[platform]}).`
        );
        return res.status(200).json({ ok: true, platform });
    } catch (error) {
        console.error("Hapus foto sosmed error:", error);
        return res.status(500).json({ error: "Gagal menghapus foto." });
    }
}

module.exports = async function handler(req, res) {
    const admin = getLoggedInAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    const resource = getQueryParam(req, "resource") || "gallery";

    if (resource === "social") {
        if (req.method === "POST") return handleSocialPost(req, res, admin);
        if (req.method === "DELETE") return handleSocialDelete(req, res, admin);
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    if (req.method === "POST") return handleGalleryPost(req, res, admin);
    if (req.method === "DELETE") return handleGalleryDelete(req, res, admin);

    return res.status(405).json({ error: "Method tidak diizinkan" });
};
