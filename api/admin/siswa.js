// =========================
// API: POST /api/admin/siswa (gabungan siswa-data + siswa-foto + siswa-background)
// ?action=data       -> body: { absen, nama, nis, jk, ig }            (semua admin yang login)
// ?action=foto       -> body: { absen, foto: { type, data, name } }  (semua admin yang login)
// ?action=background -> body: { absen, background: { type, data, name } } untuk ganti,
//                        atau { absen, reset: true } untuk kembali ke background default
//                        (semua admin yang login, dipakai khusus untuk background
//                        halaman Detail Siswa saja — tidak memengaruhi halaman lain)
//
// CATATAN: digabung ke satu file (bukan file terpisah per fitur) untuk
// menghemat kuota Serverless Functions di paket Vercel Hobby (maksimal
// 12 function per deployment, project ini sebelumnya sempat mepet/
// kelebihan — batas yang dipakai di project ini malah 11). Pola
// gabung-lewat-query-param ini sama dengan api/admin/auth.js dan
// api/admin/admins.js. Fitur background Detail Siswa SENGAJA
// ditumpangkan di file & function ini (bukan file /api baru) supaya
// jumlah total Serverless Functions tidak bertambah.
// =========================

const baseSiswa = require("../../data/siswa.json");
const { getLoggedInAdminInfo, canEditSiswa } = require("../../lib/auth");
const { readJson, writeJson, uploadImage, deleteImage } = require("../../lib/kvStore");
const { decodeImagePayload, safeFileNamePart } = require("../../lib/http");
const { logActivity } = require("../../lib/activityLog");

const DATA_OVERRIDES_KEY = "siswa-data-overrides.json";
const FOTO_OVERRIDES_KEY = "siswa-foto-overrides.json";
// Peta absen -> { url, updatedBy, updatedAt } untuk background khusus
// halaman Detail Siswa. Kalau sebuah absen tidak ada di sini, Detail
// Siswa-nya memakai background default (tidak ada perubahan tampilan).
const BACKGROUND_OVERRIDES_KEY = "siswa-background-overrides.json";

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
    try {
        await writeJson(DATA_OVERRIDES_KEY, overrides);
    } catch (error) {
        // PENTING: sebelumnya writeJson di sini tidak dibungkus try/catch,
        // jadi kalau penyimpanan ke database (Blob) sempat gagal/timeout,
        // function ini crash mentah (500 tanpa pesan jelas) padahal
        // datanya sendiri sudah tervalidasi. Sekarang errornya ditangkap
        // dan dikembalikan sebagai pesan yang jelas ke admin.
        console.error("Simpan data siswa ke database gagal:", error);
        return res.status(500).json({ error: "Gagal menyimpan perubahan ke database. Coba lagi." });
    }

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
    const previousFotoUrl = overrides[absen]; // foto hasil upload admin sebelumnya (kalau ada)
    overrides[absen] = fotoUrl;
    try {
        await writeJson(FOTO_OVERRIDES_KEY, overrides);
    } catch (error) {
        // Sama seperti di handleData: dulu tidak ada try/catch di sini, jadi
        // kalau tulis ke database gagal setelah foto SUDAH terupload,
        // function ini crash mentah dan foto baru jadi tidak ke-link ke
        // siswa (padahal filenya sudah ada di storage) -> dari sisi admin
        // kelihatannya "upload foto gagal". Sekarang errornya ditangani
        // rapi + foto yang baru saja diupload tapi gagal disimpan itu
        // langsung dihapus lagi supaya tidak jadi sampah di database.
        console.error("Simpan foto siswa ke database gagal:", error);
        await deleteImage(fotoUrl).catch(() => {});
        return res.status(500).json({ error: "Foto sudah terupload tapi gagal disimpan ke database. Coba lagi." });
    }

    // Bersihkan foto hasil upload sebelumnya (kalau ada & berbeda) supaya
    // tidak menumpuk file foto lama yang sudah tidak dipakai di database.
    if (previousFotoUrl && previousFotoUrl !== fotoUrl) {
        await deleteImage(previousFotoUrl).catch(() => {});
    }

    await logActivity("siswa_foto_edit", admin, `Ubah foto siswa absen ${absen} (${student.nama}).`);

    return res.status(200).json({ ok: true, absen, foto: fotoUrl, nama: student.nama });
}

