const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const multer = require("multer");
const db = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
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

  let user;
  try {
    const [[result]] = await db.execute(
      "SELECT * FROM admin_users WHERE username = ? OR email = ?",
      [username, username]
    );
    user = result;
  } catch (err) {
    console.error("[LOGIN ERROR] Database connection failed:", err.message);
    return res.redirect(process.env.ADMIN_PATH + "/login?error=database");
  }

  if (!user) {
    console.log("[LOGIN FAIL] user not found");
    return res.redirect(process.env.ADMIN_PATH + "/login?error=invalid");
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    console.log("[LOGIN FAIL] wrong password");
    return res.redirect(process.env.ADMIN_PATH + "/login?error=invalid");
  }

  // Store user info including role in session
  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    email: user.email,
    role: user.role || 'client',
    must_change_password: user.must_change_password || 0
  };
  console.log("[LOGIN OK]", username, "name:", user.name || username, "role:", user.role || 'client');

  // Check if user needs to change password
  if (user.must_change_password) {
    return res.redirect(process.env.ADMIN_PATH + "/change-password");
  }

  // Redirect based on role
  if (user.role === 'client') {
    return res.redirect(process.env.ADMIN_PATH + "/portal");
  }

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

// Leads page (dedicated page for leads management)
router.get("/leads", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "leads.html"));
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

