const router = require("express").Router();
const path = require("path");

// Landing (opcional). En realidad express.static ya sirve index.html,
// pero esto ayuda si quieres rutas explícitas.
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

module.exports = router;
