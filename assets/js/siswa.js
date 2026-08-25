let studentData = [];

// Lagu favorit khusus diputar suaranya saja (tanpa ditampilkan) hanya saat detail siswa Azriel dibuka.
const SPECIAL_STUDENT_SONGS = {
  "azriel aurizal ednisia": "spotify:track:6PqWdGIYq5xdLaa4zCZfRp"
};

// --- Spotify iFrame API resmi: siap dipakai begitu skrip di index.html selesai dimuat ---
let spotifyIframeApi = null;
let spotifyController = null;
window.onSpotifyIframeApiReady = (IFrameAPI) => { spotifyIframeApi = IFrameAPI; };

function playHiddenSong(spotifyUri) {
  const container = document.getElementById("modalLaguPlayer");
  if (!container) return;

  // Controller sudah pernah dibuat sebelumnya -> tinggal load track baru & putar dari awal.
  if (spotifyController) {
    spotifyController.loadUri(spotifyUri);
    spotifyController.play();
    return;
  }

  // Belum ada controller: buat sekali, lalu putar saat sudah siap.
  if (!spotifyIframeApi) {
    // API resmi belum selesai dimuat (koneksi lambat) — coba lagi sesaat lagi.
    setTimeout(() => playHiddenSong(spotifyUri), 300);
    return;
  }
  spotifyIframeApi.createController(
    container,
    { uri: spotifyUri, width: 1, height: 1 },
    controller => {
      spotifyController = controller;
      controller.addListener("ready", () => controller.play());
    }
  );
}

function stopHiddenSong() {
  if (spotifyController) spotifyController.pause();
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function renderStudents(items) {
  const container = document.getElementById("siswaList");
  if (!items.length) {
    container.innerHTML = '<div class="col-12"><div class="empty-state">Siswa tidak ditemukan.</div></div>';
    return;
  }
  container.innerHTML = items.map(student => `
    <div class="col-6 col-md-4 col-lg-3">
      <article class="site-card siswa-card" data-absen="${student.absen}" tabindex="0" role="button" aria-label="Lihat detail ${student.nama}">
        <span class="siswa-number">${student.absen}</span>
        <div class="siswa-avatar">
          <img src="${student.foto}" alt="Foto ${student.nama}" onerror="this.replaceWith(document.createTextNode('${initials(student.nama)}'))">
        </div>
        <p class="siswa-name">${student.nama}</p>
        <p class="siswa-meta">${student.jk === "L" ? "Laki-laki" : "Perempuan"}</p>
      </article>
    </div>`).join("");
}

function openStudentModal(student) {
  document.getElementById("modalNama").textContent = student.nama;
  document.getElementById("modalAbsen").textContent = student.absen;
  document.getElementById("modalNis").textContent = student.nis || "-";
  document.getElementById("modalJk").textContent = student.jk === "L" ? "Laki-laki" : "Perempuan";
  const modalIg = document.getElementById("modalIg");
  if (student.ig) {
    modalIg.innerHTML = `<a href="https://instagram.com/${student.ig}" target="_blank" rel="noopener" class="modal-ig-link">@${student.ig}</a>`;
  } else {
    modalIg.textContent = "-";
  }
  const photo = document.getElementById("modalFoto");
  photo.src = student.foto;
  photo.onerror = () => { photo.src = "assets/img/logo/default-avatar.png"; };

  const portofolioBtn = document.getElementById("modalPortofolio");
  const igRow = document.getElementById("modalIgRow");
  if (student.portofolio) {
    portofolioBtn.hidden = false;
    portofolioBtn.onclick = () => window.open(student.portofolio, "_blank", "noopener");
    igRow.hidden = true;
  } else {
    portofolioBtn.hidden = true;
    portofolioBtn.onclick = null;
    igRow.hidden = false;
  }

  const laguSrc = SPECIAL_STUDENT_SONGS[student.nama.trim().toLowerCase()];
  if (laguSrc) {
    playHiddenSong(laguSrc);
  } else {
    stopHiddenSong();
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById("siswaModal")).show();
}

// Hentikan pemutaran lagu saat modal ditutup, supaya audio tidak terus jalan di background.
document.addEventListener("DOMContentLoaded", () => {
  const modalEl = document.getElementById("siswaModal");
  if (!modalEl) return;
  modalEl.addEventListener("hidden.bs.modal", stopHiddenSong);
});

async function initStudents() {
  const container = document.getElementById("siswaList");
  try {
    const response = await fetch("/api/siswa");
    if (!response.ok) throw new Error("Data siswa gagal dimuat");
    studentData = await response.json();
    renderStudents(studentData);
  } catch (error) {
    container.innerHTML = `<div class="col-12"><div class="empty-state">${error.message}. Jalankan website lewat server, bukan membuka index.html langsung.</div></div>`;
    return;
  }

  container.addEventListener("click", event => {
    const card = event.target.closest(".siswa-card");
    if (!card) return;
    openStudentModal(studentData.find(item => item.absen === Number(card.dataset.absen)));
  });
  container.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".siswa-card");
    if (card) { event.preventDefault(); card.click(); }
  });
  document.getElementById("studentSearch").addEventListener("input", event => {
    const query = event.target.value.trim().toLowerCase();
    renderStudents(studentData.filter(student => student.nama.toLowerCase().includes(query)));
  });
}
