// Cerberus Dev – Main JS

async function includePartials() {
  const nodes = document.querySelectorAll("[data-include]");
  await Promise.all([...nodes].map(async (el) => {
    const url = el.getAttribute("data-include");
    const res = await fetch(url, { cache: "no-cache" });
    el.innerHTML = await res.text();
  }));
}

function markActiveNav() {
  const path = location.pathname.replace(/\/+$/, "");
  const links = document.querySelectorAll(".nav-link, .mobile__link");
  links.forEach(a => {
    const href = a.getAttribute("href");
    if (!href) return;
    const isActive = href === path ||
      href === path + ".html" ||
      ((path === "" || path === "/") && href === "/index.html");
    a.classList.toggle("is-active", isActive);
  });
}

function setupStickyHeader() {
  const header = document.getElementById("siteHeader");
  if (!header) return;
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        header.classList.toggle("scrolled", window.scrollY > 40);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMobile(); });
  document.querySelectorAll(".mobile__link").forEach(a => a.addEventListener("click", closeMobile));
}

function setupRevealAnimations() {
  const singles = document.querySelectorAll("[data-reveal]");
  const staggers = document.querySelectorAll("[data-reveal-stagger]");
  if (!("IntersectionObserver" in window)) {
    singles.forEach(el => el.classList.add("is-in"));
    staggers.forEach(el => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  singles.forEach(el => io.observe(el));
  staggers.forEach(el => io.observe(el));
}

function setupViewTransitions() {
  if (!("startViewTransition" in document)) return;
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
    if (!href.endsWith(".html")) return;
    e.preventDefault();
    document.startViewTransition(() => { window.location.href = href; });
  });
}

function setYear() {
  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
}

function setupContactForm() {
  const form = document.getElementById("contactForm");
  const toast = document.getElementById("contactToast");
  if (!form) return;

  function showToast(msg, ok = true) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = "toast is-show " + (ok ? "is-ok" : "is-bad");
    setTimeout(() => { toast.className = "toast"; }, 4000);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = "Enviando...";
    btn.disabled = true;

    try {
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error("bad");
      form.reset();
      showToast("Solicitud enviada. Recibirás una confirmación por correo.", true);
    } catch {
      showToast("No se pudo enviar. Intenta de nuevo o escríbenos directamente.", false);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

(async function init() {
  await includePartials();
  markActiveNav();
  setupStickyHeader();
  setupMobileMenu();
  setupRevealAnimations();
  setupViewTransitions();
  setYear();
  setupContactForm();
})();
