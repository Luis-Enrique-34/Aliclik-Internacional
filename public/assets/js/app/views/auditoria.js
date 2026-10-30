// Auditoría: registro de acciones sensibles (inicios de sesión, cambios de acceso, cargas…) con indicadores y filtros.
import { api, html, $, fechaHora, encabezado, opcion, vacio, paramsHash, qs, hoyIso, opciones } from "../core.js";
import { panelIndicadores } from "../indicadores.js";

const PELIGRO = new Set(["LOGIN_FALLIDO", "CUENTA_BLOQUEADA", "CAMBIO_ACCESO", "REGISTRO_DUPLICADO", "INTEGRACION_ELIMINADA", "OBSERVACION_ELIMINADA", "ACUERDO_ELIMINADO", "EVENTO_ELIMINADO"]);
const GRUPOS = { seguridad: "Inicios de sesión y registro", accesos: "Accesos y permisos", cambios: "Cambios de datos", cargas: "Cargas de pedidos" };

export async function render(cont) {
  const h = paramsHash();
  const f = {
    grupo: h.grupo || "", accion: h.accion || "", usuario_id: h.usuario_id || "", desde: h.desde || "", hasta: h.hasta || "",
    ip: h.ip || "", q: h.q || "", orden: h.orden || "desc", limite: h.limite || "200",
  };
  const [r, ops] = await Promise.all([api(`/api/admin/auditoria?${qs(f)}`), opciones()]);
  const { registros = [], acciones = [] } = r.ok ? r.data : {};
  encabezado("Auditoría", `${registros.length} eventos mostrados (máx. ${f.limite})`);
  cont.innerHTML = String(html`
    <div id="indPanel"></div>
    <form class="filtros" id="filtros">
      <div class="campo"><label>Categoría</label><select class="ctrl" name="grupo">${opcion("", "Todas", f.grupo)}${Object.entries(GRUPOS).map(([k, t]) => opcion(k, t, f.grupo))}</select></div>
      <div class="campo"><label>Acción</label><select class="ctrl" name="accion">${opcion("", "Todas", f.accion)}${acciones.map((a) => opcion(a, a, f.accion))}</select></div>
      <div class="campo"><label>Usuario</label><select class="ctrl" name="usuario_id">${opcion("", "Todos", f.usuario_id)}${(ops.usuarios || []).map((u) => opcion(u.id, `${u.nombres} ${u.apellidos}`, f.usuario_id))}</select></div>
      <div class="campo"><label>Desde</label><input type="date" class="ctrl" name="desde" value="${f.desde}" max="${hoyIso()}"></div>
      <div class="campo"><label>Hasta</label><input type="date" class="ctrl" name="hasta" value="${f.hasta}" max="${hoyIso()}"></div>
      <div class="campo"><label>IP</label><input class="ctrl" name="ip" value="${f.ip}" maxlength="45" placeholder="Ej. 190.12.…"></div>
      <div class="campo buscador"><label>Buscar en detalle</label><input class="ctrl" name="q" value="${f.q}" maxlength="80" placeholder="Correo, registro, texto…"></div>
      <div class="campo"><label>Orden</label><select class="ctrl" name="orden">${opcion("desc", "Más recientes primero", f.orden)}${opcion("asc", "Más antiguos primero", f.orden)}</select></div>
      <div class="campo"><label>Mostrar</label><select class="ctrl" name="limite">${["200", "500", "1000"].map((n) => opcion(n, `${n} eventos`, f.limite))}</select></div>
      <div class="filtros-acciones"><button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button><a class="btn btn-ghost" href="#/auditoria">Limpiar</a></div>
    </form>
    <div class="card">${registros.length ? html`<div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Registro</th><th>IP</th><th>Detalle</th></tr></thead>
      <tbody>${registros.map((a) => html`<tr>
        <td class="nowrap">${fechaHora(a.creado_en)}</td>
        <td><span class="badge ${PELIGRO.has(a.accion) ? "b-warn" : ""}">${a.accion}</span></td>
        <td>${a.usuario || html`<span class="muted">—</span>`}<div class="muted" style="font-size:11.5px">${a.email || ""}</div></td>
        <td class="muted">${a.entidad || "—"}</td>
        <td class="muted">${a.ip ? html`<a href="#/auditoria?${qs({ ...f, ip: a.ip })}" title="Ver todo lo de esta IP">${a.ip}</a>` : "—"}</td>
        <td class="muted"><code>${a.detalle ? JSON.stringify(a.detalle).slice(0, 140) : ""}</code></td></tr>`)}</tbody></table></div>`
      : vacio("fa-shield-halved", "Sin eventos con estos filtros")}</div>`);
  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/auditoria?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  for (const n of ["orden", "limite", "grupo", "accion", "usuario_id"]) $(`[name="${n}"]`, cont).addEventListener("change", () => $("#filtros", cont).requestSubmit());
  panelIndicadores($("#indPanel", cont), "auditoria");
}
