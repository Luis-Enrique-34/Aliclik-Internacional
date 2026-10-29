// =====================================================================
//  Seguimiento por actor: tiendas, proveedores, almacenes y couriers.
//  · Listado con salud del volumen (semáforo), meta del mes y trato especial
//  · Ficha 360: tendencia mensual vs. meta, escalas de beneficios, acuerdos,
//    contrapartes, integraciones, reuniones y bitácora
//  · Acuerdos especiales (descuentos exclusivos, tarifas, beneficios)
// =====================================================================
import {
  api, html, raw, $, numero, dinero, pct, hace, fecha, fechaHora, hoyIso, encabezado, opciones, opcion, qs, paramsHash,
  vacio, modal, confirmar, resultado, datosForm, puede, pais, TIPOS, TIPO_UNO,
} from "../core.js";
import { graficoBarras } from "../charts.js";
import { bitacora } from "./_seguimiento.js";
import { editorEvento } from "./calendario.js";

export const SALUD = {
  creciendo: ["En crecimiento", "fa-arrow-trend-up"], estable: ["Estable", "fa-equals"], atencion: ["Requiere atención", "fa-triangle-exclamation"],
  en_caida: ["En caída", "fa-arrow-trend-down"], inactiva: ["Inactiva", "fa-moon"], sin_datos: ["Sin pedidos", "fa-circle-minus"],
};
const SEGMENTOS = { estandar: "Estándar", preferente: "Preferente", vip: "VIP", estrategica: "Estratégica" };
const TIPOS_ACUERDO = {
  descuento_pct: "Descuento (%)", descuento_monto: "Descuento (monto fijo)", tarifa_especial: "Tarifa especial",
  envio_gratis: "Envío sin costo", credito: "Crédito / saldo a favor", prioridad: "Atención prioritaria", otro: "Otro beneficio",
};
const APLICA = { general: "General", fulfillment: "Fulfillment", envio: "Envío / courier", comision: "Comisión Aliclik", producto: "Productos", liquidacion: "Liquidaciones" };
const VIGENCIA = {
  vigente: ["Vigente", "b-ok"], por_vencer: ["Por vencer", "b-warn"], programado: ["Programado", "b-info"],
  vencido: ["Vencido", "b-danger"], pausado: ["Pausado", ""], finalizado: ["Finalizado", ""],
};
const ICONO_TIPO = { tienda: "fa-store", proveedor: "fa-industry", almacen: "fa-warehouse", courier: "fa-truck-fast" };
const CAMPO_PEDIDO = { tienda: "tienda_id", proveedor: "proveedor_id", almacen: "almacen_id", courier: "courier_id" };

export const badgeSalud = (s, titulo = "") => html`<span class="salud ${s}" title="${titulo}"><i class="fas ${SALUD[s]?.[1] || "fa-circle"}"></i>${SALUD[s]?.[0] || s}</span>`;
const badgeSeg = (s) => (s && s !== "estandar" ? html`<span class="seg ${s}"><i class="fas fa-star"></i>${SEGMENTOS[s]}</span>` : "");
const badgeVig = (v) => html`<span class="badge ${VIGENCIA[v]?.[1] || ""}">${VIGENCIA[v]?.[0] || v}</span>`;
const delta = (v) => (v == null ? html`<span class="muted">—</span>` : html`<span class="delta ${v > 0.005 ? "sube" : v < -0.005 ? "baja" : "igual"}">${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${Math.abs(Math.round(v * 100))}%</span>`);
const iconoAlerta = { alta: "fa-circle-exclamation", media: "fa-triangle-exclamation", info: "fa-circle-info" };

function valorAcuerdo(a) {
  if (a.tipo === "descuento_pct") return `${numero(a.valor)} %`;
  if (a.tipo === "envio_gratis") return "Sin costo";
  if (a.tipo === "prioridad") return "Prioridad";
  if (a.valor == null) return "—";
  return a.moneda ? dinero(a.valor, a.moneda) : numero(a.valor);
}

function barraMeta(e) {
  if (!e.meta_pedidos_mes) return html`<div class="meta-celda"><div class="txt"><b>${numero(e.mes_actual)}</b><span>sin meta</span></div></div>`;
  const avance = Math.min(1, e.mes_actual / e.meta_pedidos_mes);
  const proy = Math.min(1, e.proyeccion / e.meta_pedidos_mes);
  return html`<div class="meta-celda" title="Proyección al cierre del mes: ${numero(e.proyeccion)} pedidos">
    <div class="txt"><b>${numero(e.mes_actual)} / ${numero(e.meta_pedidos_mes)}</b><span>${Math.round(e.avanceMeta * 100)}%</span></div>
    <div class="barra-meta"><span class="${avance >= 1 ? "ok" : ""}" style="width:${avance * 100}%"></span><i class="proy" style="left:calc(${proy * 100}% - 1px)"></i></div></div>`;
}

