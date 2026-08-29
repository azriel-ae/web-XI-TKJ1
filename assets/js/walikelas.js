/* ==========================================================
   WALI KELAS
   Ambil data wali kelas dari data/walikelas.json lalu render
   sebagai komposisi editorial (foto besar + info bertingkat).
   Tidak pernah mengarang data — field yang kosong disembunyikan.
   ========================================================== */

async function initWalikelas() {
  const wrap = document.getElementById("walikelasWrap");
  if (!wrap) return;

  wrap.innerHTML = buildWalikelasSkeleton();

  try {
    const response = await fetch("data/walikelas.json");
    if (!response.ok) throw new Error("gagal-muat");
    const data = await response.json();

    if (!data || !data.nama) {
      wrap.innerHTML = buildWalikelasEmpty();
      return;
    }

    wrap.innerHTML = buildWalikelasCard(data);
  } catch (error) {
    wrap.innerHTML = buildWalikelasError();
  }
}

function buildWalikelasSkeleton() {
  return `
    <div class="walikelas-feature walikelas-skeleton" role="status" aria-label="Memuat data...">
      <div class="walikelas-photo-col">
        <div class="walikelas-photo-frame skeleton-block"></div>
      </div>
      <div class="walikelas-info">
        <span class="skeleton-block walikelas-skel-line is-wide"></span>
        <span class="skeleton-block walikelas-skel-line is-mid"></span>
        <span class="skeleton-block walikelas-skel-line is-narrow"></span>
      </div>
    </div>
  `;
}

function buildWalikelasError() {
  return `
    <div class="empty-state is-error">
      <i class="fa-regular fa-circle-exclamation"></i>
      <strong>Data wali kelas gagal dimuat.</strong>
      <button type="button" class="empty-state-retry" onclick="initWalikelas()">
        <i class="fa-solid fa-rotate-right"></i> Coba Lagi
      </button>
    </div>
  `;
}

function buildWalikelasEmpty() {
  return `
    <div class="empty-state">
      <i class="fa-regular fa-address-card"></i>
      <strong>Profil wali kelas belum tersedia.</strong>
    </div>
  `;
}

function buildWalikelasCard(data) {
  const DEFAULT_FOTO = "assets/img/guru/guru.png";
  const nama = escapeHtml(data.nama);
  const jabatan = data.jabatan ? escapeHtml(data.jabatan) : "";
  const foto = data.foto || DEFAULT_FOTO;
  const ig = data.instagram || "";
  const igHandle = ig ? escapeHtml(ig.replace("@", "")) : "";
  const quote = data.quote || data.pesan || "";

  const jabatanRow = jabatan
    ? `<p class="walikelas-jabatan"><span class="walikelas-jabatan-dot" aria-hidden="true"></span>${jabatan}</p>`
    : "";

  const igRow = ig
    ? `<a class="walikelas-ig" href="https://instagram.com/${igHandle}" target="_blank" rel="noopener">
        <i class="fa-brands fa-instagram"></i> @${igHandle}
       </a>`
    : "";

  const quoteRow = quote
    ? `<p class="walikelas-quote">${escapeHtml(quote)}</p>`
    : "";

  return `
    <div class="walikelas-feature">
      <div class="walikelas-photo-col">
        <div class="walikelas-photo-frame">
          <img
            class="walikelas-photo"
            src="${escapeHtml(foto)}"
            alt="Foto ${nama}"
            loading="lazy"
            onerror="this.onerror=null;this.src='${DEFAULT_FOTO}';"
          />
          <span class="walikelas-marker" aria-hidden="true">WK · 01</span>
        </div>
      </div>
      <div class="walikelas-info">
        <h3 class="walikelas-nama">${nama}</h3>
        ${jabatanRow}
        ${igRow}
        ${quoteRow}
      </div>
    </div>
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
