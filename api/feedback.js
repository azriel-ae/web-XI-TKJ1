// =========================
// API: /api/feedback
// Menerima "Masukan" dari pengunjung (nama, pesan, foto opsional)
// lalu meneruskannya sebagai email lewat Resend API (HTTP-based,
// jadi tidak butuh port SMTP yang sering diblokir di lingkungan
// serverless seperti Vercel).
//
// Environment variables yang dibutuhkan (diset di dashboard Vercel,
// TIDAK ditulis di source code):
//   RESEND_API_KEY   -> API key dari https://resend.com
//   FEEDBACK_TO_EMAIL (opsional) -> default: azrielaurizal27@gmail.com
//   FEEDBACK_FROM_EMAIL (opsional) -> default: onboarding@resend.com
// =========================

const TO_EMAIL = process.env.FEEDBACK_TO_EMAIL || "azrielaurizal27@gmail.com";
const FROM_EMAIL = process.env.FEEDBACK_FROM_EMAIL || "Masukan Website <onboarding@resend.com>";

const MAX_NAME_LEN = 80;
const MAX_MESSAGE_LEN = 2000;
const MIN_MESSAGE_LEN = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3MB (sebelum base64, dicek dari ukuran decoded)
const MIN_SUBMIT_MS = 1500; // anti-bot sederhana: form tidak boleh terkirim < 1.5 detik setelah dimuat

// Tipe gambar yang diizinkan + signature byte (magic number) untuk validasi nyata di server,
// bukan cuma percaya Content-Type/ekstensi yang gampang dipalsukan.
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": { ext: "jpg", check: buf => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  "image/png": { ext: "png", check: buf => buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 },
  "image/webp": { ext: "webp", check: buf => buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" },
  "image/gif": { ext: "gif", check: buf => buf.length > 6 && buf.toString("ascii", 0, 4) === "GIF8" }
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Buang karakter kontrol/berbahaya, rapikan whitespace berlebih.
function sanitizeText(value, maxLen) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  return cleaned.slice(0, maxLen);
}

function safeFileName(originalName, ext) {
  const base = (typeof originalName === "string" ? originalName : "foto")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.+/g, ".")
    .slice(0, 40) || "foto";
  const stamp = Date.now();
  return `masukan-${stamp}-${base.replace(/\.[a-zA-Z0-9]+$/, "")}.${ext}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan" });
  }

  try {
    const body = req.body || {};

    // Honeypot: field tersembunyi yang harusnya selalu kosong untuk pengguna asli.
    if (body.website) {
      // Pura-pura sukses supaya bot tidak tahu ditolak.
      return res.status(200).json({ ok: true });
    }

    // Anti-bot sederhana berbasis waktu pengisian form.
    const loadedAt = Number(body.loadedAt);
    if (loadedAt && Date.now() - loadedAt < MIN_SUBMIT_MS) {
      return res.status(400).json({ error: "Pengiriman terlalu cepat, silakan coba lagi." });
    }

    const nama = sanitizeText(body.nama, MAX_NAME_LEN);
    const pesan = sanitizeText(body.pesan, MAX_MESSAGE_LEN);

    if (!nama || nama.length < 2) {
      return res.status(400).json({ error: "Nama wajib diisi." });
    }

    if (!pesan || pesan.length < MIN_MESSAGE_LEN) {
      return res.status(400).json({ error: "Pesan masukan wajib diisi." });
    }

    // --- Validasi foto (opsional) ---
    let attachment = null;

    if (body.foto && typeof body.foto === "object") {
      const declaredType = String(body.foto.type || "").toLowerCase();
      const rawData = String(body.foto.data || "");

      const typeInfo = ALLOWED_IMAGE_TYPES[declaredType];

      if (!typeInfo) {
        return res.status(400).json({ error: "Format foto tidak didukung." });
      }

      // Terima data URI (data:image/png;base64,....) maupun base64 polos.
      const base64Only = rawData.includes(",") ? rawData.split(",").pop() : rawData;

      let buffer;
      try {
        buffer = Buffer.from(base64Only, "base64");
      } catch {
        return res.status(400).json({ error: "Foto tidak valid." });
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "Foto tidak valid." });
      }

      if (buffer.length > MAX_PHOTO_BYTES) {
        return res.status(400).json({ error: "Ukuran foto maksimal 3MB." });
      }

      // Validasi nyata lewat magic bytes, bukan cuma percaya header dari client.
      if (!typeInfo.check(buffer)) {
        return res.status(400).json({ error: "Foto tidak valid atau rusak." });
      }

      attachment = {
        filename: safeFileName(body.foto.name, typeInfo.ext),
        content: buffer.toString("base64")
      };
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY belum diset di Environment Variables Vercel");
      return res.status(500).json({ error: "Maaf, masukan belum berhasil dikirim. Silakan coba lagi." });
    }

    const waktu = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "long",
      timeStyle: "short"
    }) + " WIB";

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #172033;">
        <h2 style="margin: 0 0 12px;">Masukan Baru dari Website XI TKJ 1</h2>
        <p><strong>Nama:</strong> ${escapeHtml(nama)}</p>
        <p><strong>Waktu:</strong> ${escapeHtml(waktu)}</p>
        <p><strong>Pesan:</strong></p>
        <p style="white-space: pre-wrap; padding: 12px; background: #f6f8fb; border-radius: 8px;">${escapeHtml(pesan)}</p>
        ${attachment ? "<p><em>Foto pendukung dilampirkan pada email ini.</em></p>" : ""}
      </div>
    `;

    const payload = {
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `Masukan Baru dari Website - ${nama}`,
      html: htmlBody
    };

    if (attachment) {
      payload.attachments = [attachment];
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text().catch(() => "");
      console.error("Resend error:", emailResponse.status, errText);
      return res.status(500).json({ error: "Maaf, masukan belum berhasil dikirim. Silakan coba lagi." });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Feedback error:", error);
    return res.status(500).json({ error: "Maaf, masukan belum berhasil dikirim. Silakan coba lagi." });
  }
};
