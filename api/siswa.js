// =========================
// API: GET /api/siswa
// Data siswa bawaan (data/siswa.json) dengan foto & data (nama/NIS/
// JK/Instagram) yang sudah di-override oleh admin (kalau pernah
// diganti lewat /admin).
// =========================

const baseSiswa = require("../data/siswa.json");
const { readJson } = require("../lib/kvStore");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const fotoOverrides = await readJson("siswa-foto-overrides.json", {});
    const dataOverrides = await readJson("siswa-data-overrides.json", {});

    const combined = baseSiswa.map(student => {
        const fotoUrl = fotoOverrides && fotoOverrides[student.absen];
        const dataOverride = dataOverrides && dataOverrides[student.absen];
        return {
            ...student,
            ...(dataOverride
                ? { nama: dataOverride.nama, nis: dataOverride.nis, jk: dataOverride.jk, ig: dataOverride.ig }
                : {}),
            ...(fotoUrl ? { foto: fotoUrl } : {})
        };
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(combined);
};
