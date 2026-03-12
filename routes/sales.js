/**
 * Sales Routes - Digital Keys/Licenses Management
 */

const router = require("express").Router();
const { prisma } = require("../lib/prisma");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const emailService = require("../services/emailService");

// ============================================
// Dashboard Stats
// ============================================

router.get("/api/stats", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    // Get counts in parallel
    const [
      totalCategories,
      totalProducts,
      availableKeys,
      soldKeys,
      todaySales,
      weekSales,
      monthSales,
      recentSales
    ] = await Promise.all([
      prisma.salesCategory.count({ where: { isActive: true } }),
      prisma.salesProduct.count({ where: { isActive: true } }),
      prisma.salesKey.count({ where: { status: 'available' } }),
      prisma.salesKey.count({ where: { status: 'sold' } }),
      prisma.sale.count({ where: { createdAt: { gte: today } } }),
      prisma.sale.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.sale.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } } }
      })
    ]);

    // Get revenue stats
    const [cadRevenue, mxnRevenue] = await Promise.all([
      prisma.sale.aggregate({
        where: { currency: 'CAD', createdAt: { gte: startOfMonth } },
        _sum: { price: true }
      }),
      prisma.sale.aggregate({
        where: { currency: 'MXN', createdAt: { gte: startOfMonth } },
        _sum: { price: true }
      })
    ]);

    // Low stock products (less than 3 available keys)
    const lowStock = await prisma.$queryRaw`
      SELECT p.id, p.name, COUNT(k.id) as available_count
      FROM sales_products p
      LEFT JOIN sales_keys k ON k.product_id = p.id AND k.status = 'available'
      WHERE p.is_active = 1
      GROUP BY p.id, p.name
      HAVING available_count < 3
      ORDER BY available_count ASC
      LIMIT 5
    `;

    res.json({
      ok: true,
      stats: {
        totalCategories,
        totalProducts,
        availableKeys,
        soldKeys,
        todaySales,
        weekSales,
        monthSales,
        monthRevenueCAD: Number(cadRevenue._sum.price) || 0,
        monthRevenueMXN: Number(mxnRevenue._sum.price) || 0,
        lowStock,
        recentSales: recentSales.map(s => ({
          id: s.id,
          clientName: s.clientName,
          productName: s.product.name,
          price: Number(s.price),
          currency: s.currency,
          createdAt: s.createdAt
        }))
      }
    });
  } catch (err) {
    console.error('[Sales] Stats error:', err);
    res.status(500).json({ ok: false, error: 'Error loading stats' });
  }
});

// ============================================
// Categories CRUD
// ============================================

// List categories
router.get("/api/categories", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const categories = await prisma.salesCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { products: true } }
      }
    });
    res.json({ ok: true, categories });
  } catch (err) {
    console.error('[Sales] List categories error:', err);
    res.status(500).json({ ok: false, error: 'Error loading categories' });
  }
});

// Create category
router.post("/api/categories", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, icon, description } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const category = await prisma.salesCategory.create({
      data: { name, slug, icon, description }
    });

    res.json({ ok: true, category });
  } catch (err) {
    console.error('[Sales] Create category error:', err);
    res.status(500).json({ ok: false, error: 'Error creating category' });
  }
});

// Update category
router.put("/api/categories/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description, isActive, sortOrder } = req.body;

    const category = await prisma.salesCategory.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }),
        ...(icon !== undefined && { icon }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    });

    res.json({ ok: true, category });
  } catch (err) {
    console.error('[Sales] Update category error:', err);
    res.status(500).json({ ok: false, error: 'Error updating category' });
  }
});

// Delete category
router.delete("/api/categories/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.salesCategory.delete({ where: { id: parseInt(id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sales] Delete category error:', err);
    res.status(500).json({ ok: false, error: 'Error deleting category' });
  }
});

// ============================================
// Products CRUD
// ============================================

// List products
router.get("/api/products", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { categoryId } = req.query;

    const where = {};
    if (categoryId) where.categoryId = parseInt(categoryId);

    const products = await prisma.salesProduct.findMany({
      where,
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      include: {
        category: { select: { name: true, slug: true } },
        _count: { select: { keys: true } }
      }
    });

    // Get available keys count for each product
    const productsWithStock = await Promise.all(products.map(async (p) => {
      const availableKeys = await prisma.salesKey.count({
        where: { productId: p.id, status: 'available' }
      });
      return {
        ...p,
        basePrice: Number(p.basePrice),
        availableKeys,
        totalKeys: p._count.keys
      };
    }));

    res.json({ ok: true, products: productsWithStock });
  } catch (err) {
    console.error('[Sales] List products error:', err);
    res.status(500).json({ ok: false, error: 'Error loading products' });
  }
});

