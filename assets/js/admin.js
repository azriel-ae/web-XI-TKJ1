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

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  // ---------- toast notifications ----------
  const toastContainer = document.getElementById("toastContainer");

  function showToast(message, kind) {
    const toast = document.createElement("div");
    toast.className = `admin-toast ${kind === "error" ? "is-error" : "is-success"}`;
    const icon = kind === "error" ? "fa-circle-exclamation" : "fa-circle-check";
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span></span><button type="button" class="admin-toast-close" aria-label="Tutup notifikasi"><i class="fa-solid fa-xmark"></i></button>`;
    toast.querySelector("span").textContent = message;

    const removeToast = () => {
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector(".admin-toast-close").addEventListener("click", removeToast);
    toastContainer.appendChild(toast);
    setTimeout(removeToast, 4000);
  }

  // ---------- generic confirm modal ----------
  const confirmModal = document.getElementById("confirmModal");
  const confirmModalTitle = document.getElementById("confirmModalTitle");
  const confirmModalBody = document.getElementById("confirmModalBody");
  const confirmModalOk = document.getElementById("confirmModalOk");
  const confirmModalCancel = document.getElementById("confirmModalCancel");

  function askConfirm({ title, body, okLabel, cancelLabel }) {
    return new Promise(resolve => {
      confirmModalTitle.textContent = title;
      confirmModalBody.textContent = body;
      confirmModalOk.textContent = okLabel || "Hapus";
      confirmModalCancel.textContent = cancelLabel || "Batal";

      function cleanup(result) {
        confirmModal.classList.remove("is-open");
        confirmModal.setAttribute("aria-hidden", "true");
        confirmModalOk.removeEventListener("click", onOk);
        confirmModalCancel.removeEventListener("click", onCancel);
        confirmModal.querySelector("[data-confirm-cancel]").removeEventListener("click", onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }

      confirmModalOk.addEventListener("click", onOk);
      confirmModalCancel.addEventListener("click", onCancel);
      confirmModal.querySelector("[data-confirm-cancel]").addEventListener("click", onCancel);

      confirmModal.classList.add("is-open");
      confirmModal.setAttribute("aria-hidden", "false");
    });
  }

  // ---------- password show/hide ----------
  function wirePasswordToggle(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;
    toggle.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.innerHTML = showing ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
    });
  }
  wirePasswordToggle("loginPassword", "loginPasswordToggle");
  wirePasswordToggle("newAdminPassword", "newAdminPasswordToggle");

  // ---------- konfirmasi sebelum kembali ke website ----------
  function wireBackToSiteConfirm(linkId) {
    const link = document.getElementById(linkId);
    if (!link) return;
    link.addEventListener("click", async event => {
      event.preventDefault();
      const confirmed = await askConfirm({
        title: "Apakah kamu yakin ingin kembali ke website?",
        body: "Kamu akan meninggalkan panel admin.",
        okLabel: "Ya, yakin",
        cancelLabel: "Tidak"
      });
      if (confirmed) window.location.href = link.getAttribute("href");
    });
  }
  wireBackToSiteConfirm("backToSiteFromLogin");
  wireBackToSiteConfirm("backToSiteFromDashboard");

  // ---------- sidebar navigation ----------
  const sidebar = document.getElementById("adminSidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const panelTitleEl = document.getElementById("panelTitle");
  const panelSubtitleEl = document.getElementById("panelSubtitle");

  const panelMeta = {
    dashboard: { title: "Dashboard", subtitle: "Kelola konten website XI TKJ 1." },
    galeri: { title: "Galeri", subtitle: "Tambahkan dan kelola foto galeri kelas." },
    siswa: { title: "Siswa", subtitle: "Cari dan ubah data atau pasfoto siswa." },
    admin: { title: "Manajemen Admin", subtitle: "Kelola akun yang memiliki akses ke panel admin." },
    log: { title: "Log Aktivitas", subtitle: "Riwayat kegiatan di panel admin (khusus owner)." }
  };

  function openSidebar() {
    sidebar.classList.add("is-open");
    sidebarOverlay.classList.add("is-open");
  }
  function closeSidebar() {
    sidebar.classList.remove("is-open");
    sidebarOverlay.classList.remove("is-open");
  }
  sidebarToggle.addEventListener("click", openSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  function goToPanel(panel) {
    document.querySelectorAll(".admin-nav-item[data-panel]").forEach(el => {
      el.classList.toggle("is-active", el.dataset.panel === panel);
    });
    document.querySelectorAll(".admin-panel[data-panel-content]").forEach(el => {
      const active = el.dataset.panelContent === panel;
      el.hidden = !active;
      el.classList.toggle("is-active", active);
    });
    const meta = panelMeta[panel] || panelMeta.dashboard;
    panelTitleEl.textContent = meta.title;
    panelSubtitleEl.textContent = meta.subtitle;
    closeSidebar();
  }

  document.querySelectorAll(".admin-nav-item[data-panel]").forEach(el => {
    el.addEventListener("click", () => goToPanel(el.dataset.panel));
  });
  document.querySelectorAll("[data-goto-panel]").forEach(el => {
    el.addEventListener("click", () => goToPanel(el.dataset.gotoPanel));
  });

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

  let currentIsOwner = false;

  function showDashboard(username, isOwner) {
    loginView.hidden = true;
    dashboardView.hidden = false;
    currentIsOwner = !!isOwner;
    document.getElementById("adminWhoami").innerHTML =
      `<i class="fa-solid fa-circle-user"></i> ${escapeHtml(username)}${isOwner ? " (owner)" : ""}`;

    goToPanel("dashboard");
    loadGalleryExtra();
    loadSiswaAdmin();

    const navAdminItem = document.getElementById("navAdminItem");
    const shortcutAdmin = document.getElementById("shortcutAdmin");
    const statAdminCard = document.getElementById("statAdminCard");
    const navLogItem = document.getElementById("navLogItem");
    const shortcutLog = document.getElementById("shortcutLog");
    if (isOwner) {
      navAdminItem.hidden = false;
      shortcutAdmin.hidden = false;
      statAdminCard.hidden = false;
      navLogItem.hidden = false;
      shortcutLog.hidden = false;
      loadAdmins();
      loadActivityLog();
    } else {
      navAdminItem.hidden = true;
      shortcutAdmin.hidden = true;
      statAdminCard.hidden = true;
      navLogItem.hidden = true;
      shortcutLog.hidden = true;
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
    const confirmed = await askConfirm({
      title: "Keluar dari admin?",
      body: "Anda perlu login kembali untuk mengakses panel admin.",
      okLabel: "Keluar"
    });
    if (!confirmed) return;
    try { await api("/api/admin/logout", { method: "POST" }); } catch { /* ignore */ }
    showLogin();
  });

  // ---------- stats ----------
  let statsState = { siswa: null, galeri: null, admin: null };
  function renderStats() {
    document.getElementById("statSiswa").textContent = statsState.siswa === null ? "—" : statsState.siswa;
    document.getElementById("statGaleri").textContent = statsState.galeri === null ? "—" : statsState.galeri;
    document.getElementById("statAdmin").textContent = statsState.admin === null ? "—" : statsState.admin;
    document.getElementById("siswaCountBadge").textContent =
      statsState.siswa === null ? "—" : `${statsState.siswa} siswa`;
  }

  // ---------- tambah foto galeri ----------
  const galleryFotoInput = document.getElementById("galleryFoto");
  const galleryPreviewWrap = document.getElementById("galleryPreviewWrap");
  const galleryPreviewImg = document.getElementById("galleryPreviewImg");
  const galleryUploadPlaceholder = document.getElementById("galleryUploadPlaceholder");

  function setGalleryPreview(file) {
    if (!file) {
      galleryPreviewWrap.hidden = true;
      galleryUploadPlaceholder.hidden = false;
      galleryFotoInput.hidden = false;
      return;
    }
    galleryPreviewImg.src = URL.createObjectURL(file);
    document.getElementById("galleryFileName").textContent = file.name;
    document.getElementById("galleryFileSize").textContent = formatFileSize(file.size);
    galleryPreviewWrap.hidden = false;
    galleryUploadPlaceholder.hidden = true;
    galleryFotoInput.hidden = true;
  }

  galleryFotoInput.addEventListener("change", () => setGalleryPreview(galleryFotoInput.files[0]));

  document.getElementById("galleryRemoveFile").addEventListener("click", () => {
    galleryFotoInput.value = "";
    setGalleryPreview(null);
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
      showToast("Foto berhasil ditambahkan.", "success");
      event.target.reset();
      setGalleryPreview(null);
      loadGalleryExtra();
    } catch (error) {
      setStatus(statusEl, "Foto gagal diupload. Coba lagi.", "error");
      showToast(error.message || "Foto gagal diupload.", "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  function gallerySkeleton() {
    return Array.from({ length: 4 })
      .map(() => '<div class="skeleton-block"></div>')
      .join("");
  }

  async function loadGalleryExtra() {
    const container = document.getElementById("galleryExtraList");
    container.innerHTML = `<div class="admin-skeleton-grid">${gallerySkeleton()}</div>`;
    try {
      const all = await api("/api/gallery");
      statsState.galeri = all.length;
      renderStats();

      const extra = all.filter(item => item.id);
      if (!extra.length) {
        container.innerHTML = '<p class="empty-state">Belum ada foto</p>';
        return;
      }
      container.innerHTML = extra.map(item => `
        <div class="admin-gallery-item" data-id="${item.id}">
          <div class="admin-gallery-item-photo">
            <img src="${item.foto}" alt="${escapeHtml(item.judul) || "Foto galeri"}">
          </div>
          <div class="admin-gallery-item-foot">
            <div class="admin-gallery-item-info">
              <span class="admin-gallery-item-title">${escapeHtml(item.judul) || "Tanpa judul"}</span>
              ${item.uploadedBy ? `<span class="admin-gallery-item-uploader">${escapeHtml(item.uploadedBy)}</span>` : ""}
            </div>
            ${currentIsOwner ? `
            <button type="button" class="admin-btn-icon-danger" data-delete-id="${item.id}" aria-label="Hapus foto">
              <i class="fa-solid fa-trash"></i>
            </button>` : ""}
          </div>
        </div>`).join("");
    } catch (error) {
      container.innerHTML = `<div class="empty-state is-error"><i class="fa-solid fa-triangle-exclamation"></i>Data gagal dimuat.<br>
        <button type="button" class="empty-state-retry" data-retry="galeri"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
    }
  }

  document.getElementById("galleryExtraList").addEventListener("click", async event => {
    const retryBtn = event.target.closest("[data-retry]");
    if (retryBtn) { loadGalleryExtra(); return; }

    const btn = event.target.closest("[data-delete-id]");
    if (!btn) return;
    const confirmed = await askConfirm({
      title: "Hapus foto ini?",
      body: "Foto yang dihapus tidak dapat dikembalikan.",
      okLabel: "Hapus"
    });
    if (!confirmed) return;
    try {
      await api("/api/admin/gallery", {
        method: "DELETE",
        body: JSON.stringify({ id: btn.dataset.deleteId })
      });
      showToast("Data berhasil dihapus.", "success");
      loadGalleryExtra();
    } catch (error) {
      showToast(error.message || "Foto gagal diupload. Coba lagi.", "error");
    }
  });

  // ---------- ubah foto & data siswa ----------
  let allSiswa = [];

  function siswaSkeletonRows(count) {
    return Array.from({ length: count })
      .map(() => '<tr><td colspan="6"><div class="skeleton-block admin-skeleton-row"></div></td></tr>')
      .join("");
  }
  function siswaSkeletonCards(count) {
    return Array.from({ length: count })
      .map(() => '<div class="skeleton-block admin-skeleton-row"></div>')
      .join("");
  }

  async function loadSiswaAdmin() {
    document.getElementById("siswaTableBody").innerHTML = siswaSkeletonRows(6);
    document.getElementById("siswaCardList").innerHTML = siswaSkeletonCards(6);
    try {
      allSiswa = await api("/api/siswa");
      statsState.siswa = allSiswa.length;
      renderStats();
      renderSiswaAdmin(allSiswa);
    } catch (error) {
      const errorHtml = `<div class="empty-state is-error"><i class="fa-solid fa-triangle-exclamation"></i>Data gagal dimuat.<br>
        <button type="button" class="empty-state-retry" data-retry="siswa"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
      document.getElementById("siswaTableBody").innerHTML = `<tr><td colspan="6">${errorHtml}</td></tr>`;
      document.getElementById("siswaCardList").innerHTML = errorHtml;
    }
  }

  function renderSiswaAdmin(items) {
    const tableBody = document.getElementById("siswaTableBody");
    const cardList = document.getElementById("siswaCardList");

    if (!items.length) {
      const empty = '<p class="empty-state">Siswa tidak ditemukan.</p>';
      tableBody.innerHTML = `<tr><td colspan="6">${empty}</td></tr>`;
      cardList.innerHTML = empty;
      return;
    }

    tableBody.innerHTML = items.map(s => `
      <tr>
        <td><img class="admin-table-avatar" src="${s.foto}" alt="Foto ${escapeHtml(s.nama)}" onerror="this.src='assets/img/logo/default-avatar.png'"></td>
        <td class="admin-table-name">${escapeHtml(s.nama)}</td>
        <td>${escapeHtml(s.nis) || "—"}</td>
        <td>${s.jk === "P" ? "Perempuan" : "Laki-laki"}</td>
        <td>${s.ig ? `<span class="admin-table-muted">@${escapeHtml(s.ig)}</span>` : "—"}</td>
        <td>
          <div class="admin-table-actions">
            <button type="button" class="admin-btn admin-btn-ghost" data-edit-absen="${s.absen}"><i class="fa-solid fa-camera"></i> Foto</button>
            <button type="button" class="admin-btn admin-btn-ghost" data-edit-data-absen="${s.absen}"><i class="fa-solid fa-pen"></i> Data</button>
          </div>
        </td>
      </tr>`).join("");

    cardList.innerHTML = items.map(s => `
      <div class="admin-siswa-card">
        <img src="${s.foto}" alt="Foto ${escapeHtml(s.nama)}" onerror="this.src='assets/img/logo/default-avatar.png'">
        <div class="admin-siswa-card-info">
          <div class="admin-siswa-card-name">${escapeHtml(s.nama)}</div>
          <div class="admin-siswa-card-meta">${escapeHtml(s.nis) || "—"} · ${s.ig ? `@${escapeHtml(s.ig)}` : "—"}</div>
        </div>
        <div class="admin-siswa-card-actions">
          <button type="button" class="admin-btn-icon-danger" style="color:var(--color-charcoal)" data-edit-absen="${s.absen}" aria-label="Ubah foto"><i class="fa-solid fa-camera"></i></button>
          <button type="button" class="admin-btn-icon-danger" style="color:var(--color-charcoal)" data-edit-data-absen="${s.absen}" aria-label="Ubah data"><i class="fa-solid fa-pen"></i></button>
        </div>
      </div>`).join("");
  }

  document.getElementById("siswaSearch").addEventListener("input", event => {
    const query = event.target.value.trim().toLowerCase();
    renderSiswaAdmin(allSiswa.filter(s => s.nama.toLowerCase().includes(query)));
  });

  function bindSiswaActions(container) {
    container.addEventListener("click", event => {
      const retryBtn = event.target.closest("[data-retry]");
      if (retryBtn) { loadSiswaAdmin(); return; }

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
  }
  bindSiswaActions(document.getElementById("siswaTableBody"));
  bindSiswaActions(document.getElementById("siswaCardList"));

  // ---------- modal close (shared) ----------
  function bindModalClose(modal, onClose) {
    modal.querySelectorAll("[data-close-modal]").forEach(el => {
      el.addEventListener("click", () => {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        if (onClose) onClose();
      });
    });
  }

  // ---------- modal ubah data siswa ----------
  const siswaDataModal = document.getElementById("siswaDataModal");
  bindModalClose(siswaDataModal);

  function openSiswaDataModal(absen) {
    const student = allSiswa.find(s => s.absen === absen);
    if (!student) return;
    document.getElementById("siswaDataAbsen").value = absen;
    document.getElementById("siswaDataModalTitle").textContent = `Ubah Data — ${student.nama}`;
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
      showToast("Data siswa berhasil disimpan.", "success");
      await loadSiswaAdmin();
      closeSiswaDataModal();
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
  const siswaFotoUploadPlaceholder = document.getElementById("siswaFotoUploadPlaceholder");
  bindModalClose(siswaFotoModal);

  function setSiswaFotoPreview(file) {
    if (!file) {
      siswaFotoPreviewWrap.hidden = true;
      siswaFotoUploadPlaceholder.hidden = false;
      siswaFotoInput.hidden = false;
      return;
    }
    siswaFotoPreviewImg.src = URL.createObjectURL(file);
    document.getElementById("siswaFotoFileName").textContent = file.name;
    document.getElementById("siswaFotoFileSize").textContent = formatFileSize(file.size);
    siswaFotoPreviewWrap.hidden = false;
    siswaFotoUploadPlaceholder.hidden = true;
    siswaFotoInput.hidden = true;
  }

  function openSiswaFotoModal(absen) {
    const student = allSiswa.find(s => s.absen === absen);
    if (!student) return;
    document.getElementById("siswaFotoAbsen").value = absen;
    document.getElementById("siswaFotoModalTitle").textContent = `Ubah Foto — ${student.nama}`;
    document.getElementById("siswaFotoCurrentImg").src = student.foto;
    document.getElementById("siswaFotoForm").reset();
    setSiswaFotoPreview(null);
    setStatus(document.getElementById("siswaFotoStatus"), "", null);
    siswaFotoModal.classList.add("is-open");
    siswaFotoModal.setAttribute("aria-hidden", "false");
  }

  function closeSiswaFotoModal() {
    siswaFotoModal.classList.remove("is-open");
    siswaFotoModal.setAttribute("aria-hidden", "true");
  }

  siswaFotoInput.addEventListener("change", () => setSiswaFotoPreview(siswaFotoInput.files[0]));
  document.getElementById("siswaFotoRemoveFile").addEventListener("click", () => {
    siswaFotoInput.value = "";
    setSiswaFotoPreview(null);
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
      showToast("Foto berhasil diperbarui.", "success");
      await loadSiswaAdmin();
      closeSiswaFotoModal();
    } catch (error) {
      setStatus(statusEl, error.message, "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  // ---------- kelola akun admin (khusus owner) ----------
  const createAdminModal = document.getElementById("createAdminModal");
  bindModalClose(createAdminModal);

  document.getElementById("openCreateAdminBtn").addEventListener("click", () => {
    document.getElementById("createAdminForm").reset();
    setStatus(document.getElementById("createAdminStatus"), "", null);
    createAdminModal.classList.add("is-open");
    createAdminModal.setAttribute("aria-hidden", "false");
  });

  function closeCreateAdminModal() {
    createAdminModal.classList.remove("is-open");
    createAdminModal.setAttribute("aria-hidden", "true");
  }

  function adminSkeletonRows(count) {
    return Array.from({ length: count })
      .map(() => '<tr><td colspan="3"><div class="skeleton-block admin-skeleton-row"></div></td></tr>')
      .join("");
  }

  async function loadAdmins() {
    const tableBody = document.getElementById("adminsTableBody");
    tableBody.innerHTML = adminSkeletonRows(3);
    try {
      const admins = await api("/api/admin/admins");
      statsState.admin = admins.length;
      renderStats();
      renderAdmins(admins);
    } catch (error) {
      tableBody.innerHTML = `<tr><td colspan="3">
        <div class="empty-state is-error"><i class="fa-solid fa-triangle-exclamation"></i>Data gagal dimuat.<br>
          <button type="button" class="empty-state-retry" data-retry="admin"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>
      </td></tr>`;
    }
  }

  function renderAdmins(admins) {
    const tableBody = document.getElementById("adminsTableBody");
    if (!admins.length) {
      tableBody.innerHTML = '<tr><td colspan="3"><p class="empty-state">Belum ada data admin</p></td></tr>';
      return;
    }
    tableBody.innerHTML = admins.map(a => `
      <tr>
        <td class="admin-table-name">${escapeHtml(a.username)}</td>
        <td><span class="admin-badge ${a.isOwner ? "admin-badge-owner" : ""}">${a.isOwner ? "Owner" : "Admin"}</span></td>
        <td>
          ${a.removable
            ? `<button type="button" class="admin-btn admin-btn-ghost" data-delete-admin="${escapeHtml(a.username)}"><i class="fa-solid fa-trash"></i> Hapus</button>`
            : '<span class="admin-table-muted">—</span>'}
        </td>
      </tr>`).join("");
  }

  document.getElementById("adminsTableBody").addEventListener("click", async event => {
    const retryBtn = event.target.closest("[data-retry]");
    if (retryBtn) { loadAdmins(); return; }

    const btn = event.target.closest("[data-delete-admin]");
    if (!btn) return;
    const username = btn.dataset.deleteAdmin;
    const confirmed = await askConfirm({
      title: `Hapus akun admin "${username}"?`,
      body: "Akun ini tidak akan bisa login lagi setelah dihapus.",
      okLabel: "Hapus"
    });
    if (!confirmed) return;
    try {
      await api("/api/admin/admins", {
        method: "DELETE",
        body: JSON.stringify({ username })
      });
      showToast("Data berhasil dihapus.", "success");
      loadAdmins();
    } catch (error) {
      showToast(error.message || "Terjadi kesalahan.", "error");
    }
  });

  document.getElementById("createAdminForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("createAdminSubmit");
    const statusEl = document.getElementById("createAdminStatus");
    setStatus(statusEl, "", null);

    const username = document.getElementById("newAdminUsername").value.trim();
    const password = document.getElementById("newAdminPassword").value;

    if (!username) {
      setStatus(statusEl, "Username wajib diisi.", "error");
      return;
    }
    if (!password) {
      setStatus(statusEl, "Password wajib diisi.", "error");
      return;
    }

    toggleSpinner(button, true);
    try {
      await api("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      showToast(`Admin berhasil dibuat.`, "success");
      event.target.reset();
      loadAdmins();
      closeCreateAdminModal();
    } catch (error) {
      setStatus(statusEl, error.message, "error");
    } finally {
      toggleSpinner(button, false);
    }
  });

  // ---------- log aktivitas (khusus owner) ----------
  const ACTIVITY_LABELS = {
    login: "Login",
    login_gagal: "Login gagal",
    logout: "Logout",
    gallery_upload: "Upload foto galeri",
    gallery_delete: "Hapus foto galeri",
    siswa_edit: "Ubah data siswa",
    siswa_foto_edit: "Ubah foto siswa",
    admin_create: "Buat akun admin",
    admin_delete: "Hapus akun admin"
  };

  function activityLogSkeletonRows(count) {
    return Array.from({ length: count })
      .map(() => '<tr><td colspan="4"><div class="skeleton-block admin-skeleton-row"></div></td></tr>')
      .join("");
  }

  function formatLogTime(iso) {
    try {
      return new Date(iso).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short"
      });
    } catch {
      return iso;
    }
  }

  async function loadActivityLog() {
    const tableBody = document.getElementById("activityLogTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = activityLogSkeletonRows(5);
    try {
      const log = await api("/api/admin/admins?resource=activity-log");
      renderActivityLog(log);
    } catch (error) {
      tableBody.innerHTML = `<tr><td colspan="4">
        <div class="empty-state is-error"><i class="fa-solid fa-triangle-exclamation"></i>Data gagal dimuat.<br>
          <button type="button" class="empty-state-retry" data-retry="log"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>
      </td></tr>`;
    }
  }

  function renderActivityLog(log) {
    const tableBody = document.getElementById("activityLogTableBody");
    if (!log.length) {
      tableBody.innerHTML = '<tr><td colspan="4"><p class="empty-state">Belum ada aktivitas tercatat</p></td></tr>';
      return;
    }
    tableBody.innerHTML = log.map(entry => `
      <tr>
        <td class="admin-table-muted">${escapeHtml(formatLogTime(entry.at))}</td>
        <td class="admin-table-name">${escapeHtml(entry.actor)}</td>
        <td>${escapeHtml(ACTIVITY_LABELS[entry.action] || entry.action)}</td>
        <td class="admin-table-muted">${escapeHtml(entry.detail || "—")}</td>
      </tr>`).join("");
  }

  document.getElementById("activityLogTableBody").addEventListener("click", event => {
    const retryBtn = event.target.closest("[data-retry]");
    if (retryBtn) loadActivityLog();
  });

  document.getElementById("refreshLogBtn").addEventListener("click", () => loadActivityLog());

  checkSession();
})();
