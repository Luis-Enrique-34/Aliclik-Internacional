// Crea los servicios inyectándoles sus dependencias (DAO y conexión).
// En las pruebas se pueden construir los mismos servicios con DAO simulados.
const db = require("../config/database");
const daos = require("../dao");
const AuthService = require("./AuthService");
const AdminService = require("./AdminService");
const CargaService = require("./CargaService");
const DashboardService = require("./DashboardService");
const NegocioService = require("./NegocioService");
const CalendarioService = require("./CalendarioService");
const SeguimientoService = require("./SeguimientoService");
const IndicadorService = require("./IndicadorService");

const seguimientoService = new SeguimientoService(daos);

module.exports = {
  authService: new AuthService(daos),
  adminService: new AdminService(daos),
  cargaService: new CargaService({ db, ...daos }),
  dashboardService: new DashboardService(daos),
  seguimientoService,
  negocioService: new NegocioService(daos),
  calendarioService: new CalendarioService(daos),
  indicadorService: new IndicadorService({ ...daos, seguimientoService }),
};
