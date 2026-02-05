-- Migration 003: PM2 permissions, ticket types, and targeted notifications
-- Run this migration to enable PM2 access control, internal tickets, and per-user notifications

-- ============================================
-- 1. PM2 access permission for support users
-- ============================================

ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS pm2_access TINYINT(1) DEFAULT 0 AFTER phone;

-- ============================================
-- 2. Ticket type (client vs internal request)
-- ============================================

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS ticket_type ENUM('client', 'internal') DEFAULT 'client' AFTER service_id;

-- ============================================
-- 3. Enhanced notifications with user targeting
-- ============================================

-- Add user_id for targeted notifications (NULL = global/all admins)
ALTER TABLE admin_notifications
ADD COLUMN IF NOT EXISTS user_id INT NULL AFTER type;

-- Expand notification types to include ticket events
ALTER TABLE admin_notifications
MODIFY COLUMN type ENUM('lead', 'comment', 'ticket', 'ticket_reply', 'ticket_internal') NOT NULL;

-- Add index for faster per-user notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON admin_notifications(user_id, is_read);

-- ============================================
-- 4. Update storage_used_mb to DECIMAL for precision
-- ============================================

ALTER TABLE client_services
MODIFY COLUMN storage_used_mb DECIMAL(10,2) DEFAULT 0;

ALTER TABLE client_services
MODIFY COLUMN storage_limit_mb DECIMAL(10,2) DEFAULT 5000;
