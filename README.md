# Aliclik Internacional

Plataforma interna del área de Sistemas para **monitorear los pedidos de la operación internacional de Aliclik** (Guatemala, Honduras, Argentina y los países que se sumen) y hacer **seguimiento centralizado** de tiendas, proveedores, almacenes y couriers. Reemplaza el Excel "Aliclik Internacional" que se llenaba a mano.

## Qué hace

| Módulo | Para qué sirve |
|---|---|
| **Tablero** | Pedidos ingresados, entregados, en curso y devueltos del periodo, comparados con el periodo anterior. Tendencia diaria, composición por estado y ranking de tiendas, proveedores, almacenes, couriers y países. |
| **Pedidos** | Listado con filtros (fecha, país, estado, tienda, proveedor…), detalle de cada pedido y exportación a CSV. |
| **Integraciones** | La hoja "Proov Bodega" del Excel: cada proveedor + almacén por país, con su checklist (WhatsApp, sistemas, capacitación, catálogo, despacho, liquidaciones), avance y bitácora de seguimiento. |
| **Seguimiento** | Un módulo por **tiendas, proveedores, almacenes y couriers**: salud del volumen (en crecimiento, estable, en caída, inactiva), meta de pedidos del mes con proyección, alertas, ficha 360 con tendencia de 12 meses, contrapartes, reuniones y bitácora. Incluye el **trato especial**: segmento (Preferente, VIP, Estratégica), condiciones y **acuerdos** (descuentos exclusivos, tarifas, beneficios) que pueden ganarse por **escalas de pedidos**. Ver [docs/SEGUIMIENTO.md](docs/SEGUIMIENTO.md). |
| **Observaciones** | Hallazgos de la plataforma (hoja "Observaciones") con prioridad, responsable y comentarios. |
| **Calendario** | Reuniones y tareas, vinculadas a integraciones. Vista **Mes** (por defecto) y vista **Día** con línea de tiempo por hora. **Sincronización en ambos sentidos con Google Calendar** (incluye enlace de Meet e invitaciones). |
| **Cargas de datos** | Subir el CSV diario del query de Aurora, historial de cargas y clasificación de estados. |
| **Usuarios / Auditoría** | Aprobación de cuentas, roles (admin, editor, lector) y registro de acciones de seguridad. |

## Indicadores, SLA y pronósticos

Cada módulo muestra medidores con meta, KPI con semáforo, hallazgos y pronósticos (tendencia + estacionalidad semanal), además de filtros y orden propios. Se puede presentar en pantalla completa o imprimir a PDF. Detalle y fórmulas: [docs/INDICADORES.md](docs/INDICADORES.md). Metas: `src/config/metas.js`.

## Tecnologías

- **Frontend:** HTML, CSS y JavaScript (módulos ES, sin frameworks) · colores de Aliclik en paleta de bajo contraste (neutros + azul solo para acciones) · tema claro/oscuro · responsive (móvil, tablet, escritorio) · tipografías Inter y Plus Jakarta Sans (servidas localmente, sin Google Fonts)
- **Backend:** Node.js 20+ y Express 5 con arquitectura **MVC + Servicio + DAO** (igual que Command-Service)
- **Base de datos:** PostgreSQL en **Supabase** (usuarios y accesos incluidos) con RLS en todas las tablas
- **Fuente de datos:** únicamente **Aurora** (MySQL 8), por CSV o sincronización directa de solo lectura (`npm run sync:aurora`). Procedimiento: [docs/ACTUALIZACION-DIARIA.md](docs/ACTUALIZACION-DIARIA.md)
- **Seguridad:** Argon2id, sesión JWT en cookie HttpOnly/SameSite=Strict revocable, Zod, Helmet (CSP estricta), CSRF por origen, límites de peticiones, bloqueo de cuenta, tokens de Google cifrados con AES-256-GCM, auditoría. Detalle en [docs/INFORME-SEGURIDAD.md](docs/INFORME-SEGURIDAD.md).

## Inicio rápido (Windows · PowerShell)

