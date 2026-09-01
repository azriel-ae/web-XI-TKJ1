// =========================
// lib/blobData.js
// Penyimpanan data tambahan (foto galeri baru, override foto siswa)
// yang ditulis oleh admin lewat panel /admin.
//
// Di Vercel, filesystem deployment bersifat read-only & sementara,
// jadi data tambahan dari admin TIDAK bisa ditulis ke file JSON biasa
// yang ikut di-deploy. Solusinya pakai Vercel Blob Storage (persist,
// diakses lewat HTTP, tidak butuh database terpisah).
//
// Kalau Blob sama sekali tidak terdeteksi (misal saat coba jalan lokal
// dengan `node server.js` tanpa setup apa pun), otomatis fallback nulis
// ke disk lokal (data/*.json + assets/img/...) supaya tetap bisa dites
// di komputer sendiri.
//
// ------------------------------------------------------------------
// CATATAN PENTING soal deteksi koneksi Blob:
// Vercel sekarang connect store pakai OIDC by default (bukan cuma token
// statis), dan env var yang di-generate BISA berbeda nama tergantung
// setup:
//   - BLOB_READ_WRITE_TOKEN         (token statis, nama polos - default
//                                    kalau cuma ada 1 store / tidak
//                                    dikasih prefix custom)
//   - <PREFIX>_READ_WRITE_TOKEN     (kalau di "Advanced Options" saat
//                                    connect store dikasih prefix custom,
//                                    ATAU otomatis di-prefix Vercel kalau
//                                    ada lebih dari satu Blob store yang
//                                    connect ke project yang sama supaya
//                                    nama env var-nya tidak bentrok)
//   - BLOB_STORE_ID + VERCEL_OIDC_TOKEN
//                                   (auth OIDC, default sekarang - token-nya
//                                    short-lived & di-inject otomatis oleh
//                                    Vercel saat runtime, TIDAK muncul apa
//                                    adanya sebagai "value" yang bisa dicek
//                                    manual di dashboard, cuma BLOB_STORE_ID
//                                    yang keliatan sebagai env var)
//   - <PREFIX>_STORE_ID             (BLOB_STORE_ID versi prefixed, sama
//                                    alasannya dengan token di atas)
//
// Kode lama cuma cek `process.env.BLOB_READ_WRITE_TOKEN` PERSIS namanya.
// Begitu ada 2 Blob store connect ke project yang sama, Vercel WAJIB
// kasih nama env var yang beda-beda supaya tidak bentrok -> nama env
// var yang sebenarnya jadi bukan persis "BLOB_READ_WRITE_TOKEN"/
// "BLOB_STORE_ID" lagi, jadi deteksi lama gagal walau Blob-nya sendiri
// sudah ke-connect dengan benar di dashboard Vercel.
//
// resolveBlobAuth() di bawah ini nyari kandidat env var-nya secara
// fleksibel (nama polos DULU, baru nama ber-prefix) supaya tetap
// terdeteksi dalam kedua skenario itu, lalu authnya di-pass EXPLISIT
// ke setiap pemanggilan SDK (bukan mengandalkan SDK baca sendiri dari
// process.env dengan nama tetap).
// =========================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Cari token read-write Blob di environment, baik nama polos
// (BLOB_READ_WRITE_TOKEN) maupun versi ber-prefix yang di-generate Vercel
// kalau ada prefix custom / lebih dari satu store terhubung ke project yang
// sama (mis. "GALLERY_BLOB_READ_WRITE_TOKEN"). Suffix "READ_WRITE_TOKEN"
// cukup spesifik jadi aman dicocokkan longgar begini.
function findBlobToken() {
    if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
    const key = Object.keys(process.env).find(
        k => k !== "BLOB_READ_WRITE_TOKEN" && k.endsWith("READ_WRITE_TOKEN") && process.env[k]
    );
    return key ? process.env[key] : null;
}

