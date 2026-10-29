// =====================================================================
//  Caché en memoria para lecturas pesadas (tablero y seguimiento).
//  Los datos solo cambian cuando hay una carga o se edita un plan/acuerdo:
//  esas acciones llaman a invalidar() y la siguiente lectura se recalcula.
//  Además cada entrada vence a los 60 s (por si otra instancia cargó datos).
// =====================================================================
const TTL_MS = 60_000;
const MAX = 200;
const datos = new Map();
let version = 0;

/** Devuelve el valor guardado o ejecuta `fn` y lo guarda. Comparte la misma promesa entre peticiones simultáneas. */
function recordar(clave, fn, ttl = TTL_MS) {
  const k = `${version}|${clave}`;
  const e = datos.get(k);
  if (e && e.vence > Date.now()) return e.valor;
  if (datos.size >= MAX) datos.delete(datos.keys().next().value);
  const valor = Promise.resolve().then(fn);
  datos.set(k, { valor, vence: Date.now() + ttl });
  valor.catch(() => datos.delete(k)); // los errores no se guardan
  return valor;
}

function invalidar() {
  version++;
  datos.clear();
}

module.exports = { recordar, invalidar, TTL_MS };
