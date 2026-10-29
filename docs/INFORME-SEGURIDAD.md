# Informe de seguridad · Aliclik Internacional

**Fecha:** 29 de octubre de 2026 · **Versión revisada:** 1.1.0 (incluye el módulo de seguimiento y acuerdos) · **Alcance:** la plataforma completa (frontend, API, base de datos Supabase, integración con Google Calendar y extracción desde Aurora), el proceso manual que reemplaza (Excel *Aliclik Internacional*) y los patrones heredados del proyecto guía *Command-Service*.

## 1. Resumen

La plataforma maneja datos sensibles de la operación: pedidos y montos por país, contactos y teléfonos de proveedores, accesos del equipo y el calendario de cada persona. La revisión buscó proteger a **quienes la desarrollan** (que no se filtren claves ni accesos al subir el código a GitHub o a Vercel) y a **quienes la usan** (que nadie entre sin permiso, vea datos ajenos o robe una sesión).

- Se identificaron **14 vulnerabilidades o riesgos**: 4 críticos, 5 altos, 4 medios y 1 bajo.
- **12 quedaron corregidos en el código** y **2 quedan mitigados** con una solución parcial documentada (dependen de terceros: el equipo de backend y la configuración de Vercel).
- Se agregaron **38 pruebas automáticas** (18 unitarias + 20 de integración), de las cuales **15 verifican controles de seguridad**. Todas pasan.
- `npm audit` reporta **0 vulnerabilidades** en las librerías.

## 2. Métricas

| Indicador | Valor |
|---|---|
| Vulnerabilidades identificadas | 14 (4 críticas · 5 altas · 4 medias · 1 baja) |
| Corregidas en el código | 12 (86 %) |
| Mitigadas parcialmente (pendiente de terceros) | 2 (14 %) |
| Tablas con RLS activado en Supabase | 13 de 13 (100 %) |
| Rutas de la API que exigen sesión | 48 de 51. Las 3 restantes (webhook de Google, cron, regreso de Google) se validan con su propio secreto. |
| Rutas que exigen rol de editor o administrador | 20 de 20 que modifican datos compartidos (incluye planes y acuerdos comerciales) |
| Rutas con validación estricta de entrada (Zod) | 35 de 51, más todas las de autenticación. El resto no recibe datos. |
| Consultas SQL parametrizadas | 100 %. Los nombres de columna dinámicos salen de listas blancas. |
| Secretos en el código o en el repositorio | 0 (`.env`, certificados y datos del Excel están en `.gitignore`) |
| Vulnerabilidades conocidas en librerías (`npm audit`) | 0 |
| Pruebas automáticas de seguridad | 15, todas aprobadas |

## 3. Vulnerabilidades encontradas, riesgo e impacto

| # | Vulnerabilidad | Dónde | Severidad | Riesgo e impacto | Estado |
|---|---|---|---|---|---|
| V1 | **Contraseñas de proveedores en texto plano** (columna *PASS ALC*) | Excel actual | Crítica | Cualquiera que reciba o vea el archivo puede entrar a Aliclik como el proveedor y ver o alterar pedidos y liquidaciones. | ✅ Corregido |
| V2 | **Sin control de acceso** a los datos de la operación | Excel actual | Crítica | El archivo circula por correo o Drive; no se sabe quién lo vio ni quién lo cambió. | ✅ Corregido |
| V3 | **Exposición de la base de datos por la API pública de Supabase** | Supabase | Crítica | Supabase publica automáticamente cada tabla. Sin RLS, cualquiera con la URL del proyecto podría leer usuarios, contactos y pedidos. | ✅ Corregido |
| V4 | **Fuga de claves al subir el proyecto** a GitHub o Vercel | Repositorio | Crítica | Un `.env` subido por error entrega la base completa y la clave de las sesiones. | ✅ Corregido |
| V5 | **Sesiones que no se pueden revocar** | Patrón heredado de Command-Service | Alta | Un token robado, o el de un usuario suspendido o al que se le bajó el rol, sigue sirviendo hasta que expira. | ✅ Corregido |
| V6 | **Registro abierto**: cualquiera podía crear una cuenta y entrar | Patrón heredado | Alta | Una persona ajena a la empresa se registra y ve toda la operación internacional. | ✅ Corregido |
| V7 | **Tokens de Google Calendar** guardados en la base | Integración con Google | Alta | Si se filtra una copia de la base, el atacante lee y modifica el calendario de cada usuario. | ✅ Corregido |
| V8 | **Falsificación de peticiones (CSRF)** y de la conexión con Google | API y OAuth | Alta | Una web maliciosa haría que el navegador del usuario cree o borre datos, o conectaría el calendario de la víctima a la cuenta Google del atacante. | ✅ Corregido |
| V9 | **Acceso a eventos de otro usuario (IDOR)** | Calendario | Alta | Cambiando un identificador en la URL se podrían ver o borrar reuniones ajenas. | ✅ Corregido |
| V10 | **Inyección de código (XSS) y fórmulas en CSV** | Comentarios, nombres, exportaciones | Media | Un comentario con código podría robar la sesión; un CSV exportado podría ejecutar fórmulas en Excel. | ✅ Corregido |
| V11 | **Fuerza bruta de contraseñas** | Login | Media | Un script prueba miles de contraseñas. | ✅ Corregido (con límite parcial en Vercel, ver V13) |
| V12 | **Enumeración de cuentas** | Login y registro | Media | Los mensajes revelaban si un correo existía, lo que facilita el phishing dirigido. | ✅ Corregido |
| V13 | **Límite de peticiones en memoria** en entorno serverless | Vercel | Media | En Vercel cada instancia lleva su propio contador, así que el límite por IP es menos efectivo. | ⚠️ Mitigado |
| V14 | **Acceso a Aurora con privilegios amplios** para la extracción | Sincronización | Baja (alta si se usa un usuario con escritura) | Si se usa un usuario con permisos de escritura y se filtra su contraseña, se podrían alterar pedidos reales. | ⚠️ Mitigado |

## 4. Soluciones implementadas

**V1 · Contraseñas en el Excel.** Al importar el Excel se descartó la columna *PASS ALC* y la plataforma no tiene ningún campo para contraseñas de terceros: solo guarda el usuario de acceso, con un aviso de usar el gestor de contraseñas del área. Los datos importados (nombres y teléfonos) quedan en `database/privado/`, que nunca se sube a GitHub.

**V2 · Control de acceso.** Login obligatorio, tres roles (lector, editor, administrador) verificados en el servidor en cada ruta, y una **auditoría** que registra inicios de sesión, intentos fallidos, bloqueos, cambios de acceso, cargas y eliminaciones con fecha, usuario e IP.

**V3 · Supabase.** El esquema activa **RLS en las 12 tablas sin ninguna política**: la API pública queda denegada. Además retira los permisos de los roles `anon` y `authenticated`. Solo el backend accede, con la cadena de conexión que vive en el servidor.

**V4 · Fuga de claves.**
- `.gitignore` excluye `.env*`, certificados, CSV/XLSX y la carpeta de datos privados.
- La app **no arranca** si falta una clave, si es de ejemplo o débil (menos de 32 caracteres), si las dos claves son iguales, o si en producción la URL no es HTTPS.
- El registro de eventos oculta automáticamente cualquier dato con nombre de contraseña, token o cookie.

**V5 · Sesiones revocables.** Cada token lleva una *versión de sesión* que se compara contra la base. Cambiar la contraseña, el rol o suspender a alguien la incrementa y cierra al instante todas sus sesiones. Para no consultar la base en cada petición, el usuario se guarda en una caché de 20 segundos que se borra en el momento del cambio; en Vercel, con varias instancias, la revocación puede tardar como máximo esos 20 segundos en las demás. El token usa algoritmo fijo (HS256) y emisor verificado, viaja en una cookie `HttpOnly` + `SameSite=Strict` + `Secure` con prefijo `__Host-` en producción, y se renueva solo durante la jornada (8 h).

**V6 · Registro.** Las cuentas nuevas quedan **pendientes** hasta que un administrador las aprueba. Solo la primera cuenta del sistema nace como administradora. Es opcional restringir el registro a correos `@aliclik.app` (`ALLOWED_EMAIL_DOMAINS`). No se puede elegir el rol al registrarse, ni quitarse el rol uno mismo, y siempre debe quedar al menos un administrador activo.

**V7 · Tokens de Google.** Se cifran con **AES-256-GCM**, con una clave (`ENCRYPTION_KEY`) que vive solo en el servidor. GCM además detecta si alguien alteró el dato. Solo se pide el permiso mínimo (`calendar.events`) y al desconectar se revoca en Google.

**V8 · CSRF y conexión con Google.**
- Cookie `SameSite=Strict`, más verificación del encabezado `Origin` en toda petición que modifica datos.
- La conexión con Google usa `state` aleatorio comparado en tiempo constante y **PKCE**, cuyo verificador viaja cifrado y firmado en una cookie temporal de 10 minutos.
- El aviso de Google (webhook) se valida con un secreto por canal guardado como hash, y el cron con `CRON_SECRET`.

**V9 · IDOR.** Todas las consultas del calendario filtran por el usuario de la sesión, así que un evento ajeno responde "no encontrado". Los identificadores son UUID aleatorios y se validan antes de llegar a la base.

**V10 · XSS e inyección en CSV.**
- Todas las vistas usan plantillas que **escapan** cualquier dato, y los mensajes se muestran con `textContent`.
- La **CSP** solo permite scripts y estilos propios: no hay scripts en línea, de terceros ni CDNs.
- Los enlaces externos (logos, Meet) solo se aceptan si son `https://`.
- El CSV exportado antepone un apóstrofo a las celdas que empiezan con `= + - @`.
- Además: `X-Frame-Options`, `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-store` en la API.

**V11 · Fuerza bruta.** Contraseñas con **Argon2id** (parámetros OWASP) y política de 10+ caracteres con mayúscula, minúscula, número y símbolo, sin palabras comunes ni el propio correo. La cuenta se **bloquea 15 minutos tras 5 fallos**; ese contador se guarda en la base, así que funciona igual en Vercel. Hay límites por IP en login (10/15 min), registro (5/h), cargas (20/10 min) y API general.

**V12 · Enumeración.** El login da el mismo mensaje y tarda lo mismo exista o no el correo (usa un hash ficticio). Registrar un correo existente responde igual que uno nuevo. El estado "pendiente" o "suspendido" solo se informa después de una contraseña correcta.

**Acuerdos comerciales (módulo de seguimiento).** Los descuentos y beneficios son información sensible para el negocio:
- Solo editores y administradores crean o editan planes y acuerdos; solo un administrador los elimina.
- Cada alta, cambio y eliminación queda en la auditoría con el valor anterior y el nuevo.
- Un acuerdo no se puede reasignar a otra tienda al editarlo.
- Validación de rangos: porcentajes de 0 a 100, montos no negativos, umbrales positivos y fechas coherentes.

**Otros controles aplicados:**
- **Entradas:** validación Zod de cada cuerpo, consulta y parámetro; límite de 50 KB por JSON y 4 MB / 50 000 filas por CSV.
- **Cargas:** se detectan archivos repetidos por huella SHA-256 y todo ocurre en una transacción (o entra completo o no entra).
- **Errores:** el navegador recibe mensajes genéricos y el detalle técnico queda solo en el log del servidor.
- **SQL:** consultas siempre parametrizadas, con `statement_timeout` de 30 s.
- **Conexiones:** TLS hacia Supabase y Aurora; Aurora con certificado verificado.

## 5. Mitigaciones parciales (pendientes de terceros)

