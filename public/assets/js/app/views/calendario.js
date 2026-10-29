// Calendario de reuniones y tareas con sincronización bidireccional con Google Calendar.
import { api, html, raw, $, $$, encabezado, opcion, paramsHash, modal, confirmar, resultado, datosForm, toast, hace, hora, hoyIso
, urlSegura } from "../core.js";

const OFFSET = "-05:00"; // America/Lima (sin horario de verano)
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
let mesActual = hoyIso().slice(0, 7); // "AAAA-MM"
let filtroTipo = "";

const partes = (iso) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
};
const aIso = (f, h) => new Date(`${f}T${h || "00:00"}:00${OFFSET}`).toISOString();

/** Modal para crear o editar un evento. `previo` puede traer datos para precargar. */
export async function editorEvento(previo = {}, onGuardado) {
  const existente = Boolean(previo.id);
  const ini = previo.inicio ? partes(previo.inicio) : { fecha: previo.fecha || hoyIso(), hora: "10:00" };
  const fin = previo.fin ? partes(previo.fin) : { fecha: ini.fecha, hora: previo.tipo === "tarea" ? "10:30" : "11:00" };
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
function celdaEventos(evs) {
  const max = 3;
  return html`${evs.slice(0, max).map((e) => html`
    <div class="ev ${e.tipo === "tarea" ? "tarea" : ""} ${e.estado_tarea === "hecha" ? "hecha" : ""}" data-ev="${e.id}" title="${e.titulo}">
      ${e.todo_el_dia ? "" : html`<span class="h">${hora(e.inicio)}</span>`}${e.titulo}${e.google_event_id ? raw('<i class="fab fa-google" title="Sincronizado con Google"></i>') : ""}
    </div>`)}${evs.length > max ? html`<div class="mas">+${evs.length - max} más</div>` : ""}`;
}

export async function render(cont) {
  const h = paramsHash();
  if (h.google === "ok") { toast("Google Calendar conectado. Tus eventos se sincronizarán en ambos sentidos."); history.replaceState(null, "", "#/calendario"); }
  if (h.google === "error") { toast(h.msg || "No se pudo conectar con Google", "error"); history.replaceState(null, "", "#/calendario"); }

  const [a, m] = mesActual.split("-").map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const inicioGrid = new Date(primero.getTime() - ((primero.getUTCDay() + 6) % 7) * 86400000);
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicioGrid.getTime() + i * 86400000).toISOString().slice(0, 10));
  const desde = aIso(dias[0], "00:00"), hasta = aIso(dias[41], "23:59");

  const [res, tar] = await Promise.all([
    api(`/api/calendario?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${filtroTipo ? `&tipo=${filtroTipo}` : ""}`),
    api("/api/calendario/tareas"),
  ]);
  const eventos = res.ok ? res.data.eventos : [];
  const g = res.data.google || {};
  const tareas = tar.ok ? tar.data.tareas : [];
  const porDia = new Map(dias.map((d) => [d, []]));
  for (const e of eventos) {
    const di = partes(e.inicio).fecha, df = partes(e.fin).fecha;
    for (const d of dias) if (d >= di && d <= df) porDia.get(d).push(e);
  }
  const nombreMes = primero.toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).replace(/^./, (c) => c.toUpperCase());
  const hoy = hoyIso();

  encabezado("Calendario", "Reuniones y tareas de seguimiento",
    html`<button class="btn btn-ghost btn-sm" data-nuevo="tarea"><i class="fas fa-list-check"></i> Tarea</button><button class="btn btn-brand btn-sm" data-nuevo="reunion"><i class="fas fa-plus"></i> Reunión</button>`);

  cont.innerHTML = String(html`
    <div class="cal-google">
      <div class="estado-g"><i class="fab fa-google"></i>
        ${!g.habilitado ? html`<span class="muted">La sincronización con Google Calendar no está configurada en el servidor (ver docs/GUIA-GOOGLE-CALENDAR.md).</span>`
        : g.conectado ? html`<span>Conectado como <b>${g.email || "tu cuenta"}</b> · última sincronización ${hace(g.ultimaSync)}
            ${g.tiempoReal ? html` · <span class="badge b-ok">tiempo real</span>` : html` · <span class="badge" title="Se sincroniza cada pocos minutos y al abrir el calendario">periódica</span>`}
            ${g.error ? html`<br><span style="color:var(--danger)"><i class="fas fa-triangle-exclamation"></i> ${g.error}</span>` : ""}</span>`
        : html`<span>Conecta tu Google Calendar para ver aquí tus reuniones y que lo que agendes se refleje allá.</span>`}
      </div>
      ${g.habilitado && g.conectado ? html`<button class="btn btn-ghost btn-sm" id="sync"><i class="fas fa-rotate"></i> Sincronizar ahora</button><button class="btn btn-ghost btn-sm" id="desconectar">Desconectar</button>` : ""}
      ${g.habilitado && !g.conectado ? html`<a class="btn btn-brand btn-sm" href="/api/calendario/google/conectar"><i class="fab fa-google"></i> Conectar Google Calendar</a>` : ""}
    </div>
    <div class="cal-layout">
      <div>
        <div class="cal-head">
          <button class="icon-btn" id="prev" aria-label="Mes anterior"><i class="fas fa-chevron-left"></i></button>
          <h2>${nombreMes}</h2>
          <button class="icon-btn" id="next" aria-label="Mes siguiente"><i class="fas fa-chevron-right"></i></button>
          <button class="btn btn-ghost btn-sm" id="hoy">Hoy</button>
          <div class="tabs" style="margin-left:auto">${[["", "Todo"], ["reunion", "Reuniones"], ["tarea", "Tareas"]].map(([k, t]) => html`<button class="tab ${filtroTipo === k ? "activo" : ""}" data-tipo="${k}">${t}</button>`)}</div>
        </div>
        <div class="mes">
          ${DIAS.map((d) => html`<div class="dsem">${d}</div>`)}
          ${dias.map((d) => html`<div class="dia ${d.slice(0, 7) !== mesActual ? "fuera" : ""} ${d === hoy ? "hoy" : ""}" data-dia="${d}"><span class="num">${Number(d.slice(8))}</span>${celdaEventos(porDia.get(d))}</div>`)}
        </div>
      </div>
      <aside>
        <div class="card"><div class="card-head"><h3>Mis tareas abiertas</h3><span class="sub">${tareas.length}</span></div>
          <div class="card-body">${tareas.length ? html`<ul class="lista-tareas">${tareas.map((t) => html`
            <li><input type="checkbox" data-hecha="${t.id}" aria-label="Marcar como hecha">
              <div class="t"><strong class="${t.prioridad === "alta" ? "prio-alta" : ""}">${t.titulo}</strong>
              <span>${t.estado_tarea === "en_curso" ? "En curso · " : ""}vence ${partes(t.fin).fecha.split("-").reverse().join("/")}${partes(t.fin).fecha < hoy ? " · vencida" : ""}</span></div>
              <button class="icon-btn" data-ev="${t.id}" aria-label="Editar"><i class="fas fa-pen"></i></button></li>`)}</ul>`
            : html`<p class="muted">No tienes tareas pendientes. 🎉</p>`}</div></div>
      </aside>
    </div>`);

  const recargar = () => render(cont);
  const mover = (n) => { const d = new Date(Date.UTC(a, m - 1 + n, 1)); mesActual = d.toISOString().slice(0, 7); recargar(); };
  $("#prev", cont).addEventListener("click", () => mover(-1));
  $("#next", cont).addEventListener("click", () => mover(1));
  $("#hoy", cont).addEventListener("click", () => { mesActual = hoyIso().slice(0, 7); recargar(); });
  $$("[data-tipo]", cont).forEach((b) => b.addEventListener("click", () => { filtroTipo = b.dataset.tipo; recargar(); }));
  $$("#accionesVista [data-nuevo]").forEach((b) => b.addEventListener("click", () => editorEvento({ tipo: b.dataset.nuevo }, recargar)));
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
    const evEl = ev.target.closest("[data-ev]");
    if (evEl) {
      ev.stopPropagation();
      const e = [...eventos, ...tareas].find((x) => x.id === evEl.dataset.ev);
      if (!e) return;
      return editorEvento(e, recargar);
    }
    const dia = ev.target.closest("[data-dia]");
    if (dia) editorEvento({ tipo: filtroTipo || "reunion", fecha: dia.dataset.dia }, recargar);
  };
  cont.onchange = async (ev) => {
    const chk = ev.target.closest("[data-hecha]");
    if (!chk) return;
    const r = await api(`/api/calendario/${chk.dataset.hecha}/estado`, { method: "PATCH", body: { estado: "hecha" } });
    if (r.ok) { toast("Tarea completada"); recargar(); } else { chk.checked = false; toast(r.data.mensaje, "error"); }
  };

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
