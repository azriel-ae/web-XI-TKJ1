/* ==========================================================
   WALI KELAS
   Ambil data wali kelas dari data/walikelas.json
   lalu render satu kartu (foto + nama + detail).
   ========================================================== */

async function initWalikelas() {
  const wrap = document.getElementById("walikelasWrap");
  if (!wrap) return;

  try {
    const response = await fetch("data/walikelas.json");
    if (!response.ok) throw new Error("Data wali kelas gagal dimuat");
    const data = await response.json();
    wrap.innerHTML = buildWalikelasCard(data);
  } catch (error) {
    wrap.innerHTML = `<div class="empty-state is-error"><i class="fa-regular fa-circle-exclamation"></i>${error.message}. Jalankan website lewat server, bukan membuka index.html langsung.<br><button type="button" class="empty-state-retry" onclick="initWalikelas()"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
  }
}

function buildWalikelasCard(data) {
  const DEFAULT_FOTO = "assets/img/guru/guru.png";
  const nama = data.nama || "Nama Wali Kelas";
  const jabatan = data.jabatan || "Wali Kelas";
  const nip = data.nip && data.nip !== "-" ? data.nip : "";
  const foto = data.foto || DEFAULT_FOTO;
  const ig = data.instagram || "";
  const igHandle = ig ? escapeHtml(ig.replace("@", "")) : "";

  const nipRow = nip
    ? `<li>
        <span><i class="fa-regular fa-id-card"></i> NIP</span>
        <strong>${escapeHtml(nip)}</strong>
      </li>`
    : "";
  const igRow = ig
    ? `<li>
        <span><i class="fa-brands fa-instagram"></i> Instagram</span>
        <strong><a class="walikelas-ig-link" href="https://instagram.com/${igHandle}" target="_blank" rel="noopener">@${igHandle}</a></strong>
      </li>`
    : "";

  return `
    <article class="site-card walikelas-card">
      <div class="walikelas-visual">
        <div class="walikelas-photo-wrap">
          <img
            class="walikelas-photo"
            src="${escapeHtml(foto)}"
            alt="Foto ${escapeHtml(nama)}"
            onerror="this.onerror=null;this.src='${DEFAULT_FOTO}';"
          />
        </div>
        <span class="walikelas-badge"><i class="fa-solid fa-chalkboard-user"></i> Wali Kelas</span>
      </div>
      <div class="walikelas-info">
        <h3 class="walikelas-nama">${escapeHtml(nama)}</h3>
        <p class="walikelas-jabatan">${escapeHtml(jabatan)}</p>
        ${nipRow || igRow ? `<ul class="walikelas-details">${nipRow}${igRow}</ul>` : ""}
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
