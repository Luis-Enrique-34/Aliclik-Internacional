// =====================================================================
//  CONTROLADOR de indicadores: medidores, KPI/SLA y pronósticos por módulo.
// =====================================================================
const { indicadorService } = require("../services");

async function obtener(req, res) {
  const { modulo, ...filtros } = req.datos;
  res.json({ ok: true, ...(await indicadorService.obtener(modulo, filtros, req.usuario)) });
}

module.exports = { obtener };