const pestañas = (activo) => html`
  <div class="fila-flex" style="margin-bottom:16px"><div class="tabs">
    ${Object.entries(TIPOS).map(([k, t]) => html`<a class="tab ${k === activo ? "activo" : ""}" href="#/seguimiento?tipo=${k}"><i class="fas ${ICONO_TIPO[k]}"></i> ${t}</a>`)}
    <a class="tab ${activo === "acuerdos" ? "activo" : ""}" href="#/seguimiento?tipo=acuerdos"><i class="fas fa-percent"></i> Acuerdos especiales</a>
  </div></div>`;

// =====================================================================  Formularios
async function formEntidad(tipo, actual = null) {
  const { paises } = await opciones();
  const e = actual || { tipo, activo: true };
  return modal({
    titulo: actual ? `Editar datos de ${actual.nombre}` : `Registrar ${TIPO_UNO[tipo]}`,
    cuerpo: html`
      <div class="form-grid">
        <div class="f full"><label>Nombre *</label><input class="ctrl" name="nombre" maxlength="160" value="${e.nombre || ""}" required></div>
        <div class="f"><label>ID en Aurora</label><input class="ctrl" name="aurora_id" inputmode="numeric" maxlength="15" value="${e.aurora_id ?? ""}"><div class="ayuda">Vincula los pedidos sincronizados.</div></div>
        <div class="f"><label>País</label><select class="ctrl" name="pais">${opcion("", "—", e.pais)}${paises.map((p) => opcion(p.codigo, p.nombre, e.pais))}</select></div>
        <div class="f"><label>Contacto</label><input class="ctrl" name="contacto" maxlength="120" value="${e.contacto || ""}"></div>
        <div class="f"><label>Teléfono</label><input class="ctrl" name="telefono" maxlength="40" value="${e.telefono || ""}"></div>
        <div class="f full"><label>Correo</label><input class="ctrl" name="correo" type="email" maxlength="255" value="${e.correo || ""}"></div>
        <div class="f full"><label>Notas</label><textarea class="ctrl" name="notas" maxlength="2000">${e.notas || ""}</textarea></div>
        ${actual ? html`<div class="f full"><label class="switch"><input type="checkbox" name="activo" ${e.activo ? raw("checked") : ""}> Activo</label></div>` : ""}
      </div>`,
    onSubmit: async (form) => {
      const r = await api(actual ? `/api/entidad/${actual.id}` : "/api/entidad", { method: actual ? "PUT" : "POST", body: { ...datosForm(form), tipo } });
      return resultado(r) ? r.data.entidad : { errores: r.data.errores || {} };
    },
  });
}

async function formPlan(e) {
  const { usuarios } = await opciones();
  return modal({
    titulo: `Plan de seguimiento · ${e.nombre}`,
    cuerpo: html`
      <div class="form-grid">
        <div class="f"><label>Segmento / trato</label><select class="ctrl" name="segmento">${Object.entries(SEGMENTOS).map(([k, t]) => opcion(k, t, e.segmento))}</select>
          <div class="ayuda">Preferente, VIP y Estratégica se marcan como trato especial.</div></div>
        <div class="f"><label>Meta de pedidos por mes</label><input class="ctrl" name="meta_pedidos_mes" type="number" min="1" step="1" value="${e.meta_pedidos_mes ?? ""}" placeholder="Ej. 500">
          <div class="ayuda">Este mes lleva ${numero(e.mes_actual)} · proyección ${numero(e.proyeccion)}</div></div>
        <div class="f full"><label>Responsable del seguimiento</label><select class="ctrl" name="responsable_id">${opcion("", "Sin asignar", e.responsable_id)}${usuarios.map((u) => opcion(u.id, `${u.nombres} ${u.apellidos}`, e.responsable_id))}</select></div>
        <div class="f full"><label>Condiciones del trato especial</label><textarea class="ctrl" name="condiciones" maxlength="2000" rows="4" placeholder="Acuerdos generales, compromisos, contacto comercial, observaciones…">${e.condiciones || ""}</textarea></div>
      </div>`,
    onSubmit: async (form) => {
      const r = await api(`/api/seguimiento-actores/ficha/${e.id}/plan`, { method: "PUT", body: datosForm(form) });
      return resultado(r) ? true : { errores: r.data.errores || {} };
    },
  });
}

