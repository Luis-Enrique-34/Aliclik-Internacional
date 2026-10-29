// =====================================================================
//  VALIDADORES de negocio — librería: zod
// =====================================================================
const { z } = require("zod");

const vacioANull = (v) => (v === "" || v === undefined ? null : v);
const texto = (max) => z.preprocess(vacioANull, z.string().trim().max(max).nullable().optional());
const uuidOpc = z.preprocess(vacioANull, z.uuid("Identificador no válido").nullable().optional());
const pais = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "País no válido");
const paisOpc = z.preprocess(vacioANull, pais.nullable().optional());
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida (AAAA-MM-DD)");
const idAurora = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional());
const bool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === 1 || v === "1", z.boolean());
const url = z.preprocess(vacioANull, z.string().trim().max(500).url("URL no válida").refine((u) => /^https:\/\//i.test(u), "Solo se permiten enlaces https://").nullable().optional());

const GRUPOS = ["pendiente", "en_proceso", "en_ruta", "entregado", "devuelto", "cancelado", "otro"];

// ------------------------------------------------------------- Pedidos / tablero
const filtrosPedidos = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  pais: paisOpc,
  tienda_id: idAurora,
  proveedor_id: idAurora,
  almacen_id: idAurora,
  courier_id: idAurora,
  grupo: z.enum(GRUPOS).optional(),
  estado: z.string().trim().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  porPagina: z.coerce.number().int().min(10).max(200).default(50),
  orden: z.enum(["fecha", "total", "estado"]).default("fecha"),
}).refine((d) => !d.desde || !d.hasta || d.desde <= d.hasta, { message: "La fecha inicial debe ser menor o igual a la final", path: ["desde"] });

const rankingParams = z.object({ dimension: z.enum(["tienda", "proveedor", "almacen", "courier", "pais"]) });
const estadoGrupoSchema = z.object({ grupo: z.enum(GRUPOS) });
const estadoCodigoParam = z.object({ codigo: z.string().min(1).max(60) });

// ------------------------------------------------------------- Entidades
const TIPOS = ["tienda", "proveedor", "almacen", "courier"];
const tipoParam = z.object({ tipo: z.enum(TIPOS) });
const entidadSchema = z.object({
  tipo: z.enum(TIPOS),
  aurora_id: idAurora,
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(160),
  pais: paisOpc,
  contacto: texto(120),
  telefono: z.preprocess(vacioANull, z.string().trim().regex(/^[+()0-9\s-]{6,40}$/, "Teléfono no válido").nullable().optional()),
  correo: z.preprocess(vacioANull, z.string().trim().toLowerCase().max(255).email("Correo no válido").nullable().optional()),
  notas: texto(2000),
  activo: bool.optional(),
});

// ------------------------------------------------------------- Integraciones
const ESTADOS_INT = ["pendiente", "en_proceso", "integrado", "pausado"];
const CHECKS = ["grupo_wsp", "conf_sistemas", "capacitacion", "catalogo", "despacho", "liquidaciones"];
const integracionSchema = z.object({
  pais,
  proveedor_id: z.uuid("Selecciona un proveedor"),
  almacen_id: uuidOpc,
  almacen_texto: texto(160),
  contacto: texto(120),
  telefono: texto(40),
  pendiente: texto(2000),
  horario_corte: texto(1000),
  usuario_alc: texto(255),
  logo_url: url,
  comentario: texto(2000),
  ...Object.fromEntries(CHECKS.map((c) => [c, bool.default(false)])),
  estado: z.enum(ESTADOS_INT).default("pendiente"),
  responsable_id: uuidOpc,
});
const filtrosIntegracion = z.object({ pais: paisOpc, estado: z.enum(ESTADOS_INT).optional(), q: z.string().trim().max(80).optional() });
const checkSchema = z.object({ campo: z.enum(CHECKS), valor: z.boolean() });

// ------------------------------------------------------------- Observaciones
const ESTADOS_OBS = ["abierta", "en_proceso", "resuelta", "descartada"];
const observacionSchema = z.object({
  descripcion: z.string().trim().min(5, "Describe la observación").max(2000),
  pais: paisOpc,
  modulo: texto(60),
  prioridad: z.enum(["baja", "media", "alta"]).default("media"),
  estado: z.enum(ESTADOS_OBS).default("abierta"),
  nota: texto(2000),
  responsable_id: uuidOpc,
});
const filtrosObservacion = z.object({ estado: z.enum(ESTADOS_OBS).optional(), pais: paisOpc });

// ------------------------------------------------------------- Seguimiento
const seguimientoSchema = z.object({
  comentario: z.string().trim().min(1, "Escribe un comentario").max(2000),
  estado: z.string().trim().max(12).optional(),
});
const recursoParams = z.object({ recurso: z.enum(["integracion", "entidad", "observacion"]), id: z.uuid("Identificador no válido") });

