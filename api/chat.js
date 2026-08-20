const siswa = require("../data/siswa.json");
const walikelas = require("../data/walikelas.json");

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

async function getAi() {
  if (!ai) {
    const { GoogleGenAI } = await import("@google/genai");
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Pake method POST" });
  }

  const { message } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: "Message tidak boleh kosong" });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY tidak ditemukan di environment variables");
    return res.status(500).json({
      error: "GEMINI_API_KEY belum diset di Environment Variables Vercel"
    });
  }

  try {
    const client = await getAi();

    const response = await client.models.generateContent({
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

ATURAN JAWABAN (SANGAT PENTING):
- Jika user bertanya TENTANG SATU SISWA atau WALI KELAS secara umum
  (misalnya "absen 12", "siapa itu [nama]", "data si [nama]", "nis
  sekian itu siapa"), jawab dengan SEMUA data yang tersedia untuk
  orang itu, ditampilkan LENGKAP tapi RAPI dalam format daftar
  bertingkat ke bawah, satu field per baris, dengan urutan tetap
  seperti ini untuk siswa:
  - Nama: ...
  - Absen: ...
  - NIS: ...
  - Jenis Kelamin: ...
  - Instagram: ...
  - Portofolio: ...
  Dan urutan berikut untuk wali kelas:
  - Nama: ...
  - NIP: ...
  - Jabatan: ...
  - Instagram: ...
  Jika salah satu field datanya kosong/tidak ada, tetap tampilkan
  barisnya dengan keterangan "Tidak tersedia", jangan dihilangkan,
  supaya urutannya tetap konsisten dan rapi.
- Jika user hanya bertanya SATU field spesifik saja (misalnya "nis-nya
  siapa", "instagramnya apa", "jenis kelaminnya apa"), jawab HANYA
  field itu saja secara singkat satu baris, tanpa daftar lengkap.
  Contoh: "NIS: 9665/012.4.2.1"
- Jika user meminta beberapa field tertentu sekaligus (misalnya "nama
  dan instagramnya"), jawab hanya field-field yang diminta itu saja,
  masing-masing di baris terpisah dengan format "Label: nilai".
- Jika user meminta daftar banyak siswa sekaligus, gunakan format
  daftar yang sama (per siswa dikelompokkan rapi, field berurutan ke
  bawah), jangan digabung jadi satu paragraf panjang.

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

    if (!response.text) {
      console.error("Gemini tidak mengembalikan teks. Full response:", JSON.stringify(response));
      return res.status(500).json({
        error: "Gemini tidak mengembalikan teks (kemungkinan diblokir safety filter atau model bermasalah)"
      });
    }

    res.status(200).json({ reply: response.text });
  } catch (error) {
    console.error("Gemini error:", error);
    res.status(500).json({
      error: "Gagal menghubungi Gemini API: " + (error && error.message ? error.message : String(error))
    });
  }
};