```powershell
cd "C:\work\ALICLIK - INTERNACIONAL"
npm install
copy .env.example .env          # completa DATABASE_URL, JWT_SECRET y ENCRYPTION_KEY
npm run seguridad:clave         # ejecútalo 2 veces: una clave para JWT_SECRET y otra para ENCRYPTION_KEY
npm run db:test                 # prueba la conexión con Supabase
npm run db:init                 # crea las tablas (no borra datos)
npm run db:seed                 # importa el Excel (integraciones y observaciones)
npm run dev                     # abre http://localhost:3000
```

1. Entra a `http://localhost:3000/registro.html`. **La primera cuenta que se registra queda como administradora** y activa. Las siguientes quedan pendientes hasta que un administrador las apruebe en *Usuarios*.
2. Carga los pedidos: menú *Cargas de datos* → sube el CSV del query [`database/aurora/pedidos_internacional.sql`](database/aurora/pedidos_internacional.sql).
3. (Opcional) Conecta Google Calendar: [docs/GUIA-GOOGLE-CALENDAR.md](docs/GUIA-GOOGLE-CALENDAR.md).

Guía completa: [docs/GUIA-INSTALACION.md](docs/GUIA-INSTALACION.md).

## Mantener el tablero actualizado

| Opción | Cómo | Cuándo usarla |
|---|---|---|
| **A. CSV diario** | Ejecutar el query en DBeaver/Workbench → exportar CSV → subirlo en *Cargas de datos* | Para empezar hoy, sin pedir accesos nuevos |
| **B. Sincronización automática** (recomendada) | `npm run sync:aurora -- --cada 30` con un usuario de solo lectura de Aurora | Cuando backend entregue el usuario de solo lectura |
| **C. Programada en la nube** | La opción B en una tarea programada (Windows o AWS Lambda/EventBridge) | Para que corra sin depender de una PC encendida |

Detalle y comparación: [docs/SINCRONIZACION.md](docs/SINCRONIZACION.md). En todas, la carga hace UPSERT por `order_id`: los pedidos nuevos se agregan, los existentes actualizan su estado y nada se duplica.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm start` | Servidor normal |
| `npm run db:init` · `db:seed` · `db:test` | Tablas · datos del Excel · probar conexión |
| `npm run db:admin` | Crear o recuperar un administrador desde la terminal |
| `npm run sync:aurora` | Sincronizar pedidos desde Aurora (agrega `-- --cada 30` para repetir) |
| `npm run test:unit` | 18 pruebas unitarias (no necesitan base de datos) |
| `npm run test:integracion` | 20 pruebas de API, seguimiento y sincronización con Google simulada (requiere `RUN_INTEGRATION=1` y una base de **prueba**) |
| `npm run seguridad:auditar` | Busca vulnerabilidades conocidas en las librerías |
| `npm run seguridad:clave` | Genera una clave aleatoria segura |

## Estructura

```
├── public/                  VISTA: login.html · registro.html · app.html · assets/ (css, js/app/views, img, vendor)
├── src/
│   ├── app.js · server.js   cadena de middlewares · arranque y sincronización periódica
│   ├── config/              env (validación) · database (pg) · security (políticas en un solo lugar)
│   ├── routes/ middlewares/ validators/ controllers/ services/ dao/ utils/
├── database/                schema.sql · init · seed · crear-admin · aurora/ (queries para Aurora)
├── scripts/sync-aurora.js   sincronización automática Aurora → Supabase
├── api/index.js · vercel.json   despliegue en Vercel
├── tests/                   unit/ · integration/
└── docs/                    instalación · Google Calendar · sincronización · seguimiento · informe de seguridad
```

## Subir a GitHub y desplegar

```powershell
git init
git add .
git status        # verifica que NO aparezcan .env ni database/privado/
git commit -m "Plataforma Aliclik Internacional"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/aliclik-internacional.git
git push -u origin main
```

Crea el repositorio como **privado**. Para Vercel: importar el repo, cargar las variables de `.env` en *Settings → Environment Variables* (con `NODE_ENV=production` y `APP_URL=https://…`) y desplegar. Ver [docs/GUIA-INSTALACION.md](docs/GUIA-INSTALACION.md#despliegue-en-vercel).