**V13 · Límite de peticiones en Vercel.** El bloqueo de cuenta (en base de datos) sigue protegiendo el login. Para un límite por IP global:
1. Activar el *Firewall / Attack Challenge Mode* de Vercel.
2. O cambiar el almacén de `express-rate-limit` por Redis (Upstash). El cambio está aislado en `src/middlewares/rateLimit.middleware.js`.

**V14 · Usuario de Aurora.**
- `database/aurora/indices_recomendados.sql` trae el script para crear un usuario **solo lectura**, con `GRANT SELECT` únicamente sobre las 11 tablas necesarias y `REQUIRE SSL`.
- El script de sincronización además abre la sesión en `READ ONLY`, no permite varias sentencias por llamada y se recomienda apuntarlo al endpoint *reader* de Aurora.
- Falta que backend cree ese usuario. Hasta entonces, usar la opción de CSV manual.

## 6. Hallazgos fuera del alcance (para informar)

Durante el trabajo con el front actual de Aliclik (`aliclik-web`) se observaron dos puntos para escalar al equipo responsable:

1. **El `.env` del frontend contiene secretos que no deberían estar ahí**, como una `DATABASE_URL` de producción y un token de reseller. Todo lo que empieza con `REACT_APP_` se publica dentro del JavaScript que descarga cualquier visitante. **Recomendación:** rotar esas credenciales, sacarlas del repositorio del front y restringir la API key de Google Maps por dominio.
2. **`disable-devtool` no es un control de seguridad.** Bloquear F12 no impide ver el código ni las peticiones, pero sí entorpece la depuración del propio equipo. La protección real debe estar en el backend: permisos por rol, validación y límites.

## 7. Recomendaciones para mantener la app segura

| Frecuencia | Acción |
|---|---|
| Antes de cada `git push` | Ejecutar `git status` y verificar que no aparezcan `.env`, `database/privado/` ni archivos `.csv`. |
| Semanal | Ejecutar `npm run seguridad:auditar` y actualizar las librerías con vulnerabilidades. Activar **Dependabot** en GitHub. |
| Mensual | Revisar *Usuarios* (quitar el acceso a quien ya no está en el equipo) y *Auditoría* (intentos fallidos, bloqueos). |
| Cada 6 meses o ante sospecha | Rotar `JWT_SECRET` (cierra todas las sesiones), la contraseña de Supabase y la del usuario de Aurora. Rotar `ENCRYPTION_KEY` obliga a reconectar Google Calendar. |
| Al publicar | Repositorio **privado**, variables solo en el panel de Vercel, `NODE_ENV=production` y `APP_URL` con https. Activar en GitHub *secret scanning* y protección de la rama `main`. |
| Evolución | 1) Segundo factor de autenticación (TOTP) para administradores. 2) Inicio de sesión con Google Workspace corporativo (SSO). 3) Copias de seguridad automáticas de Supabase (*Point in Time Recovery* en plan Pro). 4) Monitoreo de errores (Sentry) sin datos personales. |

## 8. Cómo verificarlo

```powershell
npm run seguridad:auditar                              # 0 vulnerabilidades
npm run test:unit                                      # 18 pruebas
$env:RUN_INTEGRATION=1; npm run test:integracion       # 20 pruebas (base de PRUEBA)
```

Las pruebas de integración comprueban, entre otras cosas:
- Cabeceras de seguridad y cookie `HttpOnly` / `SameSite=Strict`.
- Rechazo sin sesión (401) y por rol (403).
- Bloqueo de CSRF desde otro origen.
- Rechazo de identificadores manipulados.
- Mensajes de login que no revelan si el correo existe.
- Cuenta nueva pendiente de aprobación.
- Revocación de sesiones al cambiar la contraseña.
- Bloqueo tras 5 intentos fallidos.
- Aislamiento del calendario entre usuarios.
- Rechazo de avisos de Google con token falso.
- Permisos y validaciones de planes y acuerdos comerciales.