// Create product
router.post("/api/products", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { categoryId, name, description, basePrice } = req.body;
    if (!categoryId || !name) {
      return res.status(400).json({ ok: false, error: 'Category and name are required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const product = await prisma.salesProduct.create({
      data: {
        categoryId: parseInt(categoryId),
        name,
        slug,
        description,
        basePrice: basePrice || 0
      }
    });

    res.json({ ok: true, product });
  } catch (err) {
    console.error('[Sales] Create product error:', err);
    res.status(500).json({ ok: false, error: 'Error creating product' });
  }
});

// Update product
router.put("/api/products/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, basePrice, isActive, sortOrder } = req.body;

    const product = await prisma.salesProduct.update({
      where: { id: parseInt(id) },
      data: {
        ...(categoryId && { categoryId: parseInt(categoryId) }),
        ...(name && { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }),
        ...(description !== undefined && { description }),
        ...(basePrice !== undefined && { basePrice }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    });

    res.json({ ok: true, product });
  } catch (err) {
    console.error('[Sales] Update product error:', err);
    res.status(500).json({ ok: false, error: 'Error updating product' });
  }
});

// Delete product
router.delete("/api/products/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.salesProduct.delete({ where: { id: parseInt(id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sales] Delete product error:', err);
    res.status(500).json({ ok: false, error: 'Error deleting product' });
  }
});

// ============================================
// Keys CRUD
// ============================================

// List keys
router.get("/api/keys", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { productId, status } = req.query;

    const where = {};
    if (productId) where.productId = parseInt(productId);
    if (status) where.status = status;

    const keys = await prisma.salesKey.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        product: { select: { name: true, category: { select: { name: true } } } }
      }
    });

    res.json({ ok: true, keys });
  } catch (err) {
    console.error('[Sales] List keys error:', err);
    res.status(500).json({ ok: false, error: 'Error loading keys' });
  }
});

// Add single key
router.post("/api/keys", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { productId, licenseKey, notes } = req.body;
    if (!productId || !licenseKey) {
      return res.status(400).json({ ok: false, error: 'Product and license key are required' });
    }

    const key = await prisma.salesKey.create({
      data: {
        productId: parseInt(productId),
        licenseKey,
        notes
      }
    });

    res.json({ ok: true, key });
  } catch (err) {
    console.error('[Sales] Create key error:', err);
    res.status(500).json({ ok: false, error: 'Error creating key' });
  }
});

// Add bulk keys
router.post("/api/keys/bulk", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { productId, keys } = req.body;
    if (!productId || !keys || !Array.isArray(keys)) {
      return res.status(400).json({ ok: false, error: 'Product and keys array are required' });
    }

    const created = await prisma.salesKey.createMany({
      data: keys.filter(k => k.trim()).map(licenseKey => ({
        productId: parseInt(productId),
        licenseKey: licenseKey.trim()
      }))
    });

    res.json({ ok: true, count: created.count });
  } catch (err) {
    console.error('[Sales] Bulk create keys error:', err);
    res.status(500).json({ ok: false, error: 'Error creating keys' });
  }
});

// Update key
router.put("/api/keys/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { licenseKey, status, notes } = req.body;

    const key = await prisma.salesKey.update({
      where: { id: parseInt(id) },
      data: {
        ...(licenseKey && { licenseKey }),
        ...(status && { status }),
        ...(notes !== undefined && { notes })
      }
    });

    res.json({ ok: true, key });
  } catch (err) {
    console.error('[Sales] Update key error:', err);
    res.status(500).json({ ok: false, error: 'Error updating key' });
  }
});

// Delete key
router.delete("/api/keys/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.salesKey.delete({ where: { id: parseInt(id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sales] Delete key error:', err);
    res.status(500).json({ ok: false, error: 'Error deleting key' });
  }
});

// ============================================
// Sales / Register Sale
// ============================================

// Get sale history
router.get("/api/sales", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20, productId, currency, startDate, endDate } = req.query;

    const where = {};
    if (productId) where.productId = parseInt(productId);
    if (currency) where.currency = currency;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { name: true, category: { select: { name: true, slug: true } } } },
          key: { select: { licenseKey: true } }
        }
      }),
      prisma.sale.count({ where })
    ]);

    res.json({
      ok: true,
      sales: sales.map(s => ({
        ...s,
        price: Number(s.price),
        licenseKey: s.key?.licenseKey || s.manualKey
      })),
      total,
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('[Sales] List sales error:', err);
    res.status(500).json({ ok: false, error: 'Error loading sales' });
  }
});

