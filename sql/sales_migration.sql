-- ============================================
-- Sales System Migration
-- Digital Keys/Licenses Management
-- ============================================

-- Sales Categories
CREATE TABLE IF NOT EXISTS sales_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(50),
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sales Products
CREATE TABLE IF NOT EXISTS sales_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  image_url VARCHAR(500),
  base_price DECIMAL(10, 2) DEFAULT 0.00,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES sales_categories(id) ON DELETE CASCADE,
  INDEX idx_sales_products_category (category_id)
);

-- Sales Keys (License Inventory)
CREATE TABLE IF NOT EXISTS sales_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  license_key VARCHAR(500) NOT NULL,
  status ENUM('available', 'sold', 'reserved') DEFAULT 'available',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sales_products(id) ON DELETE CASCADE,
  INDEX idx_sales_keys_product (product_id),
  INDEX idx_sales_keys_status (status)
);

-- Sales (Transactions)
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  key_id INT UNIQUE,
  client_name VARCHAR(150) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  manual_key VARCHAR(500),
  price DECIMAL(10, 2) NOT NULL,
  currency ENUM('CAD', 'MXN') DEFAULT 'CAD',
  language ENUM('es', 'en') DEFAULT 'es',
  custom_instructions TEXT,
  email_sent TINYINT(1) DEFAULT 0,
  email_sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sales_products(id) ON DELETE RESTRICT,
  FOREIGN KEY (key_id) REFERENCES sales_keys(id) ON DELETE SET NULL,
  INDEX idx_sales_product (product_id),
  INDEX idx_sales_created (created_at)
);

-- Insert default categories
INSERT INTO sales_categories (name, slug, icon, description, sort_order) VALUES
('Windows', 'windows', '1F4BB', 'Licencias de Windows 7, 10, 11', 1),
('Office', 'office', '1F4BC', 'Microsoft Office 2021, 2024, 365', 2),
('Antivirus', 'antivirus', '1F6E1', 'Norton, Kaspersky, ESET, Bitdefender', 3),
('Adobe', 'adobe', '1F3A8', 'Photoshop, Premiere, Illustrator', 4),
('Software', 'software', '1F4BF', 'Otros programas y licencias', 5);

