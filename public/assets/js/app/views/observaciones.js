// Observaciones de la plataforma internacional (hoja "Observaciones" del Excel) con seguimiento.
import { api, html, raw, $, hace, encabezado, opciones, opcion, qs, paramsHash, vacio, drawer, modal, confirmar, resultado, datosForm, puede, pais, ESTADO_OBS, badge, toast } from "../core.js";
import { bitacora } from "./_seguimiento.js";
import { panelIndicadores, selectorOrden, enlazarOrden, ordenar } from "../indicadores.js";

const PRIO = { alta: ["Alta", "b-danger"], media: ["Media", "b-warn"], baja: ["Baja", ""] };
const SLA = { alta: 2, media: 5, baja: 10 }; // días para resolver (mismos valores que src/config/metas.js)
const ABIERTA = (o) => !["resuelta", "descartada"].includes(o.estado);
const edad = (o) => (Date.now() - new Date(o.creado_en).getTime()) / 86400000;
const vencida = (o) => ABIERTA(o) && edad(o) > SLA[o.prioridad];
const ORDEN_OBS = [["actualizada", "Última actualización", "fecha"], ["creada", "Fecha de registro", "fecha"], ["prioridad", "Prioridad", "nivel"], ["edad", "Antigüedad (abiertas)", "dias"],
  ["descripcion", "Descripción", "texto"], ["modulo", "Módulo", "texto"], ["responsable", "Responsable", "texto"], ["comentarios", "Comentarios", "num"], ["estado", "Estado (de abierta a cerrada)", "nivel"], ["numero", "Número", "num"]];
const CAMPOS_OBS = {
  actualizada: (o) => o.actualizado_en, creada: (o) => o.creado_en, prioridad: (o) => ({ baja: 0, media: 1, alta: 2 })[o.prioridad],
  edad: (o) => (ABIERTA(o) ? edad(o) : null), comentarios: (o) => Number(o.comentarios) || 0,
  estado: (o) => ({ abierta: 0, en_proceso: 1, resuelta: 2, descartada: 3 })[o.estado], modulo: (o) => o.modulo, numero: (o) => o.numero,
  descripcion: (o) => o.descripcion, responsable: (o) => o.responsable,
};

async function formulario(actual = null) {
  const { paises, usuarios } = await opciones();
  const o = actual || { estado: "abierta", prioridad: "media" };
  return modal({
    titulo: actual ? `Editar observación #${actual.numero}` : "Nueva observación",
    cuerpo: html`
      <div class="form-grid">
        <div class="f full"><label>Descripción *</label><textarea class="ctrl" name="descripcion" maxlength="2000" rows="3" required>${o.descripcion || ""}</textarea></div>
        <div class="f"><label>País</label><select class="ctrl" name="pais">${opcion("", "Todos / general", o.pais)}${paises.map((p) => opcion(p.codigo, p.nombre, o.pais))}</select></div>
        <div class="f"><label>Módulo</label><input class="ctrl" name="modulo" maxlength="60" value="${o.modulo || ""}" placeholder="Pedidos, Catálogo, Liquidaciones…"></div>
        <div class="f"><label>Prioridad</label><select class="ctrl" name="prioridad">${Object.entries(PRIO).map(([k, [t]]) => opcion(k, t, o.prioridad))}</select></div>
        <div class="f"><label>Estado</label><select class="ctrl" name="estado">${Object.entries(ESTADO_OBS).map(([k, [t]]) => opcion(k, t, o.estado))}</select></div>
        <div class="f full"><label>Responsable</label><select class="ctrl" name="responsable_id">${opcion("", "Sin asignar", o.responsable_id)}${usuarios.map((u) => opcion(u.id, `${u.nombres} ${u.apellidos}`, o.responsable_id))}</select></div>
        <div class="f full"><label>Nota</label><textarea class="ctrl" name="nota" maxlength="2000" rows="2">${o.nota || ""}</textarea></div>
      </div>`,
    onSubmit: async (form) => {
      const r = await api(actual ? `/api/observaciones/${actual.id}` : "/api/observaciones", { method: actual ? "PUT" : "POST", body: datosForm(form) });
      return resultado(r) ? r.data.observacion : { errores: r.data.errores || {} };
    },
  });
}

