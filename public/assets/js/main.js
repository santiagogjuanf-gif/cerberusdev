// public/assets/js/main.js

// 1) Include de partials (header/footer) para no duplicar código en todas las páginas
async function includePartials() {
  const nodes = document.querySelectorAll("[data-include]");
  await Promise.all([...nodes].map(async (el) => {
    const url = el.getAttribute("data-include");
    const res = await fetch(url, { cache: "no-cache" });
    el.innerHTML = await res.text();
  }));
}

// 2) Marcar link activo según página
function markActiveNav() {
  const path = location.pathname.replace(/\/+$/, "");
  const links = document.querySelectorAll(".nav-link, .mobile__link");
  links.forEach(a => {
    const href = a.getAttribute("href");
    if (!href) return;
    a.classList.toggle("is-active", href === path || (path === "" && href === "/index.html"));
  });
}

// 3) Menú mobile
function setupMobileMenu() {
  const mobile = document.getElementById("mobileNav");
  const navToggle = document.getElementById("navToggle");
  const mobileClose = document.getElementById("mobileClose");
  const mobileBackdrop = document.getElementById("mobileBackdrop");

  if (!mobile || !navToggle) return;

  function openMobile() {
    mobile.classList.add("is-open");
    mobile.setAttribute("aria-hidden", "false");
    navToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeMobile() {
    mobile.classList.remove("is-open");
    mobile.setAttribute("aria-hidden", "true");
    navToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  navToggle.addEventListener("click", openMobile);
  mobileClose?.addEventListener("click", closeMobile);
  mobileBackdrop?.addEventListener("click", closeMobile);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobile();
  });

  document.querySelectorAll(".mobile__link").forEach(a => {
    a.addEventListener("click", closeMobile);
  });
}

// 4) Animaciones modernas: reveal on scroll (IntersectionObserver)
function setupRevealAnimations() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => io.observe(el));
}

// 5) View Transitions (si el navegador lo soporta) para transiciones entre páginas
function setupViewTransitions() {
  const supports = "startViewTransition" in document;
  if (!supports) return;

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#")) return;

    // solo para navegación interna
    if (!href.endsWith(".html")) return;

    e.preventDefault();
    document.startViewTransition(() => {
      window.location.href = href;
    });
  });
}

// 6) Footer year
function setYear() {
  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
}

// 7) Contact form (solo en contacto.html)
function setupContactForm() {
  const form = document.getElementById("contactForm");
  const toast = document.getElementById("contactToast");
  if (!form) return;

  function show(msg, ok = true) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.toggle("is-ok", ok);
    toast.classList.toggle("is-bad", !ok);
    toast.classList.add("is-show");
    setTimeout(() => toast.classList.remove("is-show"), 3500);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error("bad");
      form.reset();
      show("✅ Solicitud enviada. Respuesta en 24–48 horas.", true);
    } catch {
      show("❌ No se pudo enviar. Intenta de nuevo.", false);
    }
  });
}

// Init
(async function init() {
  await includePartials();
  markActiveNav();
  setupMobileMenu();
  setupRevealAnimations();
  setupViewTransitions();
  setYear();
  setupContactForm();
})();
