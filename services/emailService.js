/**
 * Email Service - v4
 * Centralized email sending with templates
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/prisma');

// Email transporter (lazy initialization)
let transporter = null;

/**
 * Reset the transporter (force reconnection with new config)
 */
function resetTransporter() {
  transporter = null;
  console.log('[Email] Transporter reset - will reconnect on next send');
}

/**
 * Get or create the email transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  // Use Hostinger SMTP configuration
  const config = {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Additional settings for better compatibility
    tls: {
      rejectUnauthorized: false
    }
  };

  console.log(`[Email] Creating transporter: ${config.host}:${config.port} (user: ${config.auth.user})`);

  transporter = nodemailer.createTransport(config);
  return transporter;
}

/**
 * Base HTML template
 */
function getBaseTemplate(content, title = 'Cerberus Dev') {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #3b82f6;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #1e3a5f;
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #3b82f6;
      color: white !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 10px 0;
    }
    .button:hover {
      background-color: #2563eb;
    }
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 12px;
    }
    .alert-box {
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
    }
    .alert-warning {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
    }
    .alert-danger {
      background-color: #fee2e2;
      border-left: 4px solid #ef4444;
    }
    .alert-success {
      background-color: #d1fae5;
      border-left: 4px solid #10b981;
    }
    .alert-info {
      background-color: #dbeafe;
      border-left: 4px solid #3b82f6;
    }
    .storage-bar {
      width: 100%;
      height: 20px;
      background-color: #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
    }
    .storage-fill {
      height: 100%;
      border-radius: 10px;
      transition: width 0.3s;
    }
    .storage-ok { background-color: #16a34a; }
    .storage-warning { background-color: #ca8a04; }
    .storage-danger { background-color: #ea580c; }
    .storage-critical { background-color: #dc2626; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Cerberus Dev</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Cerberus Dev. Todos los derechos reservados.</p>
      <p>Este es un correo automatico, por favor no responda directamente.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Email templates
 */
const templates = {
  // User created
  'user-created': (data) => ({
    subject: 'Bienvenido a Cerberus Dev',
    html: getBaseTemplate(`
      <h2>Bienvenido, ${data.name}!</h2>
      <p>Tu cuenta ha sido creada exitosamente. Aqui estan tus credenciales de acceso:</p>

      <div class="alert-box alert-info">
        <p><strong>Usuario:</strong> ${data.username}</p>
        <p><strong>Contrasena temporal:</strong> ${data.password}</p>
      </div>

      <p>Por seguridad, deberas cambiar tu contrasena en tu primer inicio de sesion.</p>

      <p style="text-align: center;">
        <a href="${data.loginUrl}" class="button">Iniciar Sesion</a>
      </p>

      <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
    `, 'Bienvenido a Cerberus Dev')
  }),

  // Ticket created
  'ticket-created': (data) => ({
    subject: `Ticket #${data.ticketId} creado: ${data.subject}`,
    html: getBaseTemplate(`
      <h2>Nuevo Ticket Creado</h2>
      <p>Se ha creado un nuevo ticket con la siguiente informacion:</p>

      <table>
        <tr>
          <th>Ticket ID</th>
          <td>#${data.ticketId}</td>
        </tr>
        <tr>
          <th>Asunto</th>
          <td>${data.subject}</td>
        </tr>
        <tr>
          <th>Tipo</th>
          <td>${data.category === 'improvement' ? 'Mejora' : data.category === 'storage_request' ? 'Solicitud de Espacio' : 'Soporte'}</td>
        </tr>
        <tr>
          <th>Prioridad</th>
          <td>${data.priority}</td>
        </tr>
      </table>

      <div class="alert-box alert-info">
        <p><strong>Mensaje:</strong></p>
        <p>${data.message}</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.ticketUrl}" class="button">Ver Ticket</a>
      </p>
    `, `Ticket #${data.ticketId}`)
  }),

  // Ticket response
  'ticket-response': (data) => ({
    subject: `Respuesta en Ticket #${data.ticketId}: ${data.subject}`,
    html: getBaseTemplate(`
      <h2>Nueva Respuesta en tu Ticket</h2>
      <p>Has recibido una respuesta en el ticket <strong>#${data.ticketId}</strong>:</p>

      <div class="alert-box alert-info">
        <p><strong>${data.responderName}:</strong></p>
        <p>${data.message}</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.ticketUrl}" class="button">Ver Ticket</a>
      </p>
    `, `Respuesta - Ticket #${data.ticketId}`)
  }),

  // Ticket closed
  'ticket-closed': (data) => ({
    subject: `Ticket #${data.ticketId} cerrado`,
    html: getBaseTemplate(`
      <h2>Ticket Cerrado</h2>
      <p>El ticket <strong>#${data.ticketId} - ${data.subject}</strong> ha sido marcado como cerrado.</p>

      <div class="alert-box alert-success">
        <p>Si consideras que el problema no fue resuelto, puedes responder en el ticket para reabrirlo.</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.ticketUrl}" class="button">Ver Ticket</a>
      </p>

      <p>Gracias por utilizar nuestro servicio de soporte.</p>
    `, `Ticket Cerrado #${data.ticketId}`)
  }),

  // Improvement status changed
  'improvement-status': (data) => ({
    subject: `Actualizacion de Mejora #${data.ticketId}: ${data.newStatus}`,
    html: getBaseTemplate(`
      <h2>Actualizacion de Mejora</h2>
      <p>El estado de tu solicitud de mejora ha sido actualizado:</p>

      <table>
        <tr>
          <th>Ticket</th>
          <td>#${data.ticketId} - ${data.subject}</td>
        </tr>
        <tr>
          <th>Estado anterior</th>
          <td>${data.oldStatus || 'N/A'}</td>
        </tr>
        <tr>
          <th>Nuevo estado</th>
          <td><strong>${data.newStatus}</strong></td>
        </tr>
      </table>

      <p style="text-align: center;">
        <a href="${data.ticketUrl}" class="button">Ver Detalles</a>
      </p>
    `, `Mejora #${data.ticketId}`)
  }),

  // Storage warning (80%)
  'storage-warning': (data) => ({
    subject: `Aviso: Tu almacenamiento esta al ${data.percentage}%`,
    html: getBaseTemplate(`
      <h2>Aviso de Almacenamiento</h2>
      <p>Hola ${data.clientName},</p>
      <p>Tu servicio <strong>${data.serviceName}</strong> esta alcanzando su limite de almacenamiento.</p>

      <div class="storage-bar">
        <div class="storage-fill storage-warning" style="width: ${Math.min(data.percentage, 100)}%"></div>
      </div>

      <table>
        <tr>
          <th>Usado</th>
          <td>${data.usedMb} MB</td>
        </tr>
        <tr>
          <th>Limite</th>
          <td>${data.limitMb} MB</td>
        </tr>
        <tr>
          <th>Porcentaje</th>
          <td><strong>${data.percentage}%</strong></td>
        </tr>
      </table>

      <div class="alert-box alert-warning">
        <p>Te recomendamos revisar tu espacio y eliminar archivos innecesarios, o contactarnos para ampliar tu plan.</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.portalUrl}" class="button">Ver mi Portal</a>
      </p>
    `, 'Aviso de Almacenamiento')
  }),

  // Storage danger (90%)
  'storage-danger': (data) => ({
    subject: `Urgente: Tu almacenamiento esta al ${data.percentage}%`,
    html: getBaseTemplate(`
      <h2>Alerta de Almacenamiento</h2>
      <p>Hola ${data.clientName},</p>
      <p>Tu servicio <strong>${data.serviceName}</strong> esta casi lleno.</p>

      <div class="storage-bar">
        <div class="storage-fill storage-danger" style="width: ${Math.min(data.percentage, 100)}%"></div>
      </div>

      <table>
        <tr>
          <th>Usado</th>
          <td>${data.usedMb} MB</td>
        </tr>
        <tr>
          <th>Limite</th>
          <td>${data.limitMb} MB</td>
        </tr>
        <tr>
          <th>Porcentaje</th>
          <td><strong style="color: #ea580c;">${data.percentage}%</strong></td>
        </tr>
      </table>

      <div class="alert-box alert-danger">
        <p><strong>Accion requerida:</strong> Por favor libera espacio o contactanos para ampliar tu plan antes de que se llene completamente.</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.portalUrl}" class="button">Ver mi Portal</a>
      </p>
    `, 'Alerta de Almacenamiento')
  }),

  // Storage critical (95%+)
  'storage-critical': (data) => ({
    subject: `CRITICO: Tu almacenamiento esta al ${data.percentage}%`,
    html: getBaseTemplate(`
      <h2>Almacenamiento Critico</h2>
      <p>Hola ${data.clientName},</p>
      <p>Tu servicio <strong>${data.serviceName}</strong> esta practicamente lleno.</p>

      <div class="storage-bar">
        <div class="storage-fill storage-critical" style="width: ${Math.min(data.percentage, 100)}%"></div>
      </div>

      <table>
        <tr>
          <th>Usado</th>
          <td>${data.usedMb} MB</td>
        </tr>
        <tr>
          <th>Limite</th>
          <td>${data.limitMb} MB</td>
        </tr>
        <tr>
          <th>Porcentaje</th>
          <td><strong style="color: #dc2626;">${data.percentage}%</strong></td>
        </tr>
      </table>

      <div class="alert-box alert-danger">
        <p><strong>Atencion inmediata requerida:</strong> Tu servicio puede dejar de funcionar correctamente si se llena el espacio. Contactanos urgentemente.</p>
      </div>

      <p style="text-align: center;">
        <a href="${data.portalUrl}" class="button">Ver mi Portal</a>
      </p>
    `, 'Almacenamiento Critico')
  }),

  // Maintenance notice
  'maintenance-notice': (data) => ({
    subject: `Aviso de Mantenimiento: ${data.title}`,
    html: getBaseTemplate(`
      <h2>Aviso de Mantenimiento</h2>

      <div class="alert-box alert-warning">
        <h3 style="margin-top: 0;">${data.title}</h3>
        <p>${data.message}</p>
      </div>

      <table>
        <tr>
          <th>Fecha de inicio</th>
          <td>${data.startAt}</td>
        </tr>
        ${data.endAt ? `
        <tr>
          <th>Fecha estimada de fin</th>
          <td>${data.endAt}</td>
        </tr>
        ` : ''}
      </table>

      <p>Disculpa las molestias que esto pueda ocasionar. Estamos trabajando para mejorar nuestros servicios.</p>

      <p>Si tienes preguntas, no dudes en contactarnos.</p>
    `, 'Aviso de Mantenimiento')
  }),

  // Generic notification
  'notification': (data) => ({
    subject: data.subject || 'Notificacion de Cerberus Dev',
    html: getBaseTemplate(`
      <h2>${data.title || 'Notificacion'}</h2>
      <p>${data.message}</p>

      ${data.actionUrl ? `
      <p style="text-align: center;">
        <a href="${data.actionUrl}" class="button">${data.actionText || 'Ver mas'}</a>
      </p>
      ` : ''}
    `, data.title || 'Notificacion')
  })
};

/**
 * Send an email using a template
 * @param {string} templateCode - Template identifier
 * @param {string} toEmail - Recipient email
 * @param {object} data - Template data
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendEmail(templateCode, toEmail, data) {
  try {
    const template = templates[templateCode];
    if (!template) {
      throw new Error(`Unknown template: ${templateCode}`);
    }

    const { subject, html } = template(data);

    const fromName = process.env.EMAIL_FROM_NAME || 'Cerberus Dev';
    const fromEmail = process.env.SMTP_USER;

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail,
      subject,
      html
    };

    const transport = getTransporter();
    const info = await transport.sendMail(mailOptions);

    // Log to database
    await prisma.emailLog.create({
      data: {
        templateCode,
        toEmail,
        subject,
        status: 'sent',
        sentAt: new Date()
      }
    });

    console.log(`[Email] Sent ${templateCode} to ${toEmail}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] Error sending ${templateCode} to ${toEmail}:`, err.message);

    // Log error to database
    try {
      await prisma.emailLog.create({
        data: {
          templateCode,
          toEmail,
          subject: templateCode,
          status: 'failed',
          errorMsg: err.message
        }
      });
    } catch (logErr) {
      // Ignore log errors
    }

    return { success: false, error: err.message };
  }
}

/**
 * Send email to admin
 */
async function sendAdminEmail(subject, message, data = {}) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('[Email] ADMIN_EMAIL not configured');
    return { success: false, error: 'ADMIN_EMAIL not configured' };
  }

  return sendEmail('notification', adminEmail, {
    subject,
    title: subject,
    message,
    ...data
  });
}

/**
 * Send email to all clients
 * @param {string} templateCode - Template identifier
 * @param {object} data - Template data (same for all)
 */
async function sendBulkToClients(templateCode, data) {
  const clients = await prisma.adminUser.findMany({
    where: {
      role: 'client',
      email: { not: null }
    },
    select: { id: true, name: true, email: true }
  });

  console.log(`[Email] Sending bulk ${templateCode} to ${clients.length} clients`);

  const results = [];
  for (const client of clients) {
    const result = await sendEmail(templateCode, client.email, {
      ...data,
      clientName: client.name
    });
    results.push({ clientId: client.id, email: client.email, ...result });
  }

  return results;
}

/**
 * Verify SMTP connection
 */
async function verifyConnection() {
  try {
    const transport = getTransporter();
    await transport.verify();
    console.log('[Email] SMTP connection verified');
    return { success: true };
  } catch (err) {
    console.error('[Email] SMTP connection failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendEmail,
  sendAdminEmail,
  sendBulkToClients,
  verifyConnection,
  resetTransporter,
  templates
};
