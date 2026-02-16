const router = require("express").Router();
const { prisma } = require("../lib/prisma");

// Helper function to apply translations based on language
function applyTranslation(item, lang) {
  if (lang === "en") {
    if (item.titleEn) item.title = item.titleEn;
    if (item.tagEn) item.tag = item.tagEn;
    if (item.descriptionEn) item.description = item.descriptionEn;
    if (item.contentEn) item.content = item.contentEn;
  }
  return item;
}

// Get all published projects
router.get("/", async (req, res) => {
  try {
    const lang = req.query.lang || "es";

    const projects = await prisma.project.findMany({
      where: {
        isPublished: true
      },
      include: {
        technologies: {
          select: {
            techName: true,
            techIcon: true
          }
        },
        images: {
          select: {
            imageUrl: true
          },
          orderBy: {
            sortOrder: 'asc'
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Transform to snake_case for frontend compatibility
    const rows = projects.map(p => {
      const project = {
        ...p,
        image_url: p.imageUrl,
        is_published: p.isPublished,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        title_en: p.titleEn,
        tag_en: p.tagEn,
        description_en: p.descriptionEn,
        content_en: p.contentEn,
        technologies: p.technologies.map(t => ({
          tech_name: t.techName,
          tech_icon: t.techIcon
        })),
        images: p.images.map(i => i.imageUrl)
      };
      applyTranslation(project, lang);
      return project;
    });

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

    const project = await prisma.project.findFirst({
      where: {
        slug,
        isPublished: true
      },
      include: {
        technologies: {
          select: {
            techName: true,
            techIcon: true
          }
        },
        images: {
          select: {
            imageUrl: true
          },
          orderBy: {
            sortOrder: 'asc'
          }
        }
      }
    });

    if (!project) return res.status(404).json({ ok: false, error: "not_found" });

    // Transform to snake_case for frontend compatibility
    const result = {
      ...project,
      image_url: project.imageUrl,
      is_published: project.isPublished,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      title_en: project.titleEn,
      tag_en: project.tagEn,
      description_en: project.descriptionEn,
      content_en: project.contentEn,
      technologies: project.technologies.map(t => ({
        tech_name: t.techName,
        tech_icon: t.techIcon
      })),
      images: project.images.map(i => i.imageUrl)
    };

    applyTranslation(result, lang);
    res.json({ ok: true, project: result });
  } catch (err) {
    console.error("[PROJECTS ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
