// =====================================================================
//  PANEL DE INDICADORES reutilizable (todos los módulos):
//  medidores con meta, KPI/SLA con semáforo, hallazgos en texto,
//  pronóstico con banda de confianza y desgloses. Se puede ocultar
//  (se recuerda por módulo), ver en pantalla completa o imprimir/PDF.
// =====================================================================
import { api, html, raw, $, numero, dinero, fecha, qs, esc } from "./core.js";
import { graficoPronostico, medidor } from "./charts.js";

const ESTADO_TXT = { ok: "Bien", warn: "Revisar", danger: "Atender", neutro: "" };
const ICONO_H = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", danger: "fa-circle-exclamation", info: "fa-circle-info" };

const clave = (m) => `alc-ind-${m}`;
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Valor con su unidad, listo para mostrar. */
export function formatear(v, formato, extra = "") {
  if (v == null || Number.isNaN(v)) return "—";
  switch (formato) {
    case "pct": return `${numero(v)} %`;
    case "dias": return `${numero(v)} d`;
    case "horas": return `${numero(v)} h`;
    case "seg": return `${numero(v)} s`;
    case "moneda": return dinero(v, extra);
    case "fecha": return fecha(v);
    default: return numero(v);
  }
}

function textoMeta(k) {
  if (k.meta == null) return "";
  const u = { pct: " %", dias: " d", horas: " h" }[k.formato] || "";
  return `Meta ${k.tipo === "max" ? "≤" : "≥"} ${numero(k.meta)}${u}`;
}

const tarjetaMedidor = (k) => html`
  <div class="ind-medidor e-${k.estado}" title="${[k.ayuda, textoMeta(k)].filter(Boolean).join(" · ")}">
    ${medidor(k.valor, { meta: k.tipo === "min" || k.tipo === "max" ? k.meta : null, estado: k.estado })}
    <div class="ind-valor">${formatear(k.valor, k.formato)}</div>
    <div class="ind-titulo">${k.titulo}</div>
    <div class="ind-pie">${k.meta != null ? html`<span class="ind-chip e-${k.estado}">${textoMeta(k)}</span>` : ""}${k.detalle ? html`<span class="muted">${k.detalle}</span>` : ""}</div>
  </div>`;

const tarjetaKpi = (k) => html`
  <div class="ind-kpi e-${k.estado}" title="${[k.ayuda, textoMeta(k)].filter(Boolean).join(" · ")}">
    <div class="ind-titulo">${k.titulo}</div>
    <div class="ind-valor">${formatear(k.valor, k.formato, k.formato === "moneda" ? k.detalle : "")}</div>
    <div class="ind-pie">
      ${k.estado !== "neutro" ? html`<span class="ind-chip e-${k.estado}"><i class="fas ${ICONO_H[k.estado === "neutro" ? "info" : k.estado]}"></i>${k.meta != null ? textoMeta(k) : ESTADO_TXT[k.estado]}</span>` : ""}
      ${k.detalle && k.formato !== "moneda" ? html`<span class="muted">${k.detalle}</span>` : ""}
    </div>
  </div>`;

function desglose(d) {
  const max = Math.max(1, d.total || 0, ...d.items.map((i) => Number(i.valor) || 0));
  return html`<div class="ind-desglose">
    <h4>${d.titulo}</h4>
    ${d.items.length ? html`<ul>${d.items.map((i) => html`<li>
      <span class="et" title="${i.clave}">${i.clave}</span>
      <span class="barra"><span style="width:${Math.max(2, ((Number(i.valor) || 0) / max) * 100)}%"></span></span>
      <b>${numero(i.valor)}${d.unidad || ""}</b>${i.detalle ? html`<span class="muted">${i.detalle}</span>` : ""}
    </li>`)}</ul>` : html`<p class="muted">Sin datos.</p>`}
  </div>`;
}

/**
 * Dibuja el panel de indicadores de un módulo dentro de `cont`.
 * @param {HTMLElement} cont
 * @param {string} modulo pedidos | seguimiento | integraciones | observaciones | calendario | usuarios | auditoria | cargas
 * @param {object} filtros parámetros que entiende /api/indicadores/:modulo (pais, tipo, tienda_id…)
 */
