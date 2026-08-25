(function () {
  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");

  // ---------- helpers ----------
  function fileToPayload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: file.type, name: file.name, data: reader.result });
      reader.onerror = () => reject(new Error("Gagal membaca file."));
      reader.readAsDataURL(file);
    });
  }

  function setStatus(el, message, kind) {
    el.textContent = message || "";
    el.classList.remove("is-error", "is-success");
    if (kind) el.classList.add(kind === "error" ? "is-error" : "is-success");
  }

  function toggleSpinner(button, loading) {
    const spinner = button.querySelector(".admin-spinner");
    if (spinner) spinner.hidden = !loading;
    button.disabled = loading;
  }

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options
    });
    let data = {};
    try { data = await response.json(); } catch { /* no body */ }
    if (!response.ok) throw new Error(data.error || "Terjadi kesalahan.");
    return data;
  }

  // ---------- auth / view switching ----------
  async function checkSession() {
    try {
      const data = await api("/api/admin/session");
      if (data.loggedIn) {
        showDashboard(data.username, data.isOwner);
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
  }

  function showDashboard(username, isOwner) {
    loginView.hidden = true;
    dashboardView.hidden = false;
    document.getElementById("adminWhoami").textContent = `Login sebagai ${username}${isOwner ? " (owner)" : ""}`;
    loadGalleryExtra();
    loadSiswaAdmin();

    const adminsSection = document.getElementById("adminsSection");
    if (isOwner) {
      adminsSection.hidden = false;
      loadAdmins();
    } else {
      adminsSection.hidden = true;
    }
  }

  // ---------- login form ----------
  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("loginSubmit");
    const errorEl = document.getElementById("loginError");
    errorEl.hidden = true;
    toggleSpinner(button, true);

    try {
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;
      const data = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      showDashboard(data.username, data.isOwner);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      toggleSpinner(button, false);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST" }); } catch { /* ignore */ }
    showLogin();
  });

  // ---------- tambah foto galeri ----------
  const galleryFotoInput = document.getElementById("galleryFoto");
  const galleryPreviewWrap = document.getElementById("galleryPreviewWrap");
  const galleryPreviewImg = document.getElementById("galleryPreviewImg");

  galleryFotoInput.addEventListener("change", () => {
    const file = galleryFotoInput.files[0];
    if (!file) { galleryPreviewWrap.hidden = true; return; }
    galleryPreviewImg.src = URL.createObjectURL(file);
    galleryPreviewWrap.hidden = false;
  });

  document.getElementById("galleryForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("gallerySubmit");
    const statusEl = document.getElementById("galleryStatus");
    setStatus(statusEl, "", null);

    const file = galleryFotoInput.files[0];
    if (!file) {
      setStatus(statusEl, "Pilih foto terlebih dahulu.", "error");
      return;
    }

    toggleSpinner(button, true);
    try {
      const foto = await fileToPayload(file);
      const judul = document.getElementById("galleryJudul").value.trim();
      await api("/api/admin/gallery", {
        method: "POST",
        body: JSON.stringify({ judul, foto })
      });
      setStatus(statusEl, "Foto berhasil ditambahkan ke galeri.", "success");
      event.target.reset();
      galleryPreviewWrap.hidden = true;
      loadGalleryExtra();
    } catch (error) {
      setStatus(statusEl, error.message, "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  async function loadGalleryExtra() {
    const container = document.getElementById("galleryExtraList");
    container.innerHTML = '<p class="admin-empty">Memuat...</p>';
    try {
      const all = await api("/api/gallery");
      const extra = all.filter(item => item.id);
      if (!extra.length) {
        container.innerHTML = '<p class="admin-empty">Belum ada foto tambahan.</p>';
        return;
      }
      container.innerHTML = extra.map(item => `
        <div class="admin-gallery-item" data-id="${item.id}">
          <img src="${item.foto}" alt="${item.judul || ""}">
          <span class="admin-gallery-item-title">${item.judul || ""}</span>
          <button type="button" class="admin-gallery-item-delete" data-delete-id="${item.id}" aria-label="Hapus foto">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>`).join("");
    } catch (error) {
      container.innerHTML = `<p class="admin-empty">${error.message}</p>`;
    }
  }

  document.getElementById("galleryExtraList").addEventListener("click", async event => {
    const btn = event.target.closest("[data-delete-id]");
    if (!btn) return;
    if (!confirm("Hapus foto ini dari galeri?")) return;
    try {
      await api("/api/admin/gallery", {
        method: "DELETE",
        body: JSON.stringify({ id: btn.dataset.deleteId })
      });
      loadGalleryExtra();
    } catch (error) {
      alert(error.message);
    }
  });

  // ---------- ubah foto siswa ----------
  let allSiswa = [];

  async function loadSiswaAdmin() {
    const container = document.getElementById("siswaAdminList");
    container.innerHTML = '<p class="admin-empty">Memuat data siswa...</p>';
    try {
      allSiswa = await api("/api/siswa");
      renderSiswaAdmin(allSiswa);
    } catch (error) {
      container.innerHTML = `<p class="admin-empty">${error.message}</p>`;
    }
  }

  function renderSiswaAdmin(items) {
    const container = document.getElementById("siswaAdminList");
    if (!items.length) {
      container.innerHTML = '<p class="admin-empty">Siswa tidak ditemukan.</p>';
      return;
    }
    container.innerHTML = items.map(s => `
      <div class="admin-siswa-item">
        <img src="${s.foto}" alt="Foto ${s.nama}" onerror="this.src='assets/img/logo/default-avatar.png'">
        <div class="admin-siswa-item-name">No. ${s.absen} — ${s.nama}</div>
        <div class="admin-siswa-item-actions">
          <button type="button" class="admin-btn admin-btn-ghost" data-edit-absen="${s.absen}">
            <i class="fa-solid fa-camera"></i> Foto
          </button>
          <button type="button" class="admin-btn admin-btn-ghost" data-edit-data-absen="${s.absen}">
            <i class="fa-solid fa-pen"></i> Data
          </button>
        </div>
      </div>`).join("");
  }

  document.getElementById("siswaSearch").addEventListener("input", event => {
    const query = event.target.value.trim().toLowerCase();
    renderSiswaAdmin(allSiswa.filter(s => s.nama.toLowerCase().includes(query)));
  });

  document.getElementById("siswaAdminList").addEventListener("click", event => {
    const fotoBtn = event.target.closest("[data-edit-absen]");
    if (fotoBtn) {
      openSiswaFotoModal(Number(fotoBtn.dataset.editAbsen));
      return;
    }
    const dataBtn = event.target.closest("[data-edit-data-absen]");
    if (dataBtn) {
      openSiswaDataModal(Number(dataBtn.dataset.editDataAbsen));
    }
  });

  // ---------- modal ubah data siswa (nama, NIS, JK, Instagram) ----------
  const siswaDataModal = document.getElementById("siswaDataModal");

  function openSiswaDataModal(absen) {
    const student = allSiswa.find(s => s.absen === absen);
    if (!student) return;
    document.getElementById("siswaDataAbsen").value = absen;
    document.getElementById("siswaDataModalTitle").textContent = `Ubah Data — No. ${absen}`;
    document.getElementById("siswaDataNama").value = student.nama || "";
    document.getElementById("siswaDataNis").value = student.nis || "";
    document.getElementById("siswaDataJk").value = student.jk === "P" ? "P" : "L";
    document.getElementById("siswaDataIg").value = student.ig || "";
    setStatus(document.getElementById("siswaDataStatus"), "", null);
    siswaDataModal.classList.add("is-open");
    siswaDataModal.setAttribute("aria-hidden", "false");
  }

  function closeSiswaDataModal() {
    siswaDataModal.classList.remove("is-open");
    siswaDataModal.setAttribute("aria-hidden", "true");
  }

  siswaDataModal.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", closeSiswaDataModal);
  });

  document.getElementById("siswaDataForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("siswaDataSubmit");
    const statusEl = document.getElementById("siswaDataStatus");
    setStatus(statusEl, "", null);

    const absen = Number(document.getElementById("siswaDataAbsen").value);
    const nama = document.getElementById("siswaDataNama").value.trim();
    const nis = document.getElementById("siswaDataNis").value.trim();
    const jk = document.getElementById("siswaDataJk").value;
    const ig = document.getElementById("siswaDataIg").value.trim();

    if (!nama) {
      setStatus(statusEl, "Nama tidak boleh kosong.", "error");
      return;
    }

    toggleSpinner(button, true);
    try {
      await api("/api/admin/siswa-data", {
        method: "POST",
        body: JSON.stringify({ absen, nama, nis, jk, ig })
      });
      setStatus(statusEl, "Data siswa berhasil diperbarui.", "success");
      await loadSiswaAdmin();
      setTimeout(closeSiswaDataModal, 700);
    } catch (error) {
      setStatus(statusEl, error.message, "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  // ---------- modal ganti foto siswa ----------
  const siswaFotoModal = document.getElementById("siswaFotoModal");
  const siswaFotoInput = document.getElementById("siswaFotoInput");
  const siswaFotoPreviewWrap = document.getElementById("siswaFotoPreviewWrap");
  const siswaFotoPreviewImg = document.getElementById("siswaFotoPreviewImg");

  function openSiswaFotoModal(absen) {
    const student = allSiswa.find(s => s.absen === absen);
    if (!student) return;
    document.getElementById("siswaFotoAbsen").value = absen;
    document.getElementById("siswaFotoModalTitle").textContent = `Ubah Foto — ${student.nama}`;
    document.getElementById("siswaFotoForm").reset();
    siswaFotoPreviewWrap.hidden = true;
    setStatus(document.getElementById("siswaFotoStatus"), "", null);
    siswaFotoModal.classList.add("is-open");
    siswaFotoModal.setAttribute("aria-hidden", "false");
  }

  function closeSiswaFotoModal() {
    siswaFotoModal.classList.remove("is-open");
    siswaFotoModal.setAttribute("aria-hidden", "true");
  }

  siswaFotoModal.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", closeSiswaFotoModal);
  });

  siswaFotoInput.addEventListener("change", () => {
    const file = siswaFotoInput.files[0];
    if (!file) { siswaFotoPreviewWrap.hidden = true; return; }
    siswaFotoPreviewImg.src = URL.createObjectURL(file);
    siswaFotoPreviewWrap.hidden = false;
  });

  document.getElementById("siswaFotoForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("siswaFotoSubmit");
    const statusEl = document.getElementById("siswaFotoStatus");
    setStatus(statusEl, "", null);

    const file = siswaFotoInput.files[0];
    if (!file) {
      setStatus(statusEl, "Pilih foto terlebih dahulu.", "error");
      return;
    }

    toggleSpinner(button, true);
    try {
      const foto = await fileToPayload(file);
      const absen = Number(document.getElementById("siswaFotoAbsen").value);
      await api("/api/admin/siswa-foto", {
        method: "POST",
        body: JSON.stringify({ absen, foto })
      });
      setStatus(statusEl, "Foto siswa berhasil diperbarui.", "success");
      await loadSiswaAdmin();
      setTimeout(closeSiswaFotoModal, 700);
    } catch (error) {
      setStatus(statusEl, error.message, "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  // ---------- kelola akun admin (khusus owner: azriel & david) ----------
  async function loadAdmins() {
    const container = document.getElementById("adminsList");
    container.innerHTML = '<p class="admin-empty">Memuat daftar admin...</p>';
    try {
      const admins = await api("/api/admin/admins");
      renderAdmins(admins);
    } catch (error) {
      container.innerHTML = `<p class="admin-empty">${error.message}</p>`;
    }
  }

  function renderAdmins(admins) {
    const container = document.getElementById("adminsList");
    if (!admins.length) {
      container.innerHTML = '<p class="admin-empty">Belum ada akun admin.</p>';
      return;
    }
    container.innerHTML = admins.map(a => `
      <div class="admin-list-item">
        <div class="admin-list-item-info">
          <span class="admin-list-item-name">${a.username}</span>
          <span class="admin-badge ${a.isOwner ? "admin-badge-owner" : ""}">${a.isOwner ? "Owner" : "Admin"}</span>
        </div>
        ${a.removable
          ? `<button type="button" class="admin-btn admin-btn-ghost admin-btn-danger" data-delete-admin="${a.username}">
               <i class="fa-solid fa-trash"></i> Hapus
             </button>`
          : ""}
      </div>`).join("");
  }

  document.getElementById("adminsList").addEventListener("click", async event => {
    const btn = event.target.closest("[data-delete-admin]");
    if (!btn) return;
    const username = btn.dataset.deleteAdmin;
    if (!confirm(`Hapus akun admin "${username}"?`)) return;
    try {
      await api("/api/admin/admins", {
        method: "DELETE",
        body: JSON.stringify({ username })
      });
      loadAdmins();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("createAdminForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("createAdminSubmit");
    const statusEl = document.getElementById("createAdminStatus");
    setStatus(statusEl, "", null);

    const username = document.getElementById("newAdminUsername").value.trim();
    const password = document.getElementById("newAdminPassword").value;

    toggleSpinner(button, true);
    try {
      await api("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      setStatus(statusEl, `Akun admin "${username}" berhasil dibuat.`, "success");
      event.target.reset();
      loadAdmins();
    } catch (error) {
      setStatus(statusEl, error.message, "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  checkSession();
})();
