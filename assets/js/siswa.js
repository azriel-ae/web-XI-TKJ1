let studentData = [];

// Lagu favorit khusus diputar suaranya saja (tanpa ditampilkan) hanya saat
// detail siswa tertentu dibuka. "startAt" (detik) opsional -> kalau diisi,
// lagu langsung diputar mulai dari detik tersebut alih-alih dari awal.
// videoId = ID video YouTube (bagian setelah "v=" di URL youtube.com/watch?v=...
// atau bagian akhir URL youtu.be/...).
const SPECIAL_STUDENT_SONGS = {
  // Jatuh Suka - TULUS (Official Music Video, kanal resmi TULUS),
  // diputar mulai menit 01:38 (98 detik) khusus untuk Azriel.
  "azriel aurizal ednisia": { videoId: "NRGDT2UUlsk", startAt: 98 },
  // Perfect - Ed Sheeran (Official Music Video), diputar mulai menit 02:26
  // (146 detik) khusus untuk Danish.
  "achmad danish zahi baiza": { videoId: "2Vv-BfVoq4g", startAt: 146 }
};

// --- YouTube IFrame Player API resmi: siap dipakai begitu skrip di index.html
// selesai dimuat. Resmi dari Google/YouTube — TIDAK butuh akun/login YouTube
// untuk memutar video publik, dan tidak memakai scraping/endpoint tidak resmi. ---
// Callback "onYouTubeIframeAPIReady" DIDEFINISIKAN INLINE di index.html (bukan
// di sini) supaya tidak kalah start dengan skrip async YouTube — lihat
// komentar di index.html untuk detail. Di sini kita cukup cek apakah sudah
// keburu siap duluan, atau ikut antre kalau belum.
let youtubeApiReady = Boolean(window.__youtubeApiReady);
let youtubePlayer = null;
if (!youtubeApiReady) {
  window.__youtubeApiReadyQueue = window.__youtubeApiReadyQueue || [];
  window.__youtubeApiReadyQueue.push(() => { youtubeApiReady = true; });
}

// Bungkus pemanggilan API player dengan try/catch supaya kalau autoplay
// ditolak browser (mis. kebijakan autoplay yang berubah, tab di-throttle,
// dsb), kegagalannya tertangan diam-diam tanpa melempar error ke halaman dan
// TANPA mengubah UI jadi tombol Play — sesuai permintaan.
function safePlayerCall(fn) {
  try { fn(); } catch (error) { console.warn("Pemutaran lagu gagal (diabaikan secara graceful):", error); }
}

function playHiddenSong(videoId, startAt) {
  // "container" (wrapper luar, class "visually-hidden-audio") sengaja
  // dibiarkan tetap ada di DOM apa pun yang terjadi — yang dipakai/diganti
  // oleh YouTube IFrame API adalah "mount" (elemen dalam) supaya
  // penyembunyian visualnya tidak pernah hilang walau YouTube mengganti
  // elemen tersebut dengan <iframe> miliknya sendiri.
  const container = document.getElementById("modalLaguPlayer");
  const mount = document.getElementById("modalLaguPlayerMount");
  if (!container || !mount) return;

  // Player sudah pernah dibuat sebelumnya -> tinggal load video baru & putar
  // dari detik yang diminta (loadVideoById otomatis memutar). Ini juga yang
  // memastikan hanya SATU instance/audio yang aktif: player yang sama
  // dipakai ulang (bukan membuat player/iframe baru setiap kali siswa
  // berganti), jadi tidak ada audio yang bertumpuk atau listener yang
  // terpasang dobel.
  if (youtubePlayer) {
    safePlayerCall(() => {
      youtubePlayer.loadVideoById({ videoId, startSeconds: startAt || 0 });
      youtubePlayer.playVideo();
    });
    return;
  }

  // Belum ada player: buat sekali (langsung dengan video & detik yang
  // diminta), lalu pastikan mulai diputar saat sudah siap.
  if (!youtubeApiReady || typeof YT === "undefined" || !YT.Player) {
    // API resmi belum selesai dimuat (koneksi lambat) — coba lagi sesaat lagi.
    setTimeout(() => playHiddenSong(videoId, startAt), 300);
    return;
  }
  youtubePlayer = new YT.Player(mount, {
    width: "1",
    height: "1",
    videoId,
    playerVars: {
      autoplay: 1,
      start: startAt || 0,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      origin: window.location.origin
    },
    events: {
      onReady: event => safePlayerCall(() => event.target.playVideo()),
      // Kalau videoId salah/tidak valid (mis. placeholder yang belum diganti
      // admin) atau video tidak bisa diputar (privat/dihapus/dibatasi
      // region), tangani diam-diam tanpa mengganggu halaman — TIDAK
      // memunculkan tombol Play atau pesan error apa pun ke pengunjung.
      onError: error => console.warn("YouTube player error (diabaikan secara graceful):", error && error.data)
    }
  });
}

function stopHiddenSong() {
  if (youtubePlayer) safePlayerCall(() => youtubePlayer.pauseVideo());
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function renderStudents(items) {
  const container = document.getElementById("siswaList");
  if (!container.classList.contains("row")) { container.className = "row g-3"; }
  if (!items.length) {
    container.innerHTML = '<div class="col-12"><div class="empty-state"><i class="fa-regular fa-face-frown"></i>Siswa tidak ditemukan.</div></div>';
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
  igRow.hidden = !student.ig;
  if (student.portofolio) {
    portofolioBtn.hidden = false;
    portofolioBtn.onclick = () => window.open(student.portofolio, "_blank", "noopener");
  } else {
    portofolioBtn.hidden = true;
    portofolioBtn.onclick = null;
  }

  // Background khusus Detail Siswa (diatur admin lewat Admin Panel). Ini
  // HANYA mengubah tampilan di dalam modal Detail Siswa (elemen
  // ".student-modal-body" di bawah), tidak pernah menyentuh Homepage,
  // Daftar Siswa, Dashboard, Navbar, Footer, halaman Admin, atau tema
  // global manapun. Kalau siswa tidak punya background custom (bgDetail
  // kosong/null), style-nya dibersihkan supaya kembali ke tampilan
  // default biasa.
  const modalContent = document.querySelector("#siswaModal .student-modal");
  if (modalContent) {
    if (student.bgDetail) {
      modalContent.classList.add("has-student-bg");
      modalContent.style.setProperty("--student-bg-image", `url("${student.bgDetail}")`);
    } else {
      modalContent.classList.remove("has-student-bg");
      modalContent.style.removeProperty("--student-bg-image");
    }
  }

  const lagu = SPECIAL_STUDENT_SONGS[student.nama.trim().toLowerCase()];
  if (lagu) {
    playHiddenSong(lagu.videoId, lagu.startAt);
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
    container.className = "row g-3";
    container.innerHTML = `<div class="col-12"><div class="empty-state is-error"><i class="fa-regular fa-circle-exclamation"></i>${error.message}. Jalankan website lewat server, bukan membuka index.html langsung.<br><button type="button" class="empty-state-retry" onclick="initStudents()"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div></div>`;
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
