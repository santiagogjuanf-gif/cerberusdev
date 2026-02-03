-- =============================================
-- TABLA DE TECNOLOGIAS
-- Cerberus Dev - Sistema de Tecnologias
-- =============================================

-- Crear la tabla
CREATE TABLE IF NOT EXISTS technologies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  icon_url VARCHAR(255),
  category VARCHAR(50) DEFAULT 'tools',
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar las tecnologias actuales (migracion)
INSERT INTO technologies (name, slug, icon_url, category, sort_order) VALUES
('HTML5', 'html5', '/assets/img/tech/html.svg', 'frontend', 1),
('CSS3', 'css3', '/assets/img/tech/css.svg', 'frontend', 2),
('JavaScript', 'javascript', '/assets/img/tech/js.svg', 'frontend', 3),
('TypeScript', 'typescript', '/assets/img/tech/ts.svg', 'frontend', 4),
('Angular', 'angular', '/assets/img/tech/angular.svg', 'frontend', 5),
('Node.js', 'nodejs', '/assets/img/tech/node.svg', 'backend', 1),
('Express', 'express', '/assets/img/tech/express.svg', 'backend', 2),
('MySQL', 'mysql', '/assets/img/tech/mysql.svg', 'database', 1),
('SQL Server', 'sqlserver', '/assets/img/tech/mssql.svg', 'database', 2),
('Windows Server', 'windows-server', '/assets/img/tech/windows-server.svg', 'devops', 1),
('Git', 'git', '/assets/img/tech/git.svg', 'tools', 1),
('GitHub', 'github', '/assets/img/tech/github.svg', 'tools', 2);

-- Ejemplo de como agregar SQLite despues:
-- INSERT INTO technologies (name, slug, icon_url, category, sort_order) VALUES
-- ('SQLite', 'sqlite', '/assets/img/tech/sqlite.png', 'database', 3);
