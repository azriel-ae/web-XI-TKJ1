const FEEDBACK_MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3MB
const FEEDBACK_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function initFeedback() {
  const form = document.getElementById("feedbackForm");
  if (!form) return;

  const namaInput = document.getElementById("feedbackNama");
  const pesanInput = document.getElementById("feedbackPesan");
  const fotoInput = document.getElementById("feedbackFoto");
  const fotoPreview = document.getElementById("feedbackFotoPreview");
  const fotoPreviewImg = document.getElementById("feedbackFotoPreviewImg");
  const fotoRemoveBtn = document.getElementById("feedbackFotoRemove");
  const submitBtn = document.getElementById("feedbackSubmit");
  const statusEl = document.getElementById("feedbackStatus");
  const loadedAtInput = document.getElementById("feedbackLoadedAt");

  if (loadedAtInput) loadedAtInput.value = String(Date.now());

  fotoInput.addEventListener("change", () => {
    const file = fotoInput.files && fotoInput.files[0];

    if (!file) {
      clearFotoPreview();
      return;
    }

    if (!FEEDBACK_ALLOWED_TYPES.includes(file.type)) {
      setStatus("Format foto harus JPG, PNG, WEBP, atau GIF.", "error");
      fotoInput.value = "";
      clearFotoPreview();
      return;
    }

    if (file.size > FEEDBACK_MAX_PHOTO_BYTES) {
      setStatus("Ukuran foto maksimal 3MB.", "error");
      fotoInput.value = "";
      clearFotoPreview();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      fotoPreviewImg.src = reader.result;
      fotoPreview.hidden = false;
    };
    reader.readAsDataURL(file);
    setStatus("", "");
  });

  if (fotoRemoveBtn) {
    fotoRemoveBtn.addEventListener("click", () => {
      fotoInput.value = "";
      clearFotoPreview();
    });
  }

  function clearFotoPreview() {
    fotoPreview.hidden = true;
    fotoPreviewImg.src = "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitBtn.disabled) return;

    const nama = namaInput.value.trim();
    const pesan = pesanInput.value.trim();

    if (!nama) {
      setStatus("Nama wajib diisi.", "error");
      namaInput.focus();
      return;
    }

    if (!pesan) {
      setStatus("Pesan masukan wajib diisi.", "error");
      pesanInput.focus();
      return;
    }

    setLoading(true);
    setStatus("Mengirim masukan...", "");

    try {
      const payload = {
        nama,
        pesan,
        website: form.website ? form.website.value : "",
        loadedAt: loadedAtInput ? Number(loadedAtInput.value) : Date.now()
      };

      const file = fotoInput.files && fotoInput.files[0];

      if (file) {
        payload.foto = {
          name: file.name,
          type: file.type,
          data: await fileToBase64(file)
        };
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        setStatus(data.error || "Maaf, masukan belum berhasil dikirim. Silakan coba lagi.", "error");
        return;
      }

      setStatus("Terima kasih! Masukan kamu berhasil dikirim.", "success");
      form.reset();
      clearFotoPreview();
      if (loadedAtInput) loadedAtInput.value = String(Date.now());

    } catch (error) {
      console.error(error);
      setStatus("Maaf, masukan belum berhasil dikirim. Silakan coba lagi.", "error");
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("is-loading", isLoading);
  }

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = `feedback-status${type ? ` ${type}` : ""}`;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Gagal membaca file"));
      reader.readAsDataURL(file);
    });
  }
}
