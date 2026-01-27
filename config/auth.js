// config/auth.js
// Configuración centralizada de autenticación
// (pensado para crecer a futuro: roles, 2FA, etc.)

module.exports = {
  session: {
    httpOnly: true,
    sameSite: "lax",
    // secure: true // activar solo cuando tengas HTTPS real
  },
  login: {
    maxAttempts: 10,
    windowMinutes: 5
  }
};
