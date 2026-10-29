// =====================================================================
//  LÍMITES DE PETICIONES (express-rate-limit): frenan la fuerza bruta y
//  el abuso de la API. Se suman al bloqueo de cuenta por 5 fallos.
//  Nota: el contador vive en memoria del proceso. En Vercel (varias
//  instancias) es un freno parcial; el bloqueo por cuenta sí se guarda
//  en la base y funciona siempre.
// =====================================================================
const rateLimit = require("express-rate-limit");
const { IS_PROD } = require("../config/env");

const mensaje = (texto) => ({ ok: false, mensaje: texto });
const comun = { standardHeaders: "draft-7", legacyHeaders: false };

const loginLimiter = rateLimit({
  ...comun,
  windowMs: 15 * 60 * 1000,
  limit: IS_PROD ? 10 : 50,
  message: mensaje("Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos."),
});

const registroLimiter = rateLimit({
  ...comun,
  windowMs: 60 * 60 * 1000,
  limit: IS_PROD ? 5 : 30,
  message: mensaje("Demasiados registros desde esta conexión. Intenta más tarde."),
});

const cargaLimiter = rateLimit({
  ...comun,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: mensaje("Demasiadas cargas seguidas. Espera unos minutos."),
});

const apiLimiter = rateLimit({
  ...comun,
  windowMs: 15 * 60 * 1000,
  limit: IS_PROD ? 1500 : 10000,
  message: mensaje("Demasiadas peticiones. Espera unos minutos."),
});

module.exports = { loginLimiter, registroLimiter, cargaLimiter, apiLimiter };
