/**
 * Prisma Client - Database ORM
 *
 * Usage: const { prisma } = require('./lib/prisma');
 *
 * This file initializes a single Prisma Client instance
 * to be shared across the application (singleton pattern).
 */

const { PrismaClient } = require('@prisma/client');

// Create a single instance of Prisma Client
const prisma = new PrismaClient({
  // Log queries in development
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

// Handle cleanup on app shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = { prisma };
