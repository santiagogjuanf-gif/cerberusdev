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
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
}));

// Web pública
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// Contacto
app.use("/api/contact", require("./routes/contact"));

app.get(process.env.ADMIN_PATH, (req, res) => {
  return res.redirect(process.env.ADMIN_PATH + "/");
});

// Panel privado
app.use(process.env.ADMIN_PATH, require("./routes/admin"));

// Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
  console.log(`🔒 Admin panel: http://localhost:${PORT}${process.env.ADMIN_PATH}/login`);

});
