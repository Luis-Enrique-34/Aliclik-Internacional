// =====================================================================
//  MIDDLEWARE de validación — librería: zod
//  Valida req.body / req.query / req.params contra un esquema ANTES de
//  llegar al controlador. Si es válido, deja los datos "limpios".
//    router.post("/x", validate(schema))            -> valida req.body
//    router.get("/x", validate(schema, "query"))    -> valida req.query
// =====================================================================
const { z } = require("zod");

function validate(schema, origen = "body") {
  return (req, res, next) => {
    const resultado = schema.safeParse(req[origen] ?? {});

    if (!resultado.success) {
      const errores = {};
      for (const issue of resultado.error.issues) {
        // en objetos anidados (perfil.documento) se usa el último nivel: "documento"
        const campo = issue.path[issue.path.length - 1] ?? "general";
        if (!errores[campo]) errores[campo] = issue.message; // primer error por campo
      }
      return res.status(400).json({ ok: false, mensaje: "Revisa los datos ingresados", errores });
    }

    // En Express 5 req.query es de solo lectura: los datos limpios van a req.datos
    if (origen === "body") req.body = resultado.data;
    req.datos = { ...(req.datos || {}), ...resultado.data };
    next();
  };
}

/** Valida que :id sea un UUID (evita consultas inútiles y errores de tipo en PostgreSQL). */
const idParam = validate(z.object({ id: z.uuid("Identificador no válido") }), "params");

module.exports = validate;
module.exports.validate = validate;
module.exports.idParam = idParam;
