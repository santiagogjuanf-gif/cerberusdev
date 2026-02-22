const router = require("express").Router();
const path = require("path");
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
      role: req.session.user.role
    }
  });
});

// API: Get client's services
router.get("/api/services", requireClientAuth, async (req, res) => {
  try {
    const services = await prisma.clientService.findMany({
      where: { clientId: req.session.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ ok: true, services });
  } catch (err) {
    console.error("[CLIENT SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Get client's tickets
router.get("/api/tickets", requireClientAuth, async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { clientId: req.session.user.id },
      include: {
        service: { select: { serviceName: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ ok: true, tickets });
  } catch (err) {
    console.error("[CLIENT TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
