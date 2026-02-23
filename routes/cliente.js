const router = require("express").Router();
const path = require("path");
const bcrypt = require("bcrypt");
const { prisma } = require("../lib/prisma");

// Middleware: require client authentication
const requireClientAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/portal-cliente?error=session");
  }
  if (req.session.user.role !== 'client') {
    return res.redirect("/portal-admin");
  }
  next();
};

// Client portal home (redirect to portal page)
router.get("/", requireClientAuth, (req, res) => {
  // Check if user needs to change password
  if (req.session.user.must_change_password) {
    return res.redirect("/cliente/change-password");
  }
  res.sendFile(path.join(__dirname, "..", "views", "admin", "portal.html"));
});

// Change password page
router.get("/change-password", requireClientAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "change-password.html"));
});

// Change password action
router.post("/change-password", requireClientAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.session.user.id;

    const user = await prisma.adminUser.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });
    if (!user) return res.status(404).json({ ok: false, error: 'user not found' });

    const ok = await bcrypt.compare(current_password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'Contraseña actual incorrecta' });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await prisma.adminUser.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false
      }
    });

    req.session.user.must_change_password = false;
    res.json({ ok: true });
  } catch (err) {
    console.error("[CLIENT CHANGE PASSWORD]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/cliente/logout-page?role=client");
  });
});

// Logout page
router.get("/logout-page", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "logout.html"));
});

// API: Get session info
router.get("/api/session", requireClientAuth, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      name: req.session.user.name,
      email: req.session.user.email,
      role: req.session.user.role,
      must_change_password: req.session.user.must_change_password || false
    }
  });
});

// API: Get notifications
router.get("/api/notifications", requireClientAuth, async (req, res) => {
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
    console.error("[CLIENT NOTIF]", err);
    res.json({ ok: true, notifications: [] });
  }
});

// API: Mark all notifications as read
router.post("/api/notifications/read-all", requireClientAuth, async (req, res) => {
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

// API: Delete notification
router.post("/api/notifications/:id/delete", requireClientAuth, async (req, res) => {
  try {
    await prisma.adminNotification.delete({
      where: { id: Number(req.params.id) }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[CLIENT NOTIF DELETE]", err);
    res.status(500).json({ ok: false });
  }
});

// Note: /api/tickets/*, /api/client/services, /api/maintenance/* are handled by
// tickets.js and v4.js mounted alongside this router in server.js

module.exports = router;
