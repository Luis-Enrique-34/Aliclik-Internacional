// =====================================================================
//  Errores de negocio con código HTTP.
//  HttpError hereda de Error: el manejador central de app.js lo trata como
//  cualquier Error y además usa su código (principio L de SOLID: Liskov).
// =====================================================================

class HttpError extends Error {
  /**
   * @param {number} status código HTTP (400, 401, 403, 404, 409, 423...)
   * @param {string} mensaje texto seguro para mostrar al usuario
   * @param {Record<string,string>} [errores] errores por campo
   */
  constructor(status, mensaje, errores) {
    super(mensaje);
    this.name = "HttpError";
    this.status = status;
    this.errores = errores;
  }
}

/** noEncontrado("la solicitud") -> "No se encontró la solicitud" */
const noEncontrado = (que = "el recurso") => new HttpError(404, `No se encontró ${que}`);
const prohibido = (msg = "No tienes permiso para esta acción") => new HttpError(403, msg);
const conflicto = (msg) => new HttpError(409, msg);

/** IP del cliente (respeta "trust proxy" en producción). */
const ipDe = (req) => (req.ip || "").replace(/^::ffff:/, "").slice(0, 45);

module.exports = { HttpError, noEncontrado, prohibido, conflicto, ipDe };
