// =====================================================================
//  CONFIGURACIÓN DE SEGURIDAD (un solo lugar para todas las políticas)
//  Librerías: helmet · argon2 · jsonwebtoken · cookie-parser
// =====================================================================
const argon2 = require("argon2");
const { IS_PROD, JWT_EXPIRES_IN } = require("./env");

/** helmet: cabeceras HTTP de seguridad. La CSP solo permite recursos propios. */
const HELMET_OPTIONS = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],                // sin estilos en línea
      styleSrcAttr: ["'unsafe-inline'"],   // solo atributos style="" (anchos de barras/gráficos)
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"], // logos de proveedores alojados fuera (Drive, CDN)
      scriptSrc: ["'self'"],               // sin scripts de terceros ni en línea → mitiga XSS
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],          // anti-clickjacking
      formAction: ["'self'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  strictTransportSecurity: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
};

/** Permisos del navegador que la app no usa (cámara, micrófono, etc.). */
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

/** argon2: parámetros recomendados por OWASP (19 MiB, 2 iteraciones, 1 hilo). */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** jsonwebtoken: algoritmo fijado (evita "algorithm confusion"), emisor y expiración. */
const JWT_OPTIONS = { algorithm: "HS256", expiresIn: JWT_EXPIRES_IN, issuer: "alc-internacional" };
const JWT_VERIFY_OPTIONS = { algorithms: ["HS256"], issuer: "alc-internacional" };

/** La sesión viaja en una cookie que JavaScript no puede leer. */
const COOKIE_NAME = IS_PROD ? "__Host-alc_sesion" : "alc_sesion"; // __Host- exige Secure + Path=/ sin Domain
const COOKIE_OPTIONS = {
  httpOnly: true,      // inaccesible desde JavaScript → protege contra robo por XSS
  secure: IS_PROD,     // en producción solo por HTTPS
  sameSite: "strict",  // no se envía desde otros sitios → protege contra CSRF
  path: "/",
  maxAge: 8 * 60 * 60 * 1000, // 8 horas (jornada laboral), igual que el JWT
};

/** Cookie temporal (10 min) para el viaje de ida y vuelta a Google (OAuth). */
const OAUTH_COOKIE = IS_PROD ? "__Host-alc_oauth" : "alc_oauth";
const OAUTH_COOKIE_OPTIONS = { httpOnly: true, secure: IS_PROD, sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000 };

/** Bloqueo temporal de cuenta tras fallos de contraseña consecutivos. */
const LOGIN_POLICY = { maxIntentos: 5, minutosBloqueo: 15 };

/** Límites de las cargas de archivos. */
const CARGA_LIMITES = { bytes: 4 * 1024 * 1024, filas: 50000 };

module.exports = {
  HELMET_OPTIONS, PERMISSIONS_POLICY, ARGON2_OPTIONS, JWT_OPTIONS, JWT_VERIFY_OPTIONS,
  COOKIE_NAME, COOKIE_OPTIONS, OAUTH_COOKIE, OAUTH_COOKIE_OPTIONS, LOGIN_POLICY, CARGA_LIMITES,
};
