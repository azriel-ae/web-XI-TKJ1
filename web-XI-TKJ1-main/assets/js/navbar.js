function initNavbar() {
  const navbar = document.getElementById("mainNav");
  const backToTop = document.getElementById("backToTop");
  const sections = [...document.querySelectorAll("header[id], section[id]")];
  const navLinks = [...document.querySelectorAll("#mainNav .nav-link")];

  function update() {
    navbar.classList.toggle("is-scrolled", window.scrollY > 16);
    backToTop.classList.toggle("is-visible", window.scrollY > 500);
    let activeId = "home";
    sections.forEach(section => { if (window.scrollY >= section.offsetTop - 110) activeId = section.id; });
    navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`));
  }

  window.addEventListener("scroll", update, { passive: true });
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  update();
}
