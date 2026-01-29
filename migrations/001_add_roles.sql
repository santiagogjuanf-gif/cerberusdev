-- V3 Migration: Add roles system to admin_users
-- Run this migration to enable the roles feature

-- Add role column with ENUM (admin, support, client)
ALTER TABLE admin_users
ADD COLUMN role ENUM('admin', 'support', 'client') DEFAULT 'client' AFTER password_hash;

-- Add must_change_password flag for forcing password change on first login
ALTER TABLE admin_users
ADD COLUMN must_change_password TINYINT(1) DEFAULT 0 AFTER role;

-- Add email column for users
ALTER TABLE admin_users
ADD COLUMN email VARCHAR(255) NULL AFTER username;

-- Add created_at and updated_at columns
ALTER TABLE admin_users
ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER must_change_password;

ALTER TABLE admin_users
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Update existing admin users to have admin role
UPDATE admin_users SET role = 'admin' WHERE role IS NULL OR role = 'client';

-- Create tickets table for client support
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Create ticket_responses table for ticket replies
CREATE TABLE IF NOT EXISTS ticket_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Create services table for PM2 service management
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  pm2_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  user_id INT NULL,
  status ENUM('online', 'stopped', 'errored', 'unknown') DEFAULT 'unknown',
  port INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE SET NULL
);
