// Cerberus Dev – Blog page JS
(function () {
  const grid = document.getElementById("blogGrid");
  const empty = document.getElementById("blogEmpty");
  const catsWrap = document.getElementById("blogCats");
  const countAll = document.getElementById("catCountAll");
  if (!grid) return;

  let allPosts = [];
  let activeCat = "";

  async function loadBlog() {
    try {
      const [postsRes, catsRes] = await Promise.all([
        fetch("/api/blog/posts").then(r => r.json()),
        fetch("/api/blog/categories").then(r => r.json())
      ]);

      allPosts = postsRes.posts || [];
      const cats = catsRes.categories || [];

      // Render categories
      if (countAll) countAll.textContent = String(allPosts.length);
      cats.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "sidebar-cat";
        btn.dataset.cat = c.slug;
        btn.innerHTML = `<span>${esc(c.name)}</span><span class="sidebar-cat-count">${c.post_count || 0}</span>`;
        catsWrap.appendChild(btn);
      });

      renderPosts();
    } catch (err) {
      console.warn("[Blog] Load error:", err);
      showEmpty();
    }
  }

  function renderPosts() {
    const filtered = activeCat
      ? allPosts.filter(p => p.category_slug === activeCat)
      : allPosts;

    if (filtered.length === 0) {
      showEmpty();
      grid.innerHTML = "";
      return;
    }

    empty.style.display = "none";
    grid.style.display = "";
    grid.innerHTML = filtered.map(p => `
      <article class="blog-card">
        ${p.image_url ? `<img class="blog-card-img" src="${esc(p.image_url)}" alt="${esc(p.title)}" onerror="this.style.display='none'">` : ""}
        <div class="blog-card-body">
          ${p.category_name ? `<span class="blog-card-cat">${esc(p.category_name)}</span>` : ""}
          <h3 class="blog-card-title"><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h3>
          <p class="blog-card-excerpt">${esc(p.excerpt || "")}</p>
          <div class="blog-card-meta">
            <span>${fmtDate(p.created_at)}</span>
          </div>
        </div>
      </article>
    `).join("");
  }

  function showEmpty() {
    empty.style.display = "block";
    grid.style.display = "none";
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
    } catch { return ""; }
  }

  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  // Category filter clicks
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".sidebar-cat");
    if (!btn) return;
    activeCat = btn.dataset.cat || "";
    catsWrap.querySelectorAll(".sidebar-cat").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    renderPosts();
  });

  loadBlog();
})();
