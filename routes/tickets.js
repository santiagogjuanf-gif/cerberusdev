const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

// Multer config for ticket attachments
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "public", "uploads", "tickets");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `ticket-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, name);
  }
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".txt", ".zip"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ============================================
// Client Services API
// ============================================

// Get client's services
router.get("/api/client/services", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;

    let query, params;
    if (role === 'admin' || role === 'support') {
      query = `
        SELECT cs.*, u.username, COALESCE(u.full_name, u.name, u.username) as client_name, u.company
        FROM client_services cs
        LEFT JOIN admin_users u ON cs.client_id = u.id
        ORDER BY cs.created_at DESC
      `;
      params = [];
    } else {
      query = `SELECT * FROM client_services WHERE client_id = ? ORDER BY created_at DESC`;
      params = [userId];
    }

    const [services] = await db.execute(query, params);
    res.json({ ok: true, services });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create service (admin only)
router.post("/api/client/services", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { client_id, service_name, domain, description, service_type, status, storage_limit_mb, start_date, end_date } = req.body;

    await db.execute(`
      INSERT INTO client_services (client_id, service_name, domain, description, service_type, status, storage_limit_mb, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [client_id, service_name, domain || null, description || null, service_type || 'web', status || 'active', storage_limit_mb || 5000, start_date || null, end_date || null]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update service (admin only)
router.put("/api/client/services/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { service_name, domain, description, service_type, status, storage_limit_mb, start_date, end_date } = req.body;

    await db.execute(`
      UPDATE client_services
      SET service_name = ?, domain = ?, description = ?, service_type = ?, status = ?, storage_limit_mb = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `, [service_name, domain || null, description || null, service_type || 'web', status || 'active', storage_limit_mb || 5000, start_date || null, end_date || null, id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete service (admin only)
router.delete("/api/client/services/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute("DELETE FROM client_services WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[SERVICES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// Tickets API
// ============================================

// Get tickets
router.get("/api/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;
    const { status, client_id } = req.query;

    let query, params = [];

    if (role === 'admin') {
      // Admin sees ALL tickets
      query = `
        SELECT t.*,
          u.username as client_username, COALESCE(u.full_name, u.name, u.username) as client_name, u.company as client_company,
          COALESCE(a.full_name, a.name, a.username) as assigned_name,
          cs.service_name, cs.domain,
          (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
        FROM tickets t
        LEFT JOIN admin_users u ON t.client_id = u.id
        LEFT JOIN admin_users a ON t.assigned_to = a.id
        LEFT JOIN client_services cs ON t.service_id = cs.id
      `;

      const conditions = [];
      if (status && status !== 'all') {
        conditions.push("t.status = ?");
        params.push(status);
      }
      if (client_id) {
        conditions.push("t.client_id = ?");
        params.push(client_id);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC";
    } else if (role === 'support') {
      // Support sees: unassigned tickets + tickets assigned to them
      query = `
        SELECT t.*,
          u.username as client_username, COALESCE(u.full_name, u.name, u.username) as client_name, u.company as client_company,
          COALESCE(a.full_name, a.name, a.username) as assigned_name,
          cs.service_name, cs.domain,
          (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
        FROM tickets t
        LEFT JOIN admin_users u ON t.client_id = u.id
        LEFT JOIN admin_users a ON t.assigned_to = a.id
        LEFT JOIN client_services cs ON t.service_id = cs.id
        WHERE (t.assigned_to IS NULL OR t.assigned_to = ?)
      `;
      params = [userId];

      if (status && status !== 'all') {
        query += " AND t.status = ?";
        params.push(status);
      }
      query += " ORDER BY FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC";
    } else {
      // Clients see only their tickets
      query = `
        SELECT t.*,
          cs.service_name, cs.domain,
          COALESCE(a.full_name, a.name, a.username) as assigned_name,
          (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
        FROM tickets t
        LEFT JOIN client_services cs ON t.service_id = cs.id
        LEFT JOIN admin_users a ON t.assigned_to = a.id
        WHERE t.client_id = ?
        AND (t.status != 'closed' OR t.closed_at > DATE_SUB(NOW(), INTERVAL 7 DAY) OR t.closed_at IS NULL)
        ORDER BY t.created_at DESC
      `;
      params = [userId];
    }

    const [tickets] = await db.execute(query, params);
    res.json({ ok: true, tickets });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get ticket summary/stats (MUST be before :id route)
router.get("/api/tickets/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;

    let whereClause = "";
    let params = [];

    if (role === 'client') {
      whereClause = "WHERE client_id = ?";
      params = [userId];
    } else if (role === 'support') {
      whereClause = "WHERE (assigned_to IS NULL OR assigned_to = ?)";
      params = [userId];
    }

    const [stats] = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'waiting_client' THEN 1 ELSE 0 END) as waiting_client,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM tickets ${whereClause}
    `, params);

    const s = stats[0];
    res.json({ ok: true, stats: {
      total: Number(s.total || 0),
      new: Number(s.new_count || 0),
      in_progress: Number(s.in_progress || 0),
      waiting_client: Number(s.waiting_client || 0),
      closed: Number(s.closed || 0)
    }});
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Auto-assign ticket to support agent
router.post("/api/tickets/:id/assign-me", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const [[ticket]] = await db.execute("SELECT * FROM tickets WHERE id = ?", [id]);
    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found" });

    if (ticket.assigned_to && ticket.assigned_to !== userId) {
      return res.status(409).json({ ok: false, error: "already_assigned", assigned_to: ticket.assigned_to });
    }

    await db.execute("UPDATE tickets SET assigned_to = ?, status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END WHERE id = ?", [userId, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single ticket with messages
router.get("/api/tickets/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const role = req.session.user.role;

    // Get ticket
    const [[ticket]] = await db.execute(`
      SELECT t.*,
        u.username as client_username, COALESCE(u.full_name, u.name, u.username) as client_name, u.email as client_email, u.company as client_company,
        COALESCE(a.full_name, a.name, a.username) as assigned_name,
        cs.service_name, cs.domain
      FROM tickets t
      LEFT JOIN admin_users u ON t.client_id = u.id
      LEFT JOIN admin_users a ON t.assigned_to = a.id
      LEFT JOIN client_services cs ON t.service_id = cs.id
      WHERE t.id = ?
    `, [id]);

    if (!ticket) {
      return res.status(404).json({ ok: false, error: "Ticket not found" });
    }

    // Check permission
    if (role === 'client' && ticket.client_id !== userId) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }

    // Get messages (hide internal notes from clients)
    let messagesQuery = `
      SELECT m.*, u.username, COALESCE(u.full_name, u.name, u.username) as display_name, u.role
      FROM ticket_messages m
      LEFT JOIN admin_users u ON m.user_id = u.id
      WHERE m.ticket_id = ?
    `;
    if (role === 'client') {
      messagesQuery += " AND m.is_internal = 0";
    }
    messagesQuery += " ORDER BY m.created_at ASC";

    const [messages] = await db.execute(messagesQuery, [id]);

    // Get attachments
    const [attachments] = await db.execute(`
      SELECT a.*, u.username, COALESCE(u.full_name, u.name, u.username) as display_name
      FROM ticket_attachments a
      LEFT JOIN admin_users u ON a.uploaded_by = u.id
      WHERE a.ticket_id = ?
      ORDER BY a.created_at ASC
    `, [id]);

    res.json({ ok: true, ticket, messages, attachments });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create ticket
router.post("/api/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;
    const { subject, message, service_id, priority, client_id } = req.body;

    // Determine the client_id
    let ticketClientId = userId;
    if ((role === 'admin' || role === 'support') && client_id) {
      ticketClientId = client_id;
    }

    // Create ticket
    const [result] = await db.execute(`
      INSERT INTO tickets (client_id, subject, status, priority, service_id)
      VALUES (?, ?, 'new', ?, ?)
    `, [ticketClientId, subject, priority || 'medium', service_id || null]);

    const ticketId = result.insertId;

    // Add initial message
    await db.execute(`
      INSERT INTO ticket_messages (ticket_id, user_id, message, is_internal)
      VALUES (?, ?, ?, 0)
    `, [ticketId, userId, message]);

    res.json({ ok: true, ticketId });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add message to ticket
router.post("/api/tickets/:id/messages", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const role = req.session.user.role;
    const { message, is_internal } = req.body;

    // Check ticket exists and permission
    const [[ticket]] = await db.execute("SELECT * FROM tickets WHERE id = ?", [id]);
    if (!ticket) {
      return res.status(404).json({ ok: false, error: "Ticket not found" });
    }

    if (role === 'client' && ticket.client_id !== userId) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }

    // Add message
    const isInternalNote = (role === 'admin' || role === 'support') && is_internal ? 1 : 0;
    const [msgResult] = await db.execute(`
      INSERT INTO ticket_messages (ticket_id, user_id, message, is_internal)
      VALUES (?, ?, ?, ?)
    `, [id, userId, message, isInternalNote]);

    // Update ticket status based on who replied
    let newStatus = ticket.status;
    if (role === 'client' && ticket.status === 'waiting_client') {
      newStatus = 'in_progress';
    } else if ((role === 'admin' || role === 'support') && ticket.status === 'new') {
      newStatus = 'in_progress';
    } else if ((role === 'admin' || role === 'support') && !isInternalNote) {
      newStatus = 'waiting_client';
    }

    if (newStatus !== ticket.status) {
      await db.execute("UPDATE tickets SET status = ? WHERE id = ?", [newStatus, id]);
    }

    // Auto-assign if not assigned
    if (!ticket.assigned_to && (role === 'admin' || role === 'support')) {
      await db.execute("UPDATE tickets SET assigned_to = ? WHERE id = ?", [userId, id]);
    }

    // Get the user info for the socket emit
    const [[senderInfo]] = await db.execute(
      "SELECT username, COALESCE(full_name, name, username) as display_name, role FROM admin_users WHERE id = ?",
      [userId]
    );

    // Emit via Socket.IO
    const io = req.app.get("io");
    if (io) {
      const msgData = {
        id: msgResult.insertId,
        ticket_id: Number(id),
        user_id: userId,
        message,
        is_internal: isInternalNote,
        created_at: new Date().toISOString(),
        username: senderInfo?.username || '',
        display_name: senderInfo?.display_name || '',
        role: senderInfo?.role || role
      };
      io.to(`ticket-${id}`).emit("new-message", msgData);
    }

    res.json({ ok: true, messageId: msgResult.insertId });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update ticket (status, priority, assignment) - admin only for full control
router.put("/api/tickets/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, assigned_to } = req.body;

    const updates = [];
    const params = [];

    if (status) {
      updates.push("status = ?");
      params.push(status);
      if (status === 'closed') {
        updates.push("closed_at = NOW()");
      }
    }
    if (priority) {
      updates.push("priority = ?");
      params.push(priority);
    }
    if (assigned_to !== undefined) {
      updates.push("assigned_to = ?");
      params.push(assigned_to || null);
    }

    if (updates.length > 0) {
      params.push(id);
      await db.execute(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Close ticket (admin and support)
router.post("/api/tickets/:id/close", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute("UPDATE tickets SET status = 'closed', closed_at = NOW() WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete ticket (admin only)
router.delete("/api/tickets/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute("DELETE FROM tickets WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload attachment
router.post("/api/tickets/:id/attachments", requireAuth, uploadAttachment.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const role = req.session.user.role;
    const { message_id } = req.body;

    const [[ticket]] = await db.execute("SELECT * FROM tickets WHERE id = ?", [id]);
    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found" });

    if (role === 'client' && ticket.client_id !== userId) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }

    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const filePath = `/uploads/tickets/${req.file.filename}`;
    await db.execute(`
      INSERT INTO ticket_attachments (ticket_id, message_id, filename, original_name, file_path, file_size, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, message_id || null, req.file.filename, req.file.originalname, filePath, req.file.size, req.file.mimetype, userId]);

    res.json({ ok: true, file_path: filePath });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get support staff list (for assignment dropdown)
router.get("/api/support-staff", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const [staff] = await db.execute(`
      SELECT id, username, COALESCE(full_name, name, username) as display_name, email
      FROM admin_users
      WHERE role IN ('admin', 'support') AND is_active = 1
      ORDER BY display_name ASC
    `);
    res.json({ ok: true, staff });
  } catch (err) {
    console.error("[STAFF]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get clients list (for admin creating tickets)
router.get("/api/clients", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const [clients] = await db.execute(`
      SELECT id, username, COALESCE(full_name, name, username) as display_name, email, company
      FROM admin_users
      WHERE role = 'client' AND is_active = 1
      ORDER BY display_name ASC
    `);
    res.json({ ok: true, clients });
  } catch (err) {
    console.error("[CLIENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
