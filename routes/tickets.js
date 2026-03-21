const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { prisma } = require("../lib/prisma");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const emailService = require("../services/emailService");

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

// Helper to get display name
function getDisplayName(user) {
  return user?.fullName || user?.name || user?.username || '';
}

// ============================================
// Client Services API
// ============================================

// Get client's services
router.get("/api/client/services", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;

    let services;
    if (role === 'admin' || role === 'support') {
      services = await prisma.clientService.findMany({
        include: {
          client: {
            select: {
              username: true,
              fullName: true,
              name: true,
              company: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Transform for frontend compatibility
      services = services.map(s => ({
        ...s,
        username: s.client?.username,
        client_name: getDisplayName(s.client),
        company: s.client?.company
      }));
    } else {
      services = await prisma.clientService.findMany({
        where: { clientId: userId },
        orderBy: { createdAt: 'desc' }
      });
    }

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

    await prisma.clientService.create({
      data: {
        clientId: client_id,
        serviceName: service_name,
        domain: domain || null,
        description: description || null,
        serviceType: service_type || 'web',
        status: status || 'active',
        storageLimitMb: storage_limit_mb || 5000,
        startDate: start_date ? new Date(start_date) : null,
        endDate: end_date ? new Date(end_date) : null
      }
    });

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
    const { service_name, domain, description, service_type, status, storage_used_mb, storage_limit_mb, start_date, end_date } = req.body;

    await prisma.clientService.update({
      where: { id: Number(id) },
      data: {
        serviceName: service_name,
        domain: domain || null,
        description: description || null,
        serviceType: service_type || 'web',
        status: status || 'active',
        storageUsedMb: storage_used_mb || 0,
        storageLimitMb: storage_limit_mb || 5000,
        startDate: start_date ? new Date(start_date) : null,
        endDate: end_date ? new Date(end_date) : null
      }
    });

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
    await prisma.clientService.delete({
      where: { id: Number(id) }
    });
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
    const { status, client_id, ticket_type } = req.query;

    let where = {};
    let includeConfig = {
      client: {
        select: {
          username: true,
          fullName: true,
          name: true,
          company: true
        }
      },
      assignee: {
        select: {
          fullName: true,
          name: true,
          username: true
        }
      },
      service: {
        select: {
          serviceName: true,
          domain: true
        }
      },
      _count: {
        select: { messages: true }
      }
    };

    if (role === 'admin') {
      // Admin sees ALL tickets
      if (status && status !== 'all') {
        where.status = status;
      }
      if (client_id) {
        where.clientId = Number(client_id);
      }
      if (ticket_type) {
        where.ticketType = ticket_type;
      }
    } else if (role === 'support') {
      // Support sees: unassigned tickets + tickets assigned to them
      where.OR = [
        { assignedTo: null },
        { assignedTo: userId }
      ];
      if (status && status !== 'all') {
        where.status = status;
      }
    } else {
      // Clients see only their tickets (not closed for more than 7 days)
      where.clientId = userId;
      where.OR = [
        { status: { not: 'closed' } },
        { closedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        { closedAt: null }
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: includeConfig,
      orderBy: [
        { priority: 'asc' }, // This won't give exact FIELD() order, will handle in transform
        { createdAt: 'desc' }
      ]
    });

    // Transform and sort by priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const rows = tickets
      .map(t => ({
        ...t,
        client_username: t.client?.username,
        client_name: getDisplayName(t.client),
        client_company: t.client?.company,
        assigned_name: getDisplayName(t.assignee),
        service_name: t.service?.serviceName,
        domain: t.service?.domain,
        message_count: t._count.messages
      }))
      .sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    res.json({ ok: true, tickets: rows });
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

    let where = {};
    if (role === 'client') {
      where.clientId = userId;
    } else if (role === 'support') {
      where.OR = [
        { assignedTo: null },
        { assignedTo: userId }
      ];
    }

    const [total, newCount, inProgress, waitingClient, waitingSupport, closed] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: 'new' } }),
      prisma.ticket.count({ where: { ...where, status: 'in_progress' } }),
      prisma.ticket.count({ where: { ...where, status: 'waiting_client' } }),
      prisma.ticket.count({ where: { ...where, status: 'waiting_support' } }),
      prisma.ticket.count({ where: { ...where, status: 'closed' } })
    ]);

    res.json({
      ok: true,
      stats: {
        total,
        new: newCount,
        in_progress: inProgress,
        waiting_client: waitingClient,
        waiting_support: waitingSupport,
        closed
      }
    });
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

    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(id) }
    });

    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found" });

    if (ticket.assignedTo && ticket.assignedTo !== userId) {
      return res.status(409).json({ ok: false, error: "already_assigned", assigned_to: ticket.assignedTo });
    }

    await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        assignedTo: userId,
        status: ticket.status === 'new' ? 'in_progress' : ticket.status
      }
    });

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
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(id) },
      include: {
        client: {
          select: {
            username: true,
            fullName: true,
            name: true,
            email: true,
            company: true
          }
        },
        assignee: {
          select: {
            fullName: true,
            name: true,
            username: true
          }
        },
        service: {
          select: {
            serviceName: true,
            domain: true
          }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ ok: false, error: "Ticket not found" });
    }

    // Check permission
    if (role === 'client' && ticket.clientId !== userId) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }

    // Get messages (hide internal notes from clients)
    const messagesWhere = { ticketId: Number(id) };
    if (role === 'client') {
      messagesWhere.isInternal = false;
    }

    const messages = await prisma.ticketMessage.findMany({
      where: messagesWhere,
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get attachments
    const attachments = await prisma.ticketAttachment.findMany({
      where: { ticketId: Number(id) },
      include: {
        uploader: {
          select: {
            username: true,
            fullName: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Transform for frontend
    const ticketData = {
      ...ticket,
      client_username: ticket.client?.username,
      client_name: getDisplayName(ticket.client),
      client_email: ticket.client?.email,
      client_company: ticket.client?.company,
      assigned_name: getDisplayName(ticket.assignee),
      service_name: ticket.service?.serviceName,
      domain: ticket.service?.domain
    };

    const messagesData = messages.map(m => ({
      ...m,
      username: m.user?.username,
      display_name: getDisplayName(m.user),
      role: m.user?.role
    }));

    const attachmentsData = attachments.map(a => ({
      ...a,
      username: a.uploader?.username,
      display_name: getDisplayName(a.uploader)
    }));

    res.json({ ok: true, ticket: ticketData, messages: messagesData, attachments: attachmentsData });
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
    const { subject, message, service_id, priority, client_id, ticket_type, category } = req.body;

    // Determine the client_id
    let ticketClientId = userId;
    if ((role === 'admin' || role === 'support') && client_id) {
      ticketClientId = Number(client_id);
    }

    // ticket_type: 'internal' only for staff
    const type = (role === 'admin' || role === 'support') && ticket_type === 'internal' ? 'internal' : 'client';

    // category: support, improvement, storage_request
    const ticketCategory = ['support', 'improvement', 'storage_request'].includes(category) ? category : 'support';

    // Create ticket
    const ticket = await prisma.ticket.create({
      data: {
        clientId: ticketClientId,
        subject,
        status: 'new',
        priority: priority || 'medium',
        serviceId: service_id ? Number(service_id) : null,
        ticketType: type,
        category: ticketCategory,
        improvementStatus: ticketCategory === 'improvement' ? 'pending' : null
      }
    });

    // Add initial message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        userId,
        message,
        isInternal: false
      }
    });

    // Create notifications
    try {
      if (type === 'internal') {
        // Internal request: notify all admins
        const admins = await prisma.adminUser.findMany({
          where: { role: 'admin' },
          select: { id: true }
        });
        for (const admin of admins) {
          await prisma.adminNotification.create({
            data: {
              type: 'ticket_internal',
              userId: admin.id,
              refId: ticket.id,
              title: `Solicitud interna #${ticket.id}`,
              body: subject
            }
          });
        }
      } else if (role === 'client') {
        // Client created ticket: notify all admins and support
        const staff = await prisma.adminUser.findMany({
          where: {
            role: { in: ['admin', 'support'] },
            isActive: true
          },
          select: { id: true }
        });
        for (const s of staff) {
          await prisma.adminNotification.create({
            data: {
              type: 'ticket',
              userId: s.id,
              refId: ticket.id,
              title: `Nuevo ticket #${ticket.id}`,
              body: subject
            }
          });
        }
      }
    } catch (notifErr) {
      console.error("[NOTIF]", notifErr);
    }

    // Send email notification for new ticket
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const ticketUrl = `${baseUrl}/admin/support`;

      if (role === 'client') {
        // Get client info
        const client = await prisma.adminUser.findUnique({
          where: { id: ticketClientId },
          select: { name: true, username: true, email: true }
        });

        // Notify admin about new client ticket
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
          await emailService.sendEmail('ticket-created', adminEmail, {
            ticketId: ticket.id,
            subject,
            category: ticketCategory,
            priority: priority || 'medium',
            message,
            ticketUrl,
            clientName: client?.name || client?.username || 'Cliente'
          });
        }

        // Send confirmation email to client
        if (client?.email) {
          const clientTicketUrl = `${baseUrl}/cliente`;
          await emailService.sendEmail('ticket-client-confirmation', client.email, {
            ticketId: ticket.id,
            subject,
            category: ticketCategory,
            priority: priority || 'medium',
            message,
            ticketUrl: clientTicketUrl,
            clientName: client?.name || client?.username || 'Cliente'
          });
          console.log("[TICKET] Confirmation email sent to client:", client.email);
        }
      }
    } catch (emailErr) {
      console.error("[TICKET EMAIL]", emailErr.message);
    }

    res.json({ ok: true, ticketId: ticket.id });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add message to ticket
router.post("/api/tickets/:id/messages", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const ticketId = Number(id);
    const userId = req.session.user.id;
    const role = req.session.user.role;
    const { message, is_internal } = req.body;

    // Check ticket exists and permission
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({ ok: false, error: "Ticket not found" });
    }

    if (role === 'client' && ticket.clientId !== userId) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }

    // Add message
    const isInternalNote = (role === 'admin' || role === 'support') && is_internal ? true : false;
    const newMessage = await prisma.ticketMessage.create({
      data: {
        ticketId,
        userId,
        message,
        isInternal: isInternalNote
      }
    });

    // Update ticket status based on who replied
    let newStatus = ticket.status;
    if (role === 'client') {
      // Client replied → waiting for support
      newStatus = 'waiting_support';
    } else if ((role === 'admin' || role === 'support') && !isInternalNote) {
      // Staff replied (not internal note) → waiting for client
      newStatus = 'waiting_client';
    }

    if (newStatus !== ticket.status && ticket.status !== 'closed') {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: newStatus }
      });
    }

    // Auto-assign if not assigned
    if (!ticket.assignedTo && (role === 'admin' || role === 'support')) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { assignedTo: userId }
      });
    }

    // Get the user info for the socket emit
    const senderInfo = await prisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        username: true,
        fullName: true,
        name: true,
        role: true
      }
    });

    // Emit via Socket.IO
    const io = req.app.get("io");
    if (io) {
      const msgData = {
        id: newMessage.id,
        ticket_id: ticketId,
        user_id: userId,
        message,
        is_internal: isInternalNote,
        created_at: new Date().toISOString(),
        username: senderInfo?.username || '',
        display_name: getDisplayName(senderInfo),
        role: senderInfo?.role || role
      };
      io.to(`ticket-${id}`).emit("new-message", msgData);
    }

    // Create notifications for replies
    try {
      const senderName = getDisplayName(senderInfo) || 'Usuario';
      if (role === 'client') {
        // Client replied: notify assigned support agent
        if (ticket.assignedTo) {
          await prisma.adminNotification.create({
            data: {
              type: 'ticket_reply',
              userId: ticket.assignedTo,
              refId: ticketId,
              title: `Respuesta en ticket #${id}`,
              body: `${senderName} respondio en: ${ticket.subject || 'Ticket #' + id}`
            }
          });
        } else {
          // No assigned agent: notify all admin/support
          const staff = await prisma.adminUser.findMany({
            where: {
              role: { in: ['admin', 'support'] },
              isActive: true
            },
            select: { id: true }
          });
          for (const s of staff) {
            await prisma.adminNotification.create({
              data: {
                type: 'ticket_reply',
                userId: s.id,
                refId: ticketId,
                title: `Respuesta en ticket #${id}`,
                body: `${senderName} respondio en: ${ticket.subject || 'Ticket #' + id}`
              }
            });
          }
        }
      } else if (!isInternalNote) {
        // Staff replied (non-internal): notify client
        await prisma.adminNotification.create({
          data: {
            type: 'ticket_reply',
            userId: ticket.clientId,
            refId: ticketId,
            title: `Respuesta en ticket #${id}`,
            body: `${senderName} respondio a tu ticket: ${ticket.subject || 'Ticket #' + id}`
          }
        });
      }
    } catch (notifErr) {
      console.error("[NOTIF]", notifErr);
    }

    // Send email notification for ticket response
    try {
      if (!isInternalNote) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const senderName = getDisplayName(senderInfo) || 'Usuario';

        if (role === 'client') {
          // Client replied → email admin
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail) {
            await emailService.sendEmail('ticket-response', adminEmail, {
              ticketId,
              subject: ticket.subject,
              responderName: senderName,
              message,
              ticketUrl: `${baseUrl}/admin/support`
            });
          }
        } else {
          // Staff replied → email client
          const client = await prisma.adminUser.findUnique({
            where: { id: ticket.clientId },
            select: { email: true, name: true, username: true }
          });
          if (client?.email) {
            await emailService.sendEmail('ticket-response', client.email, {
              ticketId,
              subject: ticket.subject,
              responderName: senderName,
              message,
              ticketUrl: `${baseUrl}/portal`
            });
          }
        }
      }
    } catch (emailErr) {
      console.error("[TICKET RESPONSE EMAIL]", emailErr.message);
    }

    res.json({ ok: true, messageId: newMessage.id });
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

    const data = {};
    if (status) {
      data.status = status;
      if (status === 'closed') {
        data.closedAt = new Date();
      }
    }
    if (priority) {
      data.priority = priority;
    }
    if (assigned_to !== undefined) {
      data.assignedTo = assigned_to || null;
    }

    if (Object.keys(data).length > 0) {
      await prisma.ticket.update({
        where: { id: Number(id) },
        data
      });
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
    const ticketId = Number(id);

    // Get ticket info before closing
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { subject: true, clientId: true }
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'closed',
        closedAt: new Date()
      }
    });

    // Send email to client that ticket was closed
    if (ticket) {
      try {
        const client = await prisma.adminUser.findUnique({
          where: { id: ticket.clientId },
          select: { email: true }
        });
        if (client?.email) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          await emailService.sendEmail('ticket-closed', client.email, {
            ticketId,
            subject: ticket.subject,
            ticketUrl: `${baseUrl}/portal`
          });
        }
      } catch (emailErr) {
        console.error("[TICKET CLOSE EMAIL]", emailErr.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete ticket (admin only) - permanently removes ticket and all related data
router.delete("/api/tickets/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const ticketId = Number(id);

    // Delete related data first (Prisma handles cascades but being explicit)
    await prisma.ticketAttachment.deleteMany({ where: { ticketId } });
    await prisma.ticketMessage.deleteMany({ where: { ticketId } });
    await prisma.adminNotification.deleteMany({
      where: {
        refId: ticketId,
        type: { in: ['ticket', 'ticket_reply', 'ticket_internal'] }
      }
    });
    // Delete the ticket
    await prisma.ticket.delete({ where: { id: ticketId } });

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
    const ticketId = Number(id);
    const userId = req.session.user.id;
    const role = req.session.user.role;
    const { message_id } = req.body;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found" });

    if (role === 'client' && ticket.clientId !== userId) {
      return res.status(403).json({ ok: false, error: "Access denied" });
    }

    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const filePath = `/uploads/tickets/${req.file.filename}`;
    await prisma.ticketAttachment.create({
      data: {
        ticketId,
        messageId: message_id ? Number(message_id) : null,
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: userId
      }
    });

    res.json({ ok: true, file_path: filePath });
  } catch (err) {
    console.error("[TICKETS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get support staff list (for assignment dropdown)
router.get("/api/support-staff", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const staff = await prisma.adminUser.findMany({
      where: {
        role: { in: ['admin', 'support'] },
        isActive: true
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        name: true,
        email: true
      },
      orderBy: { fullName: 'asc' }
    });

    // Transform for frontend
    const rows = staff.map(s => ({
      id: s.id,
      username: s.username,
      display_name: getDisplayName(s),
      email: s.email
    }));

    res.json({ ok: true, staff: rows });
  } catch (err) {
    console.error("[STAFF]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get clients list (for admin creating tickets)
router.get("/api/clients", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const clients = await prisma.adminUser.findMany({
      where: {
        role: 'client',
        isActive: true
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        name: true,
        email: true,
        company: true
      },
      orderBy: { fullName: 'asc' }
    });

    // Transform for frontend
    const rows = clients.map(c => ({
      id: c.id,
      username: c.username,
      display_name: getDisplayName(c),
      email: c.email,
      company: c.company
    }));

    res.json({ ok: true, clients: rows });
  } catch (err) {
    console.error("[CLIENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// Improvement Tickets API (v4)
// ============================================

// Get improvement tickets (for client portal)
router.get("/api/tickets/improvements", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;

    let where = { category: 'improvement' };
    if (role === 'client') {
      where.clientId = userId;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        client: {
          select: {
            username: true,
            fullName: true,
            name: true
          }
        },
        service: {
          select: {
            serviceName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const rows = tickets.map(t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      improvementStatus: t.improvementStatus,
      priority: t.priority,
      serviceName: t.service?.serviceName,
      clientName: getDisplayName(t.client),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }));

    res.json({ ok: true, improvements: rows });
  } catch (err) {
    console.error("[IMPROVEMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update improvement status (admin/support only)
router.post("/api/tickets/:id/improvement-status", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { id } = req.params;
    const { improvement_status } = req.body;

    if (!['pending', 'in_progress', 'completed'].includes(improvement_status)) {
      return res.status(400).json({ ok: false, error: 'Invalid improvement status' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(id) },
      include: {
        client: { select: { email: true, name: true, fullName: true } }
      }
    });

    if (!ticket) {
      return res.status(404).json({ ok: false, error: 'Ticket not found' });
    }

    if (ticket.category !== 'improvement') {
      return res.status(400).json({ ok: false, error: 'Ticket is not an improvement request' });
    }

    const oldStatus = ticket.improvementStatus;

    await prisma.ticket.update({
      where: { id: Number(id) },
      data: { improvementStatus: improvement_status }
    });

    // Create notification for client
    await prisma.adminNotification.create({
      data: {
        type: 'improvement_update',
        userId: ticket.clientId,
        refId: ticket.id,
        title: `Mejora actualizada: ${improvement_status}`,
        body: ticket.subject
      }
    });

    // TODO: Send email notification when email service is configured
    // const emailService = require('../services/emailService');
    // await emailService.sendEmail('improvement-status', ticket.client.email, {...});

    res.json({ ok: true, oldStatus, newStatus: improvement_status });
  } catch (err) {
    console.error("[IMPROVEMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// Storage Request (v4)
// ============================================

// Request more storage (creates a ticket)
router.post("/api/storage/request", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { service_id, requested_mb, message } = req.body;

    // Get service info
    const service = await prisma.clientService.findUnique({
      where: { id: Number(service_id) }
    });

    if (!service) {
      return res.status(404).json({ ok: false, error: 'Service not found' });
    }

    // Verify ownership
    if (service.clientId !== userId) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }

    // Create storage request ticket
    const ticket = await prisma.ticket.create({
      data: {
        clientId: userId,
        subject: `Solicitud de ampliacion de almacenamiento - ${service.serviceName}`,
        status: 'new',
        priority: 'medium',
        serviceId: service.id,
        ticketType: 'client',
        category: 'storage_request'
      }
    });

    // Add message with details
    const requestMsg = `Solicitud de ampliacion de almacenamiento:

Servicio: ${service.serviceName}
Almacenamiento actual: ${service.storageUsedMb} MB de ${service.storageLimitMb} MB
Espacio adicional solicitado: ${requested_mb || 'A definir'} MB

Mensaje del cliente:
${message || 'Sin mensaje adicional'}`;

    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        userId,
        message: requestMsg,
        isInternal: false
      }
    });

    // Notify admins
    const admins = await prisma.adminUser.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true }
    });

    for (const admin of admins) {
      await prisma.adminNotification.create({
        data: {
          type: 'storage_warning',
          userId: admin.id,
          refId: ticket.id,
          title: 'Solicitud de almacenamiento',
          body: `${service.serviceName} solicita mas espacio`
        }
      });
    }

    res.json({ ok: true, ticketId: ticket.id });
  } catch (err) {
    console.error("[STORAGE REQUEST]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
