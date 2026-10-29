// =====================================================================
//  SERVICIO de calendario con sincronización BIDIRECCIONAL con Google.
//
//  Plataforma → Google: cada evento creado/editado/eliminado aquí se marca
//    "pendiente_sync" y se envía de inmediato a Google. Si Google no
//    responde, queda pendiente y se reintenta en la siguiente sincronización.
//  Google → Plataforma: se leen solo los cambios desde la última vez
//    (syncToken). Se dispara: al abrir el calendario, cada N minutos
//    (servidor o cron de Vercel) y al instante por el aviso (webhook) de
//    Google cuando la app está publicada con HTTPS.
//  Conflictos: gana el cambio más reciente (comparando fechas de edición).
// =====================================================================
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { JWT_SECRET, ENCRYPTION_KEY, GOOGLE, ZONA_HORARIA } = require("../config/env");
const { cifrar, descifrar, sha256, igualesSeguro, aleatorio } = require("../utils/cifrado");
const { fechaEnZona, instanteEnZona, sumarDias } = require("../utils/fechas");
const { HttpError, noEncontrado } = require("../utils/HttpError");
const GoogleCalendarClient = require("./GoogleCalendarClient");
const logger = require("../utils/logger");

const OAUTH_AUD = "google-oauth";
const DIAS_HISTORIAL = 60;
const COLOR = { reunion: "9", tarea: "5", hecha: "8" };

class CalendarioService {
  #enCurso = new Map(); // un solo proceso de sincronización por usuario a la vez

  constructor({ eventoDAO, googleCuentaDAO, auditoriaDAO, integracionDAO, entidadDAO, google = null }) {
    this.eventos = eventoDAO;
    this.cuentas = googleCuentaDAO;
    this.auditoria = auditoriaDAO;
    this.integraciones = integracionDAO;
    this.entidades = entidadDAO;
    this.google = google || (GOOGLE.habilitado ? new GoogleCalendarClient(GOOGLE) : null);
  }

  // =================================================================== Conexión
  async estado(usuarioId) {
    const c = this.google ? await this.cuentas.obtener(usuarioId) : null;
    return {
      habilitado: Boolean(this.google),
      conectado: Boolean(c),
      email: c?.google_email || null,
      ultimaSync: c?.ultima_sync || null,
      error: c?.ultimo_error || null,
      tiempoReal: Boolean(c?.canal_id && c?.canal_expira && new Date(c.canal_expira) > new Date()),
    };
  }

  /** Paso 1: genera la URL de Google y el valor de la cookie temporal (state + PKCE). */
  iniciarConexion(usuario) {
    if (!this.google) throw new HttpError(503, "La integración con Google Calendar no está configurada en el servidor (.env)");
    const state = aleatorio(24);
    const { verifier, challenge } = GoogleCalendarClient.pkce();
    // El verifier viaja cifrado (además de firmado) dentro de la cookie temporal
    const cookie = jwt.sign({ sub: usuario.id, st: state, pv: cifrar(verifier, ENCRYPTION_KEY) }, JWT_SECRET, { algorithm: "HS256", expiresIn: "10m", audience: OAUTH_AUD });
    return { url: this.google.urlAutorizacion({ state, challenge, loginHint: usuario.email }), cookie };
  }

  /** Paso 2: Google vuelve con ?code&state. Se valida el state contra la cookie (anti-CSRF). */
  async completarConexion(cookie, { code, state, error }, ip) {
    if (!this.google) throw new HttpError(503, "Google Calendar no está configurado");
    let datos;
    try {
      datos = jwt.verify(cookie || "", JWT_SECRET, { algorithms: ["HS256"], audience: OAUTH_AUD });
    } catch {
      throw new HttpError(400, "La solicitud de conexión expiró. Vuelve a intentarlo.");
    }
    if (!state || !igualesSeguro(state, datos.st)) throw new HttpError(400, "Solicitud de conexión no válida (state)");
    if (error) throw new HttpError(400, error === "access_denied" ? "No se concedió el permiso en Google" : "Google rechazó la conexión");
    if (!code) throw new HttpError(400, "Falta el código de autorización");

    const t = await this.google.canjearCodigo(code, descifrar(datos.pv, ENCRYPTION_KEY));
    if (!t.refresh_token) throw new HttpError(400, "Google no entregó acceso permanente. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar.");
    if (!String(t.scope || "").includes("calendar.events")) throw new HttpError(400, "Debes marcar el permiso de Google Calendar para conectar");

    const usuarioId = datos.sub;
    await this.cuentas.guardar(usuarioId, {
      googleEmail: GoogleCalendarClient.correoDeIdToken(t.id_token),
      refreshCif: cifrar(t.refresh_token, ENCRYPTION_KEY),
      accessCif: cifrar(t.access_token, ENCRYPTION_KEY),
      accessExpira: new Date(Date.now() + (t.expires_in - 60) * 1000),
    });
    // Los eventos locales existentes se envían a Google en la primera sincronización
    await this.eventos.marcarLocalesPendientes(usuarioId);
    await this.auditoria.registrar({ usuarioId, accion: "GOOGLE_CONECTADO", entidad: "google_cuentas", entidadId: usuarioId, ip });
    await this.sincronizar(usuarioId).catch((e) => logger.warn("Primera sincronización con Google falló", { error: e.message }));
    await this.renovarCanal(usuarioId).catch((e) => logger.warn("No se pudo activar el aviso en tiempo real", { error: e.message }));
    return usuarioId;
  }

