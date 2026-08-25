// =========================
// API: POST /api/admin/siswa-data (semua admin yang login)
// Body: { absen, nama, nis, jk, ig }
// Mengubah data siswa (nama/NIS/jenis kelamin/instagram) dengan
// nomor absen tertentu. Disimpan sebagai override terpisah dari
// data/siswa.json (yang ikut ter-deploy & read-only di Vercel).
// =========================

const baseSiswa = require("../../data/siswa.json");
const { getLoggedInAdmin } = require("../../lib/auth");
const { readJson, writeJson } = require("../../lib/blobData");

const DATA_OVERRIDES_KEY = "siswa-data-overrides.json";

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

    const nama = String(body.nama || "").trim();
    if (!nama) {
        return res.status(400).json({ error: "Nama tidak boleh kosong." });
    }
    if (nama.length > 100) {
        return res.status(400).json({ error: "Nama terlalu panjang (maksimal 100 karakter)." });
    }

    const nis = String(body.nis || "").trim().slice(0, 40);

    const jk = String(body.jk || "").trim().toUpperCase();
    if (jk !== "L" && jk !== "P") {
        return res.status(400).json({ error: "Jenis kelamin harus L atau P." });
    }

    const ig = String(body.ig || "").trim().replace(/^@/, "").slice(0, 60);

    const overrides = await readJson(DATA_OVERRIDES_KEY, {});
    overrides[absen] = {
        nama,
        nis,
        jk,
        ig,
        updatedBy: admin,
        updatedAt: new Date().toISOString()
    };
    await writeJson(DATA_OVERRIDES_KEY, overrides);

    return res.status(200).json({ ok: true, absen, nama, nis, jk, ig });
};
