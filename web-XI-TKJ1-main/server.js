require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const siswa = require("./data/siswa.json");
const walikelas = require("./data/walikelas.json");

const { runVercelStyleHandler } = require("./lib/http");

// Handler admin & data dinamis dipakai bersama dengan Vercel (api/**)
// supaya tidak ada logika yang dobel antara mode lokal & deploy.
const adminLoginHandler = require("./api/admin/login");
const adminLogoutHandler = require("./api/admin/logout");
const adminSessionHandler = require("./api/admin/session");
const adminGalleryHandler = require("./api/admin/gallery");
const adminSiswaFotoHandler = require("./api/admin/siswa-foto");
const adminSiswaDataHandler = require("./api/admin/siswa-data");
const adminAdminsHandler = require("./api/admin/admins");
const galleryHandler = require("./api/gallery");
const siswaHandler = require("./api/siswa");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

const classContext = `
INFORMASI KELAS XI TKJ 1

WALI KELAS:
Nama: ${walikelas.nama}
NIP: ${walikelas.nip}
Jabatan: ${walikelas.jabatan}

DAFTAR SISWA:
${siswa.map(student => `
Absen: ${student.absen}
Nama: ${student.nama}
NIS: ${student.nis}
Jenis Kelamin: ${student.jk}
Instagram: ${student.ig || "Tidak tersedia"}
Portofolio: ${student.portofolio || "Tidak tersedia"}
`).join("")}
`;

let ai;

// Load Gemini SDK
async function initGemini() {
    const { GoogleGenAI } = await import("@google/genai");

    ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    });
}

// =========================
// CHATBOT
// =========================
async function handleChat(req, res) {
    let body = "";

    req.on("data", chunk => {
        body += chunk;
    });

    req.on("end", async () => {
        try {
            const data = JSON.parse(body);
            const message = data.message;

            if (!message) {
                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                return res.end(JSON.stringify({
                    error: "Message tidak boleh kosong"
                }));
            }

           const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",

            contents: `
        Kamu adalah asisten AI untuk kelas XI TKJ 1.

        Gunakan DATA KELAS di bawah ini jika pertanyaan
        berhubungan dengan siswa, wali kelas, atau informasi kelas.

        Jika pertanyaan bersifat umum, jawab menggunakan
        pengetahuan umum yang kamu miliki.

        JANGAN mengarang informasi tentang siswa atau kelas.
        Jika informasi tersebut tidak ada di DATA KELAS,
        katakan bahwa datanya tidak tersedia.
        Jika menampilkan beberapa informasi dalam bentuk daftar,
        WAJIB gunakan bullet list dan setiap bullet harus berada
        pada baris baru.

            Contoh:
        - Absen: 12
        - Nama: Aril Akbar Pradana
        - NIS: 9665/012.4.2.1
        - Jenis Kelamin: L
        - Instagram: arilpradana6
        - Portofolio: Tidak tersedia

        Setiap item harus berada pada baris baru.

        ATURAN KHUSUS TENTANG PEMBUAT WEBSITE/CHATBOT:
        Jika user bertanya siapa yang membuat, mengembangkan, atau menjadi
        creator/developer dari website atau chatbot ini (dalam bahasa apa pun,
        termasuk Indonesia atau Inggris, contoh: "siapa yang membuat website
        ini", "siapa developer web ini", "who made this website", "who created
        this chatbot"), WAJIB jawab HANYA dengan kalimat berikut, tanpa
        tambahan apa pun:
        "Website dan chatbot ini dibuat oleh Azriel dan David."
        Jangan menambahkan informasi pribadi lain tentang Azriel atau David,
        dan jangan mengarang detail tambahan mengenai mereka. Aturan ini hanya
        berlaku untuk jawaban chatbot dan tidak mengubah DATA KELAS di atas.

        DATA KELAS:
        ${classContext}

        PERTANYAAN USER:
        ${message}
        `
        });
            

            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                reply: response.text
            }));

        } catch (error) {
            console.error("Gemini error:", error);

            res.writeHead(500, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                error: "Gagal menghubungi Gemini API"
            }));
        }
    });
}

// =========================
// SERVER
// =========================
const server = http.createServer((req, res) => {
    const url = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );

    // API endpoint
    if (req.method === "POST" && url.pathname === "/api/chat") {
        return handleChat(req, res);
    }

    // API: admin & data dinamis (login, upload galeri, ubah foto siswa)
    const apiRoutes = {
        "/api/admin/login": adminLoginHandler,
        "/api/admin/logout": adminLogoutHandler,
        "/api/admin/session": adminSessionHandler,
        "/api/admin/gallery": adminGalleryHandler,
        "/api/admin/siswa-foto": adminSiswaFotoHandler,
        "/api/admin/siswa-data": adminSiswaDataHandler,
        "/api/admin/admins": adminAdminsHandler,
        "/api/gallery": galleryHandler,
        "/api/siswa": siswaHandler
    };

    if (apiRoutes[url.pathname]) {
        return runVercelStyleHandler(apiRoutes[url.pathname], req, res);
    }

    // Static files
    const requested =
        url.pathname === "/"
            ? "/index.html"
            : url.pathname === "/admin"
                ? "/admin.html"
                : decodeURIComponent(url.pathname);

    const filePath = path.resolve(ROOT, `.${requested}`);

    // Security
    if (!filePath.startsWith(ROOT + path.sep)) {
        res.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("403 Forbidden");
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            return res.end("404 Not Found");
        }

        const extension = path
            .extname(filePath)
            .toLowerCase();

        res.writeHead(200, {
            "Content-Type":
                MIME[extension] ||
                "application/octet-stream"
        });

        res.end(content);
    });
});

// Start server
initGemini()
    .then(() => {
        server.listen(PORT, () => {
            console.log(
                `Server berjalan di http://localhost:${PORT}`
            );
        });
    })
    .catch(error => {
        console.error("Gagal initialize Gemini:", error);
        process.exit(1);
    });