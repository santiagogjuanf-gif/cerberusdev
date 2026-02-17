/**
 * @deprecated Este archivo está DEPRECADO.
 *
 * Ahora usamos Prisma ORM para todas las consultas a la base de datos.
 * Ver: /lib/prisma.js
 *
 * Este archivo se mantiene temporalmente por compatibilidad.
 * Será eliminado en futuras versiones.
 */

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

console.warn("[DEPRECATED] config/db.js - Por favor usa Prisma en su lugar (/lib/prisma.js)");

module.exports = pool;
