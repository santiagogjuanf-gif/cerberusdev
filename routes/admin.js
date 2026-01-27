const router = require("express").Router();
const path = require("path");
const bcrypt = require("bcrypt");
const db = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const rateLimit = require("../middleware/rateLimit");

// Login page
router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "login.html"));
});

// Login action
router.post("/login", rateLimit, async (req, res) => {
  const { username, password } = req.body;

  const [[user]] = await db.execute(
    "SELECT * FROM admin_users WHERE username = ?",
    [username]
  );

  if (!user) {
    console.log("[LOGIN FAIL] user not found");
    return res.redirect(process.env.ADMIN_PATH + "/login");
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    console.log("[LOGIN FAIL] wrong password");
    return res.redirect(process.env.ADMIN_PATH + "/login");
  }

  req.session.user = { id: user.id, username: user.username };
  console.log("[LOGIN OK]", username);

  res.redirect(process.env.ADMIN_PATH + "/dashboard");
});

// Dashboard
router.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "dashboard.html"));
});

// Lead detail page
router.get("/lead", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "lead.html"));
});

// Blog admin page
router.get("/blog-admin", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "blog-admin.html"));
});

// ── Blog Admin API ──

// List all posts (including drafts)
router.get("/api/blog/posts", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT p.*, c.name AS category_name
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC
    `);
    res.json({ ok: true, posts: rows });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.json({ ok: true, posts: [] });
  }
});

// List categories
router.get("/api/blog/categories", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM blog_categories ORDER BY name ASC");
    res.json({ ok: true, categories: rows });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.json({ ok: true, categories: [] });
  }
});

// Create or update post
router.post("/api/blog/posts", requireAuth, async (req, res) => {
  try {
    const { id, title, slug, excerpt, content, category_id, image_url, is_published } = req.body;
    const postSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (id) {
      await db.execute(`
        UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category_id=?, image_url=?, is_published=?
        WHERE id=?
      `, [title, postSlug, excerpt || null, content || "", category_id || null, image_url || null, is_published ? 1 : 0, id]);
    } else {
      await db.execute(`
        INSERT INTO blog_posts (title, slug, excerpt, content, category_id, image_url, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [title, postSlug, excerpt || null, content || "", category_id || null, image_url || null, is_published ? 1 : 0]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete post
router.post("/api/blog/posts/:id/delete", requireAuth, async (req, res) => {
  try {
    await db.execute("DELETE FROM blog_posts WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.status(500).json({ ok: false });
  }
});

// Create category
router.post("/api/blog/categories", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await db.execute("INSERT INTO blog_categories (name, slug) VALUES (?, ?)", [name, slug]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Leads API ──

// API – list leads
router.get("/api/leads", requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    "SELECT * FROM leads ORDER BY is_important DESC, created_at DESC"
  );
  res.json({ ok: true, leads: rows });
});

// API – single lead
router.get("/api/leads/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const [[lead]] = await db.execute("SELECT * FROM leads WHERE id = ?", [id]);
  if (!lead) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, lead });
});

// API – summary
router.get("/api/summary", requireAuth, async (req, res) => {
  const [[row]] = await db.execute(`
    SELECT
      SUM(status='new') AS new_count,
      SUM(status='replied') AS replied_count,
      SUM(status='closed') AS closed_count
    FROM leads
  `);
  res.json({
    ok: true,
    summary: {
      new: Number(row.new_count || 0),
      replied: Number(row.replied_count || 0),
      closed: Number(row.closed_count || 0)
    }
  });
});

// Toggle important
router.post("/api/leads/:id/important", requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.execute(
    "UPDATE leads SET is_important = IF(is_important=1,0,1) WHERE id = ?",
    [id]
  );
  res.json({ ok: true });
});

// Update status
router.post("/api/leads/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["new", "replied", "closed"].includes(status)) {
    return res.status(400).json({ ok: false, error: "bad_status" });
  }

  await db.execute("UPDATE leads SET status = ? WHERE id = ?", [status, id]);
  res.json({ ok: true });
});

// Save notes
router.post("/api/leads/:id/notes", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  await db.execute("UPDATE leads SET internal_notes = ? WHERE id = ?", [notes || null, id]);
  res.json({ ok: true });
});

// Delete lead (permanent)
router.post("/api/leads/:id/delete", requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.execute("DELETE FROM leads WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect(process.env.ADMIN_PATH + "/login");
  });
});

module.exports = router;
