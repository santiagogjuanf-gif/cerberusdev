-- V2 Ticket System Migration
-- Enhanced ticket system with attachments, client services, and improved states

-- ============================================
-- 1. Update admin_users table
-- ============================================

-- Add full_name column if not exists
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(150) NULL AFTER email;

-- Add company column for clients
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS company VARCHAR(200) NULL AFTER full_name;

-- Add phone column
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL AFTER company;

-- Add is_active column
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1 AFTER phone;

-- ============================================
-- 2. Client Services table
-- ============================================

CREATE TABLE IF NOT EXISTS client_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  service_name VARCHAR(200) NOT NULL,
  domain VARCHAR(255) NULL,
  description TEXT NULL,
  service_type ENUM('web', 'api', 'system', 'hosting', 'maintenance', 'other') DEFAULT 'web',
  status ENUM('active', 'suspended', 'cancelled') DEFAULT 'active',
  storage_used_mb INT DEFAULT 0,
  storage_limit_mb INT DEFAULT 5000,
  start_date DATE NULL,
  end_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- ============================================
-- 3. Update tickets table with new status values
-- ============================================

-- Drop and recreate tickets table with new structure
-- First backup existing data if any
CREATE TABLE IF NOT EXISTS tickets_backup AS SELECT * FROM tickets;

-- Drop old tables
DROP TABLE IF EXISTS ticket_responses;
DROP TABLE IF EXISTS tickets;

-- Create new tickets table with updated status
CREATE TABLE tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  assigned_to INT NULL,
  service_id INT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('new', 'in_progress', 'waiting_client', 'closed') DEFAULT 'new',
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  FOREIGN KEY (client_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES admin_users(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES client_services(id) ON DELETE SET NULL
);

-- ============================================
-- 4. Ticket messages table
-- ============================================

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  is_internal TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- ============================================
-- 5. Ticket attachments table
-- ============================================

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NULL,
  message_id INT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ticket_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- ============================================
-- 6. Create indexes for performance
-- ============================================

CREATE INDEX idx_tickets_client ON tickets(client_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX idx_client_services_client ON client_services(client_id);

-- ============================================
-- 7. Drop backup table if migration successful
-- ============================================
-- DROP TABLE IF EXISTS tickets_backup;
