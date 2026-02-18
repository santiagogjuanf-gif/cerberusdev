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
 * Professional Cerberus-styled HTML email template
 */
function getCerberusTemplate(content, title = 'Cerberus Dev') {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0f;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0f;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px 40px; border-radius: 16px 16px 0 0; text-align: center; border-bottom: 3px solid #FF7A18;">
              <h1 style="color: #FF7A18; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">CERBERUS DEV</h1>
              <p style="color: rgba(255,255,255,0.6); margin: 8px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Servicios Web Administrados</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #12121a; padding: 40px; color: #e0e0e0; line-height: 1.7; font-size: 15px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px 40px; border-radius: 0 0 16px 16px; text-align: center; border-top: 1px solid rgba(255,122,24,0.3);">
              <p style="color: rgba(255,255,255,0.5); margin: 0 0 10px; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Cerberus Dev. Todos los derechos reservados.
              </p>
              <p style="color: rgba(255,255,255,0.4); margin: 0; font-size: 11px;">
                Este es un correo automatico, por favor no responda directamente.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Base HTML template (legacy - kept for compatibility)
 */
function getBaseTemplate(content, title = 'Cerberus Dev') {
  return getCerberusTemplate(content, title);
}

/**
 * Email templates
 */
const templates = {
  // User created - Professional welcome email
  'user-created': (data) => ({
    subject: 'Bienvenido a Cerberus Dev - Tu acceso esta listo',
    html: getCerberusTemplate(`
      <h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hola ${data.name},</h2>

      <p style="margin: 0 0 15px; color: #e0e0e0;">Bienvenido a <strong style="color: #FF7A18;">Cerberus Dev</strong>.</p>
      <p style="margin: 0 0 20px; color: #b0b0b0;">Es un gusto darte la bienvenida y comenzar a trabajar juntos en tu proyecto.</p>

      <p style="margin: 0 0 25px; color: #b0b0b0;">En Cerberus Dev nos especializamos en ofrecer <strong style="color: #fff;">servicios web administrados</strong>, enfocados en estabilidad, seguridad y acompañamiento continuo. Nuestro objetivo es que tu servicio funcione correctamente, este monitoreado y cuente con un canal claro de comunicacion para cualquier necesidad futura.</p>

      <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

      <h3 style="color: #fff; margin: 0 0 15px; font-size: 16px; display: flex; align-items: center;">
        <span style="color: #FF7A18; margin-right: 10px;">&#x1F510;</span> Acceso a tu panel de cliente
      </h3>

      <p style="margin: 0 0 15px; color: #b0b0b0;">Hemos creado tu acceso inicial a nuestro <strong style="color: #fff;">portal de clientes</strong>, desde donde podras gestionar y dar seguimiento a tu servicio.</p>

      <!-- Credentials Box -->
      <div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">Credenciales iniciales</p>
        <table role="presentation" style="width: 100%; margin-top: 10px;">
          <tr>
            <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Usuario:</td>
            <td style="padding: 8px 0; color: #fff; font-weight: 600;">${data.username}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #b0b0b0;">Contraseña temporal:</td>
            <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">${data.password}</td>
          </tr>
        </table>
      </div>

      <p style="margin: 15px 0 25px; color: #f59e0b; font-size: 13px;">
        <strong>&#x1F449; Por motivos de seguridad, te recomendamos cambiar tu contraseña en tu primer inicio de sesion.</strong>
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.loginUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #FF7A18, #FF9A45); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 15px rgba(255,122,24,0.3);">Acceder al Panel</a>
      </div>

      <p style="text-align: center; margin: 0 0 25px; color: rgba(255,255,255,0.5); font-size: 12px; font-style: italic;">
        Este enlace es exclusivo para clientes y no se encuentra disponible en nuestra pagina publica.
      </p>

      <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

      <h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
        <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CA;</span> ¿Que puedes hacer desde tu panel?
      </h3>

      <ul style="margin: 0 0 25px; padding-left: 0; list-style: none; color: #b0b0b0;">
        <li style="padding: 8px 0; padding-left: 25px; position: relative;"><span style="position: absolute; left: 0; color: #FF7A18;">&#x2714;</span> Ver el <strong style="color: #fff;">estado de tus servicios</strong></li>
        <li style="padding: 8px 0; padding-left: 25px; position: relative;"><span style="position: absolute; left: 0; color: #FF7A18;">&#x2714;</span> Consultar <strong style="color: #fff;">avisos de mantenimiento</strong></li>
        <li style="padding: 8px 0; padding-left: 25px; position: relative;"><span style="position: absolute; left: 0; color: #FF7A18;">&#x2714;</span> Crear y dar seguimiento a <strong style="color: #fff;">tickets de soporte</strong></li>
        <li style="padding: 8px 0; padding-left: 25px; position: relative;"><span style="position: absolute; left: 0; color: #FF7A18;">&#x2714;</span> Solicitar <strong style="color: #fff;">mejoras o actualizaciones</strong></li>
        <li style="padding: 8px 0; padding-left: 25px; position: relative;"><span style="position: absolute; left: 0; color: #FF7A18;">&#x2714;</span> Mantener comunicacion directa con nuestro equipo</li>
      </ul>

      <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

      <h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
        <span style="color: #FF7A18; margin-right: 10px;">&#x1F6E0;</span> Soporte y comunicacion
      </h3>

      <p style="margin: 0 0 15px; color: #b0b0b0;">Contamos con un <strong style="color: #fff;">sistema de tickets</strong> dentro del panel para atender solicitudes tecnicas o mejoras de forma organizada.</p>

      <p style="margin: 0 0 25px; color: #b0b0b0;">Te recomendamos utilizar <strong style="color: #fff;">tickets</strong> para soporte tecnico, cambios o solicitudes formales.</p>

      <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

      <p style="margin: 0 0 15px; color: #b0b0b0;">Gracias por confiar en <strong style="color: #FF7A18;">Cerberus Dev</strong>.</p>
      <p style="margin: 0; color: #b0b0b0;">Estamos listos para acompañarte y hacer crecer tu proyecto.</p>

      <p style="margin: 25px 0 0; color: #fff;">
        Saludos cordiales,<br>
        <strong style="color: #FF7A18;">Equipo Cerberus Dev</strong>
      </p>
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