/** Alta/edición de un acuerdo. Si no se indica la entidad, se elige en el formulario. */
async function formAcuerdo({ entidad = null, actual = null } = {}) {
  const { paises } = await opciones();
  const a = actual || { tipo: "descuento_pct", aplica_a: "general", estado: "activo", vigente_desde: hoyIso(), moneda: paises.find((p) => p.codigo === entidad?.pais)?.moneda || "" };
  let entidades = [];
  if (!entidad && !actual) {
    const r = await Promise.all(Object.keys(TIPOS).map((t) => api(`/api/entidades/${t}/opciones`).then((x) => (x.data.opciones || []).map((o) => ({ ...o, tipo: t })))));
    entidades = r.flat();
  }
  const fija = entidad || (actual && { id: actual.entidad_id, nombre: actual.entidad_nombre, tipo: actual.entidad_tipo });
  return modal({
    titulo: actual ? "Editar acuerdo" : "Nuevo acuerdo especial",
    ancho: true,
    cuerpo: html`
      <div class="form-grid">
        <div class="f full"><label>Aplica a *</label>
          ${fija ? html`<input type="hidden" name="entidad_id" value="${fija.id}"><div class="ctrl" style="display:flex;align-items:center;gap:8px;background:var(--surface-2)"><i class="fas ${ICONO_TIPO[fija.tipo]}"></i> ${fija.nombre} <span class="muted">(${TIPO_UNO[fija.tipo]})</span></div>`
          : html`<select class="ctrl" name="entidad_id">${opcion("", "Selecciona tienda, proveedor, almacén o courier…", "")}
              ${Object.entries(TIPOS).map(([t, txt]) => html`<optgroup label="${txt}">${entidades.filter((x) => x.tipo === t).map((x) => opcion(x.id, `${x.nombre}${x.aurora_id ? ` (ID ${x.aurora_id})` : ""}`, ""))}</optgroup>`)}</select>`}</div>
        <div class="f"><label>Tipo de beneficio *</label><select class="ctrl" name="tipo">${Object.entries(TIPOS_ACUERDO).map(([k, t]) => opcion(k, t, a.tipo))}</select></div>
        <div class="f"><label>Sobre qué se aplica</label><select class="ctrl" name="aplica_a">${Object.entries(APLICA).map(([k, t]) => opcion(k, t, a.aplica_a))}</select></div>
        <div class="f full"><label>Título *</label><input class="ctrl" name="titulo" maxlength="160" value="${a.titulo || ""}" placeholder="Ej. 10% de descuento en fulfillment por volumen"></div>
        <div class="f"><label>Valor</label><input class="ctrl" name="valor" type="number" min="0" step="0.01" value="${a.valor ?? ""}" placeholder="10"><div class="ayuda">Porcentaje (0–100) o monto, según el tipo.</div></div>
        <div class="f"><label>Moneda (si es monto)</label><input class="ctrl" name="moneda" maxlength="3" value="${a.moneda || ""}" placeholder="GTQ, ARS, USD…"></div>
        <div class="f"><label>Se gana al llegar a (pedidos en el mes)</label><input class="ctrl" name="umbral_pedidos" type="number" min="1" step="1" value="${a.umbral_pedidos ?? ""}" placeholder="Vacío = aplica siempre"><div class="ayuda">Crea escalas: ej. 5% desde 300 pedidos y 8% desde 600.</div></div>
        <div class="f"><label>Estado</label><select class="ctrl" name="estado">${opcion("activo", "Activo", a.estado)}${opcion("pausado", "Pausado", a.estado)}${opcion("finalizado", "Finalizado", a.estado)}</select></div>
        <div class="f"><label>Vigente desde *</label><input class="ctrl" type="date" name="vigente_desde" value="${String(a.vigente_desde || "").slice(0, 10)}"></div>
        <div class="f"><label>Vigente hasta</label><input class="ctrl" type="date" name="vigente_hasta" value="${a.vigente_hasta ? String(a.vigente_hasta).slice(0, 10) : ""}"><div class="ayuda">Vacío = sin fecha de fin.</div></div>
        <div class="f full"><label>Detalle / condiciones</label><textarea class="ctrl" name="descripcion" maxlength="2000" rows="3">${a.descripcion || ""}</textarea></div>
      </div>`,
    onSubmit: async (form) => {
      const r = await api(actual ? `/api/acuerdos/${actual.id}` : "/api/acuerdos", { method: actual ? "PUT" : "POST", body: datosForm(form) });
      return resultado(r) ? r.data.acuerdo : { errores: r.data.errores || {} };
    },
  });
}

// =====================================================================  Listado por tipo

async function renderLista(cont, tipo, h) {
  const { paises } = await opciones();
  const f = { pais: h.pais || "", q: h.q || "", segmento: h.segmento || "", salud: h.salud || "", especial: h.especial || "" };
  const r = await api(`/api/seguimiento-actores/${tipo}?${qs(f)}`);
  if (!r.ok) { cont.innerHTML = String(vacio("fa-triangle-exclamation", "No se pudo cargar", r.data.mensaje)); return; }
  const { filas, resumen, alertas } = r.data;
  const enlace = (extra) => `#/seguimiento?${qs({ tipo, ...f, ...extra })}`;

  encabezado("Seguimiento", `${TIPOS[tipo]}: volumen de pedidos, metas y trato especial`,
    puede("escribir") ? html`<button class="btn btn-ghost btn-sm" id="nuevaEnt"><i class="fas fa-plus"></i> Registrar ${TIPO_UNO[tipo]}</button>` : "");

  cont.innerHTML = String(html`
    ${pestañas(tipo)}
    <div class="chips">
      <a class="chip ${!f.salud && !f.especial ? "activo" : ""}" href="${enlace({ salud: "", especial: "" })}"><b>${numero(resumen.total)}</b> Todos</a>
      ${["creciendo", "estable", "atencion", "en_caida", "inactiva", "sin_datos"].map((s) => html`
        <a class="chip ${f.salud === s ? "activo" : ""}" href="${enlace({ salud: f.salud === s ? "" : s, especial: "" })}"><b>${numero(resumen.porSalud[s])}</b> ${badgeSalud(s)}</a>`)}
      <a class="chip ${f.especial ? "activo" : ""}" href="${enlace({ especial: f.especial ? "" : "1", salud: "" })}"><b>${numero(resumen.especial)}</b> <span class="seg vip"><i class="fas fa-star"></i>Trato especial</span></a>
    </div>

    ${alertas.length ? html`<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Alertas</h3><span class="sub">${alertas.length} por revisar · últimos 30 días vs. 30 anteriores · inactiva = ${r.data.reglas.diasInactividad}+ días sin pedidos</span>
        ${alertas.length > 6 ? html`<div class="der"><button class="btn btn-ghost btn-sm" id="verAlertas">Ver todas</button></div>` : ""}</div>
      <div class="card-body"><ul class="alertas" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${alertas.map((a, i) => html`
        <li class="${a.nivel}" data-id="${a.entidad_id}" ${i >= 6 ? raw("hidden data-extra") : ""}><i class="fas ${iconoAlerta[a.nivel]}"></i><div><b>${a.nombre}</b>${a.especial ? html` <i class="fas fa-star" title="Trato especial" style="color:var(--brand-text);margin:0"></i>` : ""}<br>${a.texto}</div></li>`)}</ul></div></div>` : ""}
        <form class="filtros" id="filtros">
          <input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="salud" value="${f.salud}"><input type="hidden" name="especial" value="${f.especial}">
          <div class="campo"><label>País</label><select class="ctrl" name="pais">${opcion("", "Todos", f.pais)}${paises.map((p) => opcion(p.codigo, p.nombre, f.pais))}</select></div>
          <div class="campo"><label>Segmento</label><select class="ctrl" name="segmento">${opcion("", "Todos", f.segmento)}${Object.entries(SEGMENTOS).map(([k, t]) => opcion(k, t, f.segmento))}</select></div>
          <div class="campo buscador"><label>Buscar</label><input class="ctrl" name="q" value="${f.q}" placeholder="Nombre o ID de Aurora" maxlength="80"></div>
          <button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button>
        </form>
        <div class="card">${filas.length ? html`
          <div class="tabla-wrap"><table class="tabla t-seguimiento">
            <thead><tr><th>${TIPO_UNO[tipo]}</th><th>Salud</th><th>Pedidos del mes</th><th class="num">30 días</th><th class="num">Efectividad</th><th class="num">Dev./canc.</th><th>Último pedido</th><th>Beneficios</th></tr></thead>
            <tbody>${filas.map((e) => html`
              <tr class="clic" data-id="${e.id}">
                <td><div class="nombre">${e.nombre}${e.aurora_id ? html`<span class="id">ID ${e.aurora_id}</span>` : ""}</div>
                  <div class="fila-flex" style="margin-top:3px">${badgeSeg(e.segmento)}${e.pais ? html`<span class="pais"><span class="cod">${e.pais}</span></span>` : ""}${e.responsable ? html`<span class="muted" style="font-size:11.5px"><i class="fas fa-user"></i> ${e.responsable}</span>` : ""}</div></td>
                <td>${badgeSalud(e.salud, e.motivo)}<div class="muted" style="font-size:11.5px;margin-top:3px">${e.motivo}</div></td>
                <td>${barraMeta(e)}</td>
                <td class="num"><b>${numero(e.u30)}</b> ${delta(e.variacion)}</td>
                <td class="num">${e.tasaEntrega == null ? html`<span class="muted">—</span>` : `${Math.round(e.tasaEntrega * 100)}%`}</td>
                <td class="num">${e.tasaPerdida == null ? html`<span class="muted">—</span>` : html`<span class="${e.tasaPerdida >= 0.25 ? "prio-alta" : ""}">${Math.round(e.tasaPerdida * 100)}%</span>`}</td>
                <td class="muted nowrap">${e.ultimo_pedido ? hace(e.ultimo_pedido) : "—"}</td>
                <td>${e.acuerdos_vigentes ? html`<span class="badge b-brand simple"><i class="fas fa-percent"></i>&nbsp;${e.acuerdos_vigentes}</span>` : html`<span class="muted">—</span>`}
                  ${e.siguiente_escala ? html`<div class="muted" style="font-size:11.5px;margin-top:3px">Faltan ${numero(e.siguiente_escala.faltan)} para “${e.siguiente_escala.titulo}”</div>` : ""}</td>
              </tr>`)}</tbody></table></div>`
          : vacio(ICONO_TIPO[tipo], `No hay ${TIPOS[tipo].toLowerCase()} con estos filtros`, "Se registran solos con cada carga de pedidos, o puedes crearlos manualmente.")}
        </div>
    </div>`);

  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/seguimiento?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  $("#nuevaEnt")?.addEventListener("click", async () => { const n = await formEntidad(tipo); if (n) location.hash = `#/seguimiento?id=${n.id}`; });
  $("#verAlertas", cont)?.addEventListener("click", (ev) => { cont.querySelectorAll("[data-extra]").forEach((li) => (li.hidden = false)); ev.currentTarget.remove(); });
  cont.onclick = (e) => { const t = e.target.closest("[data-id]"); if (t) location.hash = `#/seguimiento?id=${t.dataset.id}`; };
}