// ------------------------------------------------------------- Calendario
const instante = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha y hora no válidas");
const eventoSchema = z.object({
  tipo: z.enum(["reunion", "tarea"]),
  titulo: z.string().trim().min(2, "El título es obligatorio").max(200),
  descripcion: texto(4000),
  ubicacion: texto(300),
  inicio: instante,
  fin: instante,
  todo_el_dia: bool.default(false),
  estado_tarea: z.enum(["pendiente", "en_curso", "hecha"]).optional(),
  prioridad: z.enum(["baja", "media", "alta"]).default("media"),
  integracion_id: uuidOpc,
  entidad_id: uuidOpc,
  asistentes: z.array(z.string().trim().toLowerCase().email("Correo de invitado no válido")).max(30).default([]),
  sincronizar: bool.default(true),
  crear_meet: bool.default(false),
}).refine((d) => new Date(d.fin) >= new Date(d.inicio), { message: "El fin debe ser posterior al inicio", path: ["fin"] })
  .refine((d) => new Date(d.fin) - new Date(d.inicio) <= 1000 * 60 * 60 * 24 * 62, { message: "El evento no puede durar más de 2 meses", path: ["fin"] });
const rangoCalendario = z.object({ desde: instante, hasta: instante, tipo: z.enum(["reunion", "tarea"]).optional() });
const estadoTareaSchema = z.object({ estado: z.enum(["pendiente", "en_curso", "hecha"]) });

// ------------------------------------------------------------- Seguimiento por actor
const SEGMENTOS = ["estandar", "preferente", "vip", "estrategica"];
const SALUDES = ["creciendo", "estable", "atencion", "en_caida", "inactiva", "sin_datos"];
const filtrosSeguimiento = z.object({
  pais: paisOpc,
  q: z.string().trim().max(80).optional(),
  segmento: z.enum(SEGMENTOS).optional(),
  salud: z.enum(SALUDES).optional(),
  especial: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional(),
});
const planSchema = z.object({
  segmento: z.enum(SEGMENTOS),
  meta_pedidos_mes: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1, "La meta debe ser mayor a 0").max(10000000).nullable()),
  responsable_id: uuidOpc,
  condiciones: texto(2000),
});
const fechaOpc = z.preprocess(vacioANull, fecha.nullable().optional());
const TIPOS_ACUERDO = ["descuento_pct", "descuento_monto", "tarifa_especial", "envio_gratis", "credito", "prioridad", "otro"];
const acuerdoSchema = z.object({
  entidad_id: z.uuid("Selecciona a quién aplica"),
  tipo: z.enum(TIPOS_ACUERDO),
  titulo: z.string().trim().min(3, "Describe el beneficio").max(160),
  descripcion: texto(2000),
  aplica_a: z.enum(["fulfillment", "envio", "comision", "producto", "liquidacion", "general"]).default("general"),
  valor: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0, "El valor no puede ser negativo").max(9999999999).nullable()),
  moneda: z.preprocess(vacioANull, z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Moneda no válida").nullable().optional()),
  umbral_pedidos: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1, "El umbral debe ser mayor a 0").max(10000000).nullable()),
  vigente_desde: fecha,
  vigente_hasta: fechaOpc,
  estado: z.enum(["activo", "pausado", "finalizado"]).default("activo"),
})
  .refine((d) => d.tipo !== "descuento_pct" || (d.valor != null && d.valor > 0 && d.valor <= 100), { message: "El porcentaje debe estar entre 0 y 100", path: ["valor"] })
  .refine((d) => d.tipo !== "descuento_monto" || (d.valor != null && d.valor > 0), { message: "Indica el monto del descuento", path: ["valor"] })
  .refine((d) => !d.vigente_hasta || d.vigente_hasta >= d.vigente_desde, { message: "La fecha final debe ser posterior al inicio", path: ["vigente_hasta"] });
const filtrosAcuerdo = z.object({
  estado: z.enum(["activo", "pausado", "finalizado"]).optional(),
  tipoEntidad: z.enum(TIPOS).optional(),
  q: z.string().trim().max(80).optional(),
});

// ------------------------------------------------------------- Administración
const accesoSchema = z.object({
  rol: z.enum(["admin", "editor", "lector"]).optional(),
  estado: z.enum(["pendiente", "activo", "suspendido"]).optional(),
}).refine((d) => d.rol || d.estado, { message: "Nada que actualizar" });

module.exports = {
  GRUPOS, filtrosPedidos, rankingParams, estadoGrupoSchema, estadoCodigoParam,
  tipoParam, entidadSchema,
  integracionSchema, filtrosIntegracion, checkSchema, ESTADOS_INT,
  observacionSchema, filtrosObservacion, ESTADOS_OBS,
  seguimientoSchema, recursoParams,
  eventoSchema, rangoCalendario, estadoTareaSchema,
  accesoSchema,
  SEGMENTOS, filtrosSeguimiento, planSchema, acuerdoSchema, filtrosAcuerdo,
};