// Delete post (and its images)
router.post("/api/blog/posts/:id/delete", requireAuth, async (req, res) => {
  try {
    // Get post to find images
    const [[post]] = await db.execute("SELECT cover_image, content FROM blog_posts WHERE id = ?", [req.params.id]);

    if (post) {
      // Delete cover image if exists
      if (post.cover_image && post.cover_image.startsWith("/uploads/")) {
        const coverPath = path.join(__dirname, "..", "public", post.cover_image);
        if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
      }

      // Find and delete images in content (markdown format: ![](url) or HTML <img src="url">)
      const imgRegex = /(?:!\[.*?\]\(|<img[^>]+src=["'])([^)"']+uploads\/[^)"']+)/g;
      let match;
      while ((match = imgRegex.exec(post.content)) !== null) {
        const imgUrl = match[1];
        if (imgUrl.startsWith("/uploads/")) {
          const imgPath = path.join(__dirname, "..", "public", imgUrl);
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
      }
    }

    // Delete comments first (foreign key)
    await db.execute("DELETE FROM blog_comments WHERE post_id = ?", [req.params.id]);
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

// Delete category
router.post("/api/blog/categories/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const catId = req.params.id;
    // Check if category has posts
    const [[countResult]] = await db.execute("SELECT COUNT(*) as count FROM blog_posts WHERE category_id = ?", [catId]);
    const postCount = countResult?.count || 0;

    if (postCount > 0 && !req.body.force) {
      return res.json({ ok: false, error: 'has_posts', postCount });
    }

    // If force delete or no posts, remove category (posts will have NULL category)
    if (postCount > 0) {
      await db.execute("UPDATE blog_posts SET category_id = NULL WHERE category_id = ?", [catId]);
    }
    await db.execute("DELETE FROM blog_categories WHERE id = ?", [catId]);
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

// Delete project (and its images)
router.post("/api/projects/:id/delete", requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;

    // Get project to find main image
    const [[project]] = await db.execute("SELECT image_url, content FROM projects WHERE id = ?", [projectId]);

    if (project) {
      // Delete main image if exists
      if (project.image_url && project.image_url.startsWith("/uploads/")) {
        const mainPath = path.join(__dirname, "..", "public", project.image_url);
        if (fs.existsSync(mainPath)) fs.unlinkSync(mainPath);
      }

      // Find and delete images in content
      const imgRegex = /(?:!\[.*?\]\(|<img[^>]+src=["'])([^)"']+uploads\/[^)"']+)/g;
      let match;
      while ((match = imgRegex.exec(project.content)) !== null) {
        const imgUrl = match[1];
        if (imgUrl.startsWith("/uploads/")) {
          const imgPath = path.join(__dirname, "..", "public", imgUrl);
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
      }
    }

    // Get and delete gallery images
    const [galleryImages] = await db.execute("SELECT image_url FROM project_images WHERE project_id = ?", [projectId]);
    for (const img of galleryImages) {
      if (img.image_url && img.image_url.startsWith("/uploads/")) {
        const imgPath = path.join(__dirname, "..", "public", img.image_url);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
    }

    // Delete related records first (foreign keys)
    await db.execute("DELETE FROM project_technologies WHERE project_id = ?", [projectId]);
    await db.execute("DELETE FROM project_images WHERE project_id = ?", [projectId]);
    await db.execute("DELETE FROM projects WHERE id = ?", [projectId]);

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

// ── Users Management API (Admin only) ──

// Users admin page
router.get("/users", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "users.html"));
});

// List all users
router.get("/api/users", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT id, username, name, email, role, must_change_password, created_at, updated_at
      FROM admin_users
      ORDER BY created_at DESC
    `);
    res.json({ ok: true, users: rows });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single user
router.get("/api/users/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const [[user]] = await db.execute(`
      SELECT id, username, name, email, role, must_change_password, created_at, updated_at
      FROM admin_users WHERE id = ?
    `, [req.params.id]);
    if (!user) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, user });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create user
router.post("/api/users", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { username, name, email, password, role, must_change_password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username and password required' });
    }

    // Check if username or email already exists
    const [[existing]] = await db.execute(
      "SELECT id FROM admin_users WHERE username = ? OR (email = ? AND email IS NOT NULL)",
      [username, email || null]
    );
    if (existing) {
      return res.status(400).json({ ok: false, error: 'username or email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(`
      INSERT INTO admin_users (username, name, email, password_hash, role, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [username, name || null, email || null, password_hash, role || 'client', must_change_password ? 1 : 0]);

    res.json({ ok: true, userId: result.insertId });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update user
router.post("/api/users/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { username, name, email, password, role, must_change_password } = req.body;
    const userId = req.params.id;

    // Check if username/email exists for another user
    const [[existing]] = await db.execute(
      "SELECT id FROM admin_users WHERE (username = ? OR (email = ? AND email IS NOT NULL)) AND id != ?",
      [username, email || null, userId]
    );
    if (existing) {
      return res.status(400).json({ ok: false, error: 'username or email already exists' });
    }

    if (password) {
      // Update with new password
      const password_hash = await bcrypt.hash(password, 10);
      await db.execute(`
        UPDATE admin_users SET username = ?, name = ?, email = ?, password_hash = ?, role = ?, must_change_password = ?
        WHERE id = ?
      `, [username, name || null, email || null, password_hash, role || 'client', must_change_password ? 1 : 0, userId]);
    } else {
      // Update without changing password
      await db.execute(`
        UPDATE admin_users SET username = ?, name = ?, email = ?, role = ?, must_change_password = ?
        WHERE id = ?
      `, [username, name || null, email || null, role || 'client', must_change_password ? 1 : 0, userId]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete user
router.post("/api/users/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent deleting self
    if (req.session.user.id == userId) {
      return res.status(400).json({ ok: false, error: 'cannot delete yourself' });
    }

    await db.execute("DELETE FROM admin_users WHERE id = ?", [userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Services Management API (Admin/Support) ──

// Services admin page
router.get("/services", requireAuth, requireRole(['admin', 'support']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "services.html"));
});

// List all services (with real-time PM2 status)
router.get("/api/services", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.*, u.username as owner_name
      FROM services s
      LEFT JOIN admin_users u ON s.user_id = u.id
      ORDER BY s.name ASC
    `);

    // Get real-time PM2 status
    const { exec } = require("child_process");
    exec("pm2 jlist", { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
      let pm2Status = {};

      if (error) {
        console.log("[SERVICES] PM2 jlist error:", error.message);
      }

      if (stdout) {
        try {
          const processes = JSON.parse(stdout);
          processes.forEach(p => {
            // Store both the original name and lowercase for flexible matching
            const status = p.pm2_env?.status || 'unknown';
            pm2Status[p.name] = status;
            pm2Status[p.name.toLowerCase()] = status;
          });
        } catch (e) {
          console.log("[SERVICES] PM2 JSON parse error:", e.message);
        }
      }

      // Merge PM2 status with service data (try exact match first, then lowercase)
      const services = rows.map(s => ({
        ...s,
        status: pm2Status[s.pm2_name] || pm2Status[s.pm2_name?.toLowerCase()] || 'unknown'
      }));

      res.json({ ok: true, services });
    });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create service
router.post("/api/services", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, pm2_name, description, user_id, port } = req.body;

    if (!name || !pm2_name) {
      return res.status(400).json({ ok: false, error: 'name and pm2_name required' });
    }

    const [result] = await db.execute(`
      INSERT INTO services (name, pm2_name, description, user_id, port)
      VALUES (?, ?, ?, ?, ?)
    `, [name, pm2_name, description || null, user_id || null, port || null]);

    res.json({ ok: true, serviceId: result.insertId });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update service
router.post("/api/services/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, pm2_name, description, user_id, port } = req.body;

    await db.execute(`
      UPDATE services SET name = ?, pm2_name = ?, description = ?, user_id = ?, port = ?
      WHERE id = ?
    `, [name, pm2_name, description || null, user_id || null, port || null, req.params.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete service
router.post("/api/services/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    await db.execute("DELETE FROM services WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PM2 control endpoints
router.post("/api/services/:id/restart", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const [[service]] = await db.execute("SELECT pm2_name FROM services WHERE id = ?", [req.params.id]);
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const { exec } = require("child_process");
    exec(`pm2 restart ${service.pm2_name}`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.error("[PM2 RESTART]", stderr);
        return res.status(500).json({ ok: false, error: stderr });
      }
      res.json({ ok: true, output: stdout });
    });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/api/services/:id/stop", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const [[service]] = await db.execute("SELECT pm2_name FROM services WHERE id = ?", [req.params.id]);
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const { exec } = require("child_process");
    exec(`pm2 stop ${service.pm2_name}`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.error("[PM2 STOP]", stderr);
        return res.status(500).json({ ok: false, error: stderr });
      }
      res.json({ ok: true, output: stdout });
    });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/api/services/:id/start", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const [[service]] = await db.execute("SELECT pm2_name FROM services WHERE id = ?", [req.params.id]);
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const { exec } = require("child_process");
    exec(`pm2 start ${service.pm2_name}`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.error("[PM2 START]", stderr);
        return res.status(500).json({ ok: false, error: stderr });
      }
      res.json({ ok: true, output: stdout });
    });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get PM2 logs for a service
router.get("/api/services/:id/logs", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const [[service]] = await db.execute("SELECT pm2_name FROM services WHERE id = ?", [req.params.id]);
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const lines = req.query.lines || 50;
    const { exec } = require("child_process");
    exec(`pm2 logs ${service.pm2_name} --lines ${lines} --nostream`, { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => {
      res.json({ ok: true, logs: stdout + stderr });
    });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Monitor API (Admin/Support) ──

// Monitor page
router.get("/monitor", requireAuth, requireRole(['admin', 'support']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "monitor.html"));
});

// System stats endpoint - Enhanced with CPU %, multiple disks, network
router.get("/api/monitor/stats", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const os = require("os");
    const { exec } = require("child_process");
    const isWindows = process.platform === 'win32';

    // CPU info
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown CPU';
    const cpuCores = cpus.length;

    // Memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);

    // Uptime
    const uptime = os.uptime();
    const hostname = os.hostname();

    // Helper to format bytes
    function formatBytes(bytes) {
      if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(2) + ' TB';
      if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
      return bytes + ' B';
    }

    if (isWindows) {
      // Windows: Use PowerShell commands (WMIC is deprecated/removed in Windows 11 24H2+)
      let cpuPercent = 0;
      let disks = [];
      let network = { rx_bytes: 0, tx_bytes: 0 };
      let completed = 0;
      const total = 3;

      function checkDone() {
        completed++;
        if (completed >= total) {
          sendResponse(cpuPercent, disks, network);
        }
      }

      // CPU - using PowerShell Get-CimInstance (modern, reliable)
      const cpuCmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"';
      exec(cpuCmd, { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        if (!err && stdout) {
          const val = parseInt(stdout.trim());
          if (!isNaN(val)) cpuPercent = val;
        }
        // Fallback: Calculate from Node.js os.cpus() if PowerShell fails
        if (cpuPercent === 0) {
          const loadAvg = os.loadavg();
          cpuPercent = Math.min(100, Math.round((loadAvg[0] / cpuCores) * 100));
        }
        checkDone();
      });

      // Disks - using PowerShell Get-CimInstance (works on all Windows versions)
      const diskCmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \\"DriveType=3\\" | Select-Object DeviceID, Size, FreeSpace, VolumeName | ConvertTo-Json"';
      exec(diskCmd, { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        if (!err && stdout) {
          try {
            let data = JSON.parse(stdout.trim());
            // Ensure it's an array
            if (!Array.isArray(data)) data = [data];
            data.forEach(d => {
              if (d.DeviceID && d.Size > 0) {
                const size = d.Size || 0;
                const freeSpace = d.FreeSpace || 0;
                const used = size - freeSpace;
                const percent = ((used / size) * 100).toFixed(1);
                disks.push({
                  device: d.DeviceID,
                  type: d.VolumeName || 'Local Disk',
                  total: formatBytes(size),
                  used: formatBytes(used),
                  free: formatBytes(freeSpace),
                  percent: percent + '%',
                  mount: d.DeviceID
                });
              }
            });
          } catch (e) {
            console.error('[MONITOR DISK PARSE]', e.message);
          }
        }
        checkDone();
      });

      // Network - using PowerShell Get-NetAdapterStatistics (modern, reliable)
      const netCmd = 'powershell -NoProfile -Command "Get-NetAdapterStatistics | Select-Object ReceivedBytes, SentBytes | ConvertTo-Json"';
      exec(netCmd, { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        if (!err && stdout) {
          try {
            let data = JSON.parse(stdout.trim());
            // Sum all adapters
            if (!Array.isArray(data)) data = [data];
            data.forEach(adapter => {
              network.rx_bytes += adapter.ReceivedBytes || 0;
              network.tx_bytes += adapter.SentBytes || 0;
            });
          } catch (e) {
            console.error('[MONITOR NET PARSE]', e.message);
          }
        }
        // Fallback: Try netstat -e if PowerShell fails
        if (network.rx_bytes === 0 && network.tx_bytes === 0) {
          exec('netstat -e', { windowsHide: true, timeout: 5000 }, (err2, stdout2) => {
            if (!err2 && stdout2) {
              const lines = stdout2.split('\n');
              for (const line of lines) {
                if (line.toLowerCase().includes('bytes')) {
                  const parts = line.trim().split(/\s+/);
                  if (parts.length >= 3) {
                    network.rx_bytes = parseInt(parts[1]) || 0;
                    network.tx_bytes = parseInt(parts[2]) || 0;
                  }
                  break;
                }
              }
            }
            checkDone();
          });
        } else {
          checkDone();
        }
      });
    } else {
      // Linux: Use shell commands
      const loadAvg = os.loadavg();
      const cpuPercent = Math.min(100, ((loadAvg[0] / cpuCores) * 100)).toFixed(1);

      const linuxCmd = `
        df -h -T 2>/dev/null | grep -E '^/dev/' | awk '{print $1","$2","$3","$4","$5","$6","$7}';
        echo "---NETWORK---";
        cat /proc/net/dev 2>/dev/null | grep -E '(eth|enp|wlan|ens|wlp)' | head -2
      `;

      exec(linuxCmd, { windowsHide: true }, (error, stdout) => {
        let disks = [];
        let network = { rx_bytes: 0, tx_bytes: 0 };

        if (!error && stdout) {
          const parts = stdout.split('---NETWORK---');
          const diskLines = parts[0].trim().split('\n').filter(l => l);
          const netLines = parts[1] ? parts[1].trim().split('\n').filter(l => l) : [];

          // Parse disks
          diskLines.forEach(line => {
            const cols = line.split(',');
            if (cols.length >= 6) {
              disks.push({
                device: cols[0],
                type: cols[1],
                total: cols[2],
                used: cols[3],
                free: cols[4],
                percent: cols[5],
                mount: cols[6] || cols[5]
              });
            }
          });

          // Parse network
          netLines.forEach(line => {
            const match = line.match(/^\s*(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
            if (match) {
              network.rx_bytes += parseInt(match[2]) || 0;
              network.tx_bytes += parseInt(match[3]) || 0;
            }
          });
        }

        sendResponse(cpuPercent, disks, network);
      });
    }

    function sendResponse(cpuPercent, disks, network) {
      res.json({
        ok: true,
        stats: {
          hostname,
          cpu: {
            model: cpuModel,
            cores: cpuCores,
            loadAvg: os.loadavg(),
            percent: cpuPercent
          },
          memory: {
            total: formatBytes(totalMem),
            used: formatBytes(usedMem),
            free: formatBytes(freeMem),
            percent: memPercent,
            totalBytes: totalMem,
            usedBytes: usedMem
          },
          disks: disks.length > 0 ? disks : [{
            device: 'N/A',
            total: 'N/A',
            used: 'N/A',
            free: 'N/A',
            percent: '0%',
            mount: '/'
          }],
          network: {
            rx_bytes: network.rx_bytes,
            tx_bytes: network.tx_bytes
          },
          uptime: Math.floor(uptime / 86400) + 'd ' + Math.floor((uptime % 86400) / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm',
          uptimeSeconds: uptime
        }
      });
    }
  } catch (err) {
    console.error("[MONITOR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PM2 processes list with real-time metrics
router.get("/api/monitor/pm2", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { exec } = require("child_process");
    const isWindows = process.platform === 'win32';

    exec("pm2 jlist", { windowsHide: true, timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        console.log("[PM2] jlist error:", error.message);
        return res.json({ ok: true, processes: [] });
      }
      try {
        const processes = JSON.parse(stdout);

        // Build the simplified list
        const simplified = processes.map(p => {
          let cpu = 0;
          let memory = 0;

          if (p.monit) {
            cpu = typeof p.monit.cpu === 'number' ? p.monit.cpu : 0;
            memory = typeof p.monit.memory === 'number' ? p.monit.memory : 0;
          }

          return {
            name: p.name,
            pm_id: p.pm_id,
            status: p.pm2_env?.status || 'unknown',
            cpu: cpu,
            memory: memory,
            uptime: p.pm2_env?.pm_uptime || 0,
            restarts: p.pm2_env?.restart_time || 0,
            pid: p.pid || 0
          };
        });

        // On Windows, get CPU usage using PowerShell (more reliable)
        if (isWindows && simplified.some(p => p.pid > 0)) {
          const pids = simplified.filter(p => p.pid > 0).map(p => p.pid);
          const psScript = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,CPU | ConvertTo-Json -Compress`;

          exec(`powershell -NoProfile -Command "${psScript}"`, { windowsHide: true, timeout: 5000 }, (err2, stdout2) => {
            if (!err2 && stdout2) {
              try {
                let procData = JSON.parse(stdout2.trim());
                if (!Array.isArray(procData)) procData = [procData];

                procData.forEach(pd => {
                  if (pd && pd.Id) {
                    const proc = simplified.find(p => p.pid === pd.Id);
                    if (proc) {
                      // CPU is total processor time, convert to rough percentage
                      const cpuTime = pd.CPU || 0;
                      // Use a simple indicator based on CPU time change
                      proc.cpu = cpuTime > 0 ? Math.min(100, cpuTime / 10).toFixed(1) : 0;
                    }
                  }
                });
              } catch (e) {
                // Ignore parse errors
              }
            }
            res.json({ ok: true, processes: simplified });
          });
        } else {
          res.json({ ok: true, processes: simplified });
        }
      } catch (parseErr) {
        console.log("[PM2] parse error:", parseErr.message);
        res.json({ ok: true, processes: [] });
      }
    });
  } catch (err) {
    console.error("[MONITOR PM2]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Client Portal (Client role) ──

// Portal page
router.get("/portal", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "portal.html"));
});

// Change password page
router.get("/change-password", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "change-password.html"));
});

// Change password action
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.session.user.id;

    // Get current user
    const [[user]] = await db.execute("SELECT password_hash FROM admin_users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

    // Verify current password
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'Contraseña actual incorrecta' });
    }

    // Hash and update new password
    const password_hash = await bcrypt.hash(new_password, 10);
    await db.execute("UPDATE admin_users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [password_hash, userId]);

    // Update session
    req.session.user.must_change_password = 0;

    res.json({ ok: true });
  } catch (err) {
    console.error("[CHANGE PASSWORD]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Tickets V2 API is handled by routes/tickets.js ──
// Mounted alongside admin.js in server.js

// Support dashboard page
router.get("/support", requireAuth, requireRole(['admin', 'support']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "support-dashboard.html"));
});

// ── Session info API ──
router.get("/api/session", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      name: req.session.user.name || req.session.user.username,
      email: req.session.user.email,
      role: req.session.user.role,
      must_change_password: req.session.user.must_change_password || 0
    }
  });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.sendFile("logout.html", { root: "./views/admin" });
  });
});

