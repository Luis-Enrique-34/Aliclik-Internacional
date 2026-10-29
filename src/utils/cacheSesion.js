// =====================================================================
//  Caché corta de usuarios para validar sesiones sin consultar la base en
//  CADA petición (el tablero hace varias por vista). Dura 20 segundos y
//  se invalida al instante cuando cambia el rol, el estado o la contraseña
//  en este mismo servidor. En Vercel (varias instancias) el cambio tarda
//  como máximo 20 s en aplicarse en las demás.
// =====================================================================
const TTL_MS = 20_000;
const MAX = 1000;
const cache = new Map();

function obtener(id) {
  const e = cache.get(id);
  if (!e) return null;
  if (e.vence < Date.now()) { cache.delete(id); return null; }
  return e.usuario;
}

function guardar(id, usuario) {
  if (cache.size >= MAX) cache.delete(cache.keys().next().value); // descarta el más antiguo
  cache.set(id, { usuario, vence: Date.now() + TTL_MS });
}

const invalidar = (id) => cache.delete(id);
const limpiar = () => cache.clear();

module.exports = { obtener, guardar, invalidar, limpiar, TTL_MS };
