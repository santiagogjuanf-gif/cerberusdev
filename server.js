require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

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

// Admin redirect (exact match)
app.get(process.env.ADMIN_PATH, (req, res) => {
  return res.redirect(process.env.ADMIN_PATH + "/");
});

// Admin panel
app.use(process.env.ADMIN_PATH, require("./routes/admin"));

// Fallback – only serve index.html for "page" requests (not assets/api/partials)
app.get("*", (req, res) => {
  // Don't serve index.html for partial, asset, api, or upload requests
  if (
    req.path.startsWith("/partials/") ||
    req.path.startsWith("/assets/") ||
    req.path.startsWith("/api/") ||
    req.path.startsWith("/uploads/") ||
    req.path.match(/\.\w{2,5}$/)
  ) {
    return res.status(404).json({ error: "not_found" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}${process.env.ADMIN_PATH}/login`);
});
