const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const multer = require("multer");
const { prisma } = require("../lib/prisma");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const rateLimit = require("../middleware/rateLimit");
const emailService = require("../services/emailService");

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
    user = await prisma.adminUser.findFirst({
      where: {
        OR: [
          { username },
          { email: username }
        ]
      }
    });
  } catch (err) {
    console.error("[LOGIN ERROR] Database connection failed:", err.message);
    return res.redirect(process.env.ADMIN_PATH + "/login?error=database");
  }

  if (!user) {
    console.log("[LOGIN FAIL] user not found");
    return res.redirect(process.env.ADMIN_PATH + "/login?error=invalid");
  }

  // Block clients from admin login - redirect to portal
  if (user.role === 'client') {
    console.log("[LOGIN FAIL] client tried admin login, redirecting to portal");
    return res.redirect(process.env.ADMIN_PATH + "/portal-login?error=use_portal");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
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
    role: user.role || 'admin',
    must_change_password: user.mustChangePassword || false,
    pm2_access: user.pm2Access || false
  };
  console.log("[LOGIN OK]", username, "name:", user.name || username, "role:", user.role);

  // Check if user needs to change password
  if (user.mustChangePassword) {
    return res.redirect(process.env.ADMIN_PATH + "/change-password");
  }

  res.redirect(process.env.ADMIN_PATH + "/dashboard");
});

// ── Portal Login (Client Only) ──

// Portal login page
router.get("/portal-login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "portal-login.html"));
});

// Alias: /portal redirects to portal-login if not authenticated
router.get("/portal", (req, res, next) => {
  if (req.session.user) {
    // If authenticated, check role
    if (req.session.user.role !== 'client') {
      return res.redirect(process.env.ADMIN_PATH + "/dashboard");
    }
    // Serve portal page
    return res.sendFile(path.join(__dirname, "..", "views", "admin", "portal.html"));
  }
  // Not authenticated, redirect to portal login
  res.redirect(process.env.ADMIN_PATH + "/portal-login");
});

// Portal login action (only accepts clients)
router.post("/portal-login", rateLimit, async (req, res) => {
  const { username, password } = req.body;

  let user;
  try {
    user = await prisma.adminUser.findFirst({
      where: {
        OR: [
          { username },
          { email: username }
        ]
      }
    });
  } catch (err) {
    console.error("[PORTAL LOGIN ERROR] Database connection failed:", err.message);
    return res.redirect(process.env.ADMIN_PATH + "/portal-login?error=database");
  }

  if (!user) {
    console.log("[PORTAL LOGIN FAIL] user not found");
    return res.redirect(process.env.ADMIN_PATH + "/portal-login?error=invalid");
  }

  // Check if user is a client
  if (user.role !== 'client') {
    console.log("[PORTAL LOGIN FAIL] user is not a client:", user.role);
    return res.redirect(process.env.ADMIN_PATH + "/portal-login?error=access_denied");
  }

  // Check if user is active
  if (!user.isActive) {
    console.log("[PORTAL LOGIN FAIL] user is inactive");
    return res.redirect(process.env.ADMIN_PATH + "/portal-login?error=inactive");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    console.log("[PORTAL LOGIN FAIL] wrong password");
    return res.redirect(process.env.ADMIN_PATH + "/portal-login?error=invalid");
  }

  // Store user info in session
  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    email: user.email,
    role: user.role,
    must_change_password: user.mustChangePassword || false,
    pm2_access: false
  };
  console.log("[PORTAL LOGIN OK]", username, "name:", user.name || username);

  // Check if user needs to change password
  if (user.mustChangePassword) {
    return res.redirect(process.env.ADMIN_PATH + "/change-password");
  }

  res.redirect(process.env.ADMIN_PATH + "/portal");
});

