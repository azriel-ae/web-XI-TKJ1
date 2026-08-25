// =========================
// API: POST /api/admin/siswa-foto (khusus admin login)
// Body: { absen, foto: { type, data, name } }
// Mengganti foto siswa dengan nomor absen tertentu.
// =========================

const baseSiswa = require("../../data/siswa.json");
const { getLoggedInAdmin } = require("../../lib/auth");
const { readJson, writeJson, uploadImage } = require("../../lib/blobData");
const { decodeImagePayload, safeFileNamePart } = require("../../lib/http");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const admin = getLoggedInAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    const body = req.body || {};
    const absen = Number(body.absen);

    const student = baseSiswa.find(s => s.absen === absen);
    if (!student) {
        return res.status(404).json({ error: "Siswa dengan nomor absen tersebut tidak ditemukan." });
    }

    let image;
    try {
        image = decodeImagePayload(body.foto);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const namePart = safeFileNamePart(body.foto && body.foto.name, `siswa${absen}`);
    const filename = `absen-${absen}-${Date.now()}-${namePart.replace(/\.[a-zA-Z0-9]+$/, "")}.${image.ext}`;

    let fotoUrl;
    try {
        fotoUrl = await uploadImage("siswa", filename, image.buffer, image.contentType);
    } catch (error) {
        console.error("Upload foto siswa error:", error);
        return res.status(500).json({ error: "Gagal mengupload foto. Coba lagi." });
    }

    const overrides = await readJson("siswa-foto-overrides.json", {});
    overrides[absen] = fotoUrl;
    await writeJson("siswa-foto-overrides.json", overrides);

    return res.status(200).json({ ok: true, absen, foto: fotoUrl, nama: student.nama });
};
