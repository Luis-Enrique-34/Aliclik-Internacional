// Auditoría: registro de acciones sensibles (inicios de sesión, cambios de acceso, cargas…).
import { api, html, $, fechaHora, encabezado, opcion, vacio } from "../core.js";

const PELIGRO = new Set(["LOGIN_FALLIDO", "CUENTA_BLOQUEADA", "CAMBIO_ACCESO", "REGISTRO_DUPLICADO", "INTEGRACION_ELIMINADA", "OBSERVACION_ELIMINADA"]);
let accion = "";

export async function render(cont) {
  const r = await api(`/api/admin/auditoria${accion ? `?accion=${encodeURIComponent(accion)}` : ""}`);
  const { registros = [], acciones = [] } = r.ok ? r.data : {};
  encabezado("Auditoría", "Últimos 200 eventos de seguridad y gestión");
  cont.innerHTML = String(html`
    <div class="filtros"><div class="campo"><label>Acción</label><select class="ctrl" id="accion">${opcion("", "Todas", accion)}${acciones.map((a) => opcion(a, a, accion))}</select></div></div>
    <div class="card">${registros.length ? html`<div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Registro</th><th>IP</th><th>Detalle</th></tr></thead>
      <tbody>${registros.map((a) => html`<tr>
        <td class="nowrap">${fechaHora(a.creado_en)}</td>
        <td><span class="badge ${PELIGRO.has(a.accion) ? "b-warn" : ""}">${a.accion}</span></td>
        <td>${a.usuario || html`<span class="muted">—</span>`}<div class="muted" style="font-size:11.5px">${a.email || ""}</div></td>
        <td class="muted">${a.entidad || "—"}</td><td class="muted">${a.ip || "—"}</td>
        <td class="muted"><code>${a.detalle ? JSON.stringify(a.detalle).slice(0, 140) : ""}</code></td></tr>`)}</tbody></table></div>`
      : vacio("fa-shield-halved", "Sin eventos")}</div>`);
  $("#accion", cont).addEventListener("change", (e) => { accion = e.target.value; render(cont); });
}
