require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const session = require("express-session");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware (shared with Socket.IO)
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "fallback-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
});
app.use(sessionMiddleware);

// Socket.IO setup
const ADMIN_PATH = process.env.ADMIN_PATH;
const io = new Server(server, {
  path: (ADMIN_PATH || "") + "/socket.io/",
  cors: { origin: false }
});

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// Socket.IO authentication and events
io.on("connection", (socket) => {
  const session = socket.request.session;
  if (!session || !session.user) {
    socket.disconnect();
    return;
  }

  const user = session.user;

  // Join ticket room
  socket.on("join-ticket", (ticketId) => {
    socket.join(`ticket-${ticketId}`);
  });

  // Leave ticket room
  socket.on("leave-ticket", (ticketId) => {
    socket.leave(`ticket-${ticketId}`);
  });
});

// Make io available to routes
app.set("io", io);

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
    const { prisma } = require("./lib/prisma");
    const technologies = await prisma.technology.findMany({
      where: {
        isActive: true
      },
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
    console.error("[TECHNOLOGIES PUBLIC]", err);
    res.json({ ok: true, technologies: [] });
  }
});

// Admin panel (only if ADMIN_PATH is configured)
if (ADMIN_PATH) {
  app.get(ADMIN_PATH, (req, res) => {
    return res.redirect(ADMIN_PATH + "/");
  });
  app.use(ADMIN_PATH, require("./routes/admin"));
  app.use(ADMIN_PATH, require("./routes/tickets"));
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

server.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  if (ADMIN_PATH) {
    console.log(`Admin panel: http://localhost:${PORT}${ADMIN_PATH}/login`);
  }
});
