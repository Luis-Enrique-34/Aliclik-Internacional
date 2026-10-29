// =====================================================================
//  RUTAS de la API (todas requieren sesión).
//   lector  → solo GET          editor → además crea/edita          admin → todo + usuarios
// =====================================================================
const express = require("express");
const { validate, idParam } = require("../middlewares/validate.middleware");
const { requireAuth, requireRol, puedeEscribir } = require("../middlewares/auth.middleware");
const { cargaLimiter } = require("../middlewares/rateLimit.middleware");
const { CARGA_LIMITES } = require("../config/security");
const s = require("../validators/negocio.schemas");
const panel = require("../controllers/panel.controller");
const g = require("../controllers/gestion.controller");
const cal = require("../controllers/calendario.controller");
const admin = require("../controllers/admin.controller");
const seg = require("../controllers/seguimiento.controller");

const router = express.Router();
const q = (schema) => validate(schema, "query");
const p = (schema) => validate(schema, "params");
const soloAdmin = requireRol("admin");

// ------------------------------------------------- Rutas SIN sesión (autenticadas con su propio secreto)
router.post("/calendario/google/webhook", cal.webhook);
router.get("/cron/calendario", admin.cronCalendario);
router.get("/calendario/google/callback", cal.callback); // valida state + cookie temporal

router.use(requireAuth);

// ------------------------------------------------- Tablero y pedidos
router.get("/opciones", panel.opciones);
router.get("/dashboard", q(s.filtrosPedidos), panel.resumen);
router.get("/dashboard/ranking/:dimension", p(s.rankingParams), q(s.filtrosPedidos), panel.ranking);
router.get("/pedidos", q(s.filtrosPedidos), panel.pedidos);
router.get("/pedidos/estados", panel.estadosPedido);
router.get("/pedidos/exportar.csv", q(s.filtrosPedidos), panel.exportar);

// ------------------------------------------------- Cargas de datos
router.get("/cargas", panel.cargas);
router.post("/cargas", puedeEscribir, cargaLimiter,
  express.text({ type: ["text/csv", "text/plain", "text/tab-separated-values", "application/vnd.ms-excel"], limit: CARGA_LIMITES.bytes }),
  panel.cargarCsv);
router.get("/estados", panel.gruposEstado);
router.put("/estados/:codigo", puedeEscribir, p(s.estadoCodigoParam), validate(s.estadoGrupoSchema), panel.cambiarGrupo);

// ------------------------------------------------- Entidades (el listado con métricas está en /seguimiento-actores)
router.get("/entidades/:tipo/opciones", p(s.tipoParam), g.opcionesEntidad);
router.get("/entidad/:id", idParam, g.entidad);
router.post("/entidad", puedeEscribir, validate(s.entidadSchema), g.crearEntidad);
router.put("/entidad/:id", puedeEscribir, idParam, validate(s.entidadSchema), g.editarEntidad);

// ------------------------------------------------- Seguimiento por actor y trato especial
router.get("/seguimiento-actores/alertas", seg.alertas);
router.get("/seguimiento-actores/ficha/:id", idParam, seg.ficha);
router.get("/seguimiento-actores/:tipo", p(s.tipoParam), q(s.filtrosSeguimiento), seg.listar);
router.put("/seguimiento-actores/ficha/:id/plan", puedeEscribir, idParam, validate(s.planSchema), seg.plan);
router.get("/acuerdos", q(s.filtrosAcuerdo), seg.acuerdos);
router.post("/acuerdos", puedeEscribir, validate(s.acuerdoSchema), seg.crearAcuerdo);
router.put("/acuerdos/:id", puedeEscribir, idParam, validate(s.acuerdoSchema), seg.editarAcuerdo);
router.delete("/acuerdos/:id", soloAdmin, idParam, seg.eliminarAcuerdo);

// ------------------------------------------------- Integraciones (onboarding por país)
router.get("/integraciones", q(s.filtrosIntegracion), g.integraciones);
router.get("/integraciones/:id", idParam, g.integracion);
router.post("/integraciones", puedeEscribir, validate(s.integracionSchema), g.crearIntegracion);
router.put("/integraciones/:id", puedeEscribir, idParam, validate(s.integracionSchema), g.editarIntegracion);
router.patch("/integraciones/:id/checklist", puedeEscribir, idParam, validate(s.checkSchema), g.marcarCheck);
router.delete("/integraciones/:id", soloAdmin, idParam, g.eliminarIntegracion);

// ------------------------------------------------- Observaciones
router.get("/observaciones", q(s.filtrosObservacion), g.observaciones);
router.post("/observaciones", puedeEscribir, validate(s.observacionSchema), g.crearObservacion);
router.put("/observaciones/:id", puedeEscribir, idParam, validate(s.observacionSchema), g.editarObservacion);
router.delete("/observaciones/:id", soloAdmin, idParam, g.eliminarObservacion);

// ------------------------------------------------- Seguimiento (bitácora)
router.get("/actividad", g.actividad);
router.get("/seguimiento/:recurso/:id", p(s.recursoParams), g.seguimiento);
router.post("/seguimiento/:recurso/:id", puedeEscribir, p(s.recursoParams), validate(s.seguimientoSchema), g.comentar);

// ------------------------------------------------- Calendario (cada usuario gestiona el suyo)
router.get("/calendario", q(s.rangoCalendario), cal.listar);
router.get("/calendario/tareas", cal.tareas);
router.post("/calendario", validate(s.eventoSchema), cal.crear);
router.put("/calendario/:id", idParam, validate(s.eventoSchema), cal.editar);
router.patch("/calendario/:id/estado", idParam, validate(s.estadoTareaSchema), cal.estadoTarea);
router.delete("/calendario/:id", idParam, cal.eliminar);
router.post("/calendario/sincronizar", cal.sincronizar);
router.get("/calendario/google/conectar", cal.conectar);
router.post("/calendario/google/desconectar", cal.desconectar);

// ------------------------------------------------- Administración
router.get("/admin/usuarios", soloAdmin, admin.usuarios);
router.patch("/admin/usuarios/:id", soloAdmin, idParam, validate(s.accesoSchema), admin.acceso);
router.post("/admin/usuarios/:id/desbloquear", soloAdmin, idParam, admin.desbloquear);
router.get("/admin/auditoria", soloAdmin, admin.auditoria);

module.exports = router;
