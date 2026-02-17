const router = require("express").Router();
const { prisma } = require("../lib/prisma");
const nodemailer = require("nodemailer");

// Configure email transporter (only if credentials are set)
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: process.env.SMTP_SERVICE || "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// Send auto-reply email to client
async function sendAutoReply(name, email, projectType) {
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: `"Cerberus Dev" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Hemos recibido tu solicitud - Cerberus Dev",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0d14;color:#e8e8e8;padding:40px 32px;border-radius:16px;">
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="color:#FF7A18;font-size:24px;margin:0;">Cerberus Dev</h1>
            <p style="color:#888;font-size:13px;margin-top:4px;">Guardians of Code & Servers</p>
          </div>
          <p style="font-size:16px;line-height:1.7;">Hola <strong>${name}</strong>,</p>
          <p style="font-size:15px;line-height:1.7;color:#ccc;">
            Hemos recibido tu solicitud${projectType ? ` sobre <strong>${projectType}</strong>` : ""}.
            Nuestro equipo revisará tu mensaje y uno de nosotros se pondrá en contacto contigo
            en un plazo de <strong>24 a 48 horas</strong>.
          </p>
          <p style="font-size:15px;line-height:1.7;color:#ccc;">
            Si necesitas algo urgente, puedes escribirnos directamente a
            <a href="mailto:cerberus.dev@hotmail.com" style="color:#FF7A18;">cerberus.dev@hotmail.com</a>.
          </p>
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #222;text-align:center;">
            <p style="color:#666;font-size:12px;">
              &copy; ${new Date().getFullYear()} Cerberus Dev &bull; Guardians of Code & Servers
            </p>
          </div>
        </div>
      `
    });
    console.log(`[EMAIL] Auto-reply sent to ${email}`);
  } catch (err) {
    console.error("[EMAIL ERROR]", err.message);
  }
}

// Notify admin of new lead
async function notifyAdmin(name, email, phone, projectType, message) {
  if (!transporter || !process.env.ADMIN_EMAIL) return;

  try {
    await transporter.sendMail({
      from: `"Cerberus Dev" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `Nuevo lead: ${name} - ${projectType || "Sin tipo"}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#FF7A18;">Nuevo contacto recibido</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;"><strong>Nombre:</strong></td><td style="padding:8px 0;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#666;"><strong>Email:</strong></td><td style="padding:8px 0;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;"><strong>Teléfono:</strong></td><td style="padding:8px 0;">${phone || "No proporcionado"}</td></tr>
            <tr><td style="padding:8px 0;color:#666;"><strong>Tipo:</strong></td><td style="padding:8px 0;">${projectType || "No especificado"}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;">
            <strong>Mensaje:</strong><br>
            <p style="white-space:pre-wrap;">${message}</p>
          </div>
        </div>
      `
    });
    console.log(`[EMAIL] Admin notification sent`);
  } catch (err) {
    console.error("[EMAIL NOTIFY ERROR]", err.message);
  }
}

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim();
    const phone = String(req.body.phone || "").trim() || null;
    const project_type = String(req.body.project_type || "").trim() || null;
    const message = String(req.body.message || "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    await prisma.lead.create({
      data: {
        name,
        email,
        phone,
        projectType: project_type,
        message
      }
    });

    console.log(`[NEW LEAD] ${name} <${email}>`);

    // Create admin notification
    try {
      await prisma.adminNotification.create({
        data: {
          type: 'lead',
          refId: 0,
          title: `Nuevo lead: ${name}`,
          body: `${email} - ${project_type || "Sin tipo"}`
        }
      });
    } catch (e) {
      console.warn("[NOTIF] Could not create notification:", e.message);
    }

    // Send emails in background (don't block the response)
    sendAutoReply(name, email, project_type);
    notifyAdmin(name, email, phone, project_type, message);

    res.json({ ok: true });
  } catch (err) {
    console.error("[CONTACT ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
