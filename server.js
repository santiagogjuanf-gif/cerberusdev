require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 4000;

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
}));

// Static files: public site + uploaded content
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

// Public API – Contact
app.use("/api/contact", require("./routes/contact"));

// Public API – Blog
app.use("/api/blog", require("./routes/blog"));

// Public API – Projects
app.use("/api/projects", require("./routes/projects"));

// Public API – Technologies (for tecnologias.html)
app.get("/api/technologies", async (req, res) => {
  try {
    const db = require("./config/db");
    const [rows] = await db.execute("SELECT * FROM technologies WHERE is_active = 1 ORDER BY category ASC, sort_order ASC, name ASC");
    res.json({ ok: true, technologies: rows });
  } catch (err) {
    console.error("[TECHNOLOGIES PUBLIC]", err);
    res.json({ ok: true, technologies: [] });
  }
});

// Admin panel (only if ADMIN_PATH is configured)
const ADMIN_PATH = process.env.ADMIN_PATH;
if (ADMIN_PATH) {
  app.get(ADMIN_PATH, (req, res) => {
    return res.redirect(ADMIN_PATH + "/");
  });
  app.use(ADMIN_PATH, require("./routes/admin"));
}

// Fallback – serve the matching HTML page or index.html for clean URLs
app.get("*", (req, res) => {
  // Don't serve pages for partial, asset, api, or upload requests
  if (
    req.path.startsWith("/partials/") ||
    req.path.startsWith("/assets/") ||
    req.path.startsWith("/api/") ||
    req.path.startsWith("/uploads/") ||
    req.path.match(/\.\w{2,5}$/)
  ) {
    return res.status(404).json({ error: "not_found" });
  }

  // Blog post detail: /blog/some-slug -> blog-post.html
  if (/^\/blog\/.+/.test(req.path)) {
    return res.sendFile(path.join(__dirname, "public", "blog-post.html"));
  }

  // Project detail: /proyectos/some-slug -> proyecto-detalle.html
  if (/^\/proyectos\/.+/.test(req.path)) {
    return res.sendFile(path.join(__dirname, "public", "proyecto-detalle.html"));
  }

  // Try to serve the specific HTML file first (e.g. /blog -> blog.html)
  const clean = req.path.replace(/^\/+|\/+$/g, "");
  if (clean) {
    const filePath = path.join(__dirname, "public", clean + ".html");
    return res.sendFile(filePath, (err) => {
      if (err) {
        // File doesn't exist, serve index.html as fallback
        res.sendFile(path.join(__dirname, "public", "index.html"));
      }
    });
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  if (ADMIN_PATH) {
    console.log(`Admin panel: http://localhost:${PORT}${ADMIN_PATH}/login`);
  }
});
