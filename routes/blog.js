const router = require("express").Router();
const { prisma } = require("../lib/prisma");

// Helper function to apply translations based on language
function applyTranslation(post, lang) {
  if (lang === "en") {
    if (post.titleEn) post.title = post.titleEn;
    if (post.excerptEn) post.excerpt = post.excerptEn;
    if (post.contentEn) post.content = post.contentEn;
  }
  return post;
}

// Get all published posts (with optional category filter)
router.get("/posts", async (req, res) => {
  try {
    const { category, limit, lang } = req.query;
    const currentLang = lang || "es";

    const where = {
      isPublished: true
    };

    if (category) {
      where.category = {
        slug: category
      };
    }

    const posts = await prisma.blogPost.findMany({
      where,
      include: {
        category: {
          select: {
            name: true,
            slug: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit ? Number(limit) : undefined
    });

    // Transform to match expected format
    const rows = posts.map(post => ({
      ...post,
      category_name: post.category?.name || null,
      category_slug: post.category?.slug || null
    }));

    rows.forEach(post => applyTranslation(post, currentLang));
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
    const lang = req.query.lang || "es";

    const post = await prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true
      },
      include: {
        category: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });

    if (!post) return res.status(404).json({ ok: false, error: "not_found" });

    const result = {
      ...post,
      category_name: post.category?.name || null,
      category_slug: post.category?.slug || null
    };

    applyTranslation(result, lang);
    res.json({ ok: true, post: result });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

// Get all categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await prisma.blogCategory.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: {
                isPublished: true
              }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Transform to match expected format
    const rows = categories.map(cat => ({
      ...cat,
      post_count: cat._count.posts
    }));

    res.json({ ok: true, categories: rows });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

// Get approved comments for a post
router.get("/posts/:slug/comments", async (req, res) => {
  try {
    const { slug } = req.params;

    // Get post id from slug
    const post = await prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true
      },
      select: { id: true }
    });

    if (!post) return res.json({ ok: true, comments: [] });

    const comments = await prisma.blogComment.findMany({
      where: {
        postId: post.id,
        isApproved: true
      },
      select: {
        id: true,
        authorName: true,
        comment: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform to snake_case for frontend compatibility
    const rows = comments.map(c => ({
      id: c.id,
      author_name: c.authorName,
      comment: c.comment,
      created_at: c.createdAt
    }));

    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.json({ ok: true, comments: [] });
  }
});

// Submit a comment (public)
router.post("/posts/:slug/comments", async (req, res) => {
  try {
    const { slug } = req.params;
    const { author_name, comment } = req.body;

    if (!author_name || !comment) {
      return res.status(400).json({ ok: false, error: "name_and_comment_required" });
    }

    // Get post
    const post = await prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true
      },
      select: { id: true, title: true }
    });

    if (!post) return res.status(404).json({ ok: false, error: "post_not_found" });

    // Insert comment (pending approval)
    await prisma.blogComment.create({
      data: {
        postId: post.id,
        authorName: author_name.substring(0, 100),
        comment: comment.substring(0, 2000)
      }
    });

    // Create admin notification
    try {
      await prisma.adminNotification.create({
        data: {
          type: 'comment',
          refId: post.id,
          title: `Nuevo comentario en: ${post.title}`,
          body: `${author_name} dejo un comentario`
        }
      });
    } catch (e) {
      console.warn("[NOTIF] Could not create notification:", e.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[BLOG ERROR]", err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
