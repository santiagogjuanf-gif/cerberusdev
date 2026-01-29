# Manual de PM2 para Cerberus

## Que es PM2?

PM2 es un gestor de procesos para Node.js que te permite mantener tus aplicaciones siempre activas, reiniciarlas automaticamente si fallan, y monitorear su estado.

## Instalacion

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Verificar instalacion
pm2 --version
```

## Comandos Basicos

### Iniciar una aplicacion

```bash
# Iniciar una aplicacion Node.js
pm2 start app.js

# Iniciar con un nombre personalizado (RECOMENDADO)
pm2 start app.js --name "mi-app"

# Iniciar con parametros
pm2 start app.js --name "cerberus-web" -- --port 4000
```

### Ver procesos activos

```bash
# Lista todos los procesos
pm2 list

# Ver detalles de un proceso
pm2 show mi-app

# Monitoreo en tiempo real (CPU, RAM, etc.)
pm2 monit
```

### Controlar procesos

```bash
# Reiniciar un proceso
pm2 restart mi-app

# Detener un proceso
pm2 stop mi-app

# Iniciar un proceso detenido
pm2 start mi-app

# Eliminar un proceso de PM2
pm2 delete mi-app

# Reiniciar todos los procesos
pm2 restart all
```

### Ver logs

```bash
# Ver logs de todos los procesos
pm2 logs

# Ver logs de un proceso especifico
pm2 logs mi-app

# Ver ultimas 100 lineas
pm2 logs mi-app --lines 100

# Limpiar todos los logs
pm2 flush
```

## Configuracion con ecosystem.config.js

Crea un archivo `ecosystem.config.js` en la raiz de tu proyecto:

```javascript
module.exports = {
  apps: [
    {
      name: "cerberus-web",
      script: "app.js",
      cwd: "/home/user/cerberusdev",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    },
    {
      name: "otro-servicio",
      script: "index.js",
      cwd: "/home/user/otro-proyecto",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: 5000
      }
    }
  ]
};
```

### Usar el archivo de configuracion

```bash
# Iniciar todas las apps del ecosystem
pm2 start ecosystem.config.js

# Iniciar solo una app
pm2 start ecosystem.config.js --only cerberus-web

# Reiniciar desde el archivo
pm2 restart ecosystem.config.js
```

## Iniciar PM2 al arrancar el sistema

```bash
# Generar script de inicio automatico
pm2 startup

# Seguir las instrucciones que aparecen (copiar y ejecutar el comando)
# Ejemplo: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u usuario --hp /home/usuario

# Guardar la lista actual de procesos
pm2 save
```

## Agregar un nuevo servicio al Monitor de Cerberus

### 1. Iniciar el proceso con PM2

```bash
# Ejemplo: iniciar una API en el puerto 3001
pm2 start api.js --name "mi-api" -- --port 3001
```

### 2. Agregar el servicio en el dashboard

1. Ve a **Dashboard > Servicios**
2. Click en **"+ Nuevo Servicio"**
3. Llena el formulario:
   - **Nombre del servicio**: Mi API (nombre descriptivo)
   - **Nombre en PM2**: mi-api (el mismo nombre que usaste con --name)
   - **Descripcion**: API de ejemplo
   - **Puerto**: 3001
   - **Asignar a usuario**: (opcional) selecciona un usuario cliente

### 3. Verificar en Monitor

1. Ve a **Dashboard > Monitor**
2. En la seccion "Procesos PM2" deberia aparecer tu servicio
3. Podras ver: CPU, Memoria, Uptime, Restarts

## Comandos utiles adicionales

```bash
# Ver informacion del sistema
pm2 info

# Recargar sin downtime (para clusters)
pm2 reload mi-app

# Escalar numero de instancias
pm2 scale mi-app 4

# Ver metricas JSON (para integracion)
pm2 jlist

# Actualizar PM2
pm2 update
```

## Solucion de problemas

### El proceso no aparece en el monitor

1. Verifica que el nombre en PM2 sea exactamente igual:
   ```bash
   pm2 list
   ```
2. El servicio en Cerberus debe tener el mismo nombre en el campo "Nombre en PM2"

### El proceso se reinicia constantemente

1. Revisa los logs:
   ```bash
   pm2 logs mi-app --lines 200
   ```
2. Puede ser un error en el codigo o falta de memoria

### Error de permisos

```bash
# Asegurate de tener permisos
sudo chown -R $USER:$USER ~/.pm2
```

## Estructura de archivos de PM2

```
~/.pm2/
  ├── logs/           # Logs de todos los procesos
  │   ├── mi-app-out.log
  │   └── mi-app-error.log
  ├── pids/           # PIDs de los procesos
  └── dump.pm2        # Snapshot de procesos guardados
```

---

**Nota**: El panel de Cerberus lee los procesos de PM2 usando `pm2 jlist`. Asegurate de que PM2 este instalado globalmente y accesible desde el usuario que ejecuta el servidor de Cerberus.
