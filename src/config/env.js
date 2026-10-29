// =====================================================================
//  CONFIGURACIÓN DEL ENTORNO — librería: dotenv
//  Carga las variables del archivo .env (que NUNCA se sube a Git) y valida
//  las críticas. Si falta algo importante la app NO arranca: es mejor
//  fallar temprano que correr en producción con una clave vacía o débil.
// =====================================================================
require("dotenv").config({ quiet: true });

function fallar(...lineas) {
  lineas.forEach((l) => console.error(l));
  throw new Error("Configuración inválida: " + lineas[0]);
}

for (const nombre of ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY"]) {
  if (!process.env[nombre]) fallar(`❌ Falta la variable de entorno ${nombre}. Revisa tu archivo .env (guía: .env.example)`);
}

const dbUrl = process.env.DATABASE_URL;
if (/\[YOUR-PASSWORD\]|TU_CONTRASEÑA|TU-PASSWORD|\[PROJECT-REF\]/i.test(dbUrl)) {
  fallar("❌ DATABASE_URL todavía tiene un texto de ejemplo. Pon la contraseña real de Supabase (sin corchetes).");
}
try {
  new URL(dbUrl);
} catch {
  fallar("❌ DATABASE_URL no es una URL válida. Si la contraseña tiene @ # / : ? codifícalos (@ → %40, # → %23).");
}

const SECRETO_DEBIL = /^(pega_aqui|cambiar|secret|changeme|123)/i;
if (process.env.JWT_SECRET.length < 32 || SECRETO_DEBIL.test(process.env.JWT_SECRET)) {
  fallar("❌ JWT_SECRET debe ser aleatorio y de al menos 32 caracteres. Genera uno con:  npm run seguridad:clave");
}
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
  fallar("❌ ENCRYPTION_KEY debe tener 64 caracteres hexadecimales (32 bytes). Genera una con:  npm run seguridad:clave");
}
if (process.env.ENCRYPTION_KEY === process.env.JWT_SECRET) {
  fallar("❌ ENCRYPTION_KEY y JWT_SECRET deben ser distintas.");
}

const IS_PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
if (IS_PROD && !APP_URL.startsWith("https://")) {
  fallar("❌ En producción APP_URL debe empezar con https:// (las cookies de sesión solo viajan cifradas).");
}

const lista = (v) => (v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const GOOGLE = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${APP_URL}/api/calendario/google/callback`,
  // El aviso en tiempo real (webhook) solo funciona con una URL pública HTTPS
  webhookUrl: APP_URL.startsWith("https://") ? `${APP_URL}/api/calendario/google/webhook` : "",
};
GOOGLE.habilitado = Boolean(GOOGLE.clientId && GOOGLE.clientSecret);

module.exports = {
  PORT,
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PROD,
  IS_SERVERLESS: Boolean(process.env.VERCEL),
  APP_URL,
  DATABASE_URL: dbUrl,
  DB_POOL_MAX: Number(process.env.DB_POOL_MAX) || 5,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
  ENCRYPTION_KEY: Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
  // Solo estos dominios pueden registrarse (vacío = cualquiera, igual requiere aprobación)
  DOMINIOS_PERMITIDOS: lista(process.env.ALLOWED_EMAIL_DOMAINS),
  CRON_SECRET: process.env.CRON_SECRET || "",
  SYNC_INTERVAL_MIN: Math.max(1, Number(process.env.CALENDAR_SYNC_MINUTES) || 5),
  ZONA_HORARIA: process.env.APP_TIMEZONE || "America/Lima",
  // Zona en la que Aurora guarda sus fechas (RDS usa UTC por defecto)
  AURORA_TZ: process.env.AURORA_TIMEZONE === "America/Lima" ? "America/Lima" : "UTC",
  GOOGLE,
};
