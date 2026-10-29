// DAO del calendario (reuniones y tareas). Cada usuario solo ve los suyos:
// TODAS las consultas filtran por usuario_id (evita acceso a eventos ajenos).
const BaseDAO = require("./BaseDAO");

const CAMPOS = `e.id, e.tipo, e.titulo, e.descripcion, e.ubicacion, e.inicio, e.fin, e.todo_el_dia, e.estado_tarea,
                e.prioridad, e.integracion_id, e.entidad_id, e.asistentes, e.meet_link, e.origen, e.sincronizar,
                e.google_event_id, e.pendiente_sync, e.creado_en, e.actualizado_en`;

class EventoDAO extends BaseDAO {
  listar(usuarioId, { desde, hasta, tipo }) {
    return this.varios(
      `SELECT ${CAMPOS}, pr.nombre AS integracion_nombre, en.nombre AS entidad_nombre
         FROM eventos e
         LEFT JOIN integraciones i ON i.id = e.integracion_id
         LEFT JOIN entidades pr ON pr.id = i.proveedor_id
         LEFT JOIN entidades en ON en.id = e.entidad_id
        WHERE e.usuario_id = $1 AND NOT e.eliminado
          AND e.fin >= $2 AND e.inicio < $3
          AND ($4::text IS NULL OR e.tipo = $4)
        ORDER BY e.inicio`,
      [usuarioId, desde, hasta, tipo || null]
    );
  }

  tareasAbiertas(usuarioId) {
    return this.varios(
      `SELECT ${CAMPOS} FROM eventos e
        WHERE e.usuario_id = $1 AND NOT e.eliminado AND e.tipo = 'tarea' AND e.estado_tarea <> 'hecha'
        ORDER BY e.inicio LIMIT 100`,
      [usuarioId]
    );
  }

  proximos(usuarioId, limite = 6) {
    return this.varios(
      `SELECT ${CAMPOS} FROM eventos e
        WHERE e.usuario_id = $1 AND NOT e.eliminado AND e.fin >= now()
          AND (e.tipo = 'reunion' OR e.estado_tarea <> 'hecha')
        ORDER BY e.inicio LIMIT $2`,
      [usuarioId, limite]
    );
  }

  /** Próximas reuniones/tareas del equipo vinculadas a una entidad (o a sus integraciones). */
  vinculados(entidadId, limite = 8) {
    return this.varios(
      `SELECT e.id, e.tipo, e.titulo, e.inicio, e.fin, e.todo_el_dia, e.estado_tarea, e.meet_link,
              u.nombres || ' ' || u.apellidos AS usuario
         FROM eventos e JOIN usuarios u ON u.id = e.usuario_id
         LEFT JOIN integraciones i ON i.id = e.integracion_id
        WHERE NOT e.eliminado AND e.fin >= now() - interval '30 days'
          AND (e.entidad_id = $1 OR i.proveedor_id = $1 OR i.almacen_id = $1)
        ORDER BY e.inicio LIMIT $2`,
      [entidadId, limite]
    );
  }

  obtener(usuarioId, id) {
    return this.uno(`SELECT ${CAMPOS}, e.google_etag, e.eliminado FROM eventos e WHERE e.usuario_id = $1 AND e.id = $2`, [usuarioId, id]);
  }

  porGoogleId(usuarioId, googleId) {
    return this.uno(
      `SELECT ${CAMPOS}, e.google_actualizado, e.eliminado FROM eventos e WHERE e.usuario_id = $1 AND e.google_event_id = $2`,
      [usuarioId, googleId]
    );
  }

  crear(usuarioId, d) {
    return this.uno(
      `INSERT INTO eventos AS e (usuario_id, tipo, titulo, descripcion, ubicacion, inicio, fin, todo_el_dia, estado_tarea,
              prioridad, integracion_id, entidad_id, asistentes, origen, sincronizar, pendiente_sync,
              google_event_id, google_etag, google_actualizado, meet_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING ${CAMPOS}`,
      [usuarioId, d.tipo, d.titulo, d.descripcion || null, d.ubicacion || null, d.inicio, d.fin, Boolean(d.todo_el_dia),
       d.tipo === "tarea" ? d.estado_tarea || "pendiente" : null, d.prioridad || "media", d.integracion_id || null,
       d.entidad_id || null, JSON.stringify(d.asistentes || []), d.origen || "local", d.sincronizar ?? true,
       Boolean(d.pendiente_sync), d.google_event_id || null, d.google_etag || null, d.google_actualizado || null, d.meet_link || null]
    );
  }

