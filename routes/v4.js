/**
 * V4 Routes - New features
 * - Maintenance notices
 * - FAQ system
 * - Project requirements
 * - Internal storage API
 */

const router = require("express").Router();
const path = require("path");
const { prisma } = require("../lib/prisma");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { marked } = require("marked");

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true
});

// ============================================
// MAINTENANCE NOTICES
// ============================================

// Get active maintenance notices (public for clients)
router.get("/api/maintenance/active", requireAuth, async (req, res) => {
  try {
    const notices = await prisma.maintenanceNotice.findMany({
      where: {
        isActive: true,
        startAt: { lte: new Date() },
        OR: [
          { endAt: null },
          { endAt: { gte: new Date() } }
        ]
      },
      orderBy: { startAt: 'desc' }
    });

    res.json({ ok: true, notices });
  } catch (err) {
    console.error("[MAINTENANCE]", err);
    res.json({ ok: true, notices: [] });
  }
});

// Get all maintenance notices (admin)
router.get("/api/maintenance", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const notices = await prisma.maintenanceNotice.findMany({
      include: {
        creator: {
          select: { name: true, fullName: true, username: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const rows = notices.map(n => ({
      ...n,
      creatorName: n.creator?.fullName || n.creator?.name || n.creator?.username
    }));

    res.json({ ok: true, notices: rows });
  } catch (err) {
    console.error("[MAINTENANCE]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create maintenance notice
router.post("/api/maintenance", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { title, message, start_at, end_at, is_active, send_email } = req.body;

    const notice = await prisma.maintenanceNotice.create({
      data: {
        title,
        message,
        startAt: new Date(start_at),
        endAt: end_at ? new Date(end_at) : null,
        isActive: is_active !== false,
        createdBy: userId
      }
    });

    // Send email to all clients if requested
    if (send_email) {
      try {
        const emailService = require('../services/emailService');
        const startDate = new Date(start_at).toLocaleString('es-MX', {
          dateStyle: 'full',
          timeStyle: 'short'
        });
        const endDate = end_at ? new Date(end_at).toLocaleString('es-MX', {
          dateStyle: 'full',
          timeStyle: 'short'
        }) : null;

        await emailService.sendBulkToClients('maintenance-notice', {
          title,
          message,
          startAt: startDate,
          endAt: endDate
        });
      } catch (emailErr) {
        console.error("[MAINTENANCE EMAIL]", emailErr);
      }
    }

    res.json({ ok: true, noticeId: notice.id });
  } catch (err) {
    console.error("[MAINTENANCE]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update maintenance notice
router.put("/api/maintenance/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, start_at, end_at, is_active } = req.body;

    await prisma.maintenanceNotice.update({
      where: { id: Number(id) },
      data: {
        title,
        message,
        startAt: new Date(start_at),
        endAt: end_at ? new Date(end_at) : null,
        isActive: is_active !== false
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[MAINTENANCE]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete maintenance notice
router.delete("/api/maintenance/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.maintenanceNotice.delete({
      where: { id: Number(id) }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[MAINTENANCE]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// FAQ SYSTEM
// ============================================

// Get published FAQs (public)
router.get("/api/faq", async (req, res) => {
  try {
    const { category } = req.query;

    const where = { isPublished: true };
    if (category && category !== 'all') {
      where.category = category;
    }

    const faqs = await prisma.faqItem.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' }
      ]
    });

    // Render markdown answers
    const rows = faqs.map(f => ({
      ...f,
      answerHtml: marked(f.answer)
    }));

    res.json({ ok: true, faqs: rows });
  } catch (err) {
    console.error("[FAQ]", err);
    res.json({ ok: true, faqs: [] });
  }
});

// Get all FAQs (admin)
router.get("/api/faq/admin", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const faqs = await prisma.faqItem.findMany({
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' }
      ]
    });

    res.json({ ok: true, faqs });
  } catch (err) {
    console.error("[FAQ]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create FAQ
router.post("/api/faq", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { question, answer, category, sort_order, is_published } = req.body;

    const faq = await prisma.faqItem.create({
      data: {
        question,
        answer,
        category: category || 'general',
        sortOrder: sort_order || 0,
        isPublished: is_published !== false
      }
    });

    res.json({ ok: true, faqId: faq.id });
  } catch (err) {
    console.error("[FAQ]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update FAQ
router.put("/api/faq/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, sort_order, is_published } = req.body;

    await prisma.faqItem.update({
      where: { id: Number(id) },
      data: {
        question,
        answer,
        category: category || 'general',
        sortOrder: sort_order || 0,
        isPublished: is_published !== false
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[FAQ]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete FAQ
router.delete("/api/faq/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.faqItem.delete({
      where: { id: Number(id) }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[FAQ]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get FAQ categories
router.get("/api/faq/categories", async (req, res) => {
  const categories = [
    { value: 'general', label: 'General' },
    { value: 'storage', label: 'Almacenamiento' },
    { value: 'support', label: 'Soporte' },
    { value: 'billing', label: 'Facturacion' },
    { value: 'technical', label: 'Tecnico' }
  ];
  res.json({ ok: true, categories });
});

// ============================================
// PROJECT REQUIREMENTS (Internal)
// ============================================

// Get requirement options (for form dropdowns) - MUST be before :id route
router.get("/api/requirements/options", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  const options = {
    businessTypes: [
      'Restaurante',
      'Tienda/Comercio',
      'Servicios Profesionales',
      'Consultoria',
      'Educacion',
      'Salud',
      'Tecnologia',
      'Manufactura',
      'Inmobiliaria',
      'Otro'
    ],
    projectTypes: [
      'Pagina Web Informativa',
      'Tienda en Linea (E-commerce)',
      'Sistema Web (Aplicacion)',
      'API/Backend',
      'Landing Page',
      'Blog/Portal de Noticias',
      'Otro'
    ],
    sections: [
      'Inicio',
      'Nosotros',
      'Servicios',
      'Productos',
      'Galeria',
      'Blog',
      'Contacto',
      'Login/Registro',
      'Panel de Administracion',
      'Carrito de Compras',
      'Pasarela de Pagos'
    ],
    technologies: [
      'HTML/CSS/JS',
      'React',
      'Vue.js',
      'Next.js',
      'Node.js',
      'Express',
      'PHP',
      'Laravel',
      'WordPress',
      'MySQL',
      'PostgreSQL',
      'MongoDB',
      'SQLite'
    ],
    budgetRanges: [
      'Menos de $5,000 MXN',
      '$5,000 - $15,000 MXN',
      '$15,000 - $30,000 MXN',
      '$30,000 - $50,000 MXN',
      'Mas de $50,000 MXN',
      'A definir'
    ],
    timelines: [
      '1-2 semanas',
      '2-4 semanas',
      '1-2 meses',
      '2-3 meses',
      'Mas de 3 meses',
      'Flexible'
    ]
  };

  res.json({ ok: true, options });
});

// Get all requirements (admin/support)
router.get("/api/requirements", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { status } = req.query;

    const where = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const requirements = await prisma.projectRequirement.findMany({
      where,
      include: {
        client: {
          select: { username: true, fullName: true, name: true }
        },
        creator: {
          select: { username: true, fullName: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const rows = requirements.map(r => ({
      ...r,
      clientName: r.client?.fullName || r.client?.name || r.contactName,
      creatorName: r.creator?.fullName || r.creator?.name || r.creator?.username
    }));

    res.json({ ok: true, requirements: rows });
  } catch (err) {
    console.error("[REQUIREMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single requirement
router.get("/api/requirements/:id", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { id } = req.params;

    const requirement = await prisma.projectRequirement.findUnique({
      where: { id: Number(id) },
      include: {
        client: {
          select: { id: true, username: true, fullName: true, name: true, email: true }
        },
        creator: {
          select: { username: true, fullName: true, name: true }
        }
      }
    });

    if (!requirement) {
      return res.status(404).json({ ok: false, error: 'Requirement not found' });
    }

    res.json({ ok: true, requirement });
  } catch (err) {
    console.error("[REQUIREMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create requirement
router.post("/api/requirements", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      client_id,
      contact_name,
      contact_email,
      contact_phone,
      company_name,
      business_type,
      business_desc,
      project_type,
      project_objective,
      sections,
      branding,
      technologies,
      budget_range,
      timeline,
      comments,
      internal_notes
    } = req.body;

    const requirement = await prisma.projectRequirement.create({
      data: {
        clientId: client_id ? Number(client_id) : null,
        contactName: contact_name,
        contactEmail: contact_email,
        contactPhone: contact_phone || null,
        companyName: company_name || null,
        businessType: business_type,
        businessDesc: business_desc || null,
        projectType: project_type,
        projectObjective: project_objective || null,
        sections: sections || null,
        branding: branding || null,
        technologies: technologies || null,
        budgetRange: budget_range || null,
        timeline: timeline || null,
        comments: comments || null,
        internalNotes: internal_notes || null,
        status: 'draft',
        createdBy: userId
      }
    });

    res.json({ ok: true, requirementId: requirement.id });
  } catch (err) {
    console.error("[REQUIREMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update requirement
router.put("/api/requirements/:id", requireAuth, requireRole(['admin', 'support']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contact_name,
      contact_email,
      contact_phone,
      company_name,
      business_type,
      business_desc,
      project_type,
      project_objective,
      sections,
      branding,
      technologies,
      budget_range,
      timeline,
      comments,
      internal_notes,
      status
    } = req.body;

    await prisma.projectRequirement.update({
      where: { id: Number(id) },
      data: {
        contactName: contact_name,
        contactEmail: contact_email,
        contactPhone: contact_phone || null,
        companyName: company_name || null,
        businessType: business_type,
        businessDesc: business_desc || null,
        projectType: project_type,
        projectObjective: project_objective || null,
        sections: sections || null,
        branding: branding || null,
        technologies: technologies || null,
        budgetRange: budget_range || null,
        timeline: timeline || null,
        comments: comments || null,
        internalNotes: internal_notes || null,
        status: status || 'draft'
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[REQUIREMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Convert requirement to client
router.post("/api/requirements/:id/convert", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const bcrypt = require('bcrypt');

    const requirement = await prisma.projectRequirement.findUnique({
      where: { id: Number(id) }
    });

    if (!requirement) {
      return res.status(404).json({ ok: false, error: 'Requirement not found' });
    }

    if (requirement.status === 'converted') {
      return res.status(400).json({ ok: false, error: 'Already converted' });
    }

    // Generate username from email
    const username = requirement.contactEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check if username exists
    const existing = await prisma.adminUser.findFirst({
      where: {
        OR: [
          { username },
          { email: requirement.contactEmail }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ ok: false, error: 'User already exists with this email or username' });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).substring(2, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Create user
    const newUser = await prisma.adminUser.create({
      data: {
        username,
        name: requirement.contactName,
        fullName: requirement.contactName,
        email: requirement.contactEmail,
        phone: requirement.contactPhone,
        company: requirement.companyName,
        passwordHash,
        role: 'client',
        mustChangePassword: true
      }
    });

    // Update requirement
    await prisma.projectRequirement.update({
      where: { id: Number(id) },
      data: {
        status: 'converted',
        convertedToClientId: newUser.id
      }
    });

    // TODO: Send welcome email with credentials
    // const emailService = require('../services/emailService');
    // await emailService.sendEmail('user-created', requirement.contactEmail, {...});

    res.json({
      ok: true,
      userId: newUser.id,
      username,
      tempPassword
    });
  } catch (err) {
    console.error("[REQUIREMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete requirement
router.delete("/api/requirements/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.projectRequirement.delete({
      where: { id: Number(id) }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[REQUIREMENTS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// INTERNAL STORAGE API
// ============================================

// Middleware for internal API security
function requireInternalApi(req, res, next) {
  const apiKey = req.headers['x-internal-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  // Only allow from localhost
  const clientIp = req.ip || req.connection.remoteAddress;
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

  if (!isLocalhost) {
    return res.status(403).json({ ok: false, error: 'Forbidden - Not localhost' });
  }

  if (!expectedKey || apiKey !== expectedKey) {
    return res.status(403).json({ ok: false, error: 'Forbidden - Invalid API key' });
  }

  next();
}

// Scan a specific service (internal)
router.post("/internal/storage/scan/:serviceId", requireInternalApi, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const storageAgent = require('../services/storageAgent');

    const result = await storageAgent.scanService(Number(serviceId));

    if (!result) {
      return res.status(404).json({ ok: false, error: 'Service not found or no folder configured' });
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error("[STORAGE SCAN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Scan all services (internal)
router.post("/internal/storage/scan-all", requireInternalApi, async (req, res) => {
  try {
    const storageAgent = require('../services/storageAgent');
    const results = await storageAgent.scanAllServices();

    res.json({ ok: true, scanned: results.length, results });
  } catch (err) {
    console.error("[STORAGE SCAN ALL]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get storage status (internal)
router.get("/internal/storage/status/:serviceId", requireInternalApi, async (req, res) => {
  try {
    const { serviceId } = req.params;

    const service = await prisma.clientService.findUnique({
      where: { id: Number(serviceId) },
      select: {
        id: true,
        serviceName: true,
        folderPath: true,
        storageUsedMb: true,
        storageLimitMb: true,
        lastScanAt: true,
        lastScanResult: true,
        alertThreshold: true,
        alertSentAt: true
      }
    });

    if (!service) {
      return res.status(404).json({ ok: false, error: 'Service not found' });
    }

    res.json({ ok: true, service });
  } catch (err) {
    console.error("[STORAGE STATUS]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// STORAGE MANAGEMENT (Admin)
// ============================================

// Manual scan trigger (admin)
router.post("/api/storage/scan/:serviceId", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { serviceId } = req.params;
    const storageAgent = require('../services/storageAgent');

    const result = await storageAgent.scanService(Number(serviceId));

    if (!result) {
      return res.status(404).json({ ok: false, error: 'Service not found or no folder configured' });
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error("[STORAGE SCAN]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Scan all services (admin)
router.post("/api/storage/scan-all", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const storageAgent = require('../services/storageAgent');
    const results = await storageAgent.scanAllServices();

    res.json({ ok: true, scanned: results.length, results });
  } catch (err) {
    console.error("[STORAGE SCAN ALL]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update service folder path (admin)
router.post("/api/storage/configure/:serviceId", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { folder_path, storage_limit_mb, alert_threshold } = req.body;

    await prisma.clientService.update({
      where: { id: Number(serviceId) },
      data: {
        folderPath: folder_path || null,
        storageLimitMb: storage_limit_mb || 5000,
        alertThreshold: alert_threshold || 80
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[STORAGE CONFIG]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get storage overview (admin)
router.get("/api/storage/overview", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const services = await prisma.clientService.findMany({
      where: {
        status: 'active',
        folderPath: { not: null }
      },
      include: {
        client: {
          select: { username: true, fullName: true, name: true }
        }
      },
      orderBy: { storageUsedMb: 'desc' }
    });

    const storageAgent = require('../services/storageAgent');

    const rows = services.map(s => {
      const usedMb = Number(s.storageUsedMb) || 0;
      const limitMb = Number(s.storageLimitMb) || 5000;
      const percentage = (usedMb / limitMb) * 100;

      return {
        id: s.id,
        serviceName: s.serviceName,
        clientName: s.client?.fullName || s.client?.name || s.client?.username,
        folderPath: s.folderPath,
        usedMb,
        limitMb,
        percentage: Math.round(percentage * 100) / 100,
        status: storageAgent.getStorageStatus(percentage),
        color: storageAgent.getStorageColor(percentage),
        lastScanAt: s.lastScanAt,
        lastScanResult: s.lastScanResult
      };
    });

    res.json({ ok: true, services: rows });
  } catch (err) {
    console.error("[STORAGE OVERVIEW]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// EMAIL MANAGEMENT (Admin)
// ============================================

// Get email logs
router.get("/api/emails/logs", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const logs = await prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });

    res.json({ ok: true, logs });
  } catch (err) {
    console.error("[EMAIL LOGS]", err);
    res.json({ ok: true, logs: [] });
  }
});

// Test email configuration
router.post("/api/emails/test", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { to_email } = req.body;
    const emailService = require('../services/emailService');

    // Verify connection first
    const verify = await emailService.verifyConnection();
    if (!verify.success) {
      return res.status(400).json({ ok: false, error: `SMTP connection failed: ${verify.error}` });
    }

    // Send test email
    const result = await emailService.sendEmail('notification', to_email, {
      subject: 'Email de prueba - Cerberus Dev',
      title: 'Prueba de Email',
      message: 'Este es un correo de prueba para verificar que la configuracion de email funciona correctamente.'
    });

    res.json({ ok: result.success, error: result.error });
  } catch (err) {
    console.error("[EMAIL TEST]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// PAGE ROUTES
// ============================================

// Maintenance admin page
router.get("/maintenance-admin", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "maintenance-admin.html"));
});

// FAQ admin page
router.get("/faq-admin", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "faq-admin.html"));
});

// Requirements admin page
router.get("/requirements-admin", requireAuth, requireRole(['admin', 'support']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "requirements-admin.html"));
});

// Storage admin page
router.get("/storage-admin", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "storage-admin.html"));
});

// Email admin page
router.get("/email-admin", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "email-admin.html"));
});

// Email templates page
router.get("/email-templates", requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "email-templates.html"));
});

// FAQ public page (for clients)
router.get("/faq", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "admin", "faq.html"));
});

// ============================================
// EMAIL TEMPLATES API
// ============================================

// Default templates with variables info
const defaultTemplates = [
  {
    code: 'user-created',
    name: 'Bienvenida - Usuario Creado',
    subject: 'Bienvenido a Cerberus Dev',
    variables: ['{{name}}', '{{username}}', '{{password}}', '{{loginUrl}}'],
    description: 'Se envía cuando se crea un nuevo usuario'
  },
  {
    code: 'ticket-created',
    name: 'Ticket Creado',
    subject: 'Ticket #{{ticketId}} creado: {{subject}}',
    variables: ['{{ticketId}}', '{{subject}}', '{{category}}', '{{priority}}', '{{message}}', '{{ticketUrl}}'],
    description: 'Se envía al crear un nuevo ticket'
  },
  {
    code: 'ticket-response',
    name: 'Respuesta en Ticket',
    subject: 'Respuesta en Ticket #{{ticketId}}: {{subject}}',
    variables: ['{{ticketId}}', '{{subject}}', '{{responderName}}', '{{message}}', '{{ticketUrl}}'],
    description: 'Se envía cuando hay una nueva respuesta'
  },
  {
    code: 'ticket-closed',
    name: 'Ticket Cerrado',
    subject: 'Ticket #{{ticketId}} cerrado',
    variables: ['{{ticketId}}', '{{subject}}', '{{ticketUrl}}'],
    description: 'Se envía cuando se cierra un ticket'
  },
  {
    code: 'storage-warning',
    name: 'Alerta de Almacenamiento (80%)',
    subject: 'Aviso: Tu almacenamiento está al {{percentage}}%',
    variables: ['{{clientName}}', '{{serviceName}}', '{{percentage}}', '{{usedMb}}', '{{limitMb}}', '{{portalUrl}}'],
    description: 'Alerta cuando el storage llega al 80%'
  },
  {
    code: 'storage-danger',
    name: 'Alerta de Almacenamiento (90%)',
    subject: 'Urgente: Tu almacenamiento está al {{percentage}}%',
    variables: ['{{clientName}}', '{{serviceName}}', '{{percentage}}', '{{usedMb}}', '{{limitMb}}', '{{portalUrl}}'],
    description: 'Alerta urgente cuando el storage llega al 90%'
  },
  {
    code: 'storage-critical',
    name: 'Almacenamiento Crítico (95%+)',
    subject: 'CRÍTICO: Tu almacenamiento está al {{percentage}}%',
    variables: ['{{clientName}}', '{{serviceName}}', '{{percentage}}', '{{usedMb}}', '{{limitMb}}', '{{portalUrl}}'],
    description: 'Alerta crítica cuando el storage supera el 95%'
  },
  {
    code: 'maintenance-notice',
    name: 'Aviso de Mantenimiento',
    subject: 'Aviso de Mantenimiento: {{title}}',
    variables: ['{{title}}', '{{message}}', '{{startAt}}', '{{endAt}}'],
    description: 'Notificación de mantenimiento programado'
  },
  {
    code: 'password-reset',
    name: 'Restablecer Contraseña',
    subject: 'Restablece tu contraseña - Cerberus Dev',
    variables: ['{{name}}', '{{resetUrl}}', '{{expiresIn}}'],
    description: 'Email para restablecer contraseña (con link)'
  },
  {
    code: 'password-recovery',
    name: 'Recuperación de Contraseña',
    subject: 'Recuperacion de Contrasena - Cerberus Dev',
    variables: ['{{name}}', '{{username}}', '{{password}}', '{{loginUrl}}'],
    description: 'Se envía al cliente con nueva contraseña temporal'
  },
  {
    code: 'ticket-client-confirmation',
    name: 'Confirmación de Ticket (Cliente)',
    subject: 'Tu ticket #{{ticketId}} ha sido creado',
    variables: ['{{ticketId}}', '{{subject}}', '{{category}}', '{{priority}}', '{{message}}', '{{ticketUrl}}', '{{clientName}}'],
    description: 'Confirmación enviada al cliente cuando crea un ticket'
  }
];

// Get all email templates
router.get("/api/email-templates", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    // Get saved templates from database
    const savedTemplates = await prisma.emailTemplate.findMany();

    // Create a map for quick lookup
    const savedMap = {};
    savedTemplates.forEach(t => { savedMap[t.code] = t; });

    // Always return ALL default templates, merged with saved data
    const allTemplates = defaultTemplates.map(d => {
      const saved = savedMap[d.code];
      return {
        code: d.code,
        name: saved?.name || d.name,
        subject: saved?.subject || d.subject,
        htmlContent: saved?.htmlContent || '',
        isActive: saved?.isActive ?? true,
        variables: d.variables,
        description: d.description,
        isSaved: !!saved
      };
    });

    res.json({ ok: true, templates: allTemplates });
  } catch (err) {
    console.error("[EMAIL-TEMPLATES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get single template
router.get("/api/email-templates/:code", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { code } = req.params;

    let template = await prisma.emailTemplate.findUnique({
      where: { code }
    });

    const defaultTpl = defaultTemplates.find(d => d.code === code);

    if (!template && defaultTpl) {
      // Return default info without saved content
      return res.json({
        ok: true,
        template: {
          code: defaultTpl.code,
          name: defaultTpl.name,
          subject: defaultTpl.subject,
          htmlContent: '',
          isActive: true,
          variables: defaultTpl.variables,
          description: defaultTpl.description,
          isDefault: true
        }
      });
    }

    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template no encontrado' });
    }

    res.json({
      ok: true,
      template: {
        ...template,
        variables: defaultTpl?.variables || [],
        description: defaultTpl?.description || ''
      }
    });
  } catch (err) {
    console.error("[EMAIL-TEMPLATES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update or create template
router.put("/api/email-templates/:code", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { code } = req.params;
    const { name, subject, html_content, is_active } = req.body;

    const defaultTpl = defaultTemplates.find(d => d.code === code);
    if (!defaultTpl) {
      return res.status(400).json({ ok: false, error: 'Código de template inválido' });
    }

    const template = await prisma.emailTemplate.upsert({
      where: { code },
      update: {
        name: name || defaultTpl.name,
        subject: subject || defaultTpl.subject,
        htmlContent: html_content || '',
        isActive: is_active !== false
      },
      create: {
        code,
        name: name || defaultTpl.name,
        subject: subject || defaultTpl.subject,
        htmlContent: html_content || '',
        isActive: is_active !== false
      }
    });

    res.json({ ok: true, template });
  } catch (err) {
    console.error("[EMAIL-TEMPLATES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Send test email with template
router.post("/api/email-templates/:code/test", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { code } = req.params;
    const { to_email } = req.body;

    if (!to_email) {
      return res.status(400).json({ ok: false, error: 'Email requerido' });
    }

    const emailService = require('../services/emailService');

    // Sample data for testing
    const testData = {
      name: 'Usuario de Prueba',
      username: 'usuario_test',
      password: 'Password123!',
      loginUrl: 'https://cerberusdev.pro/login',
      ticketId: '12345',
      subject: 'Asunto de prueba',
      category: 'support',
      priority: 'medium',
      message: 'Este es un mensaje de prueba para verificar el template.',
      ticketUrl: 'https://cerberusdev.pro/ticket/12345',
      responderName: 'Soporte Cerberus',
      clientName: 'Cliente de Prueba',
      serviceName: 'Hosting Premium',
      percentage: 85,
      usedMb: 850,
      limitMb: 1000,
      portalUrl: 'https://cerberusdev.pro/portal',
      title: 'Mantenimiento Programado',
      startAt: new Date().toLocaleString('es-MX'),
      endAt: new Date(Date.now() + 3600000).toLocaleString('es-MX'),
      resetUrl: 'https://cerberusdev.pro/reset?token=abc123',
      expiresIn: '24 horas'
    };

    const result = await emailService.sendEmail(code, to_email, testData);

    if (result.success) {
      res.json({ ok: true, message: 'Email de prueba enviado' });
    } else {
      res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    console.error("[EMAIL-TEMPLATES]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
