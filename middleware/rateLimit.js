const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiados intentos. Intenta más tarde."
});
