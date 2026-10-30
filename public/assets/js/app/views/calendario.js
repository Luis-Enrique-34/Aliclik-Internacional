// Calendario de reuniones y tareas con sincronización bidireccional con Google Calendar.
import { api, html, raw, $, $$, encabezado, opcion, paramsHash, modal, confirmar, resultado, datosForm, toast, hace, hora, hoyIso
, urlSegura } from "../core.js";
import { panelIndicadores, ordenar } from "../indicadores.js";

const OFFSET = "-05:00"; // America/Lima (sin horario de verano)
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
let vista = "mes";                    // "mes" (por defecto) o "dia"
let mesActual = hoyIso().slice(0, 7); // "AAAA-MM"
let diaActual = hoyIso();             // "AAAA-MM-DD"
let filtroTipo = "";
// Filtros extra (se aplican en el navegador sobre lo ya cargado)
const extra = { prioridad: "", origen: "", vinculo: "", estado: "", ordenTareas: "vence" };
const ORDEN_TAREAS = { vence: (t) => t.fin, prioridad: (t) => ({ alta: 0, media: 1, baja: 2 })[t.prioridad], titulo: (t) => t.titulo };
function pasaFiltros(e) {
  if (extra.prioridad && e.prioridad !== extra.prioridad) return false;
  if (extra.origen === "google" && !e.google_event_id) return false;
  if (extra.origen === "local" && e.google_event_id) return false;
  if (extra.vinculo === "con" && !(e.integracion_id || e.entidad_id)) return false;
  if (extra.vinculo === "sin" && (e.integracion_id || e.entidad_id)) return false;
  if (extra.estado && e.tipo === "tarea" && (e.estado_tarea || "pendiente") !== extra.estado) return false;
  if (extra.estado && e.tipo !== "tarea") return false;
  return true;
}
const HORA_INICIO = 7;   // la vista por día muestra de 07:00…
const HORA_FIN = 21;     // …a 21:00 (se amplía si hay eventos fuera de ese rango)
const ALTO_HORA = 56;    // px por hora

const partes = (iso) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
};
const aIso = (f, h) => new Date(`${f}T${h || "00:00"}:00${OFFSET}`).toISOString();

/** Modal para crear o editar un evento. `previo` puede traer datos para precargar. */
export async function editorEvento(previo = {}, onGuardado) {
  const existente = Boolean(previo.id);
  const ini = previo.inicio ? partes(previo.inicio) : { fecha: previo.fecha || hoyIso(), hora: previo.hora || "10:00" };
  const sumarMin = (hhmm, min) => { const [h, m] = hhmm.split(":").map(Number); const t = Math.min(23 * 60 + 59, h * 60 + m + min); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const fin = previo.fin ? partes(previo.fin) : { fecha: ini.fecha, hora: sumarMin(ini.hora, previo.tipo === "tarea" ? 30 : 60) };
  const integ = await api("/api/integraciones");
  const e = { tipo: "reunion", prioridad: "media", estado_tarea: "pendiente", sincronizar: true, asistentes: [], ...previo };
  const promesa = modal({
    titulo: existente ? "Editar evento" : e.tipo === "tarea" ? "Nueva tarea" : "Nueva reunión",
    ancho: true,
    textoCancelar: existente ? "Cerrar" : "Cancelar",
    cuerpo: html`
      <div class="form-grid">
        <div class="f"><label>Tipo</label><select class="ctrl" name="tipo">${opcion("reunion", "Reunión", e.tipo)}${opcion("tarea", "Tarea", e.tipo)}</select></div>
        <div class="f"><label>Prioridad</label><select class="ctrl" name="prioridad">${opcion("baja", "Baja", e.prioridad)}${opcion("media", "Media", e.prioridad)}${opcion("alta", "Alta", e.prioridad)}</select></div>
        <div class="f full"><label>Título *</label><input class="ctrl" name="titulo" maxlength="200" value="${e.titulo || ""}" required></div>
        <div class="f"><label>Inicio *</label><div class="fila-flex"><input type="date" class="ctrl" name="f_ini" value="${ini.fecha}" style="flex:1"><input type="time" class="ctrl" name="h_ini" value="${ini.hora}" style="min-width:0;width:130px" data-hora></div></div>
        <div class="f"><label>Fin *</label><div class="fila-flex"><input type="date" class="ctrl" name="f_fin" value="${fin.fecha}" style="flex:1"><input type="time" class="ctrl" name="h_fin" value="${fin.hora}" style="min-width:0;width:130px" data-hora></div><input type="hidden" name="fin"></div>
        <div class="f full"><label class="switch"><input type="checkbox" name="todo_el_dia" ${e.todo_el_dia ? raw("checked") : ""}> Todo el día</label></div>
        <div class="f" data-solo-tarea><label>Estado de la tarea</label><select class="ctrl" name="estado_tarea">${opcion("pendiente", "Pendiente", e.estado_tarea)}${opcion("en_curso", "En curso", e.estado_tarea)}${opcion("hecha", "Hecha", e.estado_tarea)}</select></div>
        <div class="f" data-solo-reunion><label>Lugar o enlace</label><input class="ctrl" name="ubicacion" maxlength="300" value="${e.ubicacion || ""}" placeholder="Oficina, Zoom, Meet…"></div>
        <div class="f full" data-solo-reunion><label>Invitados (correos separados por coma)</label><input class="ctrl" name="asistentes" value="${(e.asistentes || []).join(", ")}" placeholder="contacto@proveedor.com, colega@aliclik.app"><div class="ayuda">Si tu Google Calendar está conectado, recibirán la invitación.</div></div>
        <div class="f full"><label>Vincular a integración</label><select class="ctrl" name="integracion_id">${opcion("", "Ninguna", e.integracion_id)}${(integ.data.integraciones || []).map((i) => opcion(i.id, `${i.proveedor_nombre} · ${i.pais}`, e.integracion_id))}</select><input type="hidden" name="entidad_id" value="${e.entidad_id || ""}"></div>
        <div class="f full"><label>Descripción / acuerdos</label><textarea class="ctrl" name="descripcion" maxlength="4000" rows="3">${e.descripcion || ""}</textarea></div>
        <div class="f"><label class="switch"><input type="checkbox" name="sincronizar" ${e.sincronizar ? raw("checked") : ""}> Sincronizar con Google Calendar</label></div>
        ${!existente ? html`<div class="f" data-solo-reunion><label class="switch"><input type="checkbox" name="crear_meet"> Crear enlace de Google Meet</label></div>` : ""}
        ${e.meet_link && urlSegura(e.meet_link) ? html`<div class="f full"><a class="btn btn-ghost btn-sm" href="${urlSegura(e.meet_link)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-video"></i> Unirse a Google Meet</a></div>` : ""}
        ${existente ? html`<div class="f full"><button type="button" class="btn btn-ghost btn-sm" data-eliminar style="color:var(--danger)"><i class="fas fa-trash"></i> Eliminar evento</button>
          ${e.origen === "google" ? html`<span class="muted" style="font-size:12px;margin-left:8px"><i class="fab fa-google"></i> Creado en Google Calendar</span>` : ""}</div>` : ""}
      </div>`,
    onSubmit: async (form) => {
      const d = datosForm(form);
      if (!d.f_ini || !d.f_fin) return { errores: { f_ini: "Indica las fechas" } };
      const cuerpo = {
        tipo: d.tipo, titulo: d.titulo, prioridad: d.prioridad, descripcion: d.descripcion,
        todo_el_dia: d.todo_el_dia, sincronizar: d.sincronizar, crear_meet: Boolean(d.crear_meet),
        inicio: aIso(d.f_ini, d.todo_el_dia ? "00:00" : d.h_ini), fin: aIso(d.f_fin, d.todo_el_dia ? "23:59" : d.h_fin),
        ubicacion: d.tipo === "reunion" ? d.ubicacion : "", estado_tarea: d.tipo === "tarea" ? d.estado_tarea : undefined,
        asistentes: d.tipo === "reunion" ? d.asistentes.split(/[,;\s]+/).filter(Boolean) : [],
        integracion_id: d.integracion_id, entidad_id: d.entidad_id,
      };
      const res = await api(existente ? `/api/calendario/${e.id}` : "/api/calendario", { method: existente ? "PUT" : "POST", body: cuerpo });
      if (!res.ok) {
        const er = res.data.errores || {};
        if (er.inicio) er.f_ini = er.inicio;
        if (er.fin) er.f_fin = er.fin;
        if (Object.keys(er).some((k) => /^asistentes/.test(k)) || er["0"]) er.asistentes = "Revisa los correos de los invitados";
        if (!res.data.errores) toast(res.data.mensaje, "error");
        return { errores: er };
      }
      toast(res.data.mensaje);
      return res.data.evento;
    },
  });
  // Botón "Eliminar" dentro del modal (el modal ya está en el DOM)
  const ov = [...document.querySelectorAll(".overlay")].at(-1);
  ov?.querySelector("[data-eliminar]")?.addEventListener("click", async () => {
    if (!(await confirmar("Eliminar evento", "Se eliminará también de tu Google Calendar si está sincronizado.", { textoOk: "Eliminar" }))) return;
    if (resultado(await api(`/api/calendario/${e.id}`, { method: "DELETE" }))) {
      ov.querySelector("[data-cerrar]").click();
      onGuardado?.();
    }
  });
  const r = await promesa;
  if (r && onGuardado) onGuardado();
  return r;
}

// Mostrar/ocultar campos según tipo y "todo el día" (delegado: el modal se crea dinámicamente)
document.addEventListener("change", (ev) => {
  const form = ev.target.closest(".modal");
  if (!form || !form.querySelector('[name="f_ini"]')) return;
  ajustarCampos(form);
});
function ajustarCampos(form) {
  const tipo = form.querySelector('[name="tipo"]').value;
  $$("[data-solo-tarea]", form).forEach((x) => (x.hidden = tipo !== "tarea"));
  $$("[data-solo-reunion]", form).forEach((x) => (x.hidden = tipo !== "reunion"));
  const todo = form.querySelector('[name="todo_el_dia"]').checked;
  $$("[data-hora]", form).forEach((x) => (x.hidden = todo));
  const fi = form.querySelector('[name="f_ini"]'), ff = form.querySelector('[name="f_fin"]');
  if (ff.value < fi.value) ff.value = fi.value;
}
new MutationObserver(() => { const f = document.querySelector(".modal [name='f_ini']")?.closest(".modal"); if (f && !f.dataset.ok) { f.dataset.ok = "1"; ajustarCampos(f); } })
  .observe(document.body, { childList: true });
const sumarDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const diaSemana = (f) => (new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
const tituloDia = (f) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^./, (c) => c.toUpperCase());
const hhmm = (iso) => partes(iso).hora; // 24 h, hora de Lima: más compacto que "10:00 a. m."
const minutos = (iso) => { const { hora: hh } = partes(iso); const [h, m] = hh.split(":").map(Number); return h * 60 + m; };
const claseEv = (e) => `${e.tipo === "tarea" ? "tarea" : ""} ${e.estado_tarea === "hecha" ? "hecha" : ""}`;
const iconoG = (e) => (e.google_event_id ? raw('<i class="fab fa-google" title="Sincronizado con Google"></i>') : "");

function celdaEventos(evs, dia) {
  const max = 3;
  return html`${evs.slice(0, max).map((e) => html`
    <div class="ev ${claseEv(e)}" data-ev="${e.id}" title="${e.titulo}">
      ${e.todo_el_dia ? "" : html`<span class="h">${hhmm(e.inicio)}</span>`}${e.titulo}${iconoG(e)}
    </div>`)}${evs.length > max ? html`<button type="button" class="mas" data-ver-dia="${dia}">+${evs.length - max} más</button>` : ""}
    ${evs.length ? html`<div class="puntos-dia" aria-hidden="true">${evs.slice(0, 4).map((e) => html`<i class="${claseEv(e)}"></i>`)}</div>` : ""}`;
}

/** Reparte eventos que se cruzan en columnas (como en Google Calendar). */
function columnas(evs) {
  const orden = [...evs].sort((x, y) => minutos(x.inicio) - minutos(y.inicio) || minutos(y.fin) - minutos(x.fin));
  const grupos = [];
  let grupo = [];
  let finGrupo = -1;
  for (const e of orden) {
    const ini = minutos(e.inicio);
    if (grupo.length && ini >= finGrupo) { grupos.push(grupo); grupo = []; finGrupo = -1; }
    grupo.push(e);
    finGrupo = Math.max(finGrupo, Math.max(minutos(e.fin), ini + 20));
  }
  if (grupo.length) grupos.push(grupo);
  const res = [];
  for (const g of grupos) {
    const finCol = [];
    for (const e of g) {
      const ini = minutos(e.inicio);
      let c = finCol.findIndex((f) => f <= ini);
      if (c === -1) { c = finCol.length; finCol.push(0); }
      finCol[c] = Math.max(minutos(e.fin), ini + 20);
      res.push({ e, col: c, total: 0, g });
    }
    const total = finCol.length;
    res.filter((r) => r.g === g).forEach((r) => (r.total = total));
  }
  return res;
}

function vistaMes(dias, porDia, hoy) {
  return html`
    <div class="mes">
      ${DIAS.map((d) => html`<div class="dsem">${d}</div>`)}
      ${dias.map((d) => html`<div class="dia ${d.slice(0, 7) !== mesActual ? "fuera" : ""} ${d === hoy ? "hoy" : ""}" data-dia="${d}">
        <button type="button" class="num" data-ver-dia="${d}" title="Ver el día">${Number(d.slice(8))}</button>${celdaEventos(porDia.get(d), d)}</div>`)}
    </div>`;
}

function vistaDia(semana, porDia, hoy) {
  const evs = porDia.get(diaActual) || [];
  const todoDia = evs.filter((e) => e.todo_el_dia || partes(e.inicio).fecha !== diaActual || partes(e.fin).fecha !== diaActual);
  const conHora = evs.filter((e) => !todoDia.includes(e));
  const hIni = Math.min(HORA_INICIO, ...conHora.map((e) => Math.floor(minutos(e.inicio) / 60)));
  const hFin = Math.max(HORA_FIN, ...conHora.map((e) => Math.ceil(minutos(e.fin) / 60)));
  const horas = Array.from({ length: hFin - hIni }, (_, i) => hIni + i);
  const ahora = new Date(Date.now() - 5 * 3600 * 1000);
  const minAhora = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  return html`
    <div class="semana" role="tablist" aria-label="Días de la semana">
      ${semana.map((d) => {
        const n = (porDia.get(d) || []).length;
        return html`<button type="button" class="semana-dia ${d === diaActual ? "activo" : ""} ${d === hoy ? "hoy" : ""}" data-ver-dia="${d}" role="tab" aria-selected="${d === diaActual ? "true" : "false"}">
          <small>${DIAS[diaSemana(d)]}</small><b>${Number(d.slice(8))}</b><span>${n ? `${n} evento${n > 1 ? "s" : ""}` : "—"}</span></button>`;
      })}
    </div>
    ${todoDia.length ? html`<div class="todo-dia"><span class="muted">Todo el día</span>${todoDia.map((e) => html`<div class="ev ${claseEv(e)}" data-ev="${e.id}">${e.titulo}${iconoG(e)}</div>`)}</div>` : ""}
    <div class="tiempo-scroll"><div class="linea-tiempo" style="height:${horas.length * ALTO_HORA}px">
      ${horas.map((h, i) => html`<div class="hora-fila" data-hora="${String(h).padStart(2, "0")}:00" style="top:${i * ALTO_HORA}px"><span>${String(h).padStart(2, "0")}:00</span></div>`)}
      ${diaActual === hoy && minAhora >= hIni * 60 && minAhora <= hFin * 60 ? html`<div class="ahora" style="top:${((minAhora - hIni * 60) / 60) * ALTO_HORA}px" title="Hora actual"></div>` : ""}
      <div class="bloques">${columnas(conHora).map(({ e, col, total }) => {
        const top = ((minutos(e.inicio) - hIni * 60) / 60) * ALTO_HORA;
        const alto = Math.max(22, ((minutos(e.fin) - minutos(e.inicio)) / 60) * ALTO_HORA - 2);
        return html`<div class="bloque ${claseEv(e)}${alto < 44 ? " corto" : ""}" data-ev="${e.id}" style="top:${top}px;height:${alto}px;left:calc(${(col / total) * 100}% + 2px);width:calc(${100 / total}% - 4px)">
          <strong>${e.titulo}</strong><span>${hhmm(e.inicio)} – ${hhmm(e.fin)}${e.ubicacion ? ` · ${e.ubicacion}` : ""}</span>${iconoG(e)}</div>`;
      })}</div>
    </div></div>
    ${!evs.length ? html`<p class="muted" style="text-align:center;margin-top:10px">Sin reuniones ni tareas este día. Haz clic en una hora para agendar.</p>` : ""}`;
}

export async function render(cont) {
  const h = paramsHash();
  if (h.google === "ok") { toast("Google Calendar conectado. Tus eventos se sincronizarán en ambos sentidos."); history.replaceState(null, "", "#/calendario"); }
  if (h.google === "error") { toast(h.msg || "No se pudo conectar con Google", "error"); history.replaceState(null, "", "#/calendario"); }

  const hoy = hoyIso();
  let dias;
  let semana = [];
  if (vista === "mes") {
    const primero = `${mesActual}-01`;
    const inicio = sumarDias(primero, -diaSemana(primero));
    dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  } else {
    const lunes = sumarDias(diaActual, -diaSemana(diaActual));
    semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
    dias = semana;
  }
  const desde = aIso(dias[0], "00:00"), hasta = aIso(dias.at(-1), "23:59");

  const [res, tar] = await Promise.all([
    api(`/api/calendario?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${filtroTipo ? `&tipo=${filtroTipo}` : ""}`),
    api("/api/calendario/tareas"),
  ]);
  const eventos = (res.ok ? res.data.eventos : []).filter(pasaFiltros);
  const g = res.data.google || {};
  const tareas = ordenar((tar.ok ? tar.data.tareas : []).filter((t) => !extra.prioridad || t.prioridad === extra.prioridad),
    ORDEN_TAREAS, extra.ordenTareas, "asc");
  const porDia = new Map(dias.map((d) => [d, []]));
  for (const e of eventos) {
    const di = partes(e.inicio).fecha, df = partes(e.fin).fecha;
    for (const d of dias) if (d >= di && d <= df) porDia.get(d).push(e);
  }
  const titulo = vista === "mes"
    ? new Date(`${mesActual}-15T12:00:00Z`).toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).replace(/^./, (c) => c.toUpperCase())
    : tituloDia(diaActual);
  const delDia = vista === "dia" ? (porDia.get(diaActual) || []) : [];

  encabezado("Calendario", "Reuniones y tareas de seguimiento",
    html`<button class="btn btn-ghost btn-sm" data-nuevo="tarea"><i class="fas fa-list-check"></i> Tarea</button><button class="btn btn-brand btn-sm" data-nuevo="reunion"><i class="fas fa-plus"></i> Reunión</button>`);

  cont.innerHTML = String(html`
    <div id="indPanel"></div>
    <div class="cal-google">
      <div class="estado-g"><i class="fab fa-google"></i>
        ${!g.habilitado ? html`<span class="muted">La sincronización con Google Calendar no está configurada en el servidor (ver docs/GUIA-GOOGLE-CALENDAR.md).</span>`
        : g.conectado ? html`<span>Conectado como <b>${g.email || "tu cuenta"}</b> · última sincronización ${hace(g.ultimaSync)}
            ${g.tiempoReal ? html` · <span class="badge b-ok">tiempo real</span>` : html` · <span class="badge" title="Se sincroniza cada pocos minutos y al abrir el calendario">periódica</span>`}
            ${g.error ? html`<br><span style="color:var(--danger)"><i class="fas fa-triangle-exclamation"></i> ${g.error}</span>` : ""}</span>`
        : html`<span>Conecta tu Google Calendar para ver aquí tus reuniones y que lo que agendes se refleje allá.</span>`}
      </div>
      ${g.habilitado && g.conectado ? html`<button class="btn btn-ghost btn-sm" id="sync"><i class="fas fa-rotate"></i> Sincronizar</button><button class="btn btn-ghost btn-sm" id="desconectar">Desconectar</button>` : ""}
      ${g.habilitado && !g.conectado ? html`<a class="btn btn-brand btn-sm" href="/api/calendario/google/conectar"><i class="fab fa-google"></i> Conectar Google Calendar</a>` : ""}
    </div>
    <div class="cal-layout">
      <div class="card cal-panel">
        <div class="cal-head">
          <div class="cal-nav">
            <button class="icon-btn" id="prev" aria-label="${vista === "mes" ? "Mes anterior" : "Día anterior"}"><i class="fas fa-chevron-left"></i></button>
            <button class="icon-btn" id="next" aria-label="${vista === "mes" ? "Mes siguiente" : "Día siguiente"}"><i class="fas fa-chevron-right"></i></button>
            <button class="btn btn-ghost btn-sm" id="hoy">Hoy</button>
          </div>
          <h2>${titulo}</h2>
          <div class="cal-controles">
            <input type="date" class="ctrl" id="irFecha" value="${vista === "mes" ? `${mesActual}-01` : diaActual}" aria-label="Ir a una fecha" title="Ir a una fecha">
            <div class="tabs" role="tablist" aria-label="Vista">${[["mes", "Mes", "fa-calendar"], ["dia", "Día", "fa-calendar-day"]].map(([k, t, ic]) => html`<button class="tab ${vista === k ? "activo" : ""}" data-vista="${k}" role="tab" aria-selected="${vista === k ? "true" : "false"}"><i class="fas ${ic}"></i> ${t}</button>`)}</div>
            <div class="tabs">${[["", "Todo"], ["reunion", "Reuniones"], ["tarea", "Tareas"]].map(([k, t]) => html`<button class="tab ${filtroTipo === k ? "activo" : ""}" data-tipo="${k}">${t}</button>`)}</div>
          </div>
        </div>
        <div class="cal-filtros fila-flex" id="calFiltros">
          <span class="muted"><i class="fas fa-filter"></i></span>
          <select class="ctrl ctrl-sm" name="prioridad" aria-label="Prioridad">${opcion("", "Toda prioridad", extra.prioridad)}${opcion("alta", "Prioridad alta", extra.prioridad)}${opcion("media", "Prioridad media", extra.prioridad)}${opcion("baja", "Prioridad baja", extra.prioridad)}</select>
          <select class="ctrl ctrl-sm" name="estado" aria-label="Estado de tarea">${opcion("", "Todo estado", extra.estado)}${opcion("pendiente", "Tareas pendientes", extra.estado)}${opcion("en_curso", "Tareas en curso", extra.estado)}${opcion("hecha", "Tareas hechas", extra.estado)}</select>
          <select class="ctrl ctrl-sm" name="vinculo" aria-label="Vínculo">${opcion("", "Con o sin vínculo", extra.vinculo)}${opcion("con", "Vinculados a integración/actor", extra.vinculo)}${opcion("sin", "Sin vincular", extra.vinculo)}</select>
          <select class="ctrl ctrl-sm" name="origen" aria-label="Origen">${opcion("", "Todos los orígenes", extra.origen)}${opcion("google", "Sincronizados con Google", extra.origen)}${opcion("local", "Solo en la plataforma", extra.origen)}</select>
        </div>
        <div class="cal-cuerpo">${vista === "mes" ? vistaMes(dias, porDia, hoy) : vistaDia(semana, porDia, hoy)}</div>
        <div class="cal-leyenda"><span><i class="cuadro reunion"></i>Reunión</span><span><i class="cuadro tarea"></i>Tarea</span><span><i class="fab fa-google"></i> Sincronizado con Google</span>
          <span class="muted">${vista === "mes" ? "Clic en un número para ver el día · clic en un espacio vacío para agendar" : "Clic en una hora para agendar"}</span></div>
      </div>
      <aside class="grid" style="align-content:start">
        ${vista === "dia" ? html`<div class="card"><div class="card-head"><h3>Agenda del día</h3><span class="sub">${delDia.length}</span></div>
          <div class="card-body">${delDia.length ? html`<ul class="agenda-dia">${delDia.map((e) => html`<li class="${claseEv(e)}" data-ev="${e.id}"><span class="hh">${e.todo_el_dia ? "Todo el día" : `${hhmm(e.inicio)} – ${hhmm(e.fin)}`}</span><strong>${e.titulo}</strong>${e.meet_link && urlSegura(e.meet_link) ? html`<a href="${urlSegura(e.meet_link)}" target="_blank" rel="noopener noreferrer" class="meet"><i class="fas fa-video"></i> Unirse</a>` : ""}</li>`)}</ul>` : html`<p class="muted">Día libre.</p>`}</div></div>` : ""}
        <div class="card"><div class="card-head"><h3>Mis tareas abiertas</h3><span class="sub">${tareas.length}</span>
          <div class="der"><select class="ctrl ctrl-sm" id="ordTareas" aria-label="Ordenar tareas">${opcion("vence", "Por vencimiento", extra.ordenTareas)}${opcion("prioridad", "Por prioridad", extra.ordenTareas)}${opcion("titulo", "Por título", extra.ordenTareas)}</select></div></div>
          <div class="card-body">${tareas.length ? html`<ul class="lista-tareas">${tareas.map((t) => html`
            <li><input type="checkbox" data-hecha="${t.id}" aria-label="Marcar como hecha">
              <div class="t"><strong class="${t.prioridad === "alta" ? "prio-alta" : ""}">${t.titulo}</strong>
              <span>${t.estado_tarea === "en_curso" ? "En curso · " : ""}vence ${partes(t.fin).fecha.split("-").reverse().join("/")}${partes(t.fin).fecha < hoy ? " · vencida" : ""}</span></div>
              <button class="icon-btn" data-ev="${t.id}" aria-label="Editar"><i class="fas fa-pen"></i></button></li>`)}</ul>`
            : html`<p class="muted">No tienes tareas pendientes. 🎉</p>`}</div></div>
      </aside>
    </div>`);

  const recargar = () => render(cont);
  const mover = (n) => {
    if (vista === "mes") { const [a, m] = mesActual.split("-").map(Number); mesActual = new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); }
    else { diaActual = sumarDias(diaActual, n); mesActual = diaActual.slice(0, 7); }
    recargar();
  };
  const verDia = (d) => { vista = "dia"; diaActual = d; mesActual = d.slice(0, 7); recargar(); };
  $("#prev", cont).addEventListener("click", () => mover(-1));
  $("#next", cont).addEventListener("click", () => mover(1));
  $("#hoy", cont).addEventListener("click", () => { diaActual = hoyIso(); mesActual = diaActual.slice(0, 7); recargar(); });
  $("#irFecha", cont).addEventListener("change", (e) => { if (!e.target.value) return; if (vista === "mes") { mesActual = e.target.value.slice(0, 7); recargar(); } else verDia(e.target.value); });
  $$("[data-vista]", cont).forEach((b) => b.addEventListener("click", () => {
    vista = b.dataset.vista;
    if (vista === "dia" && diaActual.slice(0, 7) !== mesActual) diaActual = mesActual === hoyIso().slice(0, 7) ? hoyIso() : `${mesActual}-01`;
    recargar();
  }));
  $$("[data-tipo]", cont).forEach((b) => b.addEventListener("click", () => { filtroTipo = b.dataset.tipo; recargar(); }));
  $("#calFiltros", cont).addEventListener("change", (e) => { extra[e.target.name] = e.target.value; recargar(); });
  $("#ordTareas", cont).addEventListener("change", (e) => { extra.ordenTareas = e.target.value; recargar(); });
  panelIndicadores($("#indPanel", cont), "calendario");
  $$("#accionesVista [data-nuevo]").forEach((b) => b.addEventListener("click", () => editorEvento({ tipo: b.dataset.nuevo, fecha: vista === "dia" ? diaActual : undefined }, recargar)));
  $("#sync", cont)?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const r = await api("/api/calendario/sincronizar", { method: "POST" });
    if (r.ok) { const x = r.data.resultado; toast(`Sincronizado: ${x.enviados || 0} enviados, ${(x.nuevos || 0) + (x.actualizados || 0)} recibidos, ${x.eliminados || 0} eliminados`); recargar(); }
    else { toast(r.data.mensaje, "error"); e.currentTarget.disabled = false; }
  });
  $("#desconectar", cont)?.addEventListener("click", async () => {
    if (!(await confirmar("Desconectar Google Calendar", "Tus eventos se conservan aquí, pero dejarán de sincronizarse con Google.", { textoOk: "Desconectar" }))) return;
    if (resultado(await api("/api/calendario/google/desconectar", { method: "POST" }))) recargar();
  });

  cont.onclick = async (ev) => {
    if (ev.target.closest("a")) return;
    const evEl = ev.target.closest("[data-ev]");
    if (evEl) {
      ev.stopPropagation();
      const e = [...eventos, ...tareas].find((x) => x.id === evEl.dataset.ev);
      if (e) editorEvento(e, recargar);
      return;
    }
    const ver = ev.target.closest("[data-ver-dia]");
    if (ver) return verDia(ver.dataset.verDia);
    const fila = ev.target.closest("[data-hora]");
    if (fila) return editorEvento({ tipo: filtroTipo || "reunion", fecha: diaActual, hora: fila.dataset.hora }, recargar);
    const dia = ev.target.closest("[data-dia]");
    if (dia) {
      // En celular el mes es compacto: tocar el día abre la vista del día
      if (window.matchMedia("(max-width: 760px)").matches) return verDia(dia.dataset.dia);
      editorEvento({ tipo: filtroTipo || "reunion", fecha: dia.dataset.dia }, recargar);
    }
  };
  cont.onchange = async (ev) => {
    const chk = ev.target.closest("[data-hecha]");
    if (!chk) return;
    const r = await api(`/api/calendario/${chk.dataset.hecha}/estado`, { method: "PATCH", body: { estado: "hecha" } });
    if (r.ok) { toast("Tarea completada"); recargar(); } else { chk.checked = false; toast(r.data.mensaje, "error"); }
  };

  // Al abrir la vista del día de hoy, se centra en la hora actual
  if (vista === "dia") {
    const caja = cont.querySelector(".tiempo-scroll");
    // Se posiciona en el primer evento del día (o en la hora actual), dejando una hora de margen arriba
    const tops = $$(".bloque, .ahora", cont).map((x) => x.offsetTop);
    if (caja) caja.scrollTop = tops.length ? Math.max(0, Math.min(...tops) - ALTO_HORA) : ALTO_HORA; // por defecto desde las 08:00
  }

  // Sincronización silenciosa al abrir el calendario (trae los cambios hechos en Google)
  if (g.conectado && (!g.ultimaSync || Date.now() - new Date(g.ultimaSync) > 60000) && !cont.dataset.sincronizando) {
    cont.dataset.sincronizando = "1";
    api("/api/calendario/sincronizar", { method: "POST" }).then((r) => {
      delete cont.dataset.sincronizando;
      const x = r.data?.resultado;
      if (r.ok && x && (x.nuevos || x.actualizados || x.eliminados) && location.hash.startsWith("#/calendario")) recargar();
    });
  }
}
