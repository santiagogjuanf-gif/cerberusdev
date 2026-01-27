const router = require("express").Router();
const db = require("../config/db");

// Get all published posts (with optional category filter)
router.get("/posts", async (req, res) => {
  try {
    const { category, limit } = req.query;
    let sql = `
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE p.is_published = 1
    `;
    const params = [];

    if (category) {
      sql += " AND c.slug = ?";
      params.push(category);
    }

    sql += " ORDER BY p.created_at DESC";

    if (limit) {
      sql += " LIMIT ?";
      params.push(Number(limit));
    }

    const [rows] = await db.execute(sql, params);
    res.json({ ok: true, posts: rows });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

// Get single post by slug
router.get("/posts/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [[post]] = await db.execute(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE p.slug = ? AND p.is_published = 1
    `, [slug]);

    if (!post) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, post });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

// Get all categories
router.get("/categories", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT c.*, COUNT(p.id) AS post_count
      FROM blog_categories c
      LEFT JOIN blog_posts p ON p.category_id = c.id AND p.is_published = 1
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    res.json({ ok: true, categories: rows });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
