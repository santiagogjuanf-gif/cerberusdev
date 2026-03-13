/**
 * Sales Routes - Digital Keys/Licenses Management
 * Version 2.0 - Complete System with Support, History, Stats
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
        where: { currency: 'CAD', createdAt: { gte: startOfMonth }, status: { in: ['completed', 'replaced'] } },
        _sum: { totalPrice: true }
      }),
      prisma.sale.aggregate({
        where: { currency: 'MXN', createdAt: { gte: startOfMonth }, status: { in: ['completed', 'replaced'] } },
        _sum: { totalPrice: true }
      })
    ]);

    // Low stock products
    const products = await prisma.salesProduct.findMany({
      where: { isActive: true },
      include: {
        keys: { where: { status: 'available' }, select: { id: true } }
      }
    });

    const lowStock = products
      .filter(p => p.keys.length <= p.minStockAlert)
      .map(p => ({
        id: p.id,
        name: p.name,
        available_count: p.keys.length,
        min_alert: p.minStockAlert
      }))
      .sort((a, b) => a.available_count - b.available_count)
      .slice(0, 5);

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
        monthRevenueCAD: Number(cadRevenue._sum.totalPrice) || 0,
        monthRevenueMXN: Number(mxnRevenue._sum.totalPrice) || 0,
        lowStock,
        recentSales: recentSales.map(s => ({
          id: s.id,
          clientName: s.clientName,
          productName: s.product.name,
          totalPrice: Number(s.totalPrice),
          currency: s.currency,
          status: s.status,
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
    const { categoryId, page = 1, limit = 20 } = req.query;

    const where = {};
    if (categoryId) where.categoryId = parseInt(categoryId);

    const [products, total] = await Promise.all([
      prisma.salesProduct.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
        include: {
          category: { select: { name: true, slug: true } },
          keys: { where: { status: 'available' }, select: { id: true } },
          _count: { select: { keys: true } }
        }
      }),
      prisma.salesProduct.count({ where })
    ]);

    res.json({
      ok: true,
      products: products.map(p => ({
        ...p,
        priceCad: Number(p.priceCad),
        priceMxn: Number(p.priceMxn),
        availableKeys: p.keys.length,
        totalKeys: p._count.keys,
        lowStock: p.keys.length <= p.minStockAlert
      })),
      total,
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('[Sales] List products error:', err);
    res.status(500).json({ ok: false, error: 'Error loading products' });
  }
});

// Create product
router.post("/api/products", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { categoryId, name, description, priceCad, priceMxn, minStockAlert } = req.body;
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
        priceCad: priceCad ? parseFloat(priceCad) : 0,
        priceMxn: priceMxn ? parseFloat(priceMxn) : 0,
        minStockAlert: minStockAlert ? parseInt(minStockAlert) : 3
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
    const { categoryId, name, description, priceCad, priceMxn, minStockAlert, isActive, sortOrder } = req.body;

    const product = await prisma.salesProduct.update({
      where: { id: parseInt(id) },
      data: {
        ...(categoryId && { categoryId: parseInt(categoryId) }),
        ...(name && { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }),
        ...(description !== undefined && { description }),
        ...(priceCad !== undefined && { priceCad: parseFloat(priceCad) }),
        ...(priceMxn !== undefined && { priceMxn: parseFloat(priceMxn) }),
        ...(minStockAlert !== undefined && { minStockAlert: parseInt(minStockAlert) }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) })
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
// Keys CRUD with History
// ============================================

// List keys with pagination
router.get("/api/keys", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { productId, status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (productId) where.productId = parseInt(productId);
    if (status) where.status = status;

    const [keys, total] = await Promise.all([
      prisma.salesKey.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          product: { select: { name: true, category: { select: { name: true } } } },
          sale: { select: { id: true, clientName: true, clientEmail: true, createdAt: true } }
        }
      }),
      prisma.salesKey.count({ where })
    ]);

    res.json({
      ok: true,
      keys,
      total,
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('[Sales] List keys error:', err);
    res.status(500).json({ ok: false, error: 'Error loading keys' });
  }
});

// Get key history
router.get("/api/keys/:id/history", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const [history, total] = await Promise.all([
      prisma.salesKeyHistory.findMany({
        where: { keyId: parseInt(id) },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.salesKeyHistory.count({ where: { keyId: parseInt(id) } })
    ]);

    res.json({
      ok: true,
      history: history.map(h => ({
        ...h,
        price: h.price ? Number(h.price) : null
      })),
      total,
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('[Sales] Key history error:', err);
    res.status(500).json({ ok: false, error: 'Error loading history' });
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

    // Add history entry
    await prisma.salesKeyHistory.create({
      data: {
        keyId: key.id,
        action: 'created',
        notes: 'Key added to inventory'
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

    const keysToCreate = keys.filter(k => k.trim()).map(licenseKey => ({
      productId: parseInt(productId),
      licenseKey: licenseKey.trim()
    }));

    const created = await prisma.salesKey.createMany({
      data: keysToCreate
    });

    // Get created keys for history
    const createdKeys = await prisma.salesKey.findMany({
      where: {
        productId: parseInt(productId),
        licenseKey: { in: keysToCreate.map(k => k.licenseKey) }
      },
      select: { id: true }
    });

    // Add history entries
    await prisma.salesKeyHistory.createMany({
      data: createdKeys.map(k => ({
        keyId: k.id,
        action: 'created',
        notes: 'Key added via bulk import'
      }))
    });

    res.json({ ok: true, count: created.count });
  } catch (err) {
    console.error('[Sales] Bulk create keys error:', err);
    res.status(500).json({ ok: false, error: 'Error creating keys' });
  }
});

// Update key status (return, mark defective, reactivate)
router.put("/api/keys/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, failureReason, notes } = req.body;

    const currentKey = await prisma.salesKey.findUnique({
      where: { id: parseInt(id) }
    });

    if (!currentKey) {
      return res.status(404).json({ ok: false, error: 'Key not found' });
    }

    const key = await prisma.salesKey.update({
      where: { id: parseInt(id) },
      data: {
        ...(status && { status }),
        ...(failureReason !== undefined && { failureReason }),
        ...(notes !== undefined && { notes })
      }
    });

    // Add history entry if status changed
    if (status && status !== currentKey.status) {
      let action = 'reactivated';
      if (status === 'returned') action = 'returned';
      else if (status === 'defective') action = 'marked_defective';
      else if (status === 'refunded') action = 'refunded';
      else if (status === 'available') action = 'reactivated';

      await prisma.salesKeyHistory.create({
        data: {
          keyId: key.id,
          action,
          notes: failureReason || notes || `Status changed to ${status}`
        }
      });
    }

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

    // Check if key has been sold
    const key = await prisma.salesKey.findUnique({
      where: { id: parseInt(id) },
      include: { sale: true }
    });

    if (key?.sale) {
      return res.status(400).json({ ok: false, error: 'Cannot delete a sold key' });
    }

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

// Get sale history with pagination
router.get("/api/sales", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20, productId, currency, status, startDate, endDate } = req.query;

    const where = {};
    if (productId) where.productId = parseInt(productId);
    if (currency) where.currency = currency;
    if (status) where.status = status;
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
        basePrice: Number(s.basePrice),
        supportPrice: Number(s.supportPrice),
        totalPrice: Number(s.totalPrice),
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
    const categories = await prisma.salesCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            keys: {
              where: { status: 'available' },
              select: { id: true }
            }
          }
        }
      }
    });

    res.json({
      ok: true,
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        products: c.products.map(p => ({
          id: p.id,
          name: p.name,
          priceCad: Number(p.priceCad),
          priceMxn: Number(p.priceMxn),
          availableKeys: p.keys.length
        }))
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
      useInventory = true,
      manualKey,
      basePrice,
      supportPrice = 0,
      currency,
      language,
      includesSupport = false,
      customInstructions
    } = req.body;

    // Validation
    if (!productId || !clientName || !clientEmail || basePrice === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const totalPrice = parseFloat(basePrice) + parseFloat(supportPrice || 0);

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

    // If using inventory, get first available key (FIFO)
    if (useInventory) {
      const availableKey = await prisma.salesKey.findFirst({
        where: { productId: parseInt(productId), status: 'available' },
        orderBy: { createdAt: 'asc' }
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
        basePrice: parseFloat(basePrice),
        supportPrice: parseFloat(supportPrice || 0),
        totalPrice,
        currency: currency || 'CAD',
        language: language || 'es',
        includesSupport,
        customInstructions,
        status: 'completed'
      }
    });

    // Add key history entry
    if (selectedKey) {
      await prisma.salesKeyHistory.create({
        data: {
          keyId: selectedKey.id,
          action: 'sold',
          saleId: sale.id,
          clientName,
          clientEmail,
          price: totalPrice,
          currency: currency || 'CAD',
          notes: includesSupport ? 'Sale with support' : 'Sale without support'
        }
      });
    }

    // Determine template based on category and language
    const categorySlug = product.category.slug;
    const lang = language || 'es';
    let templateCode = `sale-${categorySlug}-${lang}`;

    // Check if template exists, fallback to generic
    const template = await prisma.emailTemplate.findUnique({
      where: { code: templateCode }
    });

    if (!template) {
      templateCode = `sale-generic-${lang}`;
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
        totalPrice,
        emailSent: emailResult.success
      }
    });
  } catch (err) {
    console.error('[Sales] Register sale error:', err);
    res.status(500).json({ ok: false, error: 'Error registering sale' });
  }
});

// Update sale status (support, replaced, refunded)
router.put("/api/sales/:id", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, supportNotes } = req.body;

    const sale = await prisma.sale.update({
      where: { id: parseInt(id) },
      data: {
        ...(status && { status }),
        ...(supportNotes !== undefined && { supportNotes })
      }
    });

    res.json({ ok: true, sale });
  } catch (err) {
    console.error('[Sales] Update sale error:', err);
    res.status(500).json({ ok: false, error: 'Error updating sale' });
  }
});

// Replace key for a sale
router.post("/api/sales/:id/replace-key", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(id) },
      include: { key: true, product: true }
    });

    if (!sale) {
      return res.status(404).json({ ok: false, error: 'Sale not found' });
    }

    // Get new available key
    const newKey = await prisma.salesKey.findFirst({
      where: { productId: sale.productId, status: 'available' },
      orderBy: { createdAt: 'asc' }
    });

    if (!newKey) {
      return res.status(400).json({ ok: false, error: 'No available keys to replace' });
    }

    // Mark old key as returned
    if (sale.keyId) {
      await prisma.salesKey.update({
        where: { id: sale.keyId },
        data: { status: 'returned', failureReason: reason }
      });

      await prisma.salesKeyHistory.create({
        data: {
          keyId: sale.keyId,
          action: 'returned',
          saleId: sale.id,
          clientName: sale.clientName,
          clientEmail: sale.clientEmail,
          notes: reason || 'Key returned - replacement requested'
        }
      });
    }

    // Assign new key
    await prisma.salesKey.update({
      where: { id: newKey.id },
      data: { status: 'sold' }
    });

    await prisma.salesKeyHistory.create({
      data: {
        keyId: newKey.id,
        action: 'sold',
        saleId: sale.id,
        clientName: sale.clientName,
        clientEmail: sale.clientEmail,
        notes: 'Replacement key assigned'
      }
    });

    // Update sale
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        keyId: newKey.id,
        replacedKeyId: sale.keyId,
        status: 'replaced',
        supportNotes: reason
      }
    });

    // Send new email with replacement key
    const lang = sale.language || 'es';
    const templateCode = `sale-generic-${lang}`;

    const saleDate = new Date().toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    await emailService.sendEmail(templateCode, sale.clientEmail, {
      clientName: sale.clientName,
      productName: sale.product.name,
      licenseKey: newKey.licenseKey,
      saleDate,
      customInstructions: lang === 'es'
        ? 'Esta es tu nueva llave de reemplazo.'
        : 'This is your replacement key.'
    });

    res.json({
      ok: true,
      newKey: newKey.licenseKey
    });
  } catch (err) {
    console.error('[Sales] Replace key error:', err);
    res.status(500).json({ ok: false, error: 'Error replacing key' });
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
      templateCode = `sale-generic-${sale.language}`;
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

// ============================================
// Statistics & Reports
// ============================================

router.get("/api/statistics", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate, currency } = req.query;

    // Default to current month
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const where = {
      createdAt: { gte: start, lte: end },
      status: { in: ['completed', 'replaced'] }
    };
    if (currency) where.currency = currency;

    // Total sales and revenue
    const [totalSales, revenueCAD, revenueMXN, totalKeys, availableKeys, soldKeys] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where: { ...where, currency: 'CAD' },
        _sum: { totalPrice: true }
      }),
      prisma.sale.aggregate({
        where: { ...where, currency: 'MXN' },
        _sum: { totalPrice: true }
      }),
      prisma.salesKey.count(),
      prisma.salesKey.count({ where: { status: 'available' } }),
      prisma.salesKey.count({ where: { status: 'sold' } })
    ]);

    // Sales by product
    const salesByProduct = await prisma.sale.groupBy({
      by: ['productId'],
      where,
      _count: { id: true },
      _sum: { totalPrice: true },
      orderBy: { _count: { id: 'desc' } }
    });

    // Get product names
    const productIds = salesByProduct.map(s => s.productId);
    const products = await prisma.salesProduct.findMany({
      where: { id: { in: productIds } },
      include: { category: { select: { name: true } } }
    });

    const productMap = {};
    products.forEach(p => {
      productMap[p.id] = { name: p.name, category: p.category.name };
    });

    // Sales with support
    const salesWithSupport = await prisma.sale.count({
      where: { ...where, includesSupport: true }
    });

    // Refunded sales
    const refundedSales = await prisma.sale.count({
      where: { createdAt: { gte: start, lte: end }, status: 'refunded' }
    });

    res.json({
      ok: true,
      stats: {
        period: { start, end },
        totalSales,
        revenueCAD: Number(revenueCAD._sum.totalPrice) || 0,
        revenueMXN: Number(revenueMXN._sum.totalPrice) || 0,
        salesWithSupport,
        refundedSales,
        inventory: {
          total: totalKeys,
          available: availableKeys,
          sold: soldKeys
        },
        byProduct: salesByProduct.map(s => ({
          productId: s.productId,
          productName: productMap[s.productId]?.name || 'Unknown',
          categoryName: productMap[s.productId]?.category || 'Unknown',
          count: s._count.id,
          revenue: Number(s._sum.totalPrice) || 0
        }))
      }
    });
  } catch (err) {
    console.error('[Sales] Statistics error:', err);
    res.status(500).json({ ok: false, error: 'Error loading statistics' });
  }
});

// Export sales to CSV
router.get("/api/export", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { include: { category: { select: { name: true } } } },
        key: { select: { licenseKey: true } }
      }
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['ID', 'Fecha', 'Categoria', 'Producto', 'Cliente', 'Email', 'Precio Base', 'Soporte', 'Total', 'Moneda', 'Estado', 'Llave'];
      const rows = sales.map(s => [
        s.id,
        s.createdAt.toISOString().split('T')[0],
        s.product.category.name,
        s.product.name,
        s.clientName,
        s.clientEmail,
        Number(s.basePrice),
        Number(s.supportPrice),
        Number(s.totalPrice),
        s.currency,
        s.status,
        s.key?.licenseKey || s.manualKey || ''
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sales-export-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      // JSON format
      res.json({
        ok: true,
        sales: sales.map(s => ({
          id: s.id,
          date: s.createdAt,
          category: s.product.category.name,
          product: s.product.name,
          client: s.clientName,
          email: s.clientEmail,
          basePrice: Number(s.basePrice),
          supportPrice: Number(s.supportPrice),
          totalPrice: Number(s.totalPrice),
          currency: s.currency,
          status: s.status,
          licenseKey: s.key?.licenseKey || s.manualKey
        }))
      });
    }
  } catch (err) {
    console.error('[Sales] Export error:', err);
    res.status(500).json({ ok: false, error: 'Error exporting sales' });
  }
});

// Get low stock alerts
router.get("/api/alerts", requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const products = await prisma.salesProduct.findMany({
      where: { isActive: true },
      include: {
        category: { select: { name: true } },
        keys: { where: { status: 'available' }, select: { id: true } }
      }
    });

    const lowStock = products
      .filter(p => p.keys.length <= p.minStockAlert)
      .map(p => ({
        id: p.id,
        name: p.name,
        category: p.category.name,
        availableKeys: p.keys.length,
        minAlert: p.minStockAlert
      }))
      .sort((a, b) => a.availableKeys - b.availableKeys);

    res.json({ ok: true, alerts: lowStock });
  } catch (err) {
    console.error('[Sales] Alerts error:', err);
    res.status(500).json({ ok: false, error: 'Error loading alerts' });
  }
});

module.exports = router;
