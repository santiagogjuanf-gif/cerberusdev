# Sistema de Roles - Cerberus

## Roles disponibles

El sistema tiene 3 roles con diferentes niveles de acceso:

| Rol | Descripcion |
|-----|-------------|
| **admin** | Acceso completo a todo el sistema |
| **support** | Acceso a monitoreo y soporte de servicios |
| **client** | Acceso solo al portal de cliente |

---

## Permisos por Rol

### ADMIN (Administrador)

El admin tiene acceso TOTAL al sistema:

**Dashboard Principal**
- Ver estadisticas de leads
- Ver bandeja de leads
- Gestionar leads (marcar importante, cambiar estado, eliminar)

**Gestion de Usuarios** (`/tenemos/users`)
- Ver todos los usuarios
- Crear nuevos usuarios
- Editar usuarios existentes
- Cambiar roles de usuarios
- Eliminar usuarios
- Forzar cambio de contrasena

**Gestion de Servicios** (`/tenemos/services`)
- Ver todos los servicios registrados
- Crear nuevos servicios
- Editar configuracion de servicios
- Eliminar servicios
- Controlar servicios PM2:
  - Iniciar (start)
  - Detener (stop)
  - Reiniciar (restart)
- Ver logs de servicios

**Monitor del Sistema** (`/tenemos/monitor`)
- Ver estadisticas del servidor:
  - CPU (modelo, nucleos, carga)
  - Memoria RAM (usada, libre, porcentaje)
  - Disco (espacio usado, libre)
  - Uptime del servidor
- Ver todos los procesos PM2 en tiempo real

**Blog** (`/tenemos/blog-admin`)
- Crear posts
- Editar posts
- Eliminar posts
- Gestionar categorias
- Moderar comentarios

**Proyectos** (`/tenemos/projects-admin`)
- Crear proyectos
- Editar proyectos
- Eliminar proyectos
- Gestionar galeria de imagenes

**Tickets de Soporte**
- Ver TODOS los tickets
- Responder tickets
- Cambiar estado de tickets

---

### SUPPORT (Soporte)

El rol de soporte tiene acceso limitado a funciones operativas:

**Dashboard Principal**
- Ver estadisticas de leads (solo lectura)
- Ver bandeja de leads

**Gestion de Servicios** (`/tenemos/services`)
- Ver todos los servicios
- Controlar servicios PM2:
  - Iniciar (start)
  - Reiniciar (restart)
  - **NO puede detener (stop)**
- Ver logs de servicios
- **NO puede crear/editar/eliminar servicios**

**Monitor del Sistema** (`/tenemos/monitor`)
- Acceso completo al monitor
- Ver estadisticas del servidor
- Ver procesos PM2

**Tickets de Soporte**
- Ver TODOS los tickets
- Responder tickets
- Cambiar estado de tickets

**NO tiene acceso a:**
- Gestion de usuarios
- Crear/editar servicios
- Blog admin
- Proyectos admin

---

### CLIENT (Cliente)

El rol de cliente tiene el acceso mas limitado:

**Portal de Cliente** (`/tenemos/portal`)
- Ver sus propios tickets
- Crear nuevos tickets de soporte
- Responder a sus tickets
- Ver estado de sus tickets

**Cambiar Contrasena** (`/tenemos/change-password`)
- Cambiar su propia contrasena

**NO tiene acceso a:**
- Dashboard principal
- Gestion de usuarios
- Gestion de servicios
- Monitor del sistema
- Blog admin
- Proyectos admin
- Tickets de otros usuarios

---

## Tabla resumen de permisos

| Funcion | Admin | Support | Client |
|---------|:-----:|:-------:|:------:|
| Dashboard principal | ✅ | ✅* | ❌ |
| Gestionar leads | ✅ | ❌ | ❌ |
| Ver usuarios | ✅ | ❌ | ❌ |
| Crear/editar usuarios | ✅ | ❌ | ❌ |
| Ver servicios | ✅ | ✅ | ❌ |
| Crear/editar servicios | ✅ | ❌ | ❌ |
| Iniciar servicios | ✅ | ✅ | ❌ |
| Detener servicios | ✅ | ❌ | ❌ |
| Reiniciar servicios | ✅ | ✅ | ❌ |
| Ver logs servicios | ✅ | ✅ | ❌ |
| Monitor sistema | ✅ | ✅ | ❌ |
| Blog admin | ✅ | ❌ | ❌ |
| Proyectos admin | ✅ | ❌ | ❌ |
| Ver todos tickets | ✅ | ✅ | ❌ |
| Ver sus tickets | ✅ | ✅ | ✅ |
| Crear tickets | ✅ | ✅ | ✅ |
| Responder tickets | ✅ | ✅ | ✅* |
| Cambiar estado ticket | ✅ | ✅ | ❌ |
| Cambiar su contrasena | ✅ | ✅ | ✅ |
| Portal cliente | - | - | ✅ |

*Solo lectura o acceso limitado a sus propios recursos

---

## Flujo de redireccion segun rol

Cuando un usuario inicia sesion:

1. **Si `must_change_password = 1`**: Redirige a `/tenemos/change-password`
2. **Si rol = client**: Redirige a `/tenemos/portal`
3. **Si rol = admin o support**: Redirige a `/tenemos/dashboard`

---

## Crear un nuevo usuario con rol

### Desde el dashboard (Admin)

1. Ve a **Dashboard > Usuarios**
2. Click en **"+ Nuevo Usuario"**
3. Llena el formulario:
   - **Usuario**: nombre de acceso
   - **Nombre completo**: nombre real (aparece en bienvenida)
   - **Email**: correo electronico
   - **Contrasena**: contrasena inicial
   - **Rol**: admin, support o client
   - **Debe cambiar contrasena**: marcar si quieres que cambie al entrar

### Desde la base de datos

```sql
INSERT INTO admin_users (username, name, email, password_hash, role, must_change_password)
VALUES ('nuevo_usuario', 'Nombre Completo', 'email@ejemplo.com', '$2b$10$hash...', 'client', 1);
```

Nota: El password_hash debe generarse con bcrypt (10 rounds).