function detalle(o, recargar) {
  const { el, cerrar } = drawer();
  el.innerHTML = String(html`
    <div class="drawer-head"><div style="flex:1"><h3>Observación #${o.numero}</h3><div class="sub">${o.modulo || "General"} · registrada ${hace(o.creado_en)}</div></div>
      <button class="icon-btn" data-x aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>
    <div class="drawer-body">
      <div class="fila-flex">${badge(ESTADO_OBS, o.estado)} ${badge(PRIO, o.prioridad)} ${o.pais ? pais(o.pais) : ""}</div>
      <p style="white-space:pre-line">${o.descripcion}</p>
      ${o.nota ? html`<div class="aviso info"><i class="fas fa-note-sticky"></i><div>${o.nota}</div></div>` : ""}
      <div class="fila-flex">
        ${puede("escribir") ? html`<button class="btn btn-ghost btn-sm" data-editar><i class="fas fa-pen"></i> Editar</button>` : ""}
        ${puede("admin") ? html`<button class="btn btn-ghost btn-sm" data-borrar><i class="fas fa-trash"></i> Eliminar</button>` : ""}
      </div>
      <div class="seccion-t">Seguimiento</div><div id="bitacora"></div>
    </div>`);
  el.querySelector("[data-x]").addEventListener("click", cerrar);
  el.querySelector("[data-editar]")?.addEventListener("click", async () => { if (await formulario(o)) { cerrar(); recargar(); } });
  el.querySelector("[data-borrar]")?.addEventListener("click", async () => {
    if (!(await confirmar("Eliminar observación", "Se eliminará con su historial de comentarios.", { textoOk: "Eliminar" }))) return;
    if (resultado(await api(`/api/observaciones/${o.id}`, { method: "DELETE" }))) { cerrar(); recargar(); }
  });
  bitacora(el.querySelector("#bitacora"), { recurso: "observacion", id: o.id, estados: ESTADO_OBS, estadoActual: o.estado, onCambio: recargar });
}

