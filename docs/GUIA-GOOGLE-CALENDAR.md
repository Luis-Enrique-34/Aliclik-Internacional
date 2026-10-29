# Conectar Google Calendar (sincronización en ambos sentidos)

Cada usuario conecta **su propio** Google Calendar desde *Calendario → Conectar Google Calendar*. Antes, un administrador configura una sola vez las credenciales OAuth en Google Cloud.

## Cómo funciona

| Dirección | Qué pasa | Cuándo |
|---|---|---|
| Plataforma → Google | Crear, editar, completar o eliminar una reunión/tarea aquí la crea, edita o borra en Google. Puede generar enlace de **Google Meet** y enviar **invitaciones**. | Al instante. Si Google no responde, queda pendiente y se reintenta. |
| Google → Plataforma | Lo que crees, muevas o borres en Google aparece aquí. | Al abrir el calendario, cada `CALENDAR_SYNC_MINUTES` (servidor local) y **al instante** cuando la app está publicada con HTTPS (Google envía un aviso). |

- Solo se pide el permiso `calendar.events` (eventos), no acceso total a la cuenta de Google.
- Los tokens de Google se guardan **cifrados** (AES-256-GCM). Al desconectar se revoca el permiso en Google.
- Si un evento se edita en los dos lados a la vez, gana la edición más reciente.
- Cada usuario solo ve y sincroniza **sus** eventos.

## Configuración (una vez, administrador)

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta de Google de la empresa → crea un proyecto `aliclik-internacional`.
2. **APIs y servicios → Biblioteca** → busca **Google Calendar API** → *Habilitar*.
3. **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Interno** si la empresa usa Google Workspace (solo cuentas @aliclik.app). Si no, **Externo** y agrega como *usuarios de prueba* los correos del equipo.
   - Nombre de la app: *Aliclik Internacional*. Correo de soporte: el del área de sistemas.
   - Permisos (scopes): `openid`, `email`, `.../auth/calendar.events`.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**:
   - *Orígenes de JavaScript autorizados:* `http://localhost:3000` y `https://tu-proyecto.vercel.app`
   - *URI de redireccionamiento autorizados:*
     - `http://localhost:3000/api/calendario/google/callback`
     - `https://tu-proyecto.vercel.app/api/calendario/google/callback`
5. Copia el **ID de cliente** y el **Secreto** a `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
   ```
6. Reinicia (`npm run dev`). En la terminal verás: `📅 Google Calendar habilitado`.

## Aviso en tiempo real (webhook)

Google solo envía avisos a una URL pública **https**. En Vercel se activa solo (`APP_URL=https://…`). En tu equipo local se usa la sincronización periódica, que es suficiente para el día a día.

## Problemas frecuentes

| Mensaje | Causa |
|---|---|
| `redirect_uri_mismatch` | La URI de redirección de Google Cloud no es exactamente igual a `APP_URL` + `/api/calendario/google/callback` |
| "Google no entregó acceso permanente" | Quita la app en <https://myaccount.google.com/permissions> y vuelve a conectar |
| "Google revocó el acceso" | La contraseña de Google cambió o se quitó el permiso: vuelve a conectar |
| `access_denied` / app no verificada | Con tipo *Externo*, agrega tu correo como usuario de prueba |
