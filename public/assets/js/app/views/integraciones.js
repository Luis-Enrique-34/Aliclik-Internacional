// Integraciones: proveedores + almacenes por país con checklist de puesta en marcha y bitácora.
import { api, html, raw, $, $$, numero, hace, encabezado, opciones, opcion, qs, paramsHash, vacio, drawer, modal, confirmar, resultado, datosForm, puede, pais, urlSegura, ESTADO_INT, badge, CHECKS, toast } from "../core.js";
import { bitacora } from "./_seguimiento.js";
import { editorEvento } from "./calendario.js";
import { panelIndicadores, selectorOrden, enlazarOrden, ordenar } from "../indicadores.js";

const telLimpio = (t) => String(t || "").replace(/[^\d]/g, "");
const whatsapp = (t) => (telLimpio(t).length >= 8 ? html`<a href="https://wa.me/${telLimpio(t)}" target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"><i class="fab fa-whatsapp"></i> ${t}</a>` : t || "—");

function checklist(i, editable) {
  return html`<div class="checks">${CHECKS.map(([k, t, ic]) => html`
    <button type="button" class="chk ${i[k] ? "si" : ""}" data-chk="${k}" data-id="${i.id}" title="${t}: ${i[k] ? "listo" : "pendiente"}" aria-pressed="${i[k] ? "true" : "false"}" ${editable ? "" : raw("disabled")}>
      <i class="${ic.startsWith("fa-brands") ? ic : "fas " + ic}"></i></button>`)}</div>`;
}

async function formulario(actual = null) {
  const { paises, usuarios } = await opciones();
  const [prov, alm] = await Promise.all([api("/api/entidades/proveedor/opciones"), api("/api/entidades/almacen/opciones")]);
  const i = actual || { estado: "pendiente", pais: "GT" };
  return modal({
    titulo: actual ? "Editar integración" : "Nueva integración",
    ancho: true,
    cuerpo: html`
      <div class="form-grid">
        <div class="f"><label>País *</label><select class="ctrl" name="pais">${paises.filter((p) => p.codigo !== "PE").map((p) => opcion(p.codigo, p.nombre, i.pais))}</select></div>
        <div class="f"><label>Estado</label><select class="ctrl" name="estado">${Object.entries(ESTADO_INT).map(([k, [t]]) => opcion(k, t, i.estado))}</select></div>
        <div class="f"><label>Proveedor *</label><select class="ctrl" name="proveedor_id">${opcion("", "Selecciona…", i.proveedor_id)}${prov.data.opciones.map((p) => opcion(p.id, `${p.nombre}${p.aurora_id ? ` (ID ${p.aurora_id})` : ""}`, i.proveedor_id))}${opcion("__nuevo__", "➕ Registrar proveedor nuevo…", "")}</select></div>
        <div class="f" data-nuevo hidden><label>Nombre del proveedor nuevo</label><input class="ctrl" name="proveedor_nombre" maxlength="160"><div class="ayuda">ID de Aurora (opcional): <input class="ctrl" name="proveedor_aurora" inputmode="numeric" maxlength="12" style="width:110px;height:30px;margin-top:4px"></div></div>
        <div class="f"><label>Almacén</label><select class="ctrl" name="almacen_id">${opcion("", "Por definir", i.almacen_id)}${alm.data.opciones.map((a) => opcion(a.id, `${a.nombre}${a.aurora_id ? ` (ID ${a.aurora_id})` : ""}`, i.almacen_id))}</select></div>
        <div class="f"><label>Nota de almacén (si aún no está definido)</label><input class="ctrl" name="almacen_texto" maxlength="160" value="${i.almacen_texto || ""}" placeholder="Ej. probablemente NIBRESMA"></div>
        <div class="f"><label>Contacto</label><input class="ctrl" name="contacto" maxlength="120" value="${i.contacto || ""}"></div>
        <div class="f"><label>Teléfono / WhatsApp</label><input class="ctrl" name="telefono" maxlength="40" value="${i.telefono || ""}" placeholder="+502 5555 5555"></div>
        <div class="f"><label>Usuario en Aliclik</label><input class="ctrl" name="usuario_alc" maxlength="255" value="${i.usuario_alc || ""}" autocomplete="off"><div class="ayuda"><i class="fas fa-lock"></i> Por seguridad las contraseñas no se guardan aquí: usa el gestor de contraseñas del área.</div></div>
        <div class="f"><label>Responsable interno</label><select class="ctrl" name="responsable_id">${opcion("", "Sin asignar", i.responsable_id)}${usuarios.map((u) => opcion(u.id, `${u.nombres} ${u.apellidos}`, i.responsable_id))}</select></div>
        <div class="f full"><label>Horario de corte</label><textarea class="ctrl" name="horario_corte" maxlength="1000" rows="2">${i.horario_corte || ""}</textarea></div>
        <div class="f full"><label>Pendientes</label><textarea class="ctrl" name="pendiente" maxlength="2000" rows="2">${i.pendiente || ""}</textarea></div>
        <div class="f full"><label>Comentario general</label><textarea class="ctrl" name="comentario" maxlength="2000" rows="2">${i.comentario || ""}</textarea></div>
        <div class="f full"><label>Enlace del logo (https)</label><input class="ctrl" name="logo_url" maxlength="500" value="${i.logo_url || ""}" placeholder="https://drive.google.com/…"></div>
        <div class="f full"><label>Checklist de puesta en marcha</label><div class="check-grid">${CHECKS.map(([k, t]) => html`<label class="switch"><input type="checkbox" name="${k}" ${i[k] ? raw("checked") : ""}> ${t}</label>`)}</div></div>
      </div>`,
    onSubmit: async (form) => {
      const d = datosForm(form);
      if (d.proveedor_id === "__nuevo__") {
        if (!d.proveedor_nombre) return { errores: { proveedor_nombre: "Escribe el nombre del proveedor" } };
        const n = await api("/api/entidad", { method: "POST", body: { tipo: "proveedor", nombre: d.proveedor_nombre, aurora_id: d.proveedor_aurora, pais: d.pais } });
        if (!n.ok) return { errores: n.data.errores ? { proveedor_nombre: Object.values(n.data.errores)[0] } : { proveedor_nombre: n.data.mensaje } };
        d.proveedor_id = n.data.entidad.id;
      }
      delete d.proveedor_nombre; delete d.proveedor_aurora;
      const r = await api(actual ? `/api/integraciones/${actual.id}` : "/api/integraciones", { method: actual ? "PUT" : "POST", body: d });
      return resultado(r) ? r.data.integracion : { errores: r.data.errores || {} };
    },
  }).then((r) => r);
}

