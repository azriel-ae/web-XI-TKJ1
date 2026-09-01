// =========================
// lib/kvStore.js
// Penyimpanan data tambahan (akun admin, log aktivitas, override data/foto
// siswa, foto galeri) yang ditulis oleh admin lewat panel /admin.
//
// Di Vercel, filesystem deployment bersifat read-only & sementara (tiap
// serverless function bisa jalan di instance yang berbeda-beda, jadi
// tulisan ke disk lokal TIDAK bisa diandalkan untuk data yang perlu
// permanen & konsisten di semua request).
//
// SEBELUMNYA pakai Vercel KV (Upstash Redis), tapi database itu SUDAH
// DIHAPUS. Sekarang penyimpanan permanennya pindah ke GITHUB REPO itu
// sendiri lewat GitHub Contents API: setiap tulis data = 1 commit ke
// repo (folder `data-store/` secara default, bisa diganti lewat env
// GITHUB_DATA_PATH). Karena disimpan sebagai commit git biasa, datanya
// permanen (ada di histori repo) selama repo & akses token-nya masih ada
// — tidak akan hilang lagi seperti waktu Vercel KV dihapus.
//
// ------------------------------------------------------------------
// PENTING SOAL PRIVASI/KEAMANAN:
// GitHub Contents API tidak punya konsep "private key" seperti database.
// Kalau repo yang dipakai untuk GITHUB_REPO bersifat PUBLIC, maka SEMUA
// file yang ditulis lewat sini (termasuk folder "private": akun admin
// berikut password hash-nya, dan log aktivitas) bisa dibaca siapa saja
// lewat github.com atau raw.githubusercontent.com. Ini beda dengan
// Vercel KV yang dulu memang tidak pernah bisa diakses publik sama sekali.
//
// Supaya tetap aman:
//   - Pastikan repo yang dipakai untuk GITHUB_REPO bersifat PRIVATE, ATAU
//   - Pakai repo terpisah yang private khusus untuk penyimpanan data
//     (GITHUB_REPO boleh diisi repo lain, tidak harus repo situs ini).
// ------------------------------------------------------------------
//
// Cara setup (sekali saja):
//   1. Buat Personal Access Token (PAT) di GitHub -> Settings -> Developer
//      settings -> Fine-grained tokens (atau classic token dengan scope
//      "repo") yang punya akses read+write "Contents" ke repo tujuan.
//   2. Set env var di Vercel (Project -> Settings -> Environment Variables):
//        GITHUB_TOKEN      = <personal access token>
//        GITHUB_REPO       = <owner>/<nama-repo>   (mis. azriel-ae/web-XI-TKJ1)
//        GITHUB_BRANCH     = main                   (opsional, default "main")
//        GITHUB_DATA_PATH  = data-store             (opsional, default "data-store")
//   3. Redeploy project supaya env var-nya kepakai.
//
// Kalau kredensial GitHub sama sekali tidak diset (mis. saat coba jalan
// lokal dengan `node server.js` tanpa setup apa pun), otomatis fallback
// nulis ke disk lokal (data/*.json, data-private/*.json, assets/img/...)
// supaya tetap bisa dites di komputer sendiri TANPA perlu setup apa pun.
// ------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const IMAGE_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
};

function contentTypeForFilename(filename) {
    const ext = path.extname(String(filename || "")).toLowerCase();
    return IMAGE_CONTENT_TYPES[ext] || "application/octet-stream";
}

// -------------------------------------------------------------
// Deteksi kredensial GitHub yang tersedia di environment saat ini.
// Return null kalau tidak ada / tidak lengkap (berarti fallback ke disk lokal).
// -------------------------------------------------------------
function resolveGithubConfig() {
    const token = process.env.GITHUB_TOKEN;
    const repoFull = process.env.GITHUB_REPO; // format wajib: "owner/nama-repo"
    if (!token || !repoFull || !repoFull.includes("/")) return null;

    const [owner, repo] = repoFull.split("/").map(s => s.trim());
    if (!owner || !repo) return null;

    const branch = (process.env.GITHUB_BRANCH || "main").trim();
    const basePath = (process.env.GITHUB_DATA_PATH || "data-store")
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "") || "data-store";

    return { token, owner, repo, branch, basePath };
}

