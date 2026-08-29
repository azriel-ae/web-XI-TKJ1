document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();

  initNavbar();
  initScrollReveal();
  initWalikelas();
  initStudents();
  initGallery();
  initFeedback();

  initChatbot();
});


// Animasi smooth (fade + slide up) saat elemen ".reveal" masuk ke layar,
// dipakai terutama untuk transisi dari Home ke section Tentang.
function initScrollReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach((el) => observer.observe(el));
}


function initChatbot() {
  const toggle = document.getElementById("chatbotToggle");
  const close = document.getElementById("chatbotClose");
  const chatWindow = document.getElementById("chatbotWindow");

  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const sendButton = document.getElementById("chatSend");


  toggle.addEventListener("click", () => {
    chatWindow.classList.toggle("active");

    if (chatWindow.classList.contains("active")) {
      input.focus();
    }
  });


  close.addEventListener("click", () => {
    chatWindow.classList.remove("active");
  });


  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = input.value.trim();

    if (!message || input.disabled) return;


    // Tampilkan pesan user
    addMessage(message, "user");

    input.value = "";
    input.disabled = true;
    sendButton.disabled = true;


    // Tampilkan loading dots
    const loading = addLoading();


    try {
      const response = await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          message: message
        })
      });


      const data = await response.json();


      // Hapus loading
      loading.remove();


      // Tampilkan jawaban AI
      addMessage(
        data.reply
          ? cleanMarkdown(data.reply)
          : `Maaf, ada masalah: ${data.error || "tidak mendapatkan jawaban."}`,
        "bot"
      );


    } catch (error) {
      console.error(error);

      loading.remove();

      addMessage(
        "Terjadi kesalahan saat menghubungi server.",
        "bot"
      );


    } finally {
      input.disabled = false;
      sendButton.disabled = false;

      input.focus();
    }
  });


  function addMessage(text, sender) {
  const row = document.createElement("div");

  row.className = `chat-message-row ${sender}`;

  if (sender === "bot") {
    row.innerHTML = `
      <div class="chat-message-avatar">
        <svg viewBox="0 0 64 64" fill="none">
          <line x1="32" y1="12" x2="32" y2="7" stroke="#171717" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="32" cy="5.5" r="2.6" fill="#A3E635"/>

          <rect
            x="13"
            y="14"
            width="38"
            height="30"
            rx="13"
            fill="#171717"
          />

          <rect x="8" y="24" width="5" height="10" rx="2.5" fill="#171717"/>
          <rect x="51" y="24" width="5" height="10" rx="2.5" fill="#171717"/>

          <circle cx="24" cy="29" r="3.6" fill="#ffffff"/>
          <circle cx="40" cy="29" r="3.6" fill="#A3E635"/>

          <path
            d="M24 37C27 39.5 37 39.5 40 37"
            stroke="#ffffff"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </svg>
      </div>

      <div class="chat-message bot"></div>
    `;

    row.querySelector(".chat-message").textContent = text;

  } else {
    const bubble = document.createElement("div");

    bubble.className = "chat-message user";
    bubble.textContent = text;

    row.appendChild(bubble);
  }

  messages.appendChild(row);

  scrollToBottom();

  return row;
}


  function addLoading() {
  const row = document.createElement("div");

  row.className = "chat-message-row bot";

  row.innerHTML = `
    <div class="chat-message-avatar">
      <svg viewBox="0 0 64 64" fill="none">
        <line x1="32" y1="12" x2="32" y2="7" stroke="#171717" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="32" cy="5.5" r="2.6" fill="#A3E635"/>

        <rect
          x="13"
          y="14"
          width="38"
          height="30"
          rx="13"
          fill="#171717"
        />

        <rect x="8" y="24" width="5" height="10" rx="2.5" fill="#171717"/>
        <rect x="51" y="24" width="5" height="10" rx="2.5" fill="#171717"/>

        <circle cx="24" cy="29" r="3.6" fill="#ffffff"/>
        <circle cx="40" cy="29" r="3.6" fill="#A3E635"/>
      </svg>
    </div>

    <div class="chat-message bot loading">
      <span class="loading-dot"></span>
      <span class="loading-dot"></span>
      <span class="loading-dot"></span>
    </div>
  `;

  messages.appendChild(row);

  scrollToBottom();

  return row;
}


  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }


function cleanMarkdown(text) {
  return text
    // Markdown links
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      "$1: $2"
    )

    // Code blocks
    .replace(/```[\s\S]*?```/g, "")

    // Inline code
    .replace(/`([^`]+)`/g, "$1")

    // Bold
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")

    // Italic
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")

    // Heading
    .replace(/^#{1,6}\s*/gm, "")

    // Blockquote
    .replace(/^>\s?/gm, "")

    // Markdown bullet
    .replace(/^\s*[-*+]\s+/gm, "• ")

    // Numbered list
    .replace(/^\s*\d+\.\s+/gm, "• ")

    // Kalau Gemini sudah mengubah bullet menjadi "•"
    // paksa setiap bullet jadi baris baru
    .replace(/\s*•\s*/g, "\n• ")

    // Hapus markdown symbol yang tersisa
    .replace(/[*_~]+/g, "")

    // Rapihin newline
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}}