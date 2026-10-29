// Una instancia de cada DAO, compartida por toda la app.
const UsuarioDAO = require("./UsuarioDAO");
const AuditoriaDAO = require("./AuditoriaDAO");
const PedidoDAO = require("./PedidoDAO");
const EntidadDAO = require("./EntidadDAO");
const IntegracionDAO = require("./IntegracionDAO");
const ObservacionDAO = require("./ObservacionDAO");
const SeguimientoDAO = require("./SeguimientoDAO");
const EstadoGrupoDAO = require("./EstadoGrupoDAO");
const CargaDAO = require("./CargaDAO");
const EventoDAO = require("./EventoDAO");
const GoogleCuentaDAO = require("./GoogleCuentaDAO");
const AcuerdoDAO = require("./AcuerdoDAO");
const MetricaDAO = require("./MetricaDAO");

module.exports = {
  usuarioDAO: new UsuarioDAO(),
  auditoriaDAO: new AuditoriaDAO(),
  pedidoDAO: new PedidoDAO(),
  entidadDAO: new EntidadDAO(),
  integracionDAO: new IntegracionDAO(),
  observacionDAO: new ObservacionDAO(),
  seguimientoDAO: new SeguimientoDAO(),
  estadoGrupoDAO: new EstadoGrupoDAO(),
  cargaDAO: new CargaDAO(),
  eventoDAO: new EventoDAO(),
  googleCuentaDAO: new GoogleCuentaDAO(),
  acuerdoDAO: new AcuerdoDAO(),
  metricaDAO: new MetricaDAO(),
};