// Password Recovery API (only for clients)
router.post("/api/password-recovery", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ ok: false, error: "Email es requerido" });
  }

  try {
    // Check rate limiting (max 3 attempts per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let resetAttempt = await prisma.passwordResetAttempt.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (resetAttempt) {
      // Check if last attempt was within the hour
      if (resetAttempt.lastAttemptAt > oneHourAgo) {
        if (resetAttempt.attempts >= 3) {
          console.log("[PASSWORD RECOVERY] Rate limited:", email);
          // Return generic message for security (don't reveal rate limiting)
          return res.json({ ok: true });
        }
        // Increment attempts
        await prisma.passwordResetAttempt.update({
          where: { email: email.toLowerCase() },
          data: {
            attempts: resetAttempt.attempts + 1,
            lastAttemptAt: new Date()
          }
        });
      } else {
        // Reset counter (more than 1 hour passed)
        await prisma.passwordResetAttempt.update({
          where: { email: email.toLowerCase() },
          data: {
            attempts: 1,
            lastAttemptAt: new Date()
          }
        });
      }
    } else {
      // Create new attempt record
      await prisma.passwordResetAttempt.create({
        data: {
          email: email.toLowerCase(),
          attempts: 1,
          lastAttemptAt: new Date()
        }
      });
    }

    // Find user by email (only clients)
    const user = await prisma.adminUser.findFirst({
      where: {
        email: email.toLowerCase(),
        role: 'client'
      }
    });

    if (!user) {
      console.log("[PASSWORD RECOVERY] User not found or not client:", email);
      // Return generic message for security
      return res.json({ ok: true });
    }

    // Generate random password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let newPassword = 'Cerb_';
    for (let i = 0; i < 8; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Hash and update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true
      }
    });

    // Send email with new password
    const loginUrl = `${process.env.SITE_URL || 'https://cerberusdev.lat'}${process.env.ADMIN_PATH}/portal-login`;

    await emailService.sendEmail('password-recovery', user.email, {
      name: user.name || user.username,
      username: user.username,
      password: newPassword,
      loginUrl
    });

    console.log("[PASSWORD RECOVERY] Sent new password to:", email);
    return res.json({ ok: true });

  } catch (err) {
    console.error("[PASSWORD RECOVERY ERROR]", err);
    return res.json({ ok: false, error: "Error al procesar la solicitud" });
  }
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
    const posts = await prisma.blogPost.findMany({
      include: {
        category: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to snake_case for frontend compatibility
    const rows = posts.map(p => ({
      ...p,
      image_url: p.imageUrl,
      is_published: p.isPublished,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      category_id: p.categoryId,
      title_en: p.titleEn,
      excerpt_en: p.excerptEn,
      content_en: p.contentEn,
      category_name: p.category?.name || null
    }));

    res.json({ ok: true, posts: rows });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.json({ ok: true, posts: [] });
  }
});

