// =====================================================================
//  CIFRADO de datos sensibles en la base de datos (tokens de Google).
//  AES-256-GCM: cifra y además detecta si alguien alteró el dato.
//  Formato guardado: v1.<iv>.<tag>.<texto cifrado>  (base64url)
//  La clave (ENCRYPTION_KEY) vive solo en el servidor, nunca en la BD:
//  si alguien roba una copia de la base, los tokens no le sirven.
// =====================================================================
const crypto = require("crypto");

function cifrar(texto, clave) {
  if (texto == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave, iv);
  const datos = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), datos.toString("base64url")].join(".");
}

function descifrar(valor, clave) {
  if (!valor) return null;
  const [v, iv, tag, datos] = String(valor).split(".");
  if (v !== "v1" || !iv || !tag || !datos) throw new Error("Formato de dato cifrado no válido");
  const d = crypto.createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}

const sha256 = (texto) => crypto.createHash("sha256").update(texto).digest("hex");

/** Compara dos textos en tiempo constante (evita ataques por tiempo de respuesta). */
function igualesSeguro(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const aleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

module.exports = { cifrar, descifrar, sha256, igualesSeguro, aleatorio };
