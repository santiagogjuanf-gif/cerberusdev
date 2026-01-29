const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const multer = require("multer");
const db = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const rateLimit = require("../middleware/rateLimit");

// Multer config for project images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "public", "uploads", "projects");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

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

// Projects admin page
router.get("/projects-admin", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "projects-admin.html"));
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
    const { id, title, title_en, slug, excerpt, excerpt_en, content, content_en, category_id, image_url, is_published } = req.body;
    const postSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (id) {
      await db.execute(`
        UPDATE blog_posts SET title=?, title_en=?, slug=?, excerpt=?, excerpt_en=?, content=?, content_en=?, category_id=?, image_url=?, is_published=?
        WHERE id=?
      `, [title, title_en || null, postSlug, excerpt || null, excerpt_en || null, content || "", content_en || "", category_id || null, image_url || null, is_published ? 1 : 0, id]);
    } else {
      await db.execute(`
        INSERT INTO blog_posts (title, title_en, slug, excerpt, excerpt_en, content, content_en, category_id, image_url, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [title, title_en || null, postSlug, excerpt || null, excerpt_en || null, content || "", content_en || "", category_id || null, image_url || null, is_published ? 1 : 0]);
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

// ── Notifications API ──

router.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 50"
    );
    res.json({ ok: true, notifications: rows });
  } catch (err) {
    console.error("[NOTIF]", err);
    res.json({ ok: true, notifications: [] });
  }
});

router.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    await db.execute("UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0");
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

// Delete a notification
router.post("/api/notifications/:id/delete", requireAuth, async (req, res) => {
  try {
    await db.execute("DELETE FROM admin_notifications WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[NOTIF DELETE]", err);
    res.status(500).json({ ok: false });
  }
});

// ── Comments API (admin) ──

router.get("/api/blog/comments", requireAuth, async (req, res) => {
  try {
    const { post_id } = req.query;
    let sql = `
      SELECT bc.*, bp.title AS post_title
      FROM blog_comments bc
      LEFT JOIN blog_posts bp ON bc.post_id = bp.id
    `;
    const params = [];
    if (post_id) {
      sql += " WHERE bc.post_id = ?";
      params.push(post_id);
    }
    sql += " ORDER BY bc.created_at DESC";
    const [rows] = await db.execute(sql, params);
    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("[COMMENTS]", err);
    res.json({ ok: true, comments: [] });
  }
});

router.post("/api/blog/comments/:id/approve", requireAuth, async (req, res) => {
  try {
    const { approved } = req.body;
    await db.execute("UPDATE blog_comments SET is_approved = ?, is_read = 1 WHERE id = ?", [approved ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/api/blog/comments/:id/delete", requireAuth, async (req, res) => {
  try {
    await db.execute("DELETE FROM blog_comments WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

// ── Projects Admin API ──

// Upload image
router.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No file" });
  const url = `/uploads/projects/${req.file.filename}`;
  res.json({ ok: true, url });
});

// Delete uploaded image
router.post("/api/upload/delete", requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith("/uploads/projects/")) {
      return res.status(400).json({ ok: false, error: "Invalid URL" });
    }
    const filePath = path.join(__dirname, "..", "public", url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (err) {
    console.error("[UPLOAD DELETE]", err);
    res.status(500).json({ ok: false });
  }
});

// List all projects (including unpublished)
router.get("/api/projects", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM projects ORDER BY created_at DESC");
    for (const p of rows) {
      const [techs] = await db.execute(
        "SELECT id, tech_name, tech_icon FROM project_technologies WHERE project_id = ?",
        [p.id]
      );
      const [images] = await db.execute(
        "SELECT id, image_url, sort_order FROM project_images WHERE project_id = ? ORDER BY sort_order ASC",
        [p.id]
      );
      p.technologies = techs;
      p.images = images;
    }
    res.json({ ok: true, projects: rows });
  } catch (err) {
    console.error("[PROJECTS ADMIN]", err);
    res.json({ ok: true, projects: [] });
  }
});

// Create or update project
router.post("/api/projects", requireAuth, async (req, res) => {
  try {
    const { id, title, title_en, slug, tag, tag_en, description, description_en, content, content_en, image_url, date, is_published, technologies, images } = req.body;
    const projSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    let projectId = id;

    if (id) {
      await db.execute(`
        UPDATE projects SET title=?, title_en=?, slug=?, tag=?, tag_en=?, description=?, description_en=?, content=?, content_en=?, image_url=?, date=?, is_published=?
        WHERE id=?
      `, [title, title_en || null, projSlug, tag || null, tag_en || null, description || null, description_en || null, content || "", content_en || "", image_url || null, date || null, is_published ? 1 : 0, id]);

      // Update technologies: delete old, insert new
      await db.execute("DELETE FROM project_technologies WHERE project_id = ?", [id]);
      if (technologies && technologies.length > 0) {
        for (const t of technologies) {
          await db.execute(
            "INSERT INTO project_technologies (project_id, tech_name, tech_icon) VALUES (?, ?, ?)",
            [id, t.tech_name, t.tech_icon]
          );
        }
      }

      // Update images: delete old, insert new
      await db.execute("DELETE FROM project_images WHERE project_id = ?", [id]);
    } else {
      const [result] = await db.execute(`
        INSERT INTO projects (title, title_en, slug, tag, tag_en, description, description_en, content, content_en, image_url, date, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [title, title_en || null, projSlug, tag || null, tag_en || null, description || null, description_en || null, content || "", content_en || "", image_url || null, date || null, is_published ? 1 : 0]);

      projectId = result.insertId;
      if (technologies && technologies.length > 0) {
        for (const t of technologies) {
          await db.execute(
            "INSERT INTO project_technologies (project_id, tech_name, tech_icon) VALUES (?, ?, ?)",
            [projectId, t.tech_name, t.tech_icon]
          );
        }
      }
    }

    // Insert images
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        await db.execute(
          "INSERT INTO project_images (project_id, image_url, sort_order) VALUES (?, ?, ?)",
          [projectId, images[i].url, i]
        );
      }
    }

    res.json({ ok: true, projectId });
  } catch (err) {
    console.error("[PROJECTS ADMIN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete project
router.post("/api/projects/:id/delete", requireAuth, async (req, res) => {
  try {
    await db.execute("DELETE FROM projects WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[PROJECTS ADMIN]", err);
    res.status(500).json({ ok: false });
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
    res.sendFile("logout.html", { root: "./views/admin" });
  });
});

module.exports = router;
