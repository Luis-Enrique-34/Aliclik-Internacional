# Guía de instalación

## 1. Requisitos

- **Node.js 20 o superior** (`node -v`). Recomendado: la versión LTS.
- Una cuenta de **Supabase** (plan gratis sirve para empezar).
- Visual Studio Code y Git.

## 2. Crear la base de datos en Supabase

1. En [supabase.com](https://supabase.com) → **New project**. Nombre sugerido: `aliclik-internacional`. Región: *East US (North Virginia)* o *São Paulo*, la más cercana.
2. Guarda la contraseña de la base en tu gestor de contraseñas (no en un Excel ni en el chat).
3. Botón **Connect** → **Connection String** → Method: **Session pooler** → copia la URI.
4. Pégala en `.env` como `DATABASE_URL`, reemplazando `[YOUR-PASSWORD]` por la contraseña real (sin corchetes).

> Los accesos (usuarios, contraseñas, roles) se guardan en la tabla `usuarios` de esta misma base de Supabase, igual que en Command-Service. No se usa la API pública de Supabase desde el navegador: el esquema activa **RLS en todas las tablas sin políticas** y retira los permisos de `anon` y `authenticated`, de modo que aunque alguien obtenga la *anon key* no puede leer nada.

**Más seguro (recomendado):** descarga el certificado en *Project Settings → Database → SSL Configuration*, guárdalo en `certs/prod-ca-2021.crt` y agrega `DATABASE_SSL_CA=./certs/prod-ca-2021.crt` al `.env`. Así la conexión no solo va cifrada, también verifica que el servidor sea Supabase.

## 3. Configurar el proyecto

```powershell
cd "C:\work\ALICLIK - INTERNACIONAL"
npm install
copy .env.example .env
npm run seguridad:clave     # copia el resultado en JWT_SECRET
npm run seguridad:clave     # copia este OTRO resultado en ENCRYPTION_KEY
```

Revisa en `.env`:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La URI del Session pooler |
| `JWT_SECRET` / `ENCRYPTION_KEY` | Dos claves distintas generadas arriba. **Si pierdes `ENCRYPTION_KEY`, cada usuario tendrá que volver a conectar su Google Calendar.** |
| `ALLOWED_EMAIL_DOMAINS` | `aliclik.app` para que solo se puedan registrar correos corporativos |
| `APP_URL` | `http://localhost:3000` en tu equipo |

## 4. Crear las tablas e importar el Excel

```powershell
npm run db:test     # ✅ Conexión correcta con Supabase
npm run db:init     # crea 12 tablas con RLS activado
npm run db:seed     # 13 integraciones y 6 observaciones del Excel
```

`db:seed` lee `database/privado/datos-excel.json`, que se generó desde *Aliclik Internacional.xlsx*. Esa carpeta **no se sube a GitHub** porque tiene nombres y teléfonos de contactos. La columna **PASS ALC (contraseñas) no se importó**.

## 5. Levantar y crear el primer administrador

```powershell
npm run dev
```

Abre `http://localhost:3000/registro.html` y regístrate: la primera cuenta queda como **administrador activo**. Las demás quedan *pendientes* hasta que las apruebes en **Usuarios**.

¿Perdiste el acceso de administrador? `npm run db:admin` crea uno nuevo o promueve una cuenta existente desde la terminal.

## 6. Cargar los pedidos

Ver [SINCRONIZACION.md](SINCRONIZACION.md). Para empezar: ejecuta `database/aurora/pedidos_internacional.sql` en DBeaver, exporta el resultado a CSV y súbelo en **Cargas de datos**.

## 7. Pruebas

```powershell
npm run test:unit                                   # no necesita base de datos
$env:RUN_INTEGRATION=1; npm run test:integracion    # SOLO contra una base de PRUEBA
```

Las pruebas de integración crean y borran usuarios `@prueba.local` y pedidos con `order_id ≥ 990000000`. No las ejecutes contra la base de producción.

## Despliegue en Vercel

1. Sube el proyecto a un repositorio **privado** de GitHub (ver README).
2. En Vercel → **Add New → Project** → importa el repositorio. Framework: *Other*. No hace falta comando de build.
3. En **Settings → Environment Variables** agrega todas las variables de `.env` con estos cambios:
   - `NODE_ENV=production`
   - `APP_URL=https://tu-proyecto.vercel.app` (debe ser https)
   - `CRON_SECRET=` una clave aleatoria larga (`npm run seguridad:clave`)
   - `GOOGLE_REDIRECT_URI=https://tu-proyecto.vercel.app/api/calendario/google/callback`
4. Despliega. `vercel.json` ya define las cabeceras de seguridad, la ruta de la API y un cron diario que renueva la sincronización con Google.
5. En producción, el aviso en tiempo real de Google (webhook) funciona solo porque la URL es pública y HTTPS.

**Nota sobre el plan gratis de Vercel:** el cron solo puede ejecutarse una vez al día. La sincronización igual funciona porque Google avisa al instante de cada cambio (webhook) y la plataforma sincroniza también al abrir el calendario.

## Problemas frecuentes

| Mensaje | Solución |
|---|---|
| `Falta la variable de entorno …` | Revisa que `.env` exista y tenga esa variable |
| `Tenant or user not found` | En el pooler el usuario es `postgres.TU_PROJECT_REF`, no solo `postgres` |
| `password authentication failed` | Contraseña incorrecta o con símbolos sin codificar (`@` → `%40`) |
| `ENOTFOUND` / `timeout` | Usaste la *Direct connection* (solo IPv6) o tu red bloquea el puerto 5432 |
| El puerto 3000 está ocupado | Cambia `PORT=3001` y `APP_URL=http://localhost:3001` en `.env` |
| "Origen de la petición no permitido" | `APP_URL` no coincide con la dirección con la que abres la app |
