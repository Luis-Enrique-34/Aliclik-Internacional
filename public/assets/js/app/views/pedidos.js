// Listado de pedidos con filtros, paginación, exportación y detalle.
import { api, html, raw, $, numero, dinero, fecha, fechaHora, hoyIso, GRUPOS, badgeGrupo, encabezado, opciones, opcion, qs, paramsHash, vacio, drawer, pais } from "../core.js";

const ETIQ = { tienda_id: "Tienda", proveedor_id: "Proveedor", almacen_id: "Almacén", courier_id: "Courier" };

export async function render(cont) {
  const { paises } = await opciones();
  const h = paramsHash();
  const f = {
    desde: h.desde || hoyIso(-29), hasta: h.hasta || hoyIso(), pais: h.pais || "", grupo: h.grupo || "", estado: h.estado || "",
    q: h.q || "", pagina: Number(h.pagina) || 1, orden: h.orden || "fecha",
    tienda_id: h.tienda_id || "", proveedor_id: h.proveedor_id || "", almacen_id: h.almacen_id || "", courier_id: h.courier_id || "",
  };
  const [res, est] = await Promise.all([api(`/api/pedidos?${qs(f)}`), api("/api/pedidos/estados")]);
  const datos = res.ok ? res.data : { total: 0, filas: [], porPagina: 50 };
  const paginas = Math.max(1, Math.ceil(datos.total / datos.porPagina));
  const filtroEntidad = Object.keys(ETIQ).find((k) => f[k]);
  const nombreEntidad = filtroEntidad && datos.filas[0] ? datos.filas[0][filtroEntidad.replace("_id", "_nombre")] : null;

  encabezado("Pedidos", `${numero(datos.total)} pedidos encontrados`,
    html`<a class="btn btn-ghost btn-sm" href="/api/pedidos/exportar.csv?${qs({ ...f, pagina: "" })}"><i class="fas fa-file-csv"></i> Exportar CSV</a>`);

  cont.innerHTML = String(html`
    <form class="filtros" id="filtros">
      <div class="campo"><label>Desde</label><input type="date" class="ctrl" name="desde" value="${f.desde}" max="${hoyIso()}"></div>
      <div class="campo"><label>Hasta</label><input type="date" class="ctrl" name="hasta" value="${f.hasta}" max="${hoyIso()}"></div>
      <div class="campo"><label>País</label><select class="ctrl" name="pais">${opcion("", "Todos", f.pais)}${paises.filter((p) => p.codigo !== "PE").map((p) => opcion(p.codigo, p.nombre, f.pais))}</select></div>
      <div class="campo"><label>Grupo</label><select class="ctrl" name="grupo">${opcion("", "Todos", f.grupo)}${Object.entries(GRUPOS).map(([k, v]) => opcion(k, v, f.grupo))}</select></div>
      <div class="campo"><label>Estado Aurora</label><select class="ctrl" name="estado">${opcion("", "Todos", f.estado)}${(est.data.estados || []).map((e) => opcion(e.estado_codigo, e.estado_label, f.estado))}</select></div>
      <div class="campo buscador"><label>Buscar</label><i class="fas fa-magnifying-glass" style="top:auto;bottom:12px;transform:none"></i><input class="ctrl" name="q" value="${f.q}" placeholder="N° pedido, tienda, proveedor…" maxlength="80"></div>
      ${Object.keys(ETIQ).map((k) => html`<input type="hidden" name="${k}" value="${f[k]}">`)}
      <button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button>
      <a class="btn btn-ghost" href="#/pedidos">Limpiar</a>
    </form>
    ${filtroEntidad ? html`<div class="aviso info"><i class="fas fa-filter"></i><div>Filtrando por <b>${ETIQ[filtroEntidad]}: ${nombreEntidad || f[filtroEntidad]}</b> (ID ${f[filtroEntidad]}). <a href="#/pedidos?${qs({ ...f, [filtroEntidad]: "", pagina: "" })}">Quitar filtro</a></div></div>` : ""}
    <div class="card">
      ${datos.filas.length ? html`
      <div class="tabla-wrap"><table class="tabla t-pedidos">
        <thead><tr><th>Pedido</th><th>Fecha</th><th>País</th><th>Tienda</th><th>Proveedor</th><th>Almacén</th><th>Courier</th><th>Estado</th><th class="num">Total</th></tr></thead>
        <tbody>${datos.filas.map((p, i) => html`
          <tr class="clic" data-i="${i}">
            <td class="nombre nowrap">${p.order_number || p.order_id}</td>
            <td class="nowrap muted">${fechaHora(p.fecha_pedido)}</td>
            <td><span class="pais"><span class="cod">${p.pais}</span></span></td>
            <td class="truncar">${p.tienda_nombre || "—"}</td>
            <td class="truncar">${p.proveedor_nombre || "—"}${p.n_proveedores > 1 ? html` <span class="badge simple" title="Pedido con varios proveedores">+${p.n_proveedores - 1}</span>` : ""}</td>
            <td class="truncar">${p.almacen_nombre || "—"}</td>
            <td class="truncar">${p.courier_nombre || "—"}</td>
            <td>${badgeGrupo(p.grupo, p.estado_label)}</td>
            <td class="num">${dinero(p.total, p.moneda)}</td>
          </tr>`)}</tbody>
      </table></div>
      <div class="paginacion"><span>Página ${f.pagina} de ${paginas}</span>
        <div class="der">
          <a class="btn btn-ghost btn-sm" ${f.pagina <= 1 ? raw('aria-disabled="true" style="pointer-events:none;opacity:.5"') : ""} href="#/pedidos?${qs({ ...f, pagina: f.pagina - 1 })}"><i class="fas fa-chevron-left"></i> Anterior</a>
          <a class="btn btn-ghost btn-sm" ${f.pagina >= paginas ? raw('aria-disabled="true" style="pointer-events:none;opacity:.5"') : ""} href="#/pedidos?${qs({ ...f, pagina: f.pagina + 1 })}">Siguiente <i class="fas fa-chevron-right"></i></a>
        </div></div>`
      : vacio("fa-box-open", "No hay pedidos con estos filtros", "Prueba con otro rango de fechas o carga datos nuevos.")}
    </div>`);

  $("#filtros", cont).addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    location.hash = `#/pedidos?${qs(d)}`;
  });
  cont.onclick = (e) => {
    const tr = e.target.closest("tr[data-i]");
    if (!tr) return;
    const p = datos.filas[Number(tr.dataset.i)];
    const { el, cerrar } = drawer();
    el.innerHTML = String(html`
      <div class="drawer-head"><div style="flex:1"><h3>Pedido ${p.order_number || p.order_id}</h3><div class="sub">ID Aurora ${p.order_id} · ${fechaHora(p.fecha_pedido)}</div></div>
        <button class="icon-btn" data-x aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>
      <div class="drawer-body">
        <div class="fila-flex">${badgeGrupo(p.grupo, p.estado_label)} ${p.contraentrega ? html`<span class="badge b-info">Contraentrega</span>` : ""}</div>
        <div class="seccion-t">Ecosistema</div>
        <dl class="dl">
          <dt>País</dt><dd>${pais(p.pais)}</dd>
          <dt>Tienda</dt><dd>${p.tienda_nombre || "—"} ${p.tienda_id ? html`<span class="muted">(ID ${p.tienda_id})</span>` : ""}</dd>
          <dt>Proveedor</dt><dd>${p.proveedor_nombre || "—"} ${p.proveedor_id ? html`<span class="muted">(ID ${p.proveedor_id})</span>` : ""}${p.n_proveedores > 1 ? html`<br><span class="muted">Pedido con ${p.n_proveedores} proveedores (se muestra el principal)</span>` : ""}</dd>
          <dt>Almacén</dt><dd>${p.almacen_nombre || "—"} ${p.almacen_id ? html`<span class="muted">(ID ${p.almacen_id})</span>` : ""}</dd>
          <dt>Courier</dt><dd>${p.courier_nombre || "—"} ${p.courier_id ? html`<span class="muted">(ID ${p.courier_id})</span>` : ""}</dd>
        </dl>
        <div class="seccion-t">Estado y montos</div>
        <dl class="dl">
          <dt>Estado del pedido</dt><dd>${p.estado_label || "—"} <span class="muted">(${p.estado_codigo || "—"})</span></dd>
          <dt>Estado de envío</dt><dd>${p.estado_envio || "—"}</dd>
          <dt>Estado de entrega</dt><dd>${p.estado_entrega || "—"}</dd>
          <dt>Fecha de entrega</dt><dd>${fecha(p.fecha_entrega)}</dd>
          <dt>Total</dt><dd><b>${dinero(p.total, p.moneda)}</b> · ${numero(p.unidades)} unidades</dd>
          <dt>Última actualización</dt><dd>${fechaHora(p.fecha_actualizacion)}</dd>
          <dt>Sincronizado</dt><dd>${fechaHora(p.sincronizado_en)}</dd>
        </dl>
      </div>`);
    el.querySelector("[data-x]").addEventListener("click", cerrar);
  };
}