-- Insert email templates for sales
INSERT INTO email_templates (code, name, subject, html_content, is_active) VALUES
('sale-windows-es', 'Venta Windows (ES)', 'Tu licencia de {{productName}} - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hola {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Gracias por tu compra. Aqui estan los detalles de tu licencia:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">Detalles de tu Licencia</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Producto:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Licencia:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Fecha:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Instrucciones de Activacion
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Ve a <strong style="color: #fff;">Configuracion</strong> > <strong style="color: #fff;">Sistema</strong> > <strong style="color: #fff;">Activacion</strong></li>
  <li style="padding: 8px 0;">Haz clic en <strong style="color: #fff;">"Cambiar clave de producto"</strong></li>
  <li style="padding: 8px 0;">Ingresa la licencia proporcionada arriba</li>
  <li style="padding: 8px 0;">Haz clic en <strong style="color: #fff;">"Siguiente"</strong> y espera la validacion</li>
  <li style="padding: 8px 0;">Listo! Tu Windows esta activado</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANTE:</strong><br>
    - Esta licencia es para uso personal unicamente<br>
    - No puede ser revendida ni transferida<br>
    - Una licencia = Un dispositivo<br>
    - No nos hacemos responsables por mal uso
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> ¿Necesitas Ayuda?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a> (Haz clic para chatear)
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>

<p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 12px; text-align: center;">
  Respondemos en menos de 24 horas
</p>
', 1),

('sale-windows-en', 'Venta Windows (EN)', 'Your {{productName}} License - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hello {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Thank you for your purchase. Here are your license details:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">License Details</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Product:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">License:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Date:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Activation Instructions
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Go to <strong style="color: #fff;">Settings</strong> > <strong style="color: #fff;">System</strong> > <strong style="color: #fff;">Activation</strong></li>
  <li style="padding: 8px 0;">Click on <strong style="color: #fff;">"Change product key"</strong></li>
  <li style="padding: 8px 0;">Enter the license key provided above</li>
  <li style="padding: 8px 0;">Click <strong style="color: #fff;">"Next"</strong> and wait for validation</li>
  <li style="padding: 8px 0;">Done! Your Windows is now activated</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANT:</strong><br>
    - This license is for personal use only<br>
    - Cannot be resold or transferred<br>
    - One license = One device<br>
    - We are not responsible for misuse
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> Need Help?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a> (Click to chat)
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>

<p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 12px; text-align: center;">
  We respond within 24 hours
</p>
', 1),

('sale-office-es', 'Venta Office (ES)', 'Tu licencia de {{productName}} - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hola {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Gracias por tu compra. Aqui estan los detalles de tu licencia de Office:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">Detalles de tu Licencia</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Producto:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Licencia:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Fecha:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Instrucciones de Activacion
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Abre cualquier aplicacion de Office (Word, Excel, etc.)</li>
  <li style="padding: 8px 0;">Ve a <strong style="color: #fff;">Archivo</strong> > <strong style="color: #fff;">Cuenta</strong></li>
  <li style="padding: 8px 0;">Haz clic en <strong style="color: #fff;">"Cambiar clave de producto"</strong></li>
  <li style="padding: 8px 0;">Ingresa la licencia proporcionada</li>
  <li style="padding: 8px 0;">Sigue las instrucciones en pantalla</li>
  <li style="padding: 8px 0;">Listo! Tu Office esta activado</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANTE:</strong><br>
    - Esta licencia es para uso personal unicamente<br>
    - No puede ser revendida ni transferida<br>
    - Una licencia = Un dispositivo<br>
    - No nos hacemos responsables por mal uso
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> ¿Necesitas Ayuda?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-office-en', 'Venta Office (EN)', 'Your {{productName}} License - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hello {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Thank you for your purchase. Here are your Office license details:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">License Details</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Product:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">License:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Date:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Activation Instructions
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Open any Office application (Word, Excel, etc.)</li>
  <li style="padding: 8px 0;">Go to <strong style="color: #fff;">File</strong> > <strong style="color: #fff;">Account</strong></li>
  <li style="padding: 8px 0;">Click on <strong style="color: #fff;">"Change product key"</strong></li>
  <li style="padding: 8px 0;">Enter the license key provided</li>
  <li style="padding: 8px 0;">Follow the on-screen instructions</li>
  <li style="padding: 8px 0;">Done! Your Office is now activated</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANT:</strong><br>
    - This license is for personal use only<br>
    - Cannot be resold or transferred<br>
    - One license = One device<br>
    - We are not responsible for misuse
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> Need Help?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-antivirus-es', 'Venta Antivirus (ES)', 'Tu licencia de {{productName}} - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hola {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Gracias por tu compra. Aqui estan los detalles de tu licencia de antivirus:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">Detalles de tu Licencia</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Producto:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Licencia:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Fecha:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Instrucciones de Instalacion
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Descarga el instalador desde la pagina oficial del antivirus</li>
  <li style="padding: 8px 0;">Ejecuta el instalador y sigue las instrucciones</li>
  <li style="padding: 8px 0;">Cuando te pida la licencia, ingresa la clave proporcionada</li>
  <li style="padding: 8px 0;">Completa la activacion en linea</li>
  <li style="padding: 8px 0;">Listo! Tu antivirus esta activado</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANTE:</strong><br>
    - Esta licencia es para uso personal unicamente<br>
    - No puede ser revendida ni transferida<br>
    - Una licencia = Un dispositivo<br>
    - No nos hacemos responsables por mal uso
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> ¿Necesitas Ayuda?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-antivirus-en', 'Venta Antivirus (EN)', 'Your {{productName}} License - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hello {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Thank you for your purchase. Here are your antivirus license details:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">License Details</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Product:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">License:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Date:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Installation Instructions
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Download the installer from the official antivirus website</li>
  <li style="padding: 8px 0;">Run the installer and follow the instructions</li>
  <li style="padding: 8px 0;">When prompted for a license, enter the key provided</li>
  <li style="padding: 8px 0;">Complete the online activation</li>
  <li style="padding: 8px 0;">Done! Your antivirus is now activated</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANT:</strong><br>
    - This license is for personal use only<br>
    - Cannot be resold or transferred<br>
    - One license = One device<br>
    - We are not responsible for misuse
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> Need Help?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-adobe-es', 'Venta Adobe (ES)', 'Tu licencia de {{productName}} - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hola {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Gracias por tu compra. Aqui estan los detalles de tu licencia de Adobe:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">Detalles de tu Licencia</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Producto:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Licencia:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Fecha:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Instrucciones de Activacion
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Abre la aplicacion de Adobe</li>
  <li style="padding: 8px 0;">Ve a <strong style="color: #fff;">Ayuda</strong> > <strong style="color: #fff;">Iniciar sesion</strong> o <strong style="color: #fff;">Activar</strong></li>
  <li style="padding: 8px 0;">Selecciona <strong style="color: #fff;">"Tengo un numero de serie"</strong></li>
  <li style="padding: 8px 0;">Ingresa la licencia proporcionada</li>
  <li style="padding: 8px 0;">Listo! Tu producto Adobe esta activado</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANTE:</strong><br>
    - Esta licencia es para uso personal unicamente<br>
    - No puede ser revendida ni transferida<br>
    - Una licencia = Un dispositivo<br>
    - No nos hacemos responsables por mal uso
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> ¿Necesitas Ayuda?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-adobe-en', 'Venta Adobe (EN)', 'Your {{productName}} License - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hello {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Thank you for your purchase. Here are your Adobe license details:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">License Details</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Product:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">License:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Date:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Activation Instructions
</h3>

<ol style="margin: 0 0 25px; padding-left: 20px; color: #b0b0b0;">
  <li style="padding: 8px 0;">Open the Adobe application</li>
  <li style="padding: 8px 0;">Go to <strong style="color: #fff;">Help</strong> > <strong style="color: #fff;">Sign in</strong> or <strong style="color: #fff;">Activate</strong></li>
  <li style="padding: 8px 0;">Select <strong style="color: #fff;">"I have a serial number"</strong></li>
  <li style="padding: 8px 0;">Enter the license key provided</li>
  <li style="padding: 8px 0;">Done! Your Adobe product is now activated</li>
</ol>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANT:</strong><br>
    - This license is for personal use only<br>
    - Cannot be resold or transferred<br>
    - One license = One device<br>
    - We are not responsible for misuse
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> Need Help?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-software-es', 'Venta Software Generico (ES)', 'Tu licencia de {{productName}} - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hola {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Gracias por tu compra. Aqui estan los detalles de tu licencia:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">Detalles de tu Licencia</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Producto:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Licencia:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Fecha:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Instrucciones
</h3>

<div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin: 20px 0;">
  {{customInstructions}}
</div>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANTE:</strong><br>
    - Esta licencia es para uso personal unicamente<br>
    - No puede ser revendida ni transferida<br>
    - Una licencia = Un dispositivo<br>
    - No nos hacemos responsables por mal uso
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> ¿Necesitas Ayuda?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1),

('sale-software-en', 'Venta Software Generico (EN)', 'Your {{productName}} License - Cerberus Dev', '
<h2 style="color: #FF7A18; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hello {{clientName}},</h2>

<p style="margin: 0 0 15px; color: #e0e0e0;">Thank you for your purchase. Here are your license details:</p>

<div style="background: linear-gradient(135deg, rgba(255,122,24,0.15), rgba(255,122,24,0.05)); border: 1px solid rgba(255,122,24,0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
  <p style="margin: 0 0 5px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">License Details</p>
  <table role="presentation" style="width: 100%; margin-top: 10px;">
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0; width: 140px;">Product:</td>
      <td style="padding: 8px 0; color: #fff; font-weight: 600;">{{productName}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">License:</td>
      <td style="padding: 8px 0; color: #FF7A18; font-weight: 600; font-family: monospace; font-size: 14px;">{{licenseKey}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #b0b0b0;">Date:</td>
      <td style="padding: 8px 0; color: #fff;">{{saleDate}}</td>
    </tr>
  </table>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4CB;</span> Instructions
</h3>

<div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin: 20px 0;">
  {{customInstructions}}
</div>

<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 15px 20px; margin: 20px 0;">
  <p style="margin: 0; color: #f87171; font-size: 13px;">
    <strong>&#x26A0; IMPORTANT:</strong><br>
    - This license is for personal use only<br>
    - Cannot be resold or transferred<br>
    - One license = One device<br>
    - We are not responsible for misuse
  </p>
</div>

<div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,122,24,0.5), transparent); margin: 30px 0;"></div>

<h3 style="color: #fff; margin: 0 0 15px; font-size: 16px;">
  <span style="color: #FF7A18; margin-right: 10px;">&#x1F4DE;</span> Need Help?
</h3>

<p style="margin: 0 0 10px; color: #b0b0b0;">
  <strong style="color: #fff;">WhatsApp:</strong> <a href="https://wa.me/524794381329" style="color: #FF7A18;">+52 479 438 1329</a>
</p>
<p style="margin: 0 0 20px; color: #b0b0b0;">
  <strong style="color: #fff;">Email:</strong> <a href="mailto:soporte@cerberusdev.com" style="color: #FF7A18;">soporte@cerberusdev.com</a>
</p>
', 1);
