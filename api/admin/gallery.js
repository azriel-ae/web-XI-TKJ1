// =========================
// API: /api/admin/gallery (khusus admin login)
// POST   -> tambah foto baru ke galeri
// DELETE -> hapus foto yang ditambahkan admin (body: { id })
// =========================

const crypto = require("crypto");
const { getLoggedInAdmin, isOwnerUsername } = require("../../lib/auth");
const { readJson, writeJson, uploadImage, deleteImage } = require("../../lib/blobData");
const { decodeImagePayload, safeFileNamePart } = require("../../lib/http");
const { logActivity } = require("../../lib/activityLog");

module.exports = async function handler(req, res) {
    const admin = getLoggedInAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    if (req.method === "POST") {
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

    if (req.method === "DELETE") {
        // Hanya owner (azriel & david) yang boleh menghapus foto galeri.
        // Jangan pernah percaya role/permission yang dikirim dari frontend —
        // selalu cek ulang di sini terhadap identitas yang berasal dari
        // session cookie yang sudah diverifikasi (getLoggedInAdmin di atas).
        if (!isOwnerUsername(admin)) {
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

    return res.status(405).json({ error: "Method tidak diizinkan" });
};
