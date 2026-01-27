const router = require("express").Router();
const db = require("../config/db");

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

    await db.execute(
      `INSERT INTO leads (name, email, phone, project_type, message)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, phone, project_type, message]
    );

    console.log(`[NEW LEAD] ${name} <${email}>`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[CONTACT ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
