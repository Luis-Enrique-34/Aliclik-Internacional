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