function isKvEnabled() {
    return Boolean(resolveGithubConfig());
}

function encodeRepoPath(filePath) {
    return filePath.split("/").map(encodeURIComponent).join("/");
}

function scopedPath(config, scope, key) {
    // scope: "public" atau "private" (lihat catatan keamanan di atas —
    // ini HANYA penamaan folder, BUKAN jaminan akses tidak publik kalau
    // repo-nya sendiri public).
    return `${config.basePath}/${scope}/${key}`;
}

// -------------------------------------------------------------
// Primitif ke GitHub Contents API.
// Dokumentasi: https://docs.github.com/en/rest/repos/contents
// -------------------------------------------------------------
async function ghFetch(config, urlPath, fetchOptions) {
    const response = await fetch(`https://api.github.com${urlPath}`, {
        ...fetchOptions,
        headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "web-XI-TKJ1-admin-panel",
            ...(fetchOptions && fetchOptions.headers)
        }
    });
    return response;
}

// Ambil isi file (sebagai Buffer) + sha commit-nya. null kalau file belum ada.
async function ghGetFile(config, filePath) {
    const response = await ghFetch(
        config,
        `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(filePath)}?ref=${encodeURIComponent(config.branch)}`,
        { cache: "no-store" }
    );

    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`GitHub GET gagal (${response.status}): ${filePath}`);
    }

    const meta = await response.json();
    if (Array.isArray(meta)) return null; // ternyata path ini folder, bukan file

    if (typeof meta.content === "string" && meta.encoding === "base64") {
        return { buffer: Buffer.from(meta.content.replace(/\n/g, ""), "base64"), sha: meta.sha };
    }

    // File > 1MB: Contents API tidak menyertakan "content", harus ambil
    // lewat download_url (dukungan sampai ~100MB).
    if (meta.download_url) {
        const rawResponse = await fetch(meta.download_url, {
            headers: { Authorization: `Bearer ${config.token}` }
        });
        if (!rawResponse.ok) {
            throw new Error(`GitHub raw fetch gagal (${rawResponse.status}): ${filePath}`);
        }
        return { buffer: Buffer.from(await rawResponse.arrayBuffer()), sha: meta.sha };
    }

    throw new Error(`GitHub content tidak bisa dibaca: ${filePath}`);
}

async function ghGetSha(config, filePath) {
    const response = await ghFetch(
        config,
        `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(filePath)}?ref=${encodeURIComponent(config.branch)}`,
        { cache: "no-store" }
    );
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`GitHub GET (sha) gagal (${response.status}): ${filePath}`);
    }
    const meta = await response.json();
    if (Array.isArray(meta)) return null;
    return meta.sha || null;
}

// Buat/timpa file (commit baru). Otomatis deteksi sha kalau file sudah ada.
async function ghPutFile(config, filePath, buffer, message) {
    const sha = await ghGetSha(config, filePath).catch(() => null);

    const body = {
        message,
        content: buffer.toString("base64"),
        branch: config.branch
    };
    if (sha) body.sha = sha;

    const response = await ghFetch(config, `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(filePath)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`GitHub PUT gagal (${response.status}) untuk "${filePath}": ${errBody}`);
    }
    return response.json();
}

// Hapus file (commit penghapusan). Tidak error kalau file memang belum ada.
async function ghDeleteFile(config, filePath, message) {
    const sha = await ghGetSha(config, filePath).catch(() => null);
    if (!sha) return;

    const response = await ghFetch(config, `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(filePath)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sha, branch: config.branch })
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`GitHub DELETE gagal (${response.status}) untuk "${filePath}": ${errBody}`);
    }
}

