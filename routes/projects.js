const router = require("express").Router();
const db = require("../config/db");

// Get all published projects
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT * FROM projects
      WHERE is_published = 1
      ORDER BY date DESC, created_at DESC
    `);

    // Attach technologies to each project
    for (const p of rows) {
      const [techs] = await db.execute(
        "SELECT tech_name, tech_icon FROM project_technologies WHERE project_id = ?",
        [p.id]
      );
      p.technologies = techs;
    }

    res.json({ ok: true, projects: rows });
  } catch (err) {
    console.error("[PROJECTS ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

// Get single project by slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [[project]] = await db.execute(
      "SELECT * FROM projects WHERE slug = ? AND is_published = 1",
      [slug]
    );

    if (!project) return res.status(404).json({ ok: false, error: "not_found" });

    const [techs] = await db.execute(
      "SELECT tech_name, tech_icon FROM project_technologies WHERE project_id = ?",
      [project.id]
    );
    project.technologies = techs;

    res.json({ ok: true, project });
  } catch (err) {
    console.error("[PROJECTS ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