// List categories
router.get("/api/blog/categories", requireAuth, async (req, res) => {
  try {
    const categories = await prisma.blogCategory.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ ok: true, categories });
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
      await prisma.blogPost.update({
        where: { id: Number(id) },
        data: {
          title,
          titleEn: title_en || null,
          slug: postSlug,
          excerpt: excerpt || null,
          excerptEn: excerpt_en || null,
          content: content || "",
          contentEn: content_en || "",
          categoryId: category_id ? Number(category_id) : null,
          imageUrl: image_url || null,
          isPublished: is_published ? true : false
        }
      });
    } else {
      await prisma.blogPost.create({
        data: {
          title,
          titleEn: title_en || null,
          slug: postSlug,
          excerpt: excerpt || null,
          excerptEn: excerpt_en || null,
          content: content || "",
          contentEn: content_en || "",
          categoryId: category_id ? Number(category_id) : null,
          imageUrl: image_url || null,
          isPublished: is_published ? true : false
        }
      });
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
    const postId = Number(req.params.id);

    // Get post to find images
    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
      select: { imageUrl: true, content: true }
    });

    if (post) {
      // Delete cover image if exists
      if (post.imageUrl && post.imageUrl.startsWith("/uploads/")) {
        const coverPath = path.join(__dirname, "..", "public", post.imageUrl);
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
    await prisma.blogComment.deleteMany({ where: { postId } });
    await prisma.blogPost.delete({ where: { id: postId } });

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
    await prisma.blogCategory.create({
      data: { name, slug }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete category
router.post("/api/blog/categories/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const catId = Number(req.params.id);

    // Check if category has posts
    const postCount = await prisma.blogPost.count({
      where: { categoryId: catId }
    });

    if (postCount > 0 && !req.body.force) {
      return res.json({ ok: false, error: 'has_posts', postCount });
    }

    // If force delete or no posts, remove category (posts will have NULL category)
    if (postCount > 0) {
      await prisma.blogPost.updateMany({
        where: { categoryId: catId },
        data: { categoryId: null }
      });
    }
    await prisma.blogCategory.delete({ where: { id: catId } });

    res.json({ ok: true });
  } catch (err) {
    console.error("[BLOG ADMIN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Notifications API ──

router.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const notifications = await prisma.adminNotification.findMany({
      where: {
        OR: [
          { userId: null },
          { userId }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ ok: true, notifications });
  } catch (err) {
    console.error("[NOTIF]", err);
    res.json({ ok: true, notifications: [] });
  }
});

router.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await prisma.adminNotification.updateMany({
      where: {
        isRead: false,
        OR: [
          { userId: null },
          { userId }
        ]
      },
      data: { isRead: true }
    });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

// Delete a notification
router.post("/api/notifications/:id/delete", requireAuth, async (req, res) => {
  try {
    await prisma.adminNotification.delete({
      where: { id: Number(req.params.id) }
    });
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

    const where = {};
    if (post_id) {
      where.postId = Number(post_id);
    }

    const comments = await prisma.blogComment.findMany({
      where,
      include: {
        post: {
          select: { title: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform for frontend
    const rows = comments.map(c => ({
      ...c,
      post_title: c.post?.title || null
    }));

    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("[COMMENTS]", err);
    res.json({ ok: true, comments: [] });
  }
});

router.post("/api/blog/comments/:id/approve", requireAuth, async (req, res) => {
  try {
    const { approved } = req.body;
    await prisma.blogComment.update({
      where: { id: Number(req.params.id) },
      data: {
        isApproved: approved ? true : false,
        isRead: true
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/api/blog/comments/:id/delete", requireAuth, async (req, res) => {
  try {
    await prisma.blogComment.delete({
      where: { id: Number(req.params.id) }
    });
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
    const projects = await prisma.project.findMany({
      include: {
        technologies: {
          select: { id: true, techName: true, techIcon: true }
        },
        images: {
          select: { id: true, imageUrl: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to snake_case for frontend compatibility
    const rows = projects.map(p => ({
      ...p,
      image_url: p.imageUrl,
      is_published: p.isPublished,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      title_en: p.titleEn,
      tag_en: p.tagEn,
      description_en: p.descriptionEn,
      content_en: p.contentEn,
      technologies: p.technologies.map(t => ({
        id: t.id,
        tech_name: t.techName,
        tech_icon: t.techIcon
      })),
      images: p.images.map(i => ({
        id: i.id,
        image_url: i.imageUrl,
        sort_order: i.sortOrder
      }))
    }));

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

    let projectId = id ? Number(id) : null;

    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          title,
          titleEn: title_en || null,
          slug: projSlug,
          tag: tag || null,
          tagEn: tag_en || null,
          description: description || null,
          descriptionEn: description_en || null,
          content: content || "",
          contentEn: content_en || "",
          imageUrl: image_url || null,
          date: date ? new Date(date) : null,
          isPublished: is_published ? true : false
        }
      });

      // Update technologies: delete old, insert new
      await prisma.projectTechnology.deleteMany({ where: { projectId } });
      if (technologies && technologies.length > 0) {
        for (const t of technologies) {
          await prisma.projectTechnology.create({
            data: {
              projectId,
              techName: t.tech_name,
              techIcon: t.tech_icon
            }
          });
        }
      }

      // Update images: delete old, insert new
      await prisma.projectImage.deleteMany({ where: { projectId } });
    } else {
      const project = await prisma.project.create({
        data: {
          title,
          titleEn: title_en || null,
          slug: projSlug,
          tag: tag || null,
          tagEn: tag_en || null,
          description: description || null,
          descriptionEn: description_en || null,
          content: content || "",
          contentEn: content_en || "",
          imageUrl: image_url || null,
          date: date ? new Date(date) : null,
          isPublished: is_published ? true : false
        }
      });

      projectId = project.id;
      if (technologies && technologies.length > 0) {
        for (const t of technologies) {
          await prisma.projectTechnology.create({
            data: {
              projectId,
              techName: t.tech_name,
              techIcon: t.tech_icon
            }
          });
        }
      }
    }

    // Insert images
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        await prisma.projectImage.create({
          data: {
            projectId,
            imageUrl: images[i].url,
            sortOrder: i
          }
        });
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
    const projectId = Number(req.params.id);

    // Get project to find main image
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { imageUrl: true, content: true }
    });

    if (project) {
      // Delete main image if exists
      if (project.imageUrl && project.imageUrl.startsWith("/uploads/")) {
        const mainPath = path.join(__dirname, "..", "public", project.imageUrl);
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
    const galleryImages = await prisma.projectImage.findMany({
      where: { projectId },
      select: { imageUrl: true }
    });
    for (const img of galleryImages) {
      if (img.imageUrl && img.imageUrl.startsWith("/uploads/")) {
        const imgPath = path.join(__dirname, "..", "public", img.imageUrl);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
    }

    // Delete related records first (foreign keys)
    await prisma.projectTechnology.deleteMany({ where: { projectId } });
    await prisma.projectImage.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });

    res.json({ ok: true });
  } catch (err) {
    console.error("[PROJECTS ADMIN]", err);
    res.status(500).json({ ok: false });
  }
});

// ── Leads API ──

// API – list leads
router.get("/api/leads", requireAuth, async (req, res) => {
  const leads = await prisma.lead.findMany({
    orderBy: [
      { isImportant: 'desc' },
      { createdAt: 'desc' }
    ]
  });
  res.json({ ok: true, leads });
});

// API – single lead
router.get("/api/leads/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const lead = await prisma.lead.findUnique({
    where: { id: Number(id) }
  });
  if (!lead) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, lead });
});

// API – summary
router.get("/api/summary", requireAuth, async (req, res) => {
  const [newCount, repliedCount, closedCount] = await Promise.all([
    prisma.lead.count({ where: { status: 'new' } }),
    prisma.lead.count({ where: { status: 'replied' } }),
    prisma.lead.count({ where: { status: 'closed' } })
  ]);

  res.json({
    ok: true,
    summary: {
      new: newCount,
      replied: repliedCount,
      closed: closedCount
    }
  });
});

// Toggle important
router.post("/api/leads/:id/important", requireAuth, async (req, res) => {
  const { id } = req.params;
  const lead = await prisma.lead.findUnique({
    where: { id: Number(id) },
    select: { isImportant: true }
  });

  await prisma.lead.update({
    where: { id: Number(id) },
    data: { isImportant: !lead?.isImportant }
  });

  res.json({ ok: true });
});

// Update status
router.post("/api/leads/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["new", "replied", "closed"].includes(status)) {
    return res.status(400).json({ ok: false, error: "bad_status" });
  }

  await prisma.lead.update({
    where: { id: Number(id) },
    data: { status }
  });
  res.json({ ok: true });
});

// Save notes
router.post("/api/leads/:id/notes", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  await prisma.lead.update({
    where: { id: Number(id) },
    data: { internalNotes: notes || null }
  });
  res.json({ ok: true });
});

// Delete lead (permanent)
router.post("/api/leads/:id/delete", requireAuth, async (req, res) => {
  const { id } = req.params;
  await prisma.lead.delete({
    where: { id: Number(id) }
  });
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
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        fullName: true,
        email: true,
        role: true,
        mustChangePassword: true,
        company: true,
        phone: true,
        pm2Access: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform for frontend compatibility
    const rows = users.map(u => ({
      ...u,
      full_name: u.fullName,
      must_change_password: u.mustChangePassword,
      pm2_access: u.pm2Access,
      created_at: u.createdAt,
      updated_at: u.updatedAt
    }));

    res.json({ ok: true, users: rows });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single user
router.get("/api/users/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const user = await prisma.adminUser.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!user) return res.status(404).json({ ok: false, error: 'not_found' });

    res.json({
      ok: true,
      user: {
        ...user,
        must_change_password: user.mustChangePassword,
        created_at: user.createdAt,
        updated_at: user.updatedAt
      }
    });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create user
router.post("/api/users", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { username, name, email, password, role, must_change_password, company, phone, pm2_access } = req.body;
    const userRole = role || 'client';

    if (!username) {
      return res.status(400).json({ ok: false, error: 'username required' });
    }

    // For clients: auto-generate password if not provided
    // For admin/support: password is required
    let userPassword = password;
    let forceChangePassword = must_change_password ? true : false;

    if (userRole === 'client') {
      if (!userPassword) {
        // Generate random secure password for client
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        userPassword = 'Cerb_';
        for (let i = 0; i < 8; i++) {
          userPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }
      // Always force password change for clients
      forceChangePassword = true;
    } else if (!userPassword) {
      return res.status(400).json({ ok: false, error: 'password required for admin/support users' });
    }

    // Check if username or email already exists
    const existing = await prisma.adminUser.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : [])
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(userPassword, 10);
    const user = await prisma.adminUser.create({
      data: {
        username,
        name: name || null,
        fullName: name || null,
        email: email || null,
        passwordHash,
        role: userRole,
        mustChangePassword: forceChangePassword,
        company: company || null,
        phone: phone || null,
        pm2Access: (userRole === 'support' && pm2_access) ? true : false
      }
    });

    // Send welcome email if user has email and is a client
    if (email && userRole === 'client') {
      const loginUrl = `${req.protocol}://${req.get('host')}${process.env.ADMIN_PATH}/portal-login`;
      try {
        await emailService.sendEmail('user-created', email, {
          name: name || username,
          username: username,
          password: userPassword, // Plain password before hashing
          loginUrl: loginUrl
        });
        console.log(`[Users] Welcome email sent to ${email}`);
      } catch (emailErr) {
        console.error(`[Users] Failed to send welcome email to ${email}:`, emailErr.message);
        // Don't fail user creation if email fails
      }
    }

    res.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update user
router.post("/api/users/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { username, name, email, password, role, must_change_password, company, phone, pm2_access } = req.body;
    const userId = Number(req.params.id);
    const pm2Val = (role === 'support' && pm2_access) ? true : false;

    // Check if username/email exists for another user
    const existing = await prisma.adminUser.findFirst({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [
              { username },
              ...(email ? [{ email }] : [])
            ]
          }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'username or email already exists' });
    }

    const data = {
      username,
      name: name || null,
      fullName: name || null,
      email: email || null,
      role: role || 'client',
      mustChangePassword: must_change_password ? true : false,
      company: company || null,
      phone: phone || null,
      pm2Access: pm2Val
    };

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    await prisma.adminUser.update({
      where: { id: userId },
      data
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete user
router.post("/api/users/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const userId = Number(req.params.id);

    // Prevent deleting self
    if (req.session.user.id === userId) {
      return res.status(400).json({ ok: false, error: 'cannot delete yourself' });
    }

    await prisma.adminUser.delete({
      where: { id: userId }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[USERS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Services Management API (Admin/Support) ──

// Services admin page (support needs pm2_access)
router.get("/services", requireAuth, requireRole(['admin', 'support']), (req, res) => {
  if (req.session.user.role === 'support' && !req.session.user.pm2_access) {
    return res.redirect(process.env.ADMIN_PATH + "/dashboard");
  }
  res.sendFile(path.join(__dirname, "..", "views", "admin", "services.html"));
});

// List all services (with real-time PM2 status) - support needs pm2_access
router.get("/api/services", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  if (req.session.user.role === 'support' && !req.session.user.pm2_access) {
    return res.status(403).json({ ok: false, error: 'No PM2 access' });
  }
  try {
    const services = await prisma.service.findMany({
      include: {
        user: {
          select: { username: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Transform for frontend
    const rows = services.map(s => ({
      ...s,
      owner_name: s.user?.username || null
    }));

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
      const result = rows.map(s => ({
        ...s,
        status: pm2Status[s.pm2Name] || pm2Status[s.pm2Name?.toLowerCase()] || 'unknown'
      }));

      res.json({ ok: true, services: result });
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

    const service = await prisma.service.create({
      data: {
        name,
        pm2Name: pm2_name,
        description: description || null,
        userId: user_id ? Number(user_id) : null,
        port: port ? Number(port) : null
      }
    });

    res.json({ ok: true, serviceId: service.id });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update service
router.post("/api/services/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, pm2_name, description, user_id, port } = req.body;

    await prisma.service.update({
      where: { id: Number(req.params.id) },
      data: {
        name,
        pm2Name: pm2_name,
        description: description || null,
        userId: user_id ? Number(user_id) : null,
        port: port ? Number(port) : null
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete service
router.post("/api/services/:id/delete", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    await prisma.service.delete({
      where: { id: Number(req.params.id) }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PM2 control endpoints (support needs pm2_access for restart/start)
router.post("/api/services/:id/restart", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  if (req.session.user.role === 'support' && !req.session.user.pm2_access) {
    return res.status(403).json({ ok: false, error: 'No PM2 access' });
  }
  try {
    const service = await prisma.service.findUnique({
      where: { id: Number(req.params.id) },
      select: { pm2Name: true }
    });
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const { exec } = require("child_process");
    exec(`pm2 restart ${service.pm2Name}`, { windowsHide: true }, (error, stdout, stderr) => {
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
    const service = await prisma.service.findUnique({
      where: { id: Number(req.params.id) },
      select: { pm2Name: true }
    });
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const { exec } = require("child_process");
    exec(`pm2 stop ${service.pm2Name}`, { windowsHide: true }, (error, stdout, stderr) => {
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
  if (req.session.user.role === 'support' && !req.session.user.pm2_access) {
    return res.status(403).json({ ok: false, error: 'No PM2 access' });
  }
  try {
    const service = await prisma.service.findUnique({
      where: { id: Number(req.params.id) },
      select: { pm2Name: true }
    });
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const { exec } = require("child_process");
    exec(`pm2 start ${service.pm2Name}`, { windowsHide: true }, (error, stdout, stderr) => {
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

// Get PM2 logs for a service (support needs pm2_access)
router.get("/api/services/:id/logs", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  if (req.session.user.role === 'support' && !req.session.user.pm2_access) {
    return res.status(403).json({ ok: false, error: 'No PM2 access' });
  }
  try {
    const service = await prisma.service.findUnique({
      where: { id: Number(req.params.id) },
      select: { pm2Name: true }
    });
    if (!service) return res.status(404).json({ ok: false, error: 'not_found' });

    const lines = req.query.lines || 50;
    const { exec } = require("child_process");
    exec(`pm2 logs ${service.pm2Name} --lines ${lines} --nostream`, { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => {
      res.json({ ok: true, logs: stdout + stderr });
    });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Monitor API (Admin/Support) ──

// Monitor page - redirect to unified services page
router.get("/monitor", requireAuth, requireRole(['admin', 'support']), (req, res) => {
  res.redirect(process.env.ADMIN_PATH + "/services");
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
    const user = await prisma.adminUser.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

    // Verify current password
    const ok = await bcrypt.compare(current_password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'Contraseña actual incorrecta' });
    }

    // Hash and update new password
    const passwordHash = await bcrypt.hash(new_password, 10);
    await prisma.adminUser.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false
      }
    });

    // Update session
    req.session.user.must_change_password = false;

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
      must_change_password: req.session.user.must_change_password || false,
      pm2_access: req.session.user.pm2_access || false
    }
  });
});

// Logout
router.get("/logout", (req, res) => {
  // Capture user role before destroying session
  const userRole = req.session.user?.role || 'admin';
  req.session.destroy(() => {
    // Redirect with role parameter
    res.redirect(process.env.ADMIN_PATH + `/logout-page?role=${userRole}`);
  });
});

// Logout page (serves the animation page)
router.get("/logout-page", (req, res) => {
  res.sendFile("logout.html", { root: "./views/admin" });
});

// ── Technologies API (Admin) ──

// Tech admin page
router.get("/tech-admin", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "tech-admin.html"));
});

// List all technologies
router.get("/api/technologies", async (req, res) => {
  try {
    const technologies = await prisma.technology.findMany({
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    // Transform to snake_case for frontend compatibility
    const rows = technologies.map(t => ({
      ...t,
      icon_url: t.iconUrl,
      sort_order: t.sortOrder,
      is_active: t.isActive,
      created_at: t.createdAt
    }));

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

    await prisma.technology.create({
      data: {
        name,
        slug: techSlug,
        iconUrl: icon_url || null,
        category: category || 'tools',
        sortOrder: sort_order || 0,
        isActive: true
      }
    });

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

    await prisma.technology.update({
      where: { id: Number(req.params.id) },
      data: {
        name: name || null,
        slug: techSlug,
        iconUrl: icon_url || null,
        category: category || 'tools',
        sortOrder: sort_order || 0,
        isActive: is_active !== false
      }
    });

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
    const tech = await prisma.technology.findUnique({
      where: { id: Number(req.params.id) },
      select: { name: true }
    });

    if (tech) {
      const projectCount = await prisma.projectTechnology.count({
        where: { techName: tech.name }
      });

      if (projectCount > 0 && !req.body.force) {
        return res.json({ ok: false, error: 'in_use', projectCount });
      }
    }

    await prisma.technology.delete({
      where: { id: Number(req.params.id) }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[TECHNOLOGIES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Activate all technologies (fix for existing records)
router.post("/api/technologies/activate-all", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const result = await prisma.technology.updateMany({
      where: {
        OR: [
          { isActive: null },
          { isActive: false }
        ]
      },
      data: { isActive: true }
    });
    res.json({ ok: true, updated: result.count || 0 });
  } catch (err) {
    console.error("[TECHNOLOGIES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
