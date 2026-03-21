-- Migration: Add custom_instructions column to sales table
-- Run this SQL in your MySQL database to add the missing column
-- Then run: npx prisma generate

ALTER TABLE `sales`
ADD COLUMN `custom_instructions` TEXT NULL AFTER `language`;

-- Verify the column was added:
-- DESCRIBE sales;
