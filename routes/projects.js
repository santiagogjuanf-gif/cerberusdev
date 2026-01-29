const router = require("express").Router();
const db = require("../config/db");

// Helper function to apply translations based on language
function applyTranslation(item, lang) {
  if (lang === "en") {
    if (item.title_en) item.title = item.title_en;
    if (item.tag_en) item.tag = item.tag_en;
    if (item.description_en) item.description = item.description_en;
    if (item.content_en) item.content = item.content_en;
  }
  return item;
}

// Get all published projects
router.get("/", async (req, res) => {
  try {
    const lang = req.query.lang || "es";
    const [rows] = await db.execute(`
      SELECT * FROM projects
      WHERE is_published = 1
      ORDER BY date DESC, created_at DESC
    `);

    // Attach technologies and images to each project
    for (const p of rows) {
      const [techs] = await db.execute(
        "SELECT tech_name, tech_icon FROM project_technologies WHERE project_id = ?",
        [p.id]
      );
      const [images] = await db.execute(
        "SELECT image_url FROM project_images WHERE project_id = ? ORDER BY sort_order ASC",
        [p.id]
      );
      p.technologies = techs;
      p.images = images.map(i => i.image_url);
      applyTranslation(p, lang);
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
    const lang = req.query.lang || "es";
    const [[project]] = await db.execute(
      "SELECT * FROM projects WHERE slug = ? AND is_published = 1",
      [slug]
    );

    if (!project) return res.status(404).json({ ok: false, error: "not_found" });

    const [techs] = await db.execute(
      "SELECT tech_name, tech_icon FROM project_technologies WHERE project_id = ?",
      [project.id]
    );
    const [images] = await db.execute(
      "SELECT image_url FROM project_images WHERE project_id = ? ORDER BY sort_order ASC",
      [project.id]
    );
    project.technologies = techs;
    project.images = images.map(i => i.image_url);
    applyTranslation(project, lang);

    res.json({ ok: true, project });
  } catch (err) {
    console.error("[PROJECTS ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
