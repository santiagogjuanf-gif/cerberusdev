// Cerberus Dev – Main JS

async function includePartials() {
  const nodes = document.querySelectorAll("[data-include]");
  await Promise.all([...nodes].map(async (el) => {
    const url = el.getAttribute("data-include");
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${res.status}`);
      el.innerHTML = await res.text();
    } catch (err) {
      console.warn("[Partials] Failed to load:", url, err.message);
      el.innerHTML = "";
    }
  }));
}

function markActiveNav() {
  const raw = location.pathname.replace(/\/+$/, "").replace(/\.html$/, "");
  const path = raw || "/";
  const links = document.querySelectorAll(".nav-link, .mobile__link");
  links.forEach(a => {
    const href = (a.getAttribute("href") || "").replace(/\.html$/, "").replace(/\/+$/, "") || "/";
    a.classList.toggle("is-active", href === path);
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
    if (href.startsWith("/assets/") || href.startsWith("/uploads/")) return;
    // Only transition internal page links
    if (!href.startsWith("/")) return;
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
      showToast("Solicitud enviada. Recibiras una confirmacion por correo.", true);
    } catch {
      showToast("No se pudo enviar. Intenta de nuevo o escribenos directamente.", false);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

// ===== i18n system =====
function getCurrentLang() {
  return localStorage.getItem("cerberus_lang") || "es";
}

function setLang(lang) {
  localStorage.setItem("cerberus_lang", lang);
  applyTranslations(lang);
  updateLangButtons(lang);
  document.documentElement.lang = lang;
}

function applyTranslations(lang) {
  if (typeof I18N === "undefined") return;
  const dict = I18N[lang];
  if (!dict) return;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const val = dict[key];
    if (val === undefined) return;

    // For elements with HTML content (like contact.sub)
    if (val.includes("<")) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });

  // Handle placeholders
  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const key = el.getAttribute("data-i18n-ph");
    const val = dict[key];
    if (val !== undefined) el.placeholder = val;
  });

  // Handle select options
  document.querySelectorAll("[data-i18n-opt]").forEach(el => {
    const key = el.getAttribute("data-i18n-opt");
    const val = dict[key];
    if (val !== undefined) el.textContent = val;
  });
}

function updateLangButtons(lang) {
  const label = lang === "es" ? "ES" : "EN";
  document.querySelectorAll(".lang-switch").forEach(btn => {
    const labelEl = btn.querySelector(".lang-label");
    if (labelEl) {
      labelEl.textContent = label;
    } else {
      btn.textContent = label;
    }
  });
}

function setupLangSwitch() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".lang-switch")) return;
    const current = getCurrentLang();
    setLang(current === "es" ? "en" : "es");
  });

  // Apply on load
  const lang = getCurrentLang();
  updateLangButtons(lang);
  if (lang !== "es") {
    applyTranslations(lang);
  }
  document.documentElement.lang = lang;
}

(async function init() {
  try {
    await includePartials();
  } catch (err) {
    console.warn("[Init] Partials load error:", err);
  }
  markActiveNav();
  setupStickyHeader();
  setupMobileMenu();
  setupRevealAnimations();
  setupViewTransitions();
  setYear();
  setupContactForm();
  setupLangSwitch();
})();
