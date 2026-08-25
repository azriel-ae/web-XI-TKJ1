// =========================
// lib/http.js
// Helper kecil supaya handler yang sama bisa dipakai baik sebagai
// Vercel Serverless Function (api/**) maupun dipanggil langsung dari
// server.js waktu jalan lokal (`node server.js`).
// =========================

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8MB (cukup untuk foto ~5-6MB base64)

// Tipe gambar yang diizinkan + validasi magic bytes (bukan cuma percaya Content-Type).
const ALLOWED_IMAGE_TYPES = {
    "image/jpeg": { ext: "jpg", check: buf => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
    "image/png": { ext: "png", check: buf => buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 },
    "image/webp": { ext: "webp", check: buf => buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" },
    "image/gif": { ext: "gif", check: buf => buf.length > 6 && buf.toString("ascii", 0, 4) === "GIF8" }
};

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6MB (setelah didecode dari base64)

// Validasi + decode objek foto { type, data, name } dari body JSON.
// Return { buffer, ext, contentType } atau melempar Error dengan pesan untuk user.
function decodeImagePayload(fotoPayload) {
    if (!fotoPayload || typeof fotoPayload !== "object") {
        throw new Error("Foto wajib diisi.");
    }

    const declaredType = String(fotoPayload.type || "").toLowerCase();
    const typeInfo = ALLOWED_IMAGE_TYPES[declaredType];
    if (!typeInfo) {
        throw new Error("Format foto tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.");
    }

    const rawData = String(fotoPayload.data || "");
    const base64Only = rawData.includes(",") ? rawData.split(",").pop() : rawData;

    let buffer;
    try {
        buffer = Buffer.from(base64Only, "base64");
    } catch {
        throw new Error("Foto tidak valid.");
    }

    if (!buffer || buffer.length === 0) {
        throw new Error("Foto tidak valid.");
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error("Ukuran foto maksimal 6MB.");
    }

    if (!typeInfo.check(buffer)) {
        throw new Error("Foto tidak valid atau rusak.");
    }

    return { buffer, ext: typeInfo.ext, contentType: declaredType };
}

function safeFileNamePart(name, fallback) {
    const base = (typeof name === "string" ? name : fallback)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\.+/g, ".")
        .slice(0, 40);
    return base || fallback;
}

// -------------------------------------------------------------
// Adapter: bungkus (req, res) Node http polos supaya handler
// berbentuk Vercel (req.body sudah ke-parse, res.status().json())
// bisa dipanggil langsung dari server.js.
// -------------------------------------------------------------
function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];
        req.on("data", chunk => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
                reject(new Error("PAYLOAD_TOO_LARGE"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

async function runVercelStyleHandler(handler, req, res) {
    if (!res.status) {
        res.status = code => {
            res.statusCode = code;
            return res;
        };
        res.json = payload => {
            const body = JSON.stringify(payload);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(body);
            return res;
        };
    }

    if (req.body === undefined && req.method !== "GET" && req.method !== "HEAD") {
        try {
            const raw = await readRawBody(req);
            req.body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
        } catch (error) {
            if (error.message === "PAYLOAD_TOO_LARGE") {
                return res.status(413).json({ error: "Ukuran data terlalu besar." });
            }
            return res.status(400).json({ error: "Body request tidak valid (harus JSON)." });
        }
    }

    return handler(req, res);
}

module.exports = {
    ALLOWED_IMAGE_TYPES,
    decodeImagePayload,
    safeFileNamePart,
    readRawBody,
    runVercelStyleHandler
};