// =====================================================================  Acuerdos especiales (todos)
async function renderAcuerdos(cont, h) {
  const f = { estado: h.estado ?? "activo", tipoEntidad: h.tipoEntidad || "", q: h.q || "" };
  const r = await api(`/api/acuerdos?${qs(f)}`);
  const lista = r.ok ? r.data.acuerdos : [];
  const recargar = () => renderAcuerdos(cont, paramsHash());
  encabezado("Seguimiento", "Acuerdos especiales: descuentos exclusivos, tarifas y beneficios",
    puede("escribir") ? html`<button class="btn btn-brand btn-sm" id="nuevoAc"><i class="fas fa-plus"></i> Nuevo acuerdo</button>` : "");
  cont.innerHTML = String(html`
    ${pestañas("acuerdos")}
    <form class="filtros" id="filtros">
      <input type="hidden" name="tipo" value="acuerdos">
      <div class="campo"><label>Estado</label><select class="ctrl" name="estado">${opcion("", "Todos", f.estado)}${opcion("activo", "Activos", f.estado)}${opcion("pausado", "Pausados", f.estado)}${opcion("finalizado", "Finalizados", f.estado)}</select></div>
      <div class="campo"><label>Aplica a</label><select class="ctrl" name="tipoEntidad">${opcion("", "Todos", f.tipoEntidad)}${Object.entries(TIPOS).map(([k, t]) => opcion(k, t, f.tipoEntidad))}</select></div>
      <div class="campo buscador"><label>Buscar</label><input class="ctrl" name="q" value="${f.q}" placeholder="Tienda, proveedor o beneficio" maxlength="80"></div>
      <button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button>
    </form>
    <div class="card">${lista.length ? html`<div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Beneficio</th><th>Para</th><th>Tipo</th><th class="num">Valor</th><th>Condición</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((a, i) => html`<tr>
        <td><div class="nombre">${a.titulo}</div><div class="muted" style="font-size:11.5px">${APLICA[a.aplica_a]}${a.creado_por_nombre ? ` · registrado por ${a.creado_por_nombre}` : ""}</div></td>
        <td><a href="#/seguimiento?id=${a.entidad_id}" class="nombre"><i class="fas ${ICONO_TIPO[a.entidad_tipo]} muted"></i> ${a.entidad_nombre}</a> ${badgeSeg(a.entidad_segmento)}</td>
        <td>${TIPOS_ACUERDO[a.tipo]}</td><td class="num"><b>${valorAcuerdo(a)}</b></td>
        <td>${a.umbral_pedidos ? `Desde ${numero(a.umbral_pedidos)} pedidos/mes` : html`<span class="muted">Siempre</span>`}</td>
        <td class="nowrap muted">${fecha(String(a.vigente_desde).slice(0, 10))} – ${a.vigente_hasta ? fecha(String(a.vigente_hasta).slice(0, 10)) : "sin fin"}</td>
        <td>${badgeVig(a.vigencia)}</td>
        <td class="nowrap">${puede("escribir") ? html`<button class="icon-btn" data-editar="${i}" aria-label="Editar"><i class="fas fa-pen"></i></button>` : ""}</td>
      </tr>`)}</tbody></table></div>` : vacio("fa-percent", "Sin acuerdos con estos filtros", "Registra descuentos exclusivos o beneficios para tiendas, proveedores, almacenes o couriers.")}</div>`);
  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/seguimiento?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  $("#nuevoAc")?.addEventListener("click", async () => { if (await formAcuerdo()) recargar(); });
  cont.onclick = async (e) => { const b = e.target.closest("[data-editar]"); if (b && (await formAcuerdo({ actual: lista[Number(b.dataset.editar)] }))) recargar(); };
}

