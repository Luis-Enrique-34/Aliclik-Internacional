// =====================================================================
//  CONTROLADOR del tablero, pedidos, cargas y estados.
// =====================================================================
const { dashboardService, cargaService } = require("../services");
const { pedidoDAO, estadoGrupoDAO, usuarioDAO } = require("../dao");
const { aCsv } = require("../utils/csv");
const { ipDe, HttpError } = require("../utils/HttpError");
const db = require("../config/database");

const sinPaginacion = ({ pagina, porPagina, orden, dir, ...f }) => f;

async function resumen(req, res) {
  res.json({ ok: true, ...(await dashboardService.resumen(sinPaginacion(req.datos), req.usuario.id)) });
}

async function ranking(req, res) {
  res.json({ ok: true, filas: await dashboardService.ranking(req.datos.dimension, sinPaginacion(req.datos)) });
}

async function pedidos(req, res) {
  const { pagina, porPagina, orden, dir, ...f } = req.datos;
  res.json({ ok: true, pagina, porPagina, ...(await pedidoDAO.listar(f, { pagina, porPagina, orden, dir })) });
}

const COLUMNAS_EXPORT = [
  ["order_number", "N° pedido"], ["order_id", "ID Aurora"], ["pais", "País"], ["fecha_pedido", "Fecha pedido"],
  ["tienda_id", "ID tienda"], ["tienda_nombre", "Tienda"], ["proveedor_id", "ID proveedor"], ["proveedor_nombre", "Proveedor"],
  ["almacen_id", "ID almacén"], ["almacen_nombre", "Almacén"], ["courier_id", "ID courier"], ["courier_nombre", "Courier"],
  ["estado_label", "Estado"], ["grupo", "Grupo"], ["estado_envio", "Estado envío"], ["estado_entrega", "Estado entrega"],
  ["fecha_entrega", "Fecha entrega"], ["moneda", "Moneda"], ["total", "Total"], ["unidades", "Unidades"],
].map(([campo, titulo]) => ({ campo, titulo }));

async function exportar(req, res) {
  const filas = await pedidoDAO.exportar(sinPaginacion(req.datos));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pedidos_internacional_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(aCsv(filas, COLUMNAS_EXPORT));
}

async function estadosPedido(req, res) {
  res.json({ ok: true, estados: await pedidoDAO.estados() });
}

/** POST /api/cargas  (Content-Type: text/csv) */
async function cargarCsv(req, res) {
  if (typeof req.body !== "string" || !req.body.trim()) throw new HttpError(400, "Adjunta un archivo CSV");
  let nombre = String(req.get("x-nombre-archivo") || "carga.csv");
  try { nombre = decodeURIComponent(nombre); } catch { /* se usa tal cual */ }
  const archivo = nombre.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 150);
  if (!/\.(csv|txt|tsv)$/i.test(archivo)) throw new HttpError(400, "Solo se aceptan archivos .csv, .tsv o .txt");
  const r = await cargaService.importarCsv({ texto: req.body, archivo, usuarioId: req.usuario.id, ip: ipDe(req), forzar: req.query.forzar === "1" });
  res.status(201).json({ ok: true, mensaje: `Carga completada: ${r.insertadas} nuevos, ${r.actualizadas} actualizados, ${r.sin_cambios} sin cambios, ${r.rechazadas} rechazados`, carga: r });
}

async function cargas(req, res) {
  res.json({ ok: true, cargas: await cargaService.listar() });
}

async function gruposEstado(req, res) {
  res.json({ ok: true, estados: await estadoGrupoDAO.listar() });
}

async function cambiarGrupo(req, res) {
  const r = await estadoGrupoDAO.actualizar(req.datos.codigo, req.body.grupo);
  require("../utils/memo").invalidar();
  if (!r) throw new HttpError(404, "No se encontró el estado");
  res.json({ ok: true, mensaje: "Clasificación actualizada", estado: r });
}

async function opciones(req, res) {
  const [paises, usuarios] = await Promise.all([
    db.query("SELECT codigo, nombre, moneda FROM paises WHERE activo ORDER BY nombre").then((r) => r.rows),
    usuarioDAO.correosActivos(),
  ]);
  res.json({ ok: true, paises, usuarios });
}

module.exports = { resumen, ranking, pedidos, exportar, estadosPedido, cargarCsv, cargas, gruposEstado, cambiarGrupo, opciones };