// Get products with available keys for sale modal
router.get("/api/products-for-sale", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const products = await prisma.salesProduct.findMany({
      where: { isActive: true },
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { name: true, slug: true } },
        keys: {
          where: { status: 'available' },
          select: { id: true }
        }
      }
    });

    res.json({
      ok: true,
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        categoryName: p.category.name,
        categorySlug: p.category.slug,
        basePrice: Number(p.basePrice),
        availableKeys: p.keys.length
      }))
    });
  } catch (err) {
    console.error('[Sales] Products for sale error:', err);
    res.status(500).json({ ok: false, error: 'Error loading products' });
  }
});

// Register a sale and send email
router.post("/api/sales", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const {
      productId,
      clientName,
      clientEmail,
      useInventory,
      manualKey,
      price,
      currency,
      language,
      customInstructions
    } = req.body;

    // Validation
    if (!productId || !clientName || !clientEmail || !price) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Get product info
    const product = await prisma.salesProduct.findUnique({
      where: { id: parseInt(productId) },
      include: { category: { select: { slug: true } } }
    });

    if (!product) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }

    let selectedKey = null;
    let licenseKeyToSend = manualKey;

    // If using inventory, get a random available key
    if (useInventory) {
      const availableKey = await prisma.salesKey.findFirst({
        where: { productId: parseInt(productId), status: 'available' },
        orderBy: { createdAt: 'asc' } // FIFO - first in, first out
      });

      if (!availableKey) {
        return res.status(400).json({ ok: false, error: 'No available keys in inventory' });
      }

      selectedKey = availableKey;
      licenseKeyToSend = availableKey.licenseKey;

      // Mark key as sold
      await prisma.salesKey.update({
        where: { id: availableKey.id },
        data: { status: 'sold' }
      });
    }

    // Create sale record
    const sale = await prisma.sale.create({
      data: {
        productId: parseInt(productId),
        keyId: selectedKey?.id,
        clientName,
        clientEmail,
        manualKey: !useInventory ? manualKey : null,
        price: parseFloat(price),
        currency: currency || 'CAD',
        language: language || 'es',
        customInstructions
      }
    });

    // Determine template based on category and language
    const categorySlug = product.category.slug;
    const lang = language || 'es';
    let templateCode = `sale-${categorySlug}-${lang}`;

    // Check if template exists, fallback to software generic
    const template = await prisma.emailTemplate.findUnique({
      where: { code: templateCode }
    });

    if (!template) {
      templateCode = `sale-software-${lang}`;
    }

    // Format date
    const saleDate = new Date().toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send email
    const emailResult = await emailService.sendEmail(templateCode, clientEmail, {
      clientName,
      productName: product.name,
      licenseKey: licenseKeyToSend,
      saleDate,
      customInstructions: customInstructions || ''
    });

    // Update sale with email status
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        emailSent: emailResult.success,
        emailSentAt: emailResult.success ? new Date() : null
      }
    });

    res.json({
      ok: true,
      sale: {
        id: sale.id,
        licenseKey: licenseKeyToSend,
        emailSent: emailResult.success
      }
    });
  } catch (err) {
    console.error('[Sales] Register sale error:', err);
    res.status(500).json({ ok: false, error: 'Error registering sale' });
  }
});

// Resend sale email
router.post("/api/sales/:id/resend", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(id) },
      include: {
        product: { include: { category: { select: { slug: true } } } },
        key: { select: { licenseKey: true } }
      }
    });

    if (!sale) {
      return res.status(404).json({ ok: false, error: 'Sale not found' });
    }

    const licenseKey = sale.key?.licenseKey || sale.manualKey;
    const categorySlug = sale.product.category.slug;
    let templateCode = `sale-${categorySlug}-${sale.language}`;

    const template = await prisma.emailTemplate.findUnique({
      where: { code: templateCode }
    });

    if (!template) {
      templateCode = `sale-software-${sale.language}`;
    }

    const saleDate = sale.createdAt.toLocaleDateString(sale.language === 'es' ? 'es-MX' : 'en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const emailResult = await emailService.sendEmail(templateCode, sale.clientEmail, {
      clientName: sale.clientName,
      productName: sale.product.name,
      licenseKey,
      saleDate,
      customInstructions: sale.customInstructions || ''
    });

    if (emailResult.success) {
      await prisma.sale.update({
        where: { id: sale.id },
        data: { emailSent: true, emailSentAt: new Date() }
      });
    }

    res.json({ ok: true, emailSent: emailResult.success });
  } catch (err) {
    console.error('[Sales] Resend email error:', err);
    res.status(500).json({ ok: false, error: 'Error resending email' });
  }
});

module.exports = router;