// =====================================================================  Ficha 360
async function renderFicha(cont, id) {
  const r = await api(`/api/seguimiento-actores/ficha/${encodeURIComponent(id)}`);
  if (!r.ok) { cont.innerHTML = String(vacio("fa-circle-question", "No se encontró el registro", r.data.mensaje)); return; }
  const { entidad: e, acuerdos, mensual, contrapartes, integraciones, eventos } = r.data;
  const recargar = () => renderFicha(cont, id);
  const escalas = acuerdos.filter((a) => a.umbral_pedidos && ["vigente", "por_vencer"].includes(a.vigencia)).sort((x, y) => x.umbral_pedidos - y.umbral_pedidos);
  const MES = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
  const escribir = puede("escribir");

  encabezado(e.nombre, `Seguimiento de ${TIPO_UNO[e.tipo]}`, html`<a class="btn btn-ghost btn-sm" href="#/seguimiento?tipo=${e.tipo}"><i class="fas fa-arrow-left"></i> ${TIPOS[e.tipo]}</a>`);

  cont.innerHTML = String(html`
    <div class="ficha-head">
      <div class="icono"><i class="fas ${ICONO_TIPO[e.tipo]}"></i></div>
      <div>
        <h2>${e.nombre}</h2>
        <div class="meta">${badgeSalud(e.salud, e.motivo)} ${badgeSeg(e.segmento)} ${e.aurora_id ? html`<span>ID Aurora ${e.aurora_id}</span>` : html`<span class="badge">Sin vincular a Aurora</span>`}
          ${e.pais ? pais(e.pais) : ""} ${e.responsable ? html`<span><i class="fas fa-user"></i> ${e.responsable}</span>` : html`<span class="muted">Sin responsable</span>`}</div>
        <div class="muted" style="margin-top:6px">${e.motivo}</div>
      </div>
      <div class="acciones-f">
        ${escribir ? html`<button class="btn btn-brand btn-sm" data-plan><i class="fas fa-bullseye"></i> Plan y trato</button>
          <button class="btn btn-ghost btn-sm" data-acuerdo><i class="fas fa-percent"></i> Nuevo acuerdo</button>
          <button class="btn btn-ghost btn-sm" data-datos><i class="fas fa-pen"></i> Datos</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-agendar><i class="fas fa-calendar-plus"></i> Agendar</button>
        ${e.aurora_id ? html`<a class="btn btn-ghost btn-sm" href="#/pedidos?${qs({ [CAMPO_PEDIDO[e.tipo]]: e.aurora_id, desde: hoyIso().slice(0, 8) + "01" })}"><i class="fas fa-box"></i> Pedidos</a>` : ""}
      </div>
    </div>

    ${e.alertas.length ? html`<div class="aviso ${e.alertas[0].nivel === "alta" ? "warn" : "info"}"><i class="fas ${iconoAlerta[e.alertas[0].nivel]}"></i><div>${e.alertas.map((a) => html`${a.texto}<br>`)}</div></div>` : ""}

    <div class="grid g-4">
      <div class="card kpi"><div class="titulo"><i class="fas fa-bullseye"></i>Pedidos del mes</div><div class="valor">${numero(e.mes_actual)}</div>
        <div class="pie">${e.meta_pedidos_mes ? html`<b>${Math.round(e.avanceMeta * 100)}%</b> de la meta (${numero(e.meta_pedidos_mes)}) · proyección ${numero(e.proyeccion)}` : html`Proyección ${numero(e.proyeccion)} · sin meta definida`}</div></div>
      <div class="card kpi"><div class="titulo"><i class="fas fa-calendar"></i>Últimos 30 días</div><div class="valor">${numero(e.u30)}</div>
        <div class="pie">${delta(e.variacion)} vs. 30 días anteriores (${numero(e.p30)})</div></div>
      <div class="card kpi"><div class="titulo"><i class="fas fa-circle-check"></i>Efectividad de entrega</div><div class="valor">${e.tasaEntrega == null ? "—" : `${Math.round(e.tasaEntrega * 100)}%`}</div>
        <div class="pie">${numero(e.ent30)} entregados · ${numero(e.curso30)} en curso</div></div>
      <div class="card kpi"><div class="titulo"><i class="fas fa-rotate-left"></i>Devueltos o cancelados</div><div class="valor">${e.tasaPerdida == null ? "—" : `${Math.round(e.tasaPerdida * 100)}%`}</div>
        <div class="pie">${numero(e.perd30)} pedidos · último pedido ${e.ultimo_pedido ? hace(e.ultimo_pedido) : "—"}</div></div>
    </div>

    <div class="grid g-2-1 mt">
      <div class="card"><div class="card-head"><h3>Pedidos por mes</h3><span class="sub">Últimos 12 meses${e.meta_pedidos_mes ? " · línea punteada = meta" : ""}</span></div>
        <div class="card-body" id="grafico">${mensual.length ? "" : html`<p class="muted">Sin datos (vincula el ID de Aurora para ver su historial).</p>`}</div></div>
      <div class="card"><div class="card-head"><h3>Trato especial</h3></div>
        <div class="card-body">
          <dl class="dl" style="grid-template-columns:110px 1fr">
            <dt>Segmento</dt><dd>${badgeSeg(e.segmento) || "Estándar"}</dd>
            <dt>Beneficios hoy</dt><dd>${e.beneficios_ganados.length ? e.beneficios_ganados.join(" · ") : html`<span class="muted">Ninguno activo</span>`}</dd>
          </dl>
          ${e.condiciones ? html`<div class="condiciones mt">${e.condiciones}</div>` : html`<p class="muted mt">Sin condiciones registradas.</p>`}
          ${escalas.length ? html`<div class="seccion-t">Escala de beneficios este mes</div>
            <div class="escalas">${escalas.map((a) => html`
              <div class="escala ${a.umbral.cumplido ? "lograda" : ""} ${e.siguiente_escala?.titulo === a.titulo ? "actual" : ""}"><span class="punto"></span>
                <strong>${numero(a.umbral_pedidos)} pedidos</strong><span>${a.titulo}</span><br><span>${a.umbral.cumplido ? "✓ Ganado" : `Faltan ${numero(a.umbral.faltan)}`}</span></div>`)}</div>` : ""}
        </div></div>
    </div>

    <div class="card mt"><div class="card-head"><h3>Acuerdos y descuentos</h3><span class="sub">${acuerdos.length} registrados</span></div>
      ${acuerdos.length ? html`<div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Beneficio</th><th>Tipo</th><th class="num">Valor</th><th>Condición</th><th>Progreso del mes</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
        <tbody>${acuerdos.map((a, i) => html`<tr>
          <td><div class="nombre">${a.titulo}</div><div class="muted" style="font-size:11.5px">${APLICA[a.aplica_a]}${a.descripcion ? ` · ${a.descripcion.slice(0, 80)}` : ""}</div></td>
          <td>${TIPOS_ACUERDO[a.tipo]}</td><td class="num"><b>${valorAcuerdo(a)}</b></td>
          <td>${a.umbral_pedidos ? `Desde ${numero(a.umbral_pedidos)} pedidos/mes` : html`<span class="muted">Siempre</span>`}</td>
          <td style="min-width:140px">${a.umbral ? html`<div class="barra-meta"><span class="${a.umbral.cumplido ? "ok" : ""}" style="width:${a.umbral.avance * 100}%"></span></div>
            <div class="muted" style="font-size:11.5px;margin-top:3px">${a.umbral.cumplido ? "Ganado este mes" : `Faltan ${numero(a.umbral.faltan)} pedidos`}</div>` : html`<span class="muted">—</span>`}</td>
          <td class="nowrap muted">${fecha(String(a.vigente_desde).slice(0, 10))} – ${a.vigente_hasta ? fecha(String(a.vigente_hasta).slice(0, 10)) : "sin fin"}</td>
          <td>${badgeVig(a.vigencia)}</td>
          <td class="nowrap">${escribir ? html`<button class="icon-btn" data-editar-ac="${i}" aria-label="Editar"><i class="fas fa-pen"></i></button>` : ""}${puede("admin") ? html`<button class="icon-btn" data-borrar-ac="${i}" aria-label="Eliminar"><i class="fas fa-trash"></i></button>` : ""}</td>
        </tr>`)}</tbody></table></div>`
        : html`<div class="card-body"><p class="muted">Sin acuerdos. ${escribir ? "Usa “Nuevo acuerdo” para registrar un descuento exclusivo o un beneficio por volumen." : ""}</p></div>`}
    </div>

    <div class="grid g-2 mt">
      <div class="card"><div class="card-head"><h3>Con quién opera</h3><span class="sub">Últimos 90 días</span></div>
        <div class="card-body">${contrapartes.length && contrapartes.some((c) => c.filas.length) ? contrapartes.map((c) => html`
          <div class="seccion-t" style="margin-top:0">${TIPOS[c.tipo]}</div>
          ${c.filas.length ? html`<table class="tabla" style="margin-bottom:14px"><tbody>${c.filas.map((x) => html`<tr><td>${x.nombre || "—"} <span class="id">ID ${x.id}</span></td><td class="num">${numero(x.pedidos)} pedidos</td><td class="num muted">${pct(x.entregados, x.pedidos)}% entregados</td></tr>`)}</tbody></table>` : html`<p class="muted">Sin datos.</p>`}`)
          : html`<p class="muted">Sin pedidos en los últimos 90 días.</p>`}
          ${integraciones.length ? html`<div class="seccion-t">Integraciones</div><table class="tabla"><tbody>${integraciones.map((i) => html`<tr class="clic" data-ir="#/integraciones?pais=${i.pais}"><td>${i.proveedor_nombre} · ${i.almacen_nombre || "por definir"}</td><td>${i.pais}</td><td class="num">${i.avance}%</td></tr>`)}</tbody></table>` : ""}
        </div></div>
      <div class="card"><div class="card-head"><h3>Reuniones y tareas</h3></div>
        <div class="card-body">${eventos.length ? html`<ul class="agenda">${eventos.map((ev) => html`<li><div class="fecha"><b>${new Date(ev.inicio).toLocaleDateString("es-PE", { day: "2-digit", timeZone: "America/Lima" })}</b><small>${new Date(ev.inicio).toLocaleDateString("es-PE", { month: "short", timeZone: "America/Lima" })}</small></div>
            <div class="t"><strong>${ev.tipo === "tarea" ? raw('<i class="fas fa-list-check muted"></i> ') : ""}${ev.titulo}</strong><span>${ev.todo_el_dia ? "Todo el día" : fechaHora(ev.inicio)} · ${ev.usuario}</span></div></li>`)}</ul>`
          : html`<p class="muted">Sin reuniones vinculadas. Usa “Agendar”.</p>`}</div></div>
    </div>

    <div class="card mt"><div class="card-head"><h3>Bitácora de seguimiento</h3></div><div class="card-body" id="bitacora"></div></div>`);

  if (mensual.length) {
    graficoBarras($("#grafico", cont), { etiquetas: mensual.map((m) => MES(m.mes)), valores: mensual.map((m) => m.pedidos), nombre: "Pedidos", meta: e.meta_pedidos_mes });
  }
  bitacora($("#bitacora", cont), { recurso: "entidad", id: e.id });
  $("[data-plan]", cont)?.addEventListener("click", async () => { if (await formPlan(e)) recargar(); });
  $("[data-acuerdo]", cont)?.addEventListener("click", async () => { if (await formAcuerdo({ entidad: e })) recargar(); });
  $("[data-datos]", cont)?.addEventListener("click", async () => { if (await formEntidad(e.tipo, e)) recargar(); });
  $("[data-agendar]", cont).addEventListener("click", () => editorEvento({ tipo: "reunion", titulo: `Seguimiento ${TIPO_UNO[e.tipo]} ${e.nombre}`, entidad_id: e.id }));
  cont.onclick = async (ev) => {
    const ed = ev.target.closest("[data-editar-ac]");
    if (ed) { if (await formAcuerdo({ actual: acuerdos[Number(ed.dataset.editarAc)] })) recargar(); return; }
    const bo = ev.target.closest("[data-borrar-ac]");
    if (bo) {
      const a = acuerdos[Number(bo.dataset.borrarAc)];
      if (await confirmar("Eliminar acuerdo", `Se eliminará “${a.titulo}”. Si solo dejó de aplicar, mejor márcalo como finalizado.`, { textoOk: "Eliminar" })
        && resultado(await api(`/api/acuerdos/${a.id}`, { method: "DELETE" }))) recargar();
      return;
    }
    const ir = ev.target.closest("[data-ir]");
    if (ir) location.hash = ir.dataset.ir;
  };
}

export async function render(cont) {
  const h = paramsHash();
  if (h.id) return renderFicha(cont, h.id);
  if (h.tipo === "acuerdos") return renderAcuerdos(cont, h);
  return renderLista(cont, TIPOS[h.tipo] ? h.tipo : "tienda", h);
}
