// Observaciones de la plataforma internacional (hoja "Observaciones" del Excel) con seguimiento.
import { api, html, raw, $, hace, encabezado, opciones, opcion, qs, paramsHash, vacio, drawer, modal, confirmar, resultado, datosForm, puede, pais, ESTADO_OBS, badge, toast } from "../core.js";
import { bitacora } from "./_seguimiento.js";

const PRIO = { alta: ["Alta", "b-danger"], media: ["Media", "b-warn"], baja: ["Baja", ""] };

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
  const r = await api(`/api/observaciones?${qs(f)}`);
  const lista = r.ok ? r.data.observaciones : [];
  const abiertas = lista.filter((o) => !["resuelta", "descartada"].includes(o.estado)).length;
  const recargar = () => render(cont);

  encabezado("Observaciones", `${abiertas} abiertas de ${lista.length}`,
    puede("escribir") ? html`<button class="btn btn-brand btn-sm" id="nueva"><i class="fas fa-plus"></i> Nueva observación</button>` : "");

  cont.innerHTML = String(html`
    <form class="filtros" id="filtros">
      <div class="campo"><label>Estado</label><select class="ctrl" name="estado">${opcion("", "Todos", f.estado)}${Object.entries(ESTADO_OBS).map(([k, [t]]) => opcion(k, t, f.estado))}</select></div>
      <div class="campo"><label>País</label><select class="ctrl" name="pais">${opcion("", "Todos", f.pais)}${paises.map((p) => opcion(p.codigo, p.nombre, f.pais))}</select></div>
      <button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button>
    </form>
    <div class="card">${lista.length ? html`
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>#</th><th>Descripción</th><th>Módulo</th><th>País</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th class="num">Comentarios</th><th>Actualizada</th></tr></thead>
        <tbody>${lista.map((o, i) => html`
          <tr class="clic" data-i="${i}">
            <td class="muted">${o.numero}</td><td><div class="truncar" style="max-width:420px">${o.descripcion}</div></td>
            <td>${o.modulo || "—"}</td><td>${o.pais ? pais(o.pais) : html`<span class="muted">General</span>`}</td>
            <td>${badge(PRIO, o.prioridad)}</td><td>${badge(ESTADO_OBS, o.estado)}</td>
            <td>${o.responsable || html`<span class="muted">—</span>`}</td><td class="num">${o.comentarios}</td><td class="muted nowrap">${hace(o.actualizado_en)}</td>
          </tr>`)}</tbody></table></div>`
      : vacio("fa-clipboard-check", "Sin observaciones", "Registra aquí los hallazgos de la operación internacional.")}
    </div>`);
  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/observaciones?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  $("#nueva")?.addEventListener("click", async () => { if (await formulario()) recargar(); });
  cont.onclick = (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) detalle(lista[Number(tr.dataset.i)], recargar); };
}
export { raw, toast };
