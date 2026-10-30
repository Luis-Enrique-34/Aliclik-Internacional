// =====================================================================
//  Gráfico de líneas en SVG (sin librerías): eje Y desde 0, rejilla
//  tenue, etiquetas directas al final de cada serie, leyenda y tooltip
//  con línea guía al pasar el mouse. Colores validados (daltonismo y
//  contraste) definidos en theme.css como --serie-1..3.
// =====================================================================
import { html, raw, numero, esc } from "./core.js";

function escala(max) {
  if (max <= 0) return { tope: 4, paso: 1 };
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto);
  return { tope: paso * 4, paso };
}

const etiquetaDia = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" });

/**
 * @param {HTMLElement} cont
 * @param {{ dias: string[], series: { nombre: string, clase: string, valores: number[] }[] }} datos
 */
export function graficoLineas(cont, { dias, series }) {
  const W = 860, H = 260, m = { t: 14, r: 92, b: 28, l: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(0, ...series.flatMap((s) => s.valores));
  const { tope, paso } = escala(max);
  const x = (i) => m.l + (dias.length <= 1 ? iw / 2 : (i * iw) / (dias.length - 1));
  const y = (v) => m.t + ih - (v / tope) * ih;

  const ticksY = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticksY.push(v);
  const cadaX = Math.max(1, Math.ceil(dias.length / 8));

  // Etiquetas directas al final, separadas si chocan
  // Se acomodan de abajo hacia arriba para que no choquen entre sí ni con el eje X
  const finales = series.map((s, k) => ({ k, y: Math.min(y(s.valores.at(-1) ?? 0), m.t + ih - 4) })).sort((a, b) => b.y - a.y);
  for (let i = 1; i < finales.length; i++) if (finales[i - 1].y - finales[i].y < 14) finales[i].y = finales[i - 1].y - 14;
  const yEtiqueta = Object.fromEntries(finales.map((f) => [f.k, f.y]));

  cont.innerHTML = String(html`
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${series.map((s) => s.nombre).join(", ")} por día">
        <g class="rejilla">${ticksY.map((v) => html`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"></line>`)}</g>
        <g class="eje">
          ${ticksY.map((v) => html`<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v)}</text>`)}
          ${dias.map((d, i) => (i % cadaX === 0 && (dias.length - 1 - i >= cadaX / 2 || i === dias.length - 1) || i === dias.length - 1 ? html`<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${etiquetaDia(d)}</text>` : ""))}
        </g>
        ${series.map((s, k) => {
          const pts = s.valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return html`
            ${k === 0 ? html`<polygon class="area ${s.clase}" points="${m.l},${y(0)} ${pts} ${x(s.valores.length - 1)},${y(0)}"></polygon>` : ""}
            <polyline class="linea ${s.clase}" points="${pts}"></polyline>
            <text class="etiqueta" x="${x(s.valores.length - 1) + 8}" y="${yEtiqueta[k] + 4}">${s.nombre}: ${numero(s.valores.at(-1) ?? 0)}</text>`;
        })}
        <line class="guia" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"></line>
        <g class="puntos">${series.map((s) => html`<circle class="marca ${s.clase}" r="4.5" cx="0" cy="0" visibility="hidden"></circle>`)}</g>
        <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="captura"></rect>
      </svg>
      <div class="tooltip" hidden></div>
    </div>
    <div class="leyenda">${series.map((s) => html`<span><span class="sw ${s.clase}"></span>${s.nombre} <strong>${numero(s.valores.reduce((a, b) => a + b, 0))}</strong></span>`)}</div>`);

  const svg = cont.querySelector("svg");
  const tip = cont.querySelector(".tooltip");
  const guia = svg.querySelector(".guia");
  const puntos = [...svg.querySelectorAll(".puntos circle")];
  const ocultar = () => { tip.hidden = true; guia.setAttribute("visibility", "hidden"); puntos.forEach((p) => p.setAttribute("visibility", "hidden")); };

  svg.querySelector(".captura").addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(dias.length - 1, Math.round(((px - m.l) / iw) * (dias.length - 1))));
    guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("visibility", "visible");
    series.forEach((s, k) => { puntos[k].setAttribute("cx", x(i)); puntos[k].setAttribute("cy", y(s.valores[i])); puntos[k].setAttribute("visibility", "visible"); });
    tip.innerHTML = `<strong>${esc(new Date(dias[i] + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }))}</strong>` +
      series.map((s) => `<div class="fila"><span><span class="sw ${s.clase}"></span>${esc(s.nombre)}</span><b>${numero(s.valores[i])}</b></div>`).join("");
    tip.hidden = false;
    tip.style.left = `${(x(i) / W) * r.width}px`;
    tip.style.top = `${(Math.min(...series.map((s) => y(s.valores[i]))) / H) * r.height}px`;
  });
  svg.querySelector(".captura").addEventListener("pointerleave", ocultar);
}

/** Barra de composición por grupo de estado + leyenda con valores (sin depender solo del color). */
export function composicion(grupos, etiquetas) {
  const total = grupos.reduce((a, g) => a + g.pedidos, 0);
  if (!total) return raw('<p class="muted">Sin pedidos en el periodo.</p>');
  return html`
    <div class="composicion" role="img" aria-label="Pedidos por estado">
      ${grupos.map((g) => html`<span class="g-${g.grupo}" style="flex:${g.pedidos}" title="${etiquetas[g.grupo] || g.grupo}: ${numero(g.pedidos)}"></span>`)}
    </div>
    <div class="leyenda">
      ${grupos.map((g) => html`<span><span class="punto g-${g.grupo}"></span>${etiquetas[g.grupo] || g.grupo}<strong>${numero(g.pedidos)}</strong> <span class="muted">(${Math.round((g.pedidos / total) * 100)}%)</span></span>`)}
    </div>`;
}

/**
 * Barras verticales (una serie) con línea de meta opcional.
 * @param {HTMLElement} cont
 * @param {{ etiquetas: string[], valores: number[], nombre: string, meta?: number|null, resaltarUltima?: boolean }} datos
 */
export function graficoBarras(cont, { etiquetas, valores, nombre, meta = null, resaltarUltima = true }) {
  const W = 860, H = 240, m = { t: 18, r: 16, b: 28, l: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const { tope, paso } = escala(Math.max(0, meta || 0, ...valores));
  const y = (v) => m.t + ih - (v / tope) * ih;
  const ancho = iw / valores.length;
  const barra = Math.max(6, Math.min(36, ancho * 0.6));
  const ticks = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v);

  cont.innerHTML = String(html`
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${nombre} por mes">
        <g class="rejilla">${ticks.map((v) => html`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"></line>`)}</g>
        <g class="eje">
          ${ticks.map((v) => html`<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v)}</text>`)}
          ${etiquetas.map((t, i) => html`<text x="${m.l + ancho * i + ancho / 2}" y="${H - 8}" text-anchor="middle">${t}</text>`)}
        </g>
        ${valores.map((v, i) => {
          const x = m.l + ancho * i + (ancho - barra) / 2;
          const alto = Math.max(v > 0 ? 2 : 0, m.t + ih - y(v));
          const r = Math.min(4, alto / 2);
          const yTop = m.t + ih - alto;
          // barra con esquinas superiores redondeadas (4 px) y base recta sobre el eje
          const d = alto > 0 ? `M${x},${m.t + ih} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barra - r} Q${x + barra},${yTop} ${x + barra},${yTop + r} V${m.t + ih} Z` : "";
          return html`<path class="barra ${resaltarUltima && i === valores.length - 1 ? "s2" : "s1"}" d="${d}" data-i="${i}"></path>
            ${v > 0 && (i === valores.length - 1 || v === Math.max(...valores)) ? html`<text class="etiqueta" x="${x + barra / 2}" y="${yTop - 6}" text-anchor="middle">${numero(v)}</text>` : ""}`;
        })}
        ${meta ? html`<line class="linea-meta" x1="${m.l}" x2="${W - m.r}" y1="${y(meta)}" y2="${y(meta)}"></line>
          <text class="etiqueta" x="${W - m.r}" y="${y(meta) - 6}" text-anchor="end">Meta ${numero(meta)}</text>` : ""}
        ${valores.map((_, i) => html`<rect class="captura" data-i="${i}" x="${m.l + ancho * i}" y="${m.t}" width="${ancho}" height="${ih}" fill="transparent"></rect>`)}
      </svg>
      <div class="tooltip" hidden></div>
    </div>`);

  const svg = cont.querySelector("svg");
  const tip = cont.querySelector(".tooltip");
  svg.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".captura");
    if (!c) return (tip.hidden = true);
    const i = Number(c.dataset.i);
    const r = svg.getBoundingClientRect();
    tip.innerHTML = `<strong>${esc(etiquetas[i])}</strong><div class="fila"><span>${esc(nombre)}</span><b>${numero(valores[i])}</b></div>` +
      (meta ? `<div class="fila"><span>Meta</span><b>${numero(meta)}</b></div><div class="fila"><span>Avance</span><b>${Math.round((valores[i] / meta) * 100)}%</b></div>` : "");
    tip.hidden = false;
    tip.style.left = `${((m.l + ancho * i + ancho / 2) / W) * r.width}px`;
    tip.style.top = `${(y(valores[i]) / H) * r.height}px`;
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));
}

/** Etiqueta corta para el eje X según el periodo de la serie. */
function etiquetaX(v, periodo) {
  if (periodo === "mes") {
    const [a, m] = v.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return etiquetaDia(v);
}

/**
 * Historia (línea continua) + pronóstico (línea discontinua con banda de confianza).
 * @param {HTMLElement} cont
 * @param {{ historia: {x:string, valor:number}[], futuro: {x:string, valor:number, bajo?:number, alto?:number}[], periodo?: "dia"|"semana"|"mes", unidad?: string }} d
 */
export function graficoPronostico(cont, { historia, futuro = [], periodo = "dia", unidad = "" }) {
  const W = 860, H = 250, m = { t: 16, r: 20, b: 28, l: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const puntos = [...historia.map((p) => ({ ...p, real: true })), ...futuro.map((p) => ({ ...p, real: false }))];
  if (!puntos.length) { cont.innerHTML = '<p class="muted">Aún no hay historia suficiente.</p>'; return; }
  const max = Math.max(0, ...puntos.map((p) => Math.max(p.valor || 0, p.alto || 0)));
  const { tope, paso } = escala(max);
  const n = puntos.length;
  const x = (i) => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => m.t + ih - ((v || 0) / tope) * ih;
  const ticks = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v);
  const cada = Math.max(1, Math.ceil(n / 8));
  const iH = historia.length - 1;
  const linea = (desde, hasta) => puntos.slice(desde, hasta + 1).map((p, k) => `${x(desde + k).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const conBanda = futuro.filter((p) => p.alto != null);
  const i0 = historia.length;
  const banda = conBanda.length
    ? [...futuro.map((p, k) => `${x(i0 + k).toFixed(1)},${y(p.alto ?? p.valor).toFixed(1)}`), ...futuro.map((p, k) => `${x(i0 + k).toFixed(1)},${y(p.bajo ?? p.valor).toFixed(1)}`).reverse()]
    : [];
  if (banda.length && iH >= 0) { banda.unshift(`${x(iH).toFixed(1)},${y(historia[iH].valor).toFixed(1)}`); banda.push(`${x(iH).toFixed(1)},${y(historia[iH].valor).toFixed(1)}`); }

  cont.innerHTML = String(html`
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Historia y pronóstico de ${unidad}">
        <g class="rejilla">${ticks.map((v) => html`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"></line>`)}</g>
        <g class="eje">
          ${ticks.map((v) => html`<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v)}</text>`)}
          ${puntos.map((p, i) => ((i % cada === 0 && n - 1 - i >= cada / 2) || i === n - 1 ? html`<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${etiquetaX(p.x, periodo)}</text>` : ""))}
        </g>
        ${futuro.length && iH >= 0 ? html`<rect class="zona-futuro" x="${x(iH)}" y="${m.t}" width="${W - m.r - x(iH)}" height="${ih}"></rect>
          <text class="etiqueta-futuro" x="${x(iH) + 6}" y="${m.t + 12}">Pronóstico</text>` : ""}
        ${banda.length ? html`<polygon class="banda" points="${banda.join(" ")}"></polygon>` : ""}
        ${iH >= 0 ? html`<polygon class="area s1" points="${m.l},${y(0)} ${linea(0, iH)} ${x(iH)},${y(0)}"></polygon>
          <polyline class="linea s1" points="${linea(0, iH)}"></polyline>` : ""}
        ${futuro.length ? html`<polyline class="linea pron" points="${linea(Math.max(0, iH), n - 1)}"></polyline>` : ""}
        <line class="guia" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"></line>
        <circle class="marca s1" r="4.5" cx="0" cy="0" visibility="hidden"></circle>
        <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="captura"></rect>
      </svg>
      <div class="tooltip" hidden></div>
    </div>
    <div class="leyenda"><span><span class="sw s1"></span>Real</span>${futuro.length ? html`<span><span class="sw pron"></span>Pronóstico</span>` : ""}${banda.length ? html`<span><span class="sw banda"></span>Rango probable (80 %)</span>` : ""}</div>`);

  const svg = cont.querySelector("svg");
  const tip = cont.querySelector(".tooltip");
  const guia = svg.querySelector(".guia");
  const marca = svg.querySelector(".marca");
  svg.querySelector(".captura").addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    const p = puntos[i];
    guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("visibility", "visible");
    marca.setAttribute("cx", x(i)); marca.setAttribute("cy", y(p.valor)); marca.setAttribute("visibility", "visible");
    marca.setAttribute("class", `marca ${p.real ? "s1" : "pron"}`);
    tip.innerHTML = `<strong>${esc(periodo === "semana" ? `Semana del ${etiquetaX(p.x, "dia")}` : etiquetaX(p.x, periodo))}</strong>` +
      `<div class="fila"><span>${p.real ? "Real" : "Pronóstico"}</span><b>${numero(p.valor)}</b></div>` +
      (p.alto != null ? `<div class="fila"><span>Rango</span><b>${numero(p.bajo)} – ${numero(p.alto)}</b></div>` : "");
    tip.hidden = false;
    tip.style.left = `${(x(i) / W) * r.width}px`;
    tip.style.top = `${(y(p.valor) / H) * r.height}px`;
  });
  svg.querySelector(".captura").addEventListener("pointerleave", () => { tip.hidden = true; guia.setAttribute("visibility", "hidden"); marca.setAttribute("visibility", "hidden"); });
}

/**
 * Medidor semicircular (0–100 %) con marca de meta. Devuelve SVG listo para insertar.
 * @param {number|null} valor @param {{meta?:number|null, estado?:string}} op
 */
export function medidor(valor, { meta = null, estado = "neutro" } = {}) {
  const R = 52, cx = 64, cy = 62, L = Math.PI * R;
  const v = valor == null ? 0 : Math.max(0, Math.min(100, valor));
  const arco = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`;
  const ang = (p) => Math.PI * (1 - p / 100);
  const mx = (p, r) => cx + r * Math.cos(ang(p)), my = (p, r) => cy - r * Math.sin(ang(p));
  return html`<svg class="medidor m-${estado}" viewBox="0 0 128 72" aria-hidden="true">
      <path class="pista" d="${arco}"></path>
      ${v > 0 ? html`<path class="valor" d="${arco}" stroke-dasharray="${(L * v) / 100} ${L}"></path>` : ""}
      ${meta != null && meta <= 100 ? html`<line class="meta" x1="${mx(meta, R - 9)}" y1="${my(meta, R - 9)}" x2="${mx(meta, R + 9)}" y2="${my(meta, R + 9)}"></line>` : ""}
    </svg>`;
}