// -------------------------------------------------------------
// JSON "dokumen" kecil yang bisa ditimpa (akun admin, log aktivitas,
// override data/foto siswa, galeri tambahan). Key = nama file, mis.
// "gallery-extra.json".
//
// `options.private`: menentukan sub-folder ("private" vs "public") baik
// di GitHub maupun di fallback disk lokal (data-private/ vs data/) —
// supaya di mode fallback lokal data sensitif tidak ikut ke-serve
// sebagai file statis publik oleh server.js. LIHAT CATATAN KEAMANAN DI
// ATAS FILE INI soal batasan penamaan folder ini kalau repo GitHub-nya
// sendiri public.
// -------------------------------------------------------------
async function readJson(key, fallbackValue, options) {
    const opts = options || {};

    const config = resolveGithubConfig();
    if (config) {
        try {
            const filePath = scopedPath(config, opts.private ? "private" : "public", key);
            const file = await ghGetFile(config, filePath);
            if (!file) return fallbackValue;
            return JSON.parse(file.buffer.toString("utf8"));
        } catch (error) {
            console.error(`[kvStore] gagal baca "${key}" dari GitHub:`, error.message);
            return fallbackValue;
        }
    }

    const filePath = path.join(ROOT, opts.private ? "data-private" : "data", key);
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

async function writeJson(key, data, options) {
    const opts = options || {};
    const json = JSON.stringify(data, null, 2);

    const config = resolveGithubConfig();
    if (config) {
        const filePath = scopedPath(config, opts.private ? "private" : "public", key);
        await ghPutFile(config, filePath, Buffer.from(json, "utf8"), `data: update ${key}`);
        return;
    }

    const filePath = path.join(ROOT, opts.private ? "data-private" : "data", key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, json, "utf8");
}

// -------------------------------------------------------------
// Upload file gambar (buffer). Return: URL/path yang bisa langsung
// dipakai di <img src="...">.
//
// Mode GitHub: gambar di-commit sebagai file biner ke repo (folder
// `<GITHUB_DATA_PATH>/images/...`), disajikan lewat endpoint
// /api/img?key=... (lihat api/img.js) yang membaca ulang & mengirim
// bytenya balik dengan Content-Type ditentukan dari ekstensi filename.
// Mode lokal (tanpa GitHub): ditulis langsung ke assets/img/... seperti biasa.
// -------------------------------------------------------------
async function uploadImage(folder, filename, buffer, contentType) {
    const relativePath = `${folder}/${filename}`;

    const config = resolveGithubConfig();
    if (config) {
        const filePath = `${config.basePath}/images/${relativePath}`;
        await ghPutFile(config, filePath, buffer, `data: upload gambar ${relativePath}`);
        return `/api/img?key=${encodeURIComponent(relativePath)}`;
    }

    const dir = path.join(ROOT, "assets", "img", folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `assets/img/${folder}/${filename}`;
}

// Hapus file gambar yang pernah diupload lewat uploadImage (dukung mode GitHub & lokal).
async function deleteImage(urlOrPath) {
    if (!urlOrPath) return;

    const kvMatch = /^\/api\/img\?key=([^&]+)/.exec(urlOrPath);
    if (kvMatch) {
        const relativePath = decodeURIComponent(kvMatch[1]);
        const config = resolveGithubConfig();
        if (config) {
            try {
                await ghDeleteFile(config, `${config.basePath}/images/${relativePath}`, `data: hapus gambar ${relativePath}`);
            } catch (error) {
                console.error("[kvStore] gagal hapus gambar dari GitHub:", error.message);
            }
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

// Baca kembali gambar yang diupload lewat uploadImage, dipakai oleh
// api/img.js untuk menyajikan bytenya. relativePath = "folder/nama-file.ext".
async function readImage(relativePath) {
    if (!relativePath || relativePath.includes("..")) return null;

    const config = resolveGithubConfig();
    if (config) {
        try {
            const file = await ghGetFile(config, `${config.basePath}/images/${relativePath}`);
            if (!file) return null;
            return { buffer: file.buffer, contentType: contentTypeForFilename(relativePath) };
        } catch (error) {
            console.error("[kvStore] gagal baca gambar dari GitHub:", error.message);
            return null;
        }
    }

    const filePath = path.join(ROOT, "assets", "img", relativePath);
    try {
        const buffer = fs.readFileSync(filePath);
        return { buffer, contentType: contentTypeForFilename(filePath) };
    } catch {
        return null;
    }
}

module.exports = {
    isKvEnabled,
    readJson,
    writeJson,
    uploadImage,
    deleteImage,
    readImage
};