// Sama seperti findBlobToken tapi untuk BLOB_STORE_ID (dipakai auth OIDC).
// Butuh mengandung "BLOB" supaya tidak salah tangkap env var *_STORE_ID
// yang tidak ada hubungannya dengan Vercel Blob.
function findBlobStoreId() {
    if (process.env.BLOB_STORE_ID) return process.env.BLOB_STORE_ID;
    const key = Object.keys(process.env).find(
        k => k !== "BLOB_STORE_ID" && k.endsWith("BLOB_STORE_ID") && process.env[k]
    );
    return key ? process.env[key] : null;
}

// Resolusi kredensial Blob yang tersedia di environment saat ini.
// Return null kalau tidak ada sama sekali (berarti fallback ke disk lokal).
// Return objek options yang siap di-spread ke pemanggilan SDK (put/head/del)
// kalau ada -> entah berisi { token } (auth token statis) atau
// { storeId } (auth OIDC, token OIDC-nya sendiri otomatis diambil SDK
// dari process.env.VERCEL_OIDC_TOKEN - itu selalu nama polos, tidak
// pernah di-prefix per-store).
function resolveBlobAuth() {
    const token = findBlobToken();
    if (token) return { token };

    const storeId = findBlobStoreId();
    if (storeId && process.env.VERCEL_OIDC_TOKEN) return { storeId };

    return null;
}

function isBlobEnabled() {
    return Boolean(resolveBlobAuth());
}

let blobModulePromise = null;
function getBlobModule() {
    if (!blobModulePromise) blobModulePromise = import("@vercel/blob");
    return blobModulePromise;
}

// -------------------------------------------------------------
// JSON "dokumen" kecil yang bisa ditimpa (data tambahan galeri,
// override foto siswa). Key = nama file, mis. "gallery-extra.json".
// -------------------------------------------------------------

async function readJson(key, fallbackValue) {
    const auth = resolveBlobAuth();
    if (auth) {
        const { head } = await getBlobModule();
        try {
            const info = await head(`data/${key}`, auth);
            const response = await fetch(info.url, { cache: "no-store" });
            if (!response.ok) return fallbackValue;
            return await response.json();
        } catch (error) {
            // Belum pernah ditulis sama sekali -> pakai fallback.
            return fallbackValue;
        }
    }

    const filePath = path.join(ROOT, "data", key);
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

async function writeJson(key, data) {
    const json = JSON.stringify(data, null, 2);

    const auth = resolveBlobAuth();
    if (auth) {
        const { put } = await getBlobModule();
        await put(`data/${key}`, json, {
            access: "public",
            contentType: "application/json; charset=utf-8",
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 0,
            ...auth
        });
        return;
    }

    const filePath = path.join(ROOT, "data", key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, json, "utf8");
}

// -------------------------------------------------------------
// Upload file gambar (buffer) ke folder tertentu.
// Return: URL/path yang bisa langsung dipakai di <img src="...">.
// -------------------------------------------------------------

async function uploadImage(folder, filename, buffer, contentType) {
    const auth = resolveBlobAuth();
    if (auth) {
        const { put } = await getBlobModule();
        const result = await put(`${folder}/${filename}`, buffer, {
            access: "public",
            contentType,
            addRandomSuffix: true,
            ...auth
        });
        return result.url;
    }

    const dir = path.join(ROOT, "assets", "img", folder);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return `assets/img/${folder}/${filename}`;
}

// Hapus file gambar yang pernah diupload lewat uploadImage (dukung mode blob & lokal).
async function deleteImage(urlOrPath) {
    const auth = resolveBlobAuth();
    if (auth && /^https?:\/\//.test(urlOrPath)) {
        const { del } = await getBlobModule();
        try {
            await del(urlOrPath, auth);
        } catch (error) {
            console.error("Gagal hapus blob:", error.message);
        }
        return;
    }

    if (!/^https?:\/\//.test(urlOrPath)) {
        const filePath = path.join(ROOT, urlOrPath);
        if (filePath.startsWith(ROOT + path.sep)) {
            fs.unlink(filePath, () => {});
        }
    }
}

module.exports = {
    isBlobEnabled,
    readJson,
    writeJson,
    uploadImage,
    deleteImage
};