export async function panelIndicadores(cont, modulo, filtros = {}) {
  if (!cont) return;
  const oculto = leer(clave(modulo)) === "0";
  cont.classList.add("ind-panel");
  cont.innerHTML = String(html`<div class="card"><div class="card-body"><div class="skeleton" style="height:120px"></div></div></div>`);
  const r = await api(`/api/indicadores/${modulo}?${qs(filtros)}`);
  if (!r.ok) { cont.innerHTML = ""; return; } // sin permiso o error: el módulo sigue funcionando sin el panel
  const d = r.data;
  const medidores = d.kpis.filter((k) => k.medidor);
  const resto = d.kpis.filter((k) => !k.medidor);
  const p = d.pronostico;

  cont.innerHTML = String(html`
    <section class="card ind ${oculto ? "plegado" : ""}" aria-label="${d.titulo}">
      <div class="card-head ind-head">
        <h3><i class="fas fa-gauge-high"></i> ${d.titulo}</h3>
        <span class="sub">${d.periodo}</span>
        <div class="der fila-flex">
          <button class="btn btn-ghost btn-sm" data-ind="completa" title="Ver en pantalla completa"><i class="fas fa-expand"></i><span class="ocultar-movil"> Presentar</span></button>
          <button class="btn btn-ghost btn-sm" data-ind="imprimir" title="Imprimir o guardar como PDF"><i class="fas fa-print"></i><span class="ocultar-movil"> PDF</span></button>
          <button class="btn btn-ghost btn-sm" data-ind="plegar" aria-expanded="${oculto ? "false" : "true"}">
            <i class="fas ${oculto ? "fa-chevron-down" : "fa-chevron-up"}"></i><span class="ocultar-movil"> ${oculto ? "Mostrar" : "Ocultar"}</span></button>
        </div>
      </div>
      <div class="card-body ind-cuerpo">
        <div class="ind-tarjetas">${medidores.map(tarjetaMedidor)}${resto.map(tarjetaKpi)}</div>
        ${d.hallazgos?.length ? html`<ul class="ind-hallazgos">${d.hallazgos.map((h) => html`<li class="h-${h.nivel}"><i class="fas ${ICONO_H[h.nivel] || ICONO_H.info}"></i><span>${h.texto}</span></li>`)}</ul>` : ""}
        ${p && p.historia?.length ? html`
          <div class="ind-pron">
            <div class="ind-pron-graf"><h4>${p.titulo}</h4><div data-pron></div>${p.metodo ? html`<p class="ind-metodo"><i class="fas fa-flask"></i> Método: ${p.metodo}.</p>` : ""}</div>
            ${p.resumen?.length ? html`<div class="ind-pron-res">${p.resumen.map((x) => html`
              <div><span>${x.etiqueta}</span><b>${formatear(x.valor, x.formato)}</b>${x.detalle ? html`<small>${x.detalle}</small>` : ""}</div>`)}</div>` : ""}
          </div>` : ""}
        ${d.desgloses?.length ? html`<div class="ind-desgloses">${d.desgloses.map(desglose)}</div>` : ""}
        <p class="ind-nota muted">Pasa el mouse sobre cada indicador para ver cómo se calcula. Las metas se ajustan en <code>src/config/metas.js</code>.</p>
      </div>
    </section>`);

  if (p && p.historia?.length) graficoPronostico($("[data-pron]", cont), { historia: p.historia, futuro: p.futuro, periodo: p.periodo || "dia", unidad: p.unidad });

  const seccion = $(".ind", cont);
  cont.querySelector(".ind-head").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ind]");
    if (!b) return;
    if (b.dataset.ind === "plegar") {
      const plegado = seccion.classList.toggle("plegado");
      guardar(clave(modulo), plegado ? "0" : "1");
      b.setAttribute("aria-expanded", String(!plegado));
      b.innerHTML = `<i class="fas ${plegado ? "fa-chevron-down" : "fa-chevron-up"}"></i><span class="ocultar-movil"> ${plegado ? "Mostrar" : "Ocultar"}</span>`;
    } else if (b.dataset.ind === "imprimir") {
      seccion.classList.remove("plegado");
      document.body.classList.add("imprimiendo-ind");
      seccion.classList.add("a-imprimir");
      const fin = () => { document.body.classList.remove("imprimiendo-ind"); seccion.classList.remove("a-imprimir"); window.removeEventListener("afterprint", fin); };
      window.addEventListener("afterprint", fin);
      window.print();
      setTimeout(fin, 1500);
    } else if (b.dataset.ind === "completa") {
      seccion.classList.remove("plegado");
      if (document.fullscreenElement) document.exitFullscreen?.();
      else seccion.requestFullscreen?.().catch(() => {});
    }
  });
}

// ------------------------------------------------------------- Ordenar listas (todos los módulos)
/**
 * Selector "Ordenar por" + dirección. Devuelve el HTML; leer el orden con leerOrden(form).
 * @param {[string,string][]} opciones [valor, texto]
 */
export function selectorOrden(opciones, actual = "", dir = "desc") {
  return html`<div class="f orden-f">
      <label for="orden">Ordenar por</label>
      <div class="fila-flex orden-ctrl">
        <select class="ctrl" name="orden" id="orden">${opciones.map(([v, t]) => html`<option value="${v}" ${v === actual ? raw("selected") : ""}>${t}</option>`)}</select>
        <select class="ctrl dir" name="dir" aria-label="Dirección">
          <option value="desc" ${dir === "desc" ? raw("selected") : ""}>↓ Mayor primero</option>
          <option value="asc" ${dir === "asc" ? raw("selected") : ""}>↑ Menor primero</option>
        </select>
      </div>
    </div>`;
}

/**
 * Ordena filas en el navegador según una función de acceso por campo.
 * @param {object[]} filas @param {Record<string,(f:object)=>any>} campos @param {string} orden @param {"asc"|"desc"} dir
 */
export function ordenar(filas, campos, orden, dir = "desc") {
  const get = campos[orden];
  if (!get) return filas;
  const s = dir === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1; // vacíos siempre al final
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * s;
    return String(x).localeCompare(String(y), "es", { numeric: true, sensitivity: "base" }) * s;
  });
}

export { esc };