  actualizar(usuarioId, id, d) {
    return this.uno(
      `UPDATE eventos AS e SET tipo = $3, titulo = $4, descripcion = $5, ubicacion = $6, inicio = $7, fin = $8,
              todo_el_dia = $9, estado_tarea = $10, prioridad = $11, integracion_id = $12, entidad_id = $13,
              asistentes = $14, sincronizar = $15, pendiente_sync = $16
        WHERE e.usuario_id = $1 AND e.id = $2 AND NOT e.eliminado
        RETURNING ${CAMPOS}`,
      [usuarioId, id, d.tipo, d.titulo, d.descripcion || null, d.ubicacion || null, d.inicio, d.fin, Boolean(d.todo_el_dia),
       d.tipo === "tarea" ? d.estado_tarea || "pendiente" : null, d.prioridad || "media", d.integracion_id || null,
       d.entidad_id || null, JSON.stringify(d.asistentes || []), d.sincronizar ?? true, Boolean(d.pendiente_sync)]
    );
  }

  /** Datos que llegan desde Google (no marca pendiente_sync). */
  aplicarDesdeGoogle(usuarioId, id, d) {
    return this.uno(
      `UPDATE eventos AS e SET titulo = $3, descripcion = $4, ubicacion = $5, inicio = $6, fin = $7, todo_el_dia = $8,
              asistentes = $9, meet_link = $10, google_etag = $11, google_actualizado = $12, eliminado = false, pendiente_sync = false
        WHERE e.usuario_id = $1 AND e.id = $2 RETURNING ${CAMPOS}`,
      [usuarioId, id, d.titulo, d.descripcion || null, d.ubicacion || null, d.inicio, d.fin, Boolean(d.todo_el_dia),
       JSON.stringify(d.asistentes || []), d.meet_link || null, d.google_etag || null, d.google_actualizado || null]
    );
  }

  marcarSincronizado(usuarioId, id, { googleEventId, etag, actualizado, meetLink }) {
    return this.afecta(
      `UPDATE eventos SET google_event_id = $3, google_etag = $4, google_actualizado = $5,
              meet_link = COALESCE($6, meet_link), pendiente_sync = false
        WHERE usuario_id = $1 AND id = $2`,
      [usuarioId, id, googleEventId, etag || null, actualizado || null, meetLink || null]
    );
  }

  marcarPendiente(usuarioId, id) {
    return this.afecta("UPDATE eventos SET pendiente_sync = true WHERE usuario_id = $1 AND id = $2", [usuarioId, id]);
  }

  cambiarEstadoTarea(usuarioId, id, estado, pendienteSync) {
    return this.uno(
      `UPDATE eventos AS e SET estado_tarea = $3, pendiente_sync = $4
        WHERE e.usuario_id = $1 AND e.id = $2 AND e.tipo = 'tarea' AND NOT e.eliminado RETURNING ${CAMPOS}`,
      [usuarioId, id, estado, pendienteSync]
    );
  }

  /** Borrado lógico: se conserva para poder propagar la eliminación a Google. */
  eliminar(usuarioId, id, pendienteSync) {
    return this.uno(
      `UPDATE eventos SET eliminado = true, pendiente_sync = $3
        WHERE usuario_id = $1 AND id = $2 AND NOT eliminado RETURNING id, google_event_id`,
      [usuarioId, id, pendienteSync]
    );
  }

  pendientesDeSync(usuarioId) {
    return this.varios(
      `SELECT ${CAMPOS}, e.google_etag, e.eliminado FROM eventos e
        WHERE e.usuario_id = $1 AND e.pendiente_sync AND e.sincronizar ORDER BY e.actualizado_en LIMIT 100`,
      [usuarioId]
    );
  }

  purgarEliminadosSincronizados() {
    return this.query("DELETE FROM eventos WHERE eliminado AND NOT pendiente_sync AND actualizado_en < now() - interval '30 days'");
  }

  marcarLocalesPendientes(usuarioId) {
    return this.query(
      `UPDATE eventos SET pendiente_sync = true
        WHERE usuario_id = $1 AND sincronizar AND NOT eliminado AND google_event_id IS NULL AND fin >= now() - interval '60 days'`,
      [usuarioId]
    );
  }

  desvincularGoogle(usuarioId) {
    return this.query(
      `UPDATE eventos SET google_event_id = NULL, google_etag = NULL, google_actualizado = NULL, pendiente_sync = false
        WHERE usuario_id = $1`,
      [usuarioId]
    );
  }
}

module.exports = EventoDAO;
