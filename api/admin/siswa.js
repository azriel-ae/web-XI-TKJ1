// =========================
// API: POST /api/admin/siswa (gabungan siswa-data + siswa-foto)
// ?action=data -> body: { absen, nama, nis, jk, ig }        (semua admin yang login)
// ?action=foto -> body: { absen, foto: { type, data, name } } (semua admin yang login)
//
// CATATAN: digabung ke satu file (bukan dua file terpisah seperti
// sebelumnya) untuk menghemat kuota Serverless Functions di paket
// Vercel Hobby (maksimal 12 function per deployment, project ini
// sebelumnya sempat mepet/kelebihan). Pola gabung-lewat-query-param ini
// sama dengan api/admin/auth.js dan api/admin/admins.js.
// =========================

const baseSiswa = require("../../data/siswa.json");
const { getLoggedInAdminInfo, canEditSiswa } = require("../../lib/auth");
const { readJson, writeJson, uploadImage } = require("../../lib/kvStore");
const { decodeImagePayload, safeFileNamePart } = require("../../lib/http");
const { logActivity } = require("../../lib/activityLog");

const DATA_OVERRIDES_KEY = "siswa-data-overrides.json";
const FOTO_OVERRIDES_KEY = "siswa-foto-overrides.json";

function getQueryParam(req, key) {
    try {
        const url = new URL(req.url, "http://localhost");
        return url.searchParams.get(key);
    } catch {
        return null;
    }
}

function findStudentOrRespond(absen, res) {
    const student = baseSiswa.find(s => s.absen === absen);
    if (!student) {
        res.status(404).json({ error: "Siswa dengan nomor absen tersebut tidak ditemukan." });
        return null;
    }
    return student;
}

async function handleData(req, res, adminInfo) {
    const admin = adminInfo.username;
    const body = req.body || {};
    const absen = Number(body.absen);

    const student = findStudentOrRespond(absen, res);
    if (!student) return;

    // Akun ber-role siswa hanya boleh mengedit siswa yang sudah dipilihkan
    // owner saat akun dibuat. Cek ini SELALU terhadap data sesi tepercaya
    // (getLoggedInAdminInfo), tidak pernah terhadap apa pun dari body/frontend.
    if (!canEditSiswa(adminInfo, absen)) {
        return res.status(403).json({ error: "Anda tidak memiliki izin untuk mengedit data siswa ini." });
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

    await logActivity("siswa_edit", admin, `Ubah data siswa absen ${absen} (${nama}).`);

    return res.status(200).json({ ok: true, absen, nama, nis, jk, ig });
}

async function handleFoto(req, res, adminInfo) {
    const admin = adminInfo.username;
    const body = req.body || {};
    const absen = Number(body.absen);

    const student = findStudentOrRespond(absen, res);
    if (!student) return;

    if (!canEditSiswa(adminInfo, absen)) {
        return res.status(403).json({ error: "Anda tidak memiliki izin untuk mengubah foto siswa ini." });
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

    const overrides = await readJson(FOTO_OVERRIDES_KEY, {});
    overrides[absen] = fotoUrl;
    await writeJson(FOTO_OVERRIDES_KEY, overrides);

    await logActivity("siswa_foto_edit", admin, `Ubah foto siswa absen ${absen} (${student.nama}).`);

    return res.status(200).json({ ok: true, absen, foto: fotoUrl, nama: student.nama });
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const adminInfo = await getLoggedInAdminInfo(req);
    if (!adminInfo) {
        return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
    }

    const action = getQueryParam(req, "action");
    if (action === "data") return handleData(req, res, adminInfo);
    if (action === "foto") return handleFoto(req, res, adminInfo);

    return res.status(400).json({ error: "Parameter action wajib diisi (data/foto)." });
};