export async function render(cont) {
  const { paises } = await opciones();
  const h = paramsHash();
  const f = { estado: h.estado || "", pais: h.pais || "" };
  const v = { prioridad: h.prioridad || "", modulo: h.modulo || "", responsable: h.responsable || "", sla: h.sla || "", q: h.q || "", orden: h.orden || "actualizada", dir: h.dir || "desc" };
  const r = await api(`/api/observaciones?${qs(f)}`);
  const todas = r.ok ? r.data.observaciones : [];
  const modulos = [...new Set(todas.map((o) => o.modulo).filter(Boolean))].sort();
  const responsables = [...new Set(todas.map((o) => o.responsable).filter(Boolean))].sort();
  let lista = todas;
  if (v.prioridad) lista = lista.filter((o) => o.prioridad === v.prioridad);
  if (v.modulo) lista = lista.filter((o) => o.modulo === v.modulo);
  if (v.responsable === "_sin") lista = lista.filter((o) => !o.responsable);
  else if (v.responsable) lista = lista.filter((o) => o.responsable === v.responsable);
  if (v.sla === "vencidas") lista = lista.filter(vencida);
  if (v.sla === "en_plazo") lista = lista.filter((o) => ABIERTA(o) && !vencida(o));
  if (v.q) { const t = v.q.toLowerCase(); lista = lista.filter((o) => `${o.numero} ${o.descripcion} ${o.nota || ""}`.toLowerCase().includes(t)); }
  lista = ordenar(lista, CAMPOS_OBS, v.orden, v.dir);
  const abiertas = todas.filter(ABIERTA).length;
  const recargar = () => render(cont);

  encabezado("Observaciones", `${abiertas} abiertas de ${todas.length}`,
    puede("escribir") ? html`<button class="btn btn-brand btn-sm" id="nueva"><i class="fas fa-plus"></i> Nueva observación</button>` : "");

  cont.innerHTML = String(html`
    <div id="indPanel"></div>
    <form class="filtros" id="filtros">
      <div class="campo"><label>Estado</label><select class="ctrl" name="estado">${opcion("", "Todos", f.estado)}${Object.entries(ESTADO_OBS).map(([k, [t]]) => opcion(k, t, f.estado))}</select></div>
      <div class="campo"><label>País</label><select class="ctrl" name="pais">${opcion("", "Todos", f.pais)}${paises.map((p) => opcion(p.codigo, p.nombre, f.pais))}</select></div>
      <div class="campo"><label>Prioridad</label><select class="ctrl" name="prioridad">${opcion("", "Todas", v.prioridad)}${Object.entries(PRIO).map(([k, [t]]) => opcion(k, t, v.prioridad))}</select></div>
      <div class="campo"><label>Módulo</label><select class="ctrl" name="modulo">${opcion("", "Todos", v.modulo)}${modulos.map((x) => opcion(x, x, v.modulo))}</select></div>
      <div class="campo"><label>Responsable</label><select class="ctrl" name="responsable">${opcion("", "Todos", v.responsable)}${opcion("_sin", "Sin asignar", v.responsable)}${responsables.map((x) => opcion(x, x, v.responsable))}</select></div>
      <div class="campo"><label>SLA</label><select class="ctrl" name="sla">${opcion("", "Todas", v.sla)}${opcion("vencidas", "Vencidas", v.sla)}${opcion("en_plazo", "Abiertas en plazo", v.sla)}</select></div>
      <div class="campo buscador"><label>Buscar</label><input class="ctrl" name="q" value="${v.q}" placeholder="N° o texto" maxlength="80"></div>
      ${selectorOrden(ORDEN_OBS, v.orden, v.dir)}
      <div class="filtros-acciones"><button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button><a class="btn btn-ghost" href="#/observaciones">Limpiar</a></div>
    </form>
    <p class="muted conteo">${lista.length} de ${todas.length} observaciones</p>
    <div class="card">${lista.length ? html`
      <div class="tabla-wrap"><table class="tabla t-observaciones">
        <thead><tr><th>#</th><th>Descripción</th><th>Módulo</th><th>País</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th class="num">Comentarios</th><th>Actualizada</th></tr></thead>
        <tbody>${lista.map((o, i) => html`
          <tr class="clic" data-i="${i}">
            <td class="muted">${o.numero}</td><td><div class="truncar" style="max-width:420px">${o.descripcion}</div></td>
            <td>${o.modulo || "—"}</td><td>${o.pais ? pais(o.pais) : html`<span class="muted">General</span>`}</td>
            <td>${badge(PRIO, o.prioridad)}</td><td>${badge(ESTADO_OBS, o.estado)}${vencida(o) ? html` <span class="badge b-danger simple" title="Superó su SLA de ${SLA[o.prioridad]} días">Vencida</span>` : ""}</td>
            <td>${o.responsable || html`<span class="muted">—</span>`}</td><td class="num">${o.comentarios}</td><td class="muted nowrap">${hace(o.actualizado_en)}</td>
          </tr>`)}</tbody></table></div>`
      : vacio("fa-clipboard-check", "Sin observaciones", "Registra aquí los hallazgos de la operación internacional.")}
    </div>`);
  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/observaciones?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  enlazarOrden(cont, () => $("#filtros", cont).requestSubmit());
  panelIndicadores($("#indPanel", cont), "observaciones", { pais: f.pais });
  $("#nueva")?.addEventListener("click", async () => { if (await formulario()) recargar(); });
  cont.onclick = (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) detalle(lista[Number(tr.dataset.i)], recargar); };
}
export { raw, toast };
