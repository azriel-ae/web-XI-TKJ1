/* ==========================================================
   KONTAK KELAS — AVATAR INSTAGRAM & TIKTOK
   Ambil avatar dari /api/social (yang sudah menangani API resmi +
   cache di server). Kalau avatar tidak tersedia/API gagal/timeout,
   tampilkan fallback avatar berbasis inisial — bukan broken image,
   bukan pesan error teknis. Gagal di sini tidak boleh menghambat
   bagian lain halaman.
   ========================================================== */

function initSocial() {
  const nodes = document.querySelectorAll("[data-social-avatar]");
  if (!nodes.length) return;

  // Semua node mulai dari skeleton (class default di HTML), lalu
  // di-update begitu /api/social selesai — tanpa memblokir apa pun.
  loadSocialProfiles()
    .then(profiles => {
      nodes.forEach(node => applySocialAvatar(node, profiles));
    })
    .catch(() => {
      // Fetch gagal total (network error/timeout) -> semua avatar
      // jatuh ke fallback inisial, bukan dibiarkan skeleton selamanya.
      nodes.forEach(node => applySocialAvatar(node, null));
    });
}

async function loadSocialProfiles() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch("/api/social", { signal: controller.signal });
    if (!response.ok) throw new Error("social-api-not-ok");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function applySocialAvatar(node, profiles) {
  const platform = node.getAttribute("data-social-avatar");
  const profile = profiles && profiles[platform];
  const img = node.querySelector(".social-avatar-img");

  if (!profile || !profile.avatarUrl) {
    showSocialFallback(node);
    return;
  }

  // Kalau URL avatar ternyata gagal dimuat (mis. sudah expired di
  // sisi provider), jatuh ke fallback juga — jangan tampilkan
  // broken image icon bawaan browser.
  img.addEventListener("load", () => {
    node.classList.remove("is-fallback");
    node.classList.add("is-loaded");
  }, { once: true });

  img.addEventListener("error", () => {
    showSocialFallback(node);
  }, { once: true });

  img.src = profile.avatarUrl;
  img.hidden = false;
}

function showSocialFallback(node) {
  const img = node.querySelector(".social-avatar-img");
  if (img) img.hidden = true;
  node.classList.remove("is-loaded");
  node.classList.add("is-fallback");
}
