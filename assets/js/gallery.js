async function initGallery() {
  const container = document.getElementById("galleryList");
  const pagination = document.getElementById("galleryPagination");
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxCounter = document.getElementById("lightboxCounter");
  const lightboxPrevBtn = lightbox.querySelector('[data-lightbox-nav="prev"]');
  const lightboxNextBtn = lightbox.querySelector('[data-lightbox-nav="next"]');
  const perPage = 4;
  let items = [];
  let currentPage = 1;
  let lightboxIndex = 0;

  function renderPage() {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);

    container.innerHTML = pageItems.map((item, i) => `
      <div class="col-6 col-md-4">
        <a class="gallery-card" href="${item.foto}" data-gallery-image="${item.foto}" data-gallery-index="${start + i}">
          <img src="${item.foto}" alt="${item.judul}" loading="lazy">
        </a>
      </div>`).join("");

    container.querySelectorAll("img").forEach(img => {
      img.addEventListener("error", () => {
        const card = img.closest(".gallery-card");
        if (!card) return;
        card.classList.add("is-empty");
        card.removeAttribute("href");
        card.removeAttribute("data-gallery-image");
        img.remove();
        card.insertAdjacentHTML("beforeend", `<span class="gallery-empty"><i class="fa-regular fa-image"></i><span>Segera hadir</span></span>`);
      });
    });

    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!pagination) return;
    if (totalPages <= 1) { pagination.innerHTML = ""; return; }

    let numbers = "";
    for (let page = 1; page <= totalPages; page += 1) {
      numbers += `<button type="button" class="gallery-page-btn${page === currentPage ? " is-active" : ""}" data-gallery-page="${page}" aria-label="Halaman ${page}" aria-current="${page === currentPage ? "true" : "false"}">${page}</button>`;
    }

    pagination.innerHTML = `
      <button type="button" class="gallery-nav-btn" data-gallery-nav="prev" aria-label="Sebelumnya" ${currentPage === 1 ? "disabled" : ""}>&lsaquo;</button>
      <div class="gallery-page-numbers">${numbers}</div>
      <button type="button" class="gallery-nav-btn" data-gallery-nav="next" aria-label="Selanjutnya" ${currentPage === totalPages ? "disabled" : ""}>&rsaquo;</button>
    `;
  }

  function fileSortKey(path) {
    const match = path.match(/(\d+)(?=\D*$)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  try {
    const response = await fetch("/api/gallery");
    if (!response.ok) throw new Error("Data galeri gagal dimuat");
    items = await response.json();
    items.sort((a, b) => fileSortKey(a.foto) - fileSortKey(b.foto));
    if (!items.length) throw new Error("Belum ada foto galeri");
    renderPage();
  } catch (error) {
    container.innerHTML = `<div class="col-12"><div class="empty-state${error.message.includes("Belum ada") ? "" : " is-error"}"><i class="fa-regular fa-image"></i>${error.message}${error.message.includes("Belum ada") ? "" : `<br><button type="button" class="empty-state-retry" onclick="initGallery()"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button>`}</div></div>`;
    return;
  }

  function showLightboxImage(index) {
    if (!items.length) return;
    lightboxIndex = (index + items.length) % items.length;
    const item = items[lightboxIndex];
    lightboxImage.src = item.foto;
    lightboxImage.alt = item.judul;
    if (lightboxCounter) lightboxCounter.textContent = `${lightboxIndex + 1}/${items.length}`;
  }

  container.addEventListener("click", event => {
    const item = event.target.closest("[data-gallery-image]");
    if (!item) return;
    event.preventDefault();
    showLightboxImage(Number(item.dataset.galleryIndex));
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
  });

  let gridTouchStartX = 0;
  let gridTouchStartY = 0;
  container.addEventListener("touchstart", event => {
    gridTouchStartX = event.changedTouches[0].clientX;
    gridTouchStartY = event.changedTouches[0].clientY;
  }, { passive: true });
  container.addEventListener("touchend", event => {
    const diffX = event.changedTouches[0].clientX - gridTouchStartX;
    const diffY = event.changedTouches[0].clientY - gridTouchStartY;
    if (Math.abs(diffX) < 50 || Math.abs(diffX) < Math.abs(diffY)) return;
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    if (diffX < 0 && currentPage < totalPages) {
      currentPage += 1;
      renderPage();
    } else if (diffX > 0 && currentPage > 1) {
      currentPage -= 1;
      renderPage();
    }
  }, { passive: true });

  lightboxPrevBtn?.addEventListener("click", () => showLightboxImage(lightboxIndex - 1));
  lightboxNextBtn?.addEventListener("click", () => showLightboxImage(lightboxIndex + 1));

  document.addEventListener("keydown", event => {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "ArrowLeft") showLightboxImage(lightboxIndex - 1);
    if (event.key === "ArrowRight") showLightboxImage(lightboxIndex + 1);
  });

  let touchStartX = 0;
  lightbox.addEventListener("touchstart", event => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener("touchend", event => {
    const diff = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(diff) < 40) return;
    if (diff < 0) showLightboxImage(lightboxIndex + 1);
    else showLightboxImage(lightboxIndex - 1);
  }, { passive: true });

  if (pagination) {
    pagination.addEventListener("click", event => {
      const navBtn = event.target.closest("[data-gallery-nav]");
      const pageBtn = event.target.closest("[data-gallery-page]");
      const totalPages = Math.max(1, Math.ceil(items.length / perPage));

      if (navBtn) {
        if (navBtn.dataset.galleryNav === "prev" && currentPage > 1) currentPage -= 1;
        if (navBtn.dataset.galleryNav === "next" && currentPage < totalPages) currentPage += 1;
        renderPage();
        return;
      }
      if (pageBtn) {
        currentPage = Number(pageBtn.dataset.galleryPage);
        renderPage();
      }
    });
  }

  const close = () => { lightbox.classList.remove("is-open"); lightbox.setAttribute("aria-hidden", "true"); lightboxImage.src = ""; };
  lightbox.addEventListener("click", event => { if (event.target === lightbox || event.target.closest(".lightbox-close")) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
}