  async desconectar(usuarioId, ip) {
    const c = await this.cuentas.obtener(usuarioId);
    if (!c) return;
    try {
      const token = await this.#accessToken(usuarioId, c);
      if (c.canal_id && c.canal_recurso_id) await this.google.detenerCanal(token, { id: c.canal_id, resourceId: c.canal_recurso_id }).catch(() => {});
      await this.google.revocar(descifrar(c.refresh_token_cif, ENCRYPTION_KEY));
    } catch (e) {
      logger.warn("Desconexión de Google con avisos", { error: e.message });
    }
    await this.cuentas.eliminar(usuarioId);
    await this.eventos.desvincularGoogle(usuarioId);
    await this.auditoria.registrar({ usuarioId, accion: "GOOGLE_DESCONECTADO", entidad: "google_cuentas", entidadId: usuarioId, ip });
  }

  /** Token de acceso vigente (se renueva solo cuando vence). */
  async #accessToken(usuarioId, cuenta) {
    const c = cuenta || (await this.cuentas.obtener(usuarioId));
    if (!c) throw new HttpError(409, "Tu calendario de Google no está conectado");
    if (c.access_token_cif && c.access_expira && new Date(c.access_expira) > new Date()) {
      return descifrar(c.access_token_cif, ENCRYPTION_KEY);
    }
    try {
      const t = await this.google.renovar(descifrar(c.refresh_token_cif, ENCRYPTION_KEY));
      await this.cuentas.actualizar(usuarioId, {
        access_token_cif: cifrar(t.access_token, ENCRYPTION_KEY),
        access_expira: new Date(Date.now() + (t.expires_in - 60) * 1000),
        ultimo_error: null,
      });
      return t.access_token;
    } catch (e) {
      if (e.razon === "invalid_grant") {
        await this.cuentas.actualizar(usuarioId, { ultimo_error: "Google revocó el acceso. Vuelve a conectar tu calendario." });
        throw new HttpError(409, "Google revocó el acceso. Vuelve a conectar tu calendario.");
      }
      throw e;
    }
  }

  // =================================================================== Eventos locales
  listar(usuarioId, rango) { return this.eventos.listar(usuarioId, rango); }
  tareas(usuarioId) { return this.eventos.tareasAbiertas(usuarioId); }

  async #validarVinculos(d) {
    if (d.integracion_id && !(await this.integraciones.obtener(d.integracion_id))) throw new HttpError(400, "Revisa los datos", { integracion_id: "Integración no válida" });
    if (d.entidad_id && !(await this.entidades.obtener(d.entidad_id))) throw new HttpError(400, "Revisa los datos", { entidad_id: "Entidad no válida" });
  }

  /** Normaliza "todo el día": de 00:00 del primer día a 23:59:59 del último (hora local). */
  static #ajustarDia(d) {
    if (!d.todo_el_dia) return { ...d, inicio: new Date(d.inicio).toISOString(), fin: new Date(d.fin).toISOString() };
    const a = fechaEnZona(d.inicio);
    const b = fechaEnZona(d.fin);
    return { ...d, inicio: instanteEnZona(a).toISOString(), fin: instanteEnZona(b, "23:59:59").toISOString() };
  }

  async crear(usuarioId, datos, ip) {
    await this.#validarVinculos(datos);
    const conectado = this.google && (await this.cuentas.obtener(usuarioId));
    const d = CalendarioService.#ajustarDia(datos);
    const ev = await this.eventos.crear(usuarioId, { ...d, origen: "local", pendiente_sync: Boolean(conectado && d.sincronizar) });
    await this.auditoria.registrar({ usuarioId, accion: "EVENTO_CREADO", entidad: "eventos", entidadId: ev.id, ip, detalle: { tipo: ev.tipo } });
    return this.#empujarSiCorresponde(usuarioId, ev, { conMeet: datos.crear_meet && d.tipo === "reunion", notificar: d.asistentes?.length > 0 });
  }

  async actualizar(usuarioId, id, datos, ip) {
    await this.#validarVinculos(datos);
    const antes = await this.eventos.obtener(usuarioId, id);
    if (!antes || antes.eliminado) throw noEncontrado("el evento");
    const conectado = this.google && (await this.cuentas.obtener(usuarioId));
    const d = CalendarioService.#ajustarDia(datos);
    // Si deja de sincronizarse pero ya estaba en Google, se borra allá
    if (antes.google_event_id && !d.sincronizar && conectado) {
      await this.#borrarEnGoogle(usuarioId, antes.google_event_id).catch(() => {});
      await this.eventos.marcarSincronizado(usuarioId, id, { googleEventId: null });
    }
    const ev = await this.eventos.actualizar(usuarioId, id, { ...d, pendiente_sync: Boolean(conectado && d.sincronizar) });
    await this.auditoria.registrar({ usuarioId, accion: "EVENTO_EDITADO", entidad: "eventos", entidadId: id, ip });
    return this.#empujarSiCorresponde(usuarioId, ev, { notificar: d.asistentes?.length > 0 });
  }

  async cambiarEstadoTarea(usuarioId, id, estado) {
    const conectado = this.google && (await this.cuentas.obtener(usuarioId));
    const ev = await this.eventos.cambiarEstadoTarea(usuarioId, id, estado, Boolean(conectado));
    if (!ev) throw noEncontrado("la tarea");
    return this.#empujarSiCorresponde(usuarioId, ev, {});
  }

  async eliminar(usuarioId, id, ip) {
    const conectado = this.google && (await this.cuentas.obtener(usuarioId));
    const ev = await this.eventos.eliminar(usuarioId, id, Boolean(conectado));
    if (!ev) throw noEncontrado("el evento");
    await this.auditoria.registrar({ usuarioId, accion: "EVENTO_ELIMINADO", entidad: "eventos", entidadId: id, ip });
    if (conectado && ev.google_event_id) {
      try {
        await this.#borrarEnGoogle(usuarioId, ev.google_event_id);
        await this.eventos.marcarSincronizado(usuarioId, id, { googleEventId: ev.google_event_id });
      } catch (e) {
        logger.warn("Eliminación pendiente de enviar a Google", { error: e.message });
      }
    }
  }

  async #empujarSiCorresponde(usuarioId, ev, opciones) {
    if (!ev.pendiente_sync) return ev;
    try {
      await this.#empujar(usuarioId, ev, opciones);
      return (await this.eventos.obtener(usuarioId, ev.id)) || ev;
    } catch (e) {
      logger.warn("Cambio pendiente de enviar a Google", { error: e.message });
      return { ...ev, aviso: "Guardado. Se enviará a Google Calendar en la próxima sincronización." };
    }
  }

  // =================================================================== Plataforma → Google
  static aGoogle(ev) {
    const g = {
      summary: ev.titulo,
      description: ev.descripcion || "",
      location: ev.ubicacion || "",
      colorId: ev.tipo === "tarea" ? (ev.estado_tarea === "hecha" ? COLOR.hecha : COLOR.tarea) : COLOR.reunion,
      attendees: (ev.asistentes || []).map((email) => ({ email })),
      extendedProperties: { private: { alcId: ev.id, alcTipo: ev.tipo, alcEstado: ev.estado_tarea || "" } },
    };
    if (ev.todo_el_dia) {
      g.start = { date: fechaEnZona(ev.inicio) };
      g.end = { date: sumarDias(fechaEnZona(ev.fin), 1) }; // en Google el fin de un día completo es exclusivo
    } else {
      g.start = { dateTime: new Date(ev.inicio).toISOString(), timeZone: ZONA_HORARIA };
      g.end = { dateTime: new Date(ev.fin).toISOString(), timeZone: ZONA_HORARIA };
    }
    return g;
  }

  async #borrarEnGoogle(usuarioId, googleId) {
    const c = await this.cuentas.obtener(usuarioId);
    const token = await this.#accessToken(usuarioId, c);
    try {
      await this.google.eliminarEvento(token, c.calendar_id, googleId);
    } catch (e) {
      if (![404, 410].includes(e.status)) throw e; // ya no existía: está bien
    }
  }

  async #empujar(usuarioId, ev, { conMeet = false, notificar = false } = {}) {
    if (ev.eliminado) {
      if (ev.google_event_id) await this.#borrarEnGoogle(usuarioId, ev.google_event_id);
      await this.eventos.marcarSincronizado(usuarioId, ev.id, { googleEventId: ev.google_event_id });
      return;
    }
    const c = await this.cuentas.obtener(usuarioId);
    const token = await this.#accessToken(usuarioId, c);
    const cuerpo = CalendarioService.aGoogle(ev);
    let r;
    if (ev.google_event_id) {
      try {
        r = await this.google.actualizarEvento(token, c.calendar_id, ev.google_event_id, cuerpo, { notificar });
      } catch (e) {
        if (![404, 410].includes(e.status)) throw e;
        r = null; // lo borraron en Google: se vuelve a crear
      }
    }
    if (!r) {
      if (conMeet) cuerpo.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
      r = await this.google.crearEvento(token, c.calendar_id, cuerpo, { conMeet, notificar });
    }
    await this.eventos.marcarSincronizado(usuarioId, ev.id, { googleEventId: r.id, etag: r.etag, actualizado: r.updated, meetLink: r.hangoutLink });
  }

  // =================================================================== Google → Plataforma
  static desdeGoogle(item) {
    const todoElDia = Boolean(item.start?.date);
    let inicio;
    let fin;
    if (todoElDia) {
      inicio = instanteEnZona(item.start.date).toISOString();
      fin = instanteEnZona(sumarDias(item.end?.date || sumarDias(item.start.date, 1), -1), "23:59:59").toISOString();
    } else {
      inicio = new Date(item.start?.dateTime).toISOString();
      fin = new Date(item.end?.dateTime || item.start?.dateTime).toISOString();
    }
    if (fin < inicio) fin = inicio;
    const priv = item.extendedProperties?.private || {};
    return {
      tipo: priv.alcTipo === "tarea" ? "tarea" : "reunion",
      titulo: String(item.summary || "(sin título)").slice(0, 200),
      descripcion: item.description ? String(item.description).slice(0, 4000) : null,
      ubicacion: item.location ? String(item.location).slice(0, 300) : null,
      inicio, fin, todo_el_dia: todoElDia,
      estado_tarea: priv.alcTipo === "tarea" ? (["pendiente", "en_curso", "hecha"].includes(priv.alcEstado) ? priv.alcEstado : "pendiente") : null,
      asistentes: (item.attendees || []).filter((a) => !a.self && a.email).map((a) => String(a.email).toLowerCase()).slice(0, 30),
      meet_link: item.hangoutLink || null,
      google_event_id: item.id,
      google_etag: item.etag,
      google_actualizado: item.updated,
      alcId: priv.alcId || null,
    };
  }

  async #traer(usuarioId) {
    const c = await this.cuentas.obtener(usuarioId);
    const token = await this.#accessToken(usuarioId, c);
    let syncToken = c.sync_token;
    let pageToken;
    const res = { nuevos: 0, actualizados: 0, eliminados: 0 };
    const timeMin = new Date(Date.now() - DIAS_HISTORIAL * 86400000).toISOString();
    for (;;) {
      let pagina;
      try {
        pagina = await this.google.listarEventos(token, c.calendar_id, { syncToken, pageToken, timeMin });
      } catch (e) {
        if (e.status === 410 && syncToken) { // el token venció: sincronización completa
          syncToken = null; pageToken = undefined;
          await this.cuentas.actualizar(usuarioId, { sync_token: null });
          continue;
        }
        throw e;
      }
      for (const item of pagina.items || []) await this.#aplicar(usuarioId, item, res);
      if (pagina.nextPageToken) { pageToken = pagina.nextPageToken; continue; }
      await this.cuentas.actualizar(usuarioId, { sync_token: pagina.nextSyncToken || null });
      return res;
    }
  }

  async #aplicar(usuarioId, item, res) {
    let local = await this.eventos.porGoogleId(usuarioId, item.id);
    const priv = item.extendedProperties?.private || {};
    if (!local && priv.alcId && /^[0-9a-f-]{36}$/i.test(priv.alcId)) {
      // Evento nuestro cuyo id de Google aún no se guardó (p. ej. se cortó la red al crearlo)
      const propio = await this.eventos.obtener(usuarioId, priv.alcId);
      if (propio && !propio.google_event_id) {
        await this.eventos.marcarSincronizado(usuarioId, propio.id, { googleEventId: item.id, etag: item.etag, actualizado: item.updated });
        local = await this.eventos.porGoogleId(usuarioId, item.id);
      }
    }
    if (item.status === "cancelled") {
      if (local && !local.eliminado) {
        await this.eventos.eliminar(usuarioId, local.id, false);
        res.eliminados++;
      }
      return;
    }
    if (!item.start) return;
    const d = CalendarioService.desdeGoogle(item);
    if (local) {
      // Conflicto: si aquí hay un cambio más reciente aún no enviado, gana el local
      if (local.pendiente_sync && new Date(local.actualizado_en) > new Date(item.updated)) return;
      if (local.google_actualizado && new Date(local.google_actualizado) >= new Date(item.updated) && !local.eliminado) return;
      await this.eventos.aplicarDesdeGoogle(usuarioId, local.id, d);
      if (local.tipo === "tarea" && d.estado_tarea && d.estado_tarea !== local.estado_tarea) await this.eventos.cambiarEstadoTarea(usuarioId, local.id, d.estado_tarea, false);
      res.actualizados++;
    } else {
      await this.eventos.crear(usuarioId, { ...d, origen: "google", sincronizar: true, pendiente_sync: false });
      res.nuevos++;
    }
  }

  // =================================================================== Sincronización completa
  /** Envía lo pendiente y trae los cambios de Google. Un solo proceso por usuario a la vez. */
  sincronizar(usuarioId) {
    if (!this.google) return Promise.resolve({ omitido: true });
    if (this.#enCurso.has(usuarioId)) return this.#enCurso.get(usuarioId);
    const p = (async () => {
      const c = await this.cuentas.obtener(usuarioId);
      if (!c) return { omitido: true };
      let enviados = 0;
      const errores = [];
      for (const ev of await this.eventos.pendientesDeSync(usuarioId)) {
        try { await this.#empujar(usuarioId, ev); enviados++; } catch (e) { errores.push(e.message); if (e.status === 409) throw e; }
      }
      const traidos = await this.#traer(usuarioId);
      await this.cuentas.actualizar(usuarioId, { ultima_sync: new Date(), ultimo_error: errores[0]?.slice(0, 300) || null });
      return { enviados, ...traidos, errores: errores.length };
    })()
      .catch(async (e) => {
        await this.cuentas.actualizar(usuarioId, { ultimo_error: String(e.message).slice(0, 300) }).catch(() => {});
        throw e;
      })
      .finally(() => this.#enCurso.delete(usuarioId));
    this.#enCurso.set(usuarioId, p);
    return p;
  }

  /** Activa/renueva el aviso en tiempo real de Google (solo con URL pública HTTPS). */
  async renovarCanal(usuarioId) {
    if (!this.google || !GOOGLE.webhookUrl) return false;
    const c = await this.cuentas.obtener(usuarioId);
    if (!c) return false;
    if (c.canal_expira && new Date(c.canal_expira) - Date.now() > 24 * 3600 * 1000) return true;
    const token = await this.#accessToken(usuarioId, c);
    if (c.canal_id && c.canal_recurso_id) await this.google.detenerCanal(token, { id: c.canal_id, resourceId: c.canal_recurso_id }).catch(() => {});
    const secreto = aleatorio(32);
    const canal = await this.google.vigilar(token, c.calendar_id, { id: crypto.randomUUID(), address: GOOGLE.webhookUrl, secreto });
    await this.cuentas.actualizar(usuarioId, {
      canal_id: canal.id, canal_recurso_id: canal.resourceId, canal_token_hash: sha256(secreto),
      canal_expira: canal.expiration ? new Date(Number(canal.expiration)) : null,
    });
    return true;
  }

  /** Aviso de Google: "algo cambió en este calendario". Se valida el token secreto del canal. */
  async recibirAviso({ canalId, token, estado }) {
    if (!canalId || !token) return false;
    const c = await this.cuentas.porCanal(canalId);
    if (!c || !c.canal_token_hash || !igualesSeguro(sha256(token), c.canal_token_hash)) return false;
    if (estado === "sync") return true; // mensaje inicial de confirmación
    await this.sincronizar(c.usuario_id).catch((e) => logger.warn("Sincronización por aviso de Google falló", { error: e.message }));
    return true;
  }

  /** Para el cron / intervalo: sincroniza a todos y renueva canales por vencer. */
  async sincronizarTodos() {
    if (!this.google) return { usuarios: 0 };
    const cuentas = await this.cuentas.todas();
    let ok = 0;
    for (const c of cuentas) {
      try {
        await this.sincronizar(c.usuario_id);
        await this.renovarCanal(c.usuario_id).catch(() => {});
        ok++;
      } catch (e) {
        logger.warn("Sincronización programada con errores", { usuario: c.usuario_id, error: e.message });
      }
    }
    await this.eventos.purgarEliminadosSincronizados().catch(() => {});
    return { usuarios: cuentas.length, ok };
  }
}

module.exports = CalendarioService;