function enlazarNuevo() {
  const sel = document.querySelector('.modal select[name="proveedor_id"]');
  sel?.addEventListener("change", () => { document.querySelector(".modal [data-nuevo]").hidden = sel.value !== "__nuevo__"; });
}

async function detalle(id, recargar) {
  const { el, cerrar } = drawer();
  const r = await api(`/api/integraciones/${id}`);
  if (!r.ok) { cerrar(); return toast(r.data.mensaje, "error"); }
  const i = r.data.integracion;
  const logo = urlSegura(i.logo_url);
  el.innerHTML = String(html`
    <div class="drawer-head"><div style="flex:1"><h3>${i.proveedor_nombre}</h3><div class="sub">${i.pais_nombre} · ${i.almacen_nombre || "Almacén por definir"}${i.proveedor_aurora_id ? ` · ID proveedor ${i.proveedor_aurora_id}` : ""}</div></div>
      <button class="icon-btn" data-x aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>
    <div class="drawer-body">
      <div class="fila-flex">${badge(ESTADO_INT, i.estado)} <span class="badge b-brand">${i.avance}% de avance</span> <span class="badge">${numero(i.pedidos_30d)} pedidos (30 días)</span></div>
      <div class="fila-flex mt">
        ${puede("escribir") ? html`<button class="btn btn-ghost btn-sm" data-editar><i class="fas fa-pen"></i> Editar</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-agendar><i class="fas fa-calendar-plus"></i> Agendar reunión</button>
        ${i.proveedor_aurora_id ? html`<a class="btn btn-ghost btn-sm" href="#/pedidos?${qs({ proveedor_id: i.proveedor_aurora_id, pais: i.pais })}"><i class="fas fa-box"></i> Ver pedidos</a>` : ""}
        ${puede("admin") ? html`<button class="btn btn-ghost btn-sm" data-borrar><i class="fas fa-trash"></i></button>` : ""}
      </div>
      <div class="seccion-t">Checklist</div>
      <div class="check-grid">${CHECKS.map(([k, t, ic]) => html`<div class="check-item"><span class="chk ${i[k] ? "si" : ""}"><i class="${ic.startsWith("fa-brands") ? ic : "fas " + ic}"></i></span> ${t}</div>`)}</div>
      <div class="seccion-t">Datos</div>
      <dl class="dl">
        ${logo ? html`<dt>Logo</dt><dd><a href="${logo}" target="_blank" rel="noopener noreferrer">Ver logo <i class="fas fa-arrow-up-right-from-square"></i></a></dd>` : ""}
        <dt>Contacto</dt><dd>${i.contacto || "—"}</dd>
        <dt>Teléfono</dt><dd>${whatsapp(i.telefono)}</dd>
        <dt>Usuario Aliclik</dt><dd>${i.usuario_alc || "—"}</dd>
        <dt>Responsable</dt><dd>${i.responsable || "Sin asignar"}</dd>
        <dt>Horario de corte</dt><dd>${i.horario_corte || "—"}</dd>
        <dt>Pendientes</dt><dd>${i.pendiente || "—"}</dd>
        <dt>Comentario</dt><dd>${i.comentario || "—"}</dd>
        <dt>Actualizado</dt><dd>${hace(i.actualizado_en)}</dd>
      </dl>
      <div class="seccion-t">Seguimiento</div>
      <div id="bitacora"></div>
    </div>`);
  el.querySelector("[data-x]").addEventListener("click", cerrar);
  el.querySelector("[data-editar]")?.addEventListener("click", async () => {
    const p = formulario(i); setTimeout(enlazarNuevo, 60);
    if (await p) { cerrar(); recargar(); }
  });
  el.querySelector("[data-agendar]").addEventListener("click", () => editorEvento({ tipo: "reunion", titulo: `Seguimiento integración ${i.proveedor_nombre} (${i.pais})`, integracion_id: i.id }));
  el.querySelector("[data-borrar]")?.addEventListener("click", async () => {
    if (!(await confirmar("Eliminar integración", `Se eliminará la integración de ${i.proveedor_nombre} en ${i.pais_nombre} y su bitácora. Esta acción no se puede deshacer.`, { textoOk: "Eliminar" }))) return;
    if (resultado(await api(`/api/integraciones/${i.id}`, { method: "DELETE" }))) { cerrar(); recargar(); }
  });
  bitacora(el.querySelector("#bitacora"), { recurso: "integracion", id: i.id, estados: ESTADO_INT, estadoActual: i.estado, onCambio: recargar });
}

const SLA_DIAS = 30, SIN_MOV_DIAS = 7; // mismos valores que src/config/metas.js
const dias = (v) => (v ? (Date.now() - new Date(v).getTime()) / 86400000 : null);
const ORDEN_INT = [["avance", "Avance del checklist", "pct"], ["proveedor", "Proveedor", "texto"], ["almacen", "Almacén", "texto"], ["pais", "País", "texto"],
  ["antiguedad", "Días abierta", "dias"], ["pedidos", "Pedidos 30 días", "num"], ["movimiento", "Último seguimiento", "fecha"], ["estado", "Estado (de pendiente a integrado)", "nivel"]];
const CAMPOS_INT = {
  avance: (i) => i.avance, antiguedad: (i) => (i.estado === "integrado" ? null : dias(i.creado_en)), pedidos: (i) => i.pedidos_30d,
  movimiento: (i) => i.ultimo_seguimiento_en || i.actualizado_en, proveedor: (i) => i.proveedor_nombre, almacen: (i) => i.almacen_nombre, pais: (i) => i.pais_nombre || i.pais,
  estado: (i) => ({ pendiente: 0, en_proceso: 1, pausado: 2, integrado: 3 })[i.estado],
};

export async function render(cont) {
  const { paises } = await opciones();
  const h = paramsHash();
  const f = { pais: h.pais || "", estado: h.estado || "", q: h.q || "" };
  const v = { paso: h.paso || "", avance: h.avance || "", sla: h.sla || "", responsable: h.responsable || "", pedidos: h.pedidos || "", orden: h.orden || "avance", dir: h.dir || "asc" };
  const r = await api(`/api/integraciones?${qs(f)}`);
  const todas = r.ok ? r.data.integraciones : [];
  const responsables = [...new Set(todas.map((i) => i.responsable).filter(Boolean))].sort();
  let lista = todas;
  if (v.paso) lista = lista.filter((i) => !i[v.paso]);
  if (v.avance === "0") lista = lista.filter((i) => i.avance === 0);
  if (v.avance === "1-49") lista = lista.filter((i) => i.avance > 0 && i.avance < 50);
  if (v.avance === "50-99") lista = lista.filter((i) => i.avance >= 50 && i.avance < 100);
  if (v.avance === "100") lista = lista.filter((i) => i.avance === 100);
  if (v.sla === "fuera") lista = lista.filter((i) => !["integrado", "pausado"].includes(i.estado) && dias(i.creado_en) > SLA_DIAS);
  if (v.sla === "sin_mov") lista = lista.filter((i) => !["integrado", "pausado"].includes(i.estado) && dias(i.ultimo_seguimiento_en || i.actualizado_en) > SIN_MOV_DIAS);
  if (v.responsable === "_sin") lista = lista.filter((i) => !i.responsable);
  else if (v.responsable) lista = lista.filter((i) => i.responsable === v.responsable);
  if (v.pedidos === "con") lista = lista.filter((i) => i.pedidos_30d > 0);
  if (v.pedidos === "sin") lista = lista.filter((i) => !i.pedidos_30d);
  lista = ordenar(lista, CAMPOS_INT, v.orden, v.dir);
  const resumen = r.ok ? r.data.resumen : [];
  const recargar = () => render(cont);

  encabezado("Integraciones", "Proveedores y almacenes por país: puesta en marcha y seguimiento",
    puede("escribir") ? html`<button class="btn btn-brand btn-sm" id="nueva"><i class="fas fa-plus"></i> Nueva integración</button>` : "");

  cont.innerHTML = String(html`
    <div id="indPanel"></div>
    <div class="resumen-paises">${resumen.map((p) => html`
      <a class="card resumen-pais" href="#/integraciones?pais=${p.pais}" style="text-decoration:none;color:inherit">
        <div class="top"><span class="pais"><span class="cod">${p.pais}</span>${p.pais_nombre}</span><span class="n">${p.integrados}/${p.total}</span></div>
        <div class="muted" style="font-size:12px">${p.en_proceso} en proceso · ${p.pendientes} pendientes</div>
        <div class="progreso"><span style="width:${p.avance_promedio || 0}%"></span></div>
      </a>`)}</div>
    <form class="filtros" id="filtros">
      <div class="campo"><label>País</label><select class="ctrl" name="pais">${opcion("", "Todos", f.pais)}${paises.filter((p) => p.codigo !== "PE").map((p) => opcion(p.codigo, p.nombre, f.pais))}</select></div>
      <div class="campo"><label>Estado</label><select class="ctrl" name="estado">${opcion("", "Todos", f.estado)}${Object.entries(ESTADO_INT).map(([k, [t]]) => opcion(k, t, f.estado))}</select></div>
      <div class="campo"><label>Paso pendiente</label><select class="ctrl" name="paso">${opcion("", "Cualquiera", v.paso)}${CHECKS.map(([k, t]) => opcion(k, t, v.paso))}</select></div>
      <div class="campo"><label>Avance</label><select class="ctrl" name="avance">${opcion("", "Todos", v.avance)}${opcion("0", "0 %", v.avance)}${opcion("1-49", "1 – 49 %", v.avance)}${opcion("50-99", "50 – 99 %", v.avance)}${opcion("100", "100 %", v.avance)}</select></div>
      <div class="campo"><label>SLA</label><select class="ctrl" name="sla">${opcion("", "Todas", v.sla)}${opcion("fuera", `Abiertas > ${SLA_DIAS} días`, v.sla)}${opcion("sin_mov", `Sin movimiento > ${SIN_MOV_DIAS} días`, v.sla)}</select></div>
      <div class="campo"><label>Responsable</label><select class="ctrl" name="responsable">${opcion("", "Todos", v.responsable)}${opcion("_sin", "Sin asignar", v.responsable)}${responsables.map((x) => opcion(x, x, v.responsable))}</select></div>
      <div class="campo"><label>Pedidos</label><select class="ctrl" name="pedidos">${opcion("", "Todos", v.pedidos)}${opcion("con", "Ya vende (30 d)", v.pedidos)}${opcion("sin", "Sin pedidos", v.pedidos)}</select></div>
      <div class="campo buscador"><label>Buscar</label><input class="ctrl" name="q" value="${f.q}" placeholder="Proveedor, almacén o contacto" maxlength="80"></div>
      ${selectorOrden(ORDEN_INT, v.orden, v.dir)}
      <div class="filtros-acciones"><button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button><a class="btn btn-ghost" href="#/integraciones">Limpiar</a></div>
    </form>
    <p class="muted conteo">${numero(lista.length)} de ${numero(todas.length)} integraciones</p>
    <div class="card">${lista.length ? html`
      <div class="tabla-wrap"><table class="tabla t-integraciones">
        <thead><tr><th>Proveedor</th><th>País</th><th>Almacén</th><th>Contacto</th><th>Checklist</th><th class="num">Avance</th><th>Estado</th><th class="num">Pedidos 30d</th><th>Último seguimiento</th></tr></thead>
        <tbody>${lista.map((i) => html`
          <tr class="clic" data-id="${i.id}">
            <td><div class="celda-prov">${urlSegura(i.logo_url) && !/drive\.google\.com\/file/.test(i.logo_url) ? html`<img class="logo-prov" src="${urlSegura(i.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="avatar" style="border-radius:7px;width:30px;height:30px;font-size:11px">${i.proveedor_nombre.slice(0, 2).toUpperCase()}</span>`}
              <div><span class="nombre">${i.proveedor_nombre}</span>${i.proveedor_aurora_id ? html`<span class="id">ID ${i.proveedor_aurora_id}</span>` : ""}</div></div></td>
            <td>${pais(i.pais)}</td>
            <td class="truncar">${i.almacen_nombre || html`<span class="muted">Por definir</span>`}</td>
            <td><div>${i.contacto || "—"}</div><div class="muted" style="font-size:12px">${i.telefono || ""}</div></td>
            <td>${checklist(i, puede("escribir"))}</td>
            <td class="num"><b>${i.avance}%</b></td>
            <td>${badge(ESTADO_INT, i.estado)}</td>
            <td class="num">${numero(i.pedidos_30d)}</td>
            <td class="muted"><div class="truncar" style="max-width:220px">${i.ultimo_seguimiento || "—"}</div>${i.ultimo_seguimiento_en ? html`<div style="font-size:11.5px">${hace(i.ultimo_seguimiento_en)}</div>` : ""}</td>
          </tr>`)}</tbody></table></div>`
      : vacio("fa-handshake", "No hay integraciones con estos filtros", puede("escribir") ? "Registra la primera con el botón “Nueva integración”." : "")}
    </div>`);

  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/integraciones?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  enlazarOrden(cont, () => $("#filtros", cont).requestSubmit());
  panelIndicadores($("#indPanel", cont), "integraciones", { pais: f.pais });
  $("#nueva")?.addEventListener("click", async () => { const p = formulario(); setTimeout(enlazarNuevo, 60); if (await p) recargar(); });
  cont.onclick = async (e) => {
    const chk = e.target.closest("[data-chk]");
    if (chk && !chk.disabled) {
      e.stopPropagation();
      const valor = !chk.classList.contains("si");
      chk.disabled = true;
      const res = await api(`/api/integraciones/${chk.dataset.id}/checklist`, { method: "PATCH", body: { campo: chk.dataset.chk, valor } });
      chk.disabled = false;
      if (!res.ok) return toast(res.data.mensaje, "error");
      chk.classList.toggle("si", valor);
      chk.setAttribute("aria-pressed", String(valor));
      const fila = chk.closest("tr");
      fila.querySelector("td.num b").textContent = `${res.data.avance}%`;
      return;
    }
    const tr = e.target.closest("tr[data-id]");
    if (tr) detalle(tr.dataset.id, recargar);
  };
}
