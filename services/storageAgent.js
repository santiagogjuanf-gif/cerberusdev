/**
 * Storage Agent - v4
 * Scans client project folders and tracks storage usage
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { prisma } = require('../lib/prisma');

// Folders to exclude from size calculation
const EXCLUSIONS = [
  'node_modules',
  '.next',
  'dist',
  '.git',
  'cache',
  '.cache',
  '__pycache__',
  'vendor',
  'tmp',
  'temp'
];

// File extensions to exclude
const EXCLUDED_EXTENSIONS = [
  '.log'
];

/**
 * Calculate folder size recursively (excluding specified folders)
 * @param {string} folderPath - Path to scan
 * @returns {Promise<{totalBytes: number, fileCount: number, excludedCount: number}>}
 */
async function calculateFolderSize(folderPath) {
  let totalBytes = 0;
  let fileCount = 0;
  let excludedCount = 0;

  async function scanDir(dirPath) {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Check if should exclude this directory
        if (entry.isDirectory()) {
          if (EXCLUSIONS.includes(entry.name)) {
            excludedCount++;
            continue;
          }
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          // Check if should exclude this file
          const ext = path.extname(entry.name).toLowerCase();
          if (EXCLUDED_EXTENSIONS.includes(ext)) {
            excludedCount++;
            continue;
          }

          try {
            const stats = await fs.promises.stat(fullPath);
            totalBytes += stats.size;
            fileCount++;
          } catch (err) {
            // Skip files we can't read
          }
        }
      }
    } catch (err) {
      console.error(`[Storage Agent] Error scanning ${dirPath}:`, err.message);
    }
  }

  await scanDir(folderPath);

  return { totalBytes, fileCount, excludedCount };
}

/**
 * Convert bytes to MB
 */
function bytesToMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/**
 * Get storage status based on percentage
 */
function getStorageStatus(percentage) {
  if (percentage >= 95) return 'critical';
  if (percentage >= 90) return 'danger';
  if (percentage >= 80) return 'warning';
  return 'ok';
}

/**
 * Get color for storage status
 */
function getStorageColor(percentage) {
  if (percentage >= 95) return '#dc2626'; // Red
  if (percentage >= 90) return '#ea580c'; // Orange
  if (percentage >= 80) return '#ca8a04'; // Yellow
  return '#16a34a'; // Green
}

/**
 * Scan a single service's storage
 * @param {number} serviceId - ClientService ID
 * @returns {Promise<object|null>}
 */
async function scanService(serviceId) {
  try {
    const service = await prisma.clientService.findUnique({
      where: { id: serviceId },
      include: {
        client: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!service || !service.folderPath) {
      return null;
    }

    // Check if folder exists
    if (!fs.existsSync(service.folderPath)) {
      console.log(`[Storage Agent] Folder not found: ${service.folderPath}`);
      return null;
    }

    console.log(`[Storage Agent] Scanning: ${service.serviceName} (${service.folderPath})`);

    const startTime = Date.now();
    const result = await calculateFolderSize(service.folderPath);
    const scanTime = Date.now() - startTime;

    const usedMb = bytesToMb(result.totalBytes);
    const limitMb = Number(service.storageLimitMb) || 5000;
    const percentage = (usedMb / limitMb) * 100;
    const status = getStorageStatus(percentage);

    // Update database
    await prisma.clientService.update({
      where: { id: serviceId },
      data: {
        storageUsedMb: usedMb,
        lastScanAt: new Date(),
        lastScanResult: {
          totalMb: usedMb,
          totalBytes: result.totalBytes,
          fileCount: result.fileCount,
          excludedCount: result.excludedCount,
          percentage: Math.round(percentage * 100) / 100,
          status,
          scanTimeMs: scanTime
        }
      }
    });

    console.log(`[Storage Agent] ${service.serviceName}: ${usedMb} MB / ${limitMb} MB (${percentage.toFixed(1)}%) - ${status}`);

    return {
      serviceId,
      serviceName: service.serviceName,
      client: service.client,
      usedMb,
      limitMb,
      percentage,
      status,
      color: getStorageColor(percentage),
      needsAlert: percentage >= service.alertThreshold
    };
  } catch (err) {
    console.error(`[Storage Agent] Error scanning service ${serviceId}:`, err.message);
    return null;
  }
}

/**
 * Scan all services with configured folder paths
 * @returns {Promise<object[]>}
 */
async function scanAllServices() {
  console.log('[Storage Agent] Starting full scan...');

  const services = await prisma.clientService.findMany({
    where: {
      folderPath: { not: null },
      status: 'active'
    }
  });

  console.log(`[Storage Agent] Found ${services.length} services to scan`);

  const results = [];
  for (const service of services) {
    const result = await scanService(service.id);
    if (result) {
      results.push(result);
    }
  }

  console.log('[Storage Agent] Full scan completed');
  return results;
}

/**
 * Check if an alert should be sent (not sent in last 24 hours)
 */
async function shouldSendAlert(serviceId) {
  const service = await prisma.clientService.findUnique({
    where: { id: serviceId },
    select: { alertSentAt: true }
  });

  if (!service || !service.alertSentAt) {
    return true;
  }

  const hoursSinceAlert = (Date.now() - service.alertSentAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceAlert >= 24;
}

/**
 * Mark alert as sent
 */
async function markAlertSent(serviceId) {
  await prisma.clientService.update({
    where: { id: serviceId },
    data: { alertSentAt: new Date() }
  });
}

/**
 * Initialize the storage agent cron job
 */
function initStorageAgent() {
  const interval = process.env.STORAGE_SCAN_INTERVAL || 6;

  // Run every X hours
  const cronExpression = `0 */${interval} * * *`;

  console.log(`[Storage Agent] Initializing with ${interval}-hour interval`);

  cron.schedule(cronExpression, async () => {
    try {
      await scanAllServices();
    } catch (err) {
      console.error('[Storage Agent] Cron error:', err.message);
    }
  });

  console.log('[Storage Agent] Cron job scheduled');
}

module.exports = {
  calculateFolderSize,
  scanService,
  scanAllServices,
  shouldSendAlert,
  markAlertSent,
  getStorageStatus,
  getStorageColor,
  bytesToMb,
  initStorageAgent
};