// ── Technologies API (Admin) ──

// Tech admin page
router.get("/tech-admin", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "tech-admin.html"));
});

// List all technologies
router.get("/api/technologies", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM technologies ORDER BY category ASC, sort_order ASC, name ASC");
    res.json({ ok: true, technologies: rows });
  } catch (err) {
    // If table doesn't exist, return empty array
    console.error("[TECHNOLOGIES]", err);
    res.json({ ok: true, technologies: [] });
  }
});

// Create technology
router.post("/api/technologies", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, slug, icon_url, category, sort_order } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'name required' });

    const techSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    await db.execute(`
      INSERT INTO technologies (name, slug, icon_url, category, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [name, techSlug, icon_url || null, category || 'tools', sort_order || 0]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[TECHNOLOGIES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update technology
router.post("/api/technologies/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, slug, icon_url, category, sort_order, is_active } = req.body;

    // Generate slug from name if not provided
    const techSlug = slug || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null);

    await db.execute(`
      UPDATE technologies SET name = ?, slug = ?, icon_url = ?, category = ?, sort_order = ?, is_active = ?
      WHERE id = ?
    `, [name || null, techSlug, icon_url || null, category || 'tools', sort_order || 0, is_active !== false ? 1 : 0, req.params.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[TECHNOLOGIES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete technology
router.post("/api/technologies/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    // First check if used in any projects
    const [[countResult]] = await db.execute(
      "SELECT COUNT(*) as count FROM project_technologies WHERE tech_name = (SELECT name FROM technologies WHERE id = ?)",
      [req.params.id]
    );

    if (countResult?.count > 0 && !req.body.force) {
      return res.json({ ok: false, error: 'in_use', projectCount: countResult.count });
    }

    await db.execute("DELETE FROM technologies WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TECHNOLOGIES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Activate all technologies (fix for existing records)
router.post("/api/technologies/activate-all", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const [result] = await db.execute("UPDATE technologies SET is_active = 1 WHERE is_active IS NULL OR is_active = 0");
    res.json({ ok: true, updated: result.affectedRows || 0 });
  } catch (err) {
    console.error("[TECHNOLOGIES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