// Background khusus Detail Siswa. DUA mode lewat body yang sama supaya
// tidak perlu action/endpoint baru:
//  - reset: true          -> hapus override, Detail Siswa kembali pakai
//                             background default.
//  - background: {...}    -> upload background baru & pakai untuk
//                             Detail Siswa absen tersebut saja.
// Sama seperti handleFoto, TIDAK menyentuh data/tampilan siswa lain
// ataupun halaman lain (homepage, daftar siswa, dashboard, dsb) —
// hanya menulis ke key BACKGROUND_OVERRIDES_KEY yang dibaca khusus oleh
// modal Detail Siswa di frontend.
async function handleBackground(req, res, adminInfo) {
    const admin = adminInfo.username;
    const body = req.body || {};
    const absen = Number(body.absen);

    const student = findStudentOrRespond(absen, res);
    if (!student) return;

    if (!canEditSiswa(adminInfo, absen)) {
        return res.status(403).json({ error: "Anda tidak memiliki izin untuk mengubah background siswa ini." });
    }

    const overrides = await readJson(BACKGROUND_OVERRIDES_KEY, {});
    const previous = overrides[absen]; // { url, ... } hasil upload sebelumnya (kalau ada)

    // Mode reset: hapus override -> Detail Siswa balik ke background default.
    if (body.reset === true) {
        if (!previous) {
            return res.status(200).json({ ok: true, absen, background: null });
        }
        delete overrides[absen];
        try {
            await writeJson(BACKGROUND_OVERRIDES_KEY, overrides);
        } catch (error) {
            console.error("Reset background siswa ke database gagal:", error);
            return res.status(500).json({ error: "Gagal menyimpan reset background ke database. Coba lagi." });
        }
        await deleteImage(previous.url).catch(() => {});
        await logActivity("siswa_background_reset", admin, `Reset background Detail Siswa absen ${absen} (${student.nama}) ke default.`);
        return res.status(200).json({ ok: true, absen, background: null });
    }

    // Mode ganti/upload background baru.
    let image;
    try {
        image = decodeImagePayload(body.background);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const namePart = safeFileNamePart(body.background && body.background.name, `bg-siswa${absen}`);
    const filename = `absen-${absen}-${Date.now()}-${namePart.replace(/\.[a-zA-Z0-9]+$/, "")}.${image.ext}`;

    let bgUrl;
    try {
        bgUrl = await uploadImage("siswa-background", filename, image.buffer, image.contentType);
    } catch (error) {
        console.error("Upload background siswa error:", error);
        return res.status(500).json({ error: "Gagal mengupload background. Coba lagi." });
    }

    overrides[absen] = {
        url: bgUrl,
        updatedBy: admin,
        updatedAt: new Date().toISOString()
    };
    try {
        await writeJson(BACKGROUND_OVERRIDES_KEY, overrides);
    } catch (error) {
        console.error("Simpan background siswa ke database gagal:", error);
        await deleteImage(bgUrl).catch(() => {});
        return res.status(500).json({ error: "Background sudah terupload tapi gagal disimpan ke database. Coba lagi." });
    }

    // Bersihkan background lama (kalau ada & berbeda) supaya tidak menumpuk
    // file di storage.
    if (previous && previous.url && previous.url !== bgUrl) {
        await deleteImage(previous.url).catch(() => {});
    }

    await logActivity("siswa_background_edit", admin, `Ubah background Detail Siswa absen ${absen} (${student.nama}).`);

    return res.status(200).json({ ok: true, absen, background: bgUrl });
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
    if (action === "background") return handleBackground(req, res, adminInfo);

    return res.status(400).json({ error: "Parameter action wajib diisi (data/foto/background)." });
};
