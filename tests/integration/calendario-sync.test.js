// =====================================================================
//  Sincronización bidireccional con Google Calendar usando un Google
//  SIMULADO en memoria (no se conecta a Google). Requiere RUN_INTEGRATION=1.
// =====================================================================
const test = require("node:test");
const assert = require("node:assert/strict");

const ACTIVO = process.env.RUN_INTEGRATION === "1";
const t = ACTIVO ? test : test.skip;

/** Google Calendar falso: guarda eventos y emula syncToken / cancelados. */
class GoogleFalso {
  constructor() { this.eventos = new Map(); this.version = 0; this.llamadas = []; }
  #marcar(ev) { ev.updated = new Date(Date.now() + ++this.version).toISOString(); ev._v = this.version; ev.etag = `"${this.version}"`; return ev; }
  async renovar() { return { access_token: "acceso", expires_in: 3600 }; }
  async listarEventos(_tk, _cal, { syncToken }) {
    const desde = syncToken ? Number(syncToken) : 0;
    const items = [...this.eventos.values()].filter((e) => e._v > desde && (syncToken || e.status !== "cancelled"));
    return { items: structuredClone(items), nextSyncToken: String(this.version) };
  }
  async crearEvento(_tk, _cal, cuerpo, op) {
    this.llamadas.push(["crear", op]);
    const ev = this.#marcar({ id: `g${this.eventos.size + 1}`, status: "confirmed", ...structuredClone(cuerpo), ...(op?.conMeet && { hangoutLink: "https://meet.google.com/abc-defg-hij" }) });
    this.eventos.set(ev.id, ev);
    return ev;
  }
  async actualizarEvento(_tk, _cal, id, cuerpo) {
    const ev = this.eventos.get(id);
    if (!ev || ev.status === "cancelled") { const e = new Error("no existe"); e.status = 404; throw e; }
    Object.assign(ev, structuredClone(cuerpo));
    return this.#marcar(ev);
  }
  async eliminarEvento(_tk, _cal, id) { const ev = this.eventos.get(id); if (ev) { ev.status = "cancelled"; this.#marcar(ev); } }
  async revocar() {}
  async detenerCanal() {}
  // Acciones "hechas por el usuario en Google"
  editarDesdeGoogle(id, cambios) { Object.assign(this.eventos.get(id), cambios); this.#marcar(this.eventos.get(id)); }
  crearDesdeGoogle(cuerpo) { const ev = this.#marcar({ id: `gx${this.eventos.size + 1}`, status: "confirmed", ...cuerpo }); this.eventos.set(ev.id, ev); return ev; }
  borrarDesdeGoogle(id) { this.eventos.get(id).status = "cancelled"; this.#marcar(this.eventos.get(id)); }
}

let db, servicio, google, usuarioId;

test.before(async () => {
  if (!ACTIVO) return;
  db = require("../../src/config/database");
  const daos = require("../../src/dao");
  const CalendarioService = require("../../src/services/CalendarioService");
  const { cifrar } = require("../../src/utils/cifrado");
  const { ENCRYPTION_KEY } = require("../../src/config/env");
  google = new GoogleFalso();
  servicio = new CalendarioService({ ...daos, google });
  const u = await db.query("INSERT INTO usuarios (nombres, apellidos, email, password_hash, estado) VALUES ('Cal', 'Test', $1, 'x', 'activo') RETURNING id", [`cal.${Date.now()}@prueba.local`]);
  usuarioId = u.rows[0].id;
  await daos.googleCuentaDAO.guardar(usuarioId, { googleEmail: "luis@gmail.com", refreshCif: cifrar("refresh", ENCRYPTION_KEY) });
});

test.after(async () => {
  if (!ACTIVO) return;
  await db.query("DELETE FROM usuarios WHERE id = $1", [usuarioId]);
  await db.pool.end();
});

const base = { tipo: "reunion", titulo: "Reunión con VITALCOM", inicio: "2026-11-03T15:00:00Z", fin: "2026-11-03T16:00:00Z", sincronizar: true, asistentes: [] };

t("Plataforma → Google: crear, editar y eliminar se reflejan en Google", async () => {
  const ev = await servicio.crear(usuarioId, { ...base, crear_meet: true });
  assert.ok(ev.google_event_id, "se guardó el id de Google");
  assert.equal(ev.meet_link, "https://meet.google.com/abc-defg-hij");
  const g = google.eventos.get(ev.google_event_id);
  assert.equal(g.summary, "Reunión con VITALCOM");
  assert.equal(g.extendedProperties.private.alcId, ev.id);

  await servicio.actualizar(usuarioId, ev.id, { ...base, titulo: "Reunión VITALCOM (reprogramada)", inicio: "2026-11-04T15:00:00Z", fin: "2026-11-04T16:00:00Z" });
  assert.equal(google.eventos.get(ev.google_event_id).summary, "Reunión VITALCOM (reprogramada)");

  await servicio.eliminar(usuarioId, ev.id);
  assert.equal(google.eventos.get(ev.google_event_id).status, "cancelled");
});

t("Google → Plataforma: eventos nuevos, editados y borrados en Google llegan a la plataforma", async () => {
  const g = google.crearDesdeGoogle({ summary: "Llamada con Moira", start: { dateTime: "2026-11-05T14:00:00Z" }, end: { dateTime: "2026-11-05T14:30:00Z" }, attendees: [{ email: "yo@gmail.com", self: true }, { email: "moises@moira.com" }] });
  let r = await servicio.sincronizar(usuarioId);
  assert.ok(r.nuevos >= 1);
  let local = await require("../../src/dao").eventoDAO.porGoogleId(usuarioId, g.id);
  assert.equal(local.titulo, "Llamada con Moira");
  assert.deepEqual(local.asistentes, ["moises@moira.com"]);
  assert.equal(local.origen, "google");

  google.editarDesdeGoogle(g.id, { summary: "Llamada con Moira (movida)" });
  r = await servicio.sincronizar(usuarioId);
  assert.equal(r.actualizados, 1);
  local = await require("../../src/dao").eventoDAO.porGoogleId(usuarioId, g.id);
  assert.equal(local.titulo, "Llamada con Moira (movida)");

  google.borrarDesdeGoogle(g.id);
  r = await servicio.sincronizar(usuarioId);
  assert.equal(r.eliminados, 1);
  local = await require("../../src/dao").eventoDAO.porGoogleId(usuarioId, g.id);
  assert.equal(local.eliminado, true);
});

t("Eventos de día completo y tareas conservan su tipo y estado", async () => {
  const tarea = await servicio.crear(usuarioId, { ...base, tipo: "tarea", titulo: "Enviar catálogo", todo_el_dia: true, inicio: "2026-11-06T05:00:00Z", fin: "2026-11-06T05:00:00Z" });
  const g = google.eventos.get(tarea.google_event_id);
  assert.deepEqual(g.start, { date: "2026-11-06" });
  assert.deepEqual(g.end, { date: "2026-11-07" }, "fin exclusivo en Google");
  await servicio.cambiarEstadoTarea(usuarioId, tarea.id, "hecha");
  assert.equal(google.eventos.get(tarea.google_event_id).extendedProperties.private.alcEstado, "hecha");
});

t("Sin conexión con Google el cambio queda pendiente y se envía después", async () => {
  const original = google.crearEvento.bind(google);
  google.crearEvento = async () => { const e = new Error("sin red"); e.status = 503; throw e; };
  const ev = await servicio.crear(usuarioId, { ...base, titulo: "Pendiente de enviar" });
  assert.equal(ev.pendiente_sync, true);
  assert.ok(ev.aviso);
  google.crearEvento = original;
  const r = await servicio.sincronizar(usuarioId);
  assert.ok(r.enviados >= 1);
  const local = await require("../../src/dao").eventoDAO.obtener(usuarioId, ev.id);
  assert.ok(local.google_event_id);
  assert.equal(local.pendiente_sync, false);
});

t("Aviso (webhook) con token falso se rechaza", async () => {
  assert.equal(await servicio.recibirAviso({ canalId: "canal-inexistente", token: "x", estado: "exists" }), false);
});
