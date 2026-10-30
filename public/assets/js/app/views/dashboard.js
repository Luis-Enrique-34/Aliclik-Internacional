// Tablero: indicadores del periodo, tendencia diaria, estados y rankings.
import { api, html, raw, $, $$, numero, dinero, pct, hace, fechaHora, hoyIso, GRUPOS, encabezado, opciones, opcion, qs, vacio, iniciales, toast } from "../core.js";
import { graficoLineas, composicion } from "../charts.js";
import { panelIndicadores, ordenar } from "../indicadores.js";

const filtros = { periodo: "30", desde: "", hasta: "", pais: "" };
let dimension = "tiendas";
const ordenRanking = { campo: "pedidos", dir: "desc" };
const CAMPOS_RANKING = {
  pedidos: (f) => f.pedidos, entregados: (f) => f.entregados, efectividad: (f) => (f.pedidos ? f.entregados / f.pedidos : null),
  perdidos: (f) => (f.pedidos ? f.perdidos / f.pedidos : null), en_curso: (f) => f.en_curso, ultimo: (f) => f.ultimo_pedido, nombre: (f) => f.nombre,
};

function rangoDe(f) {
  if (f.periodo === "custom") return { desde: f.desde, hasta: f.hasta };
  if (f.periodo === "mes") return { desde: hoyIso().slice(0, 8) + "01", hasta: hoyIso() };
  return { desde: hoyIso(-(Number(f.periodo) - 1)), hasta: hoyIso() };
}

function delta(actual, anterior) {
  if (!anterior && !actual) return html`<span class="delta igual">sin cambios</span>`;
  if (!anterior) return html`<span class="delta sube">nuevo</span>`;
  const d = Math.round(((actual - anterior) / anterior) * 100);
  return html`<span class="delta ${d > 0 ? "sube" : d < 0 ? "baja" : "igual"}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${Math.abs(d)}%</span>`;
}

const kpi = (icono, titulo, valor, pie) => html`
  <div class="card kpi"><div class="titulo"><i class="fas ${icono}"></i>${titulo}</div><div class="valor">${valor}</div><div class="pie">${pie}</div></div>`;

const DIM = {
  tiendas: ["Tiendas", "tienda_id", "Tienda"], proveedores: ["Proveedores", "proveedor_id", "Proveedor"], almacenes: ["Almacenes", "almacen_id", "Almacén"],
  couriers: ["Couriers", "courier_id", "Courier"], paises: ["Países", "pais", "País"],
};

function tablaRanking(filasOrig, r) {
  const filas = ordenar(filasOrig, CAMPOS_RANKING, ordenRanking.campo, ordenRanking.dir);
  if (!filas.length) return vacio("fa-ranking-star", "Sin datos en el periodo");
  const max = Math.max(...filas.map((f) => f.pedidos));
  const [, campo] = DIM[dimension];
  return html`
    <div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>${DIM[dimension][2]}</th><th class="num">Pedidos</th><th></th><th class="num">Entregados</th><th class="num">En curso</th><th class="num">Dev./canc.</th><th>Último pedido</th></tr></thead>
      <tbody>${filas.map((f) => html`
        <tr class="clic" data-ir="#/pedidos?${qs({ [campo]: f.id ?? "", desde: r.desde, hasta: r.hasta })}">
          <td><span class="nombre">${f.nombre}</span>${f.id != null && dimension !== "paises" ? html`<span class="id">ID ${f.id}</span>` : ""}</td>
          <td class="num"><b>${numero(f.pedidos)}</b></td>
          <td><div class="mini-barra"><span style="width:${(f.pedidos / max) * 100}%"></span></div></td>
          <td class="num">${numero(f.entregados)} <span class="muted">(${pct(f.entregados, f.pedidos)}%)</span></td>
          <td class="num">${numero(f.en_curso)}</td>
          <td class="num">${numero(f.perdidos)} <span class="muted">(${pct(f.perdidos, f.pedidos)}%)</span></td>
          <td class="muted nowrap">${hace(f.ultimo_pedido)}</td>
        </tr>`)}</tbody>
    </table></div>`;
}

export async function render(cont) {
  const { paises } = await opciones();
  const r = rangoDe(filtros);
  const res = await api(`/api/dashboard?${qs({ ...r, pais: filtros.pais })}`);
  if (!res.ok) { cont.innerHTML = String(vacio("fa-triangle-exclamation", "No se pudo cargar el tablero", res.data.mensaje)); return; }
  const d = res.data;
  const k = d.kpis;
  const a = d.kpisAnt;
  const enCurso = k.en_preparacion + k.en_ruta;
  const perdidos = k.devueltos + k.cancelados;
  const unaMoneda = k.monedas <= 1;
  const monedaPais = paises.find((p) => p.codigo === filtros.pais)?.moneda;

  encabezado("Tablero internacional",
    d.ultimaCarga ? `Datos actualizados ${hace(d.ultimaCarga.creado_en)} (${d.ultimaCarga.origen === "sync" ? "sincronización Aurora" : "carga CSV"})` : "Aún no hay datos cargados",
    html`<a class="btn btn-ghost btn-sm" href="/api/pedidos/exportar.csv?${qs({ ...r, pais: filtros.pais })}"><i class="fas fa-file-csv"></i> Exportar</a>`);

  cont.innerHTML = String(html`
    <div class="filtros">
      <div class="campo"><label for="fPeriodo">Periodo</label>
        <select class="ctrl" id="fPeriodo">
          ${opcion("7", "Últimos 7 días", filtros.periodo)}${opcion("30", "Últimos 30 días", filtros.periodo)}
          ${opcion("90", "Últimos 90 días", filtros.periodo)}${opcion("mes", "Mes actual", filtros.periodo)}${opcion("custom", "Personalizado", filtros.periodo)}
        </select></div>
      <div class="campo" ${filtros.periodo === "custom" ? "" : raw("hidden")}><label for="fDesde">Desde</label><input type="date" class="ctrl" id="fDesde" value="${r.desde}" max="${hoyIso()}"></div>
      <div class="campo" ${filtros.periodo === "custom" ? "" : raw("hidden")}><label for="fHasta">Hasta</label><input type="date" class="ctrl" id="fHasta" value="${r.hasta}" max="${hoyIso()}"></div>
      <div class="campo"><label for="fPais">País</label>
        <select class="ctrl" id="fPais">${opcion("", "Todos los países", filtros.pais)}${paises.filter((p) => p.codigo !== "PE").map((p) => opcion(p.codigo, p.nombre, filtros.pais))}</select></div>
      <span class="muted" style="margin-left:auto;font-size:12.5px">Comparado con ${d.rango.anterior.desde.split("-").reverse().join("/")} – ${d.rango.anterior.hasta.split("-").reverse().join("/")}</span>
    </div>

    ${!d.ultimaCarga ? html`<div class="aviso info"><i class="fas fa-circle-info"></i><div><b>Todavía no hay pedidos cargados.</b> Ve a <a href="#/cargas">Cargas de datos</a> para subir el CSV del query de Aurora o activar la sincronización automática.</div></div>` : ""}

    <div class="grid g-4">
      ${kpi("fa-box", "Pedidos ingresados", numero(k.pedidos), html`${delta(k.pedidos, a.pedidos)} vs. periodo anterior (${numero(a.pedidos)})`)}
      ${kpi("fa-circle-check", "Entregados", numero(k.entregados), html`<b>${pct(k.entregados, k.pedidos)}%</b> de efectividad · ${delta(k.entregados, a.entregados)}`)}
      ${kpi("fa-truck-fast", "En curso", numero(enCurso), html`${numero(k.en_preparacion)} en preparación · ${numero(k.en_ruta)} en ruta`)}
      ${kpi("fa-rotate-left", "Devueltos o cancelados", numero(perdidos), html`<b>${pct(perdidos, k.pedidos)}%</b> del total · ${numero(k.sin_clasificar)} sin clasificar`)}
    </div>

    <div class="grid g-4 mt">
      ${kpi("fa-store", "Tiendas activas", numero(k.tiendas), "con al menos un pedido")}
      ${kpi("fa-industry", "Proveedores", numero(k.proveedores), "con pedidos en el periodo")}
      ${kpi("fa-warehouse", "Almacenes", numero(k.almacenes), html`${numero(k.couriers)} couriers operando`)}
      ${kpi("fa-coins", "Monto de pedidos", unaMoneda ? dinero(k.monto, monedaPais || d.rankings.paises[0] && paises.find((p) => p.codigo === d.rankings.paises[0].id)?.moneda) : "Varias monedas", unaMoneda ? html`${numero(k.unidades)} unidades` : "Filtra por país para ver el monto")}
    </div>

    <div id="indPanel" class="mt"></div>

    <div class="grid g-2-1">
      <div class="card"><div class="card-head"><h3>Pedidos por día</h3><span class="sub">Hora de Lima</span></div><div class="card-body" id="grafico"></div></div>
      <div class="card"><div class="card-head"><h3>Estado de los pedidos</h3></div><div class="card-body">${composicion(d.grupos, GRUPOS)}</div>
        <div class="card-head"><h3>Integraciones por país</h3><div class="der"><a href="#/integraciones" class="btn btn-ghost btn-sm">Ver todas</a></div></div>
        <div class="card-body">${d.integraciones.length ? html`<table class="tabla"><tbody>${d.integraciones.map((i) => html`
          <tr class="clic" data-ir="#/integraciones?pais=${i.pais}"><td><span class="pais"><span class="cod">${i.pais}</span>${i.pais_nombre}</span></td>
          <td class="num">${i.integrados}/${i.total}</td><td style="width:40%"><div class="progreso"><span style="width:${i.avance_promedio || 0}%"></span></div></td></tr>`)}</tbody></table>`
          : html`<p class="muted">Sin integraciones registradas.</p>`}</div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Ranking del ecosistema</h3><span class="sub">Clic en una fila para ver sus pedidos</span>
        <div class="der"><div class="tabs" role="tablist">${Object.entries(DIM).map(([key, [txt]]) => html`<button class="tab ${dimension === key ? "activo" : ""}" data-dim="${key}" role="tab">${txt}</button>`)}</div>
          <select class="ctrl ctrl-sm" id="ordRanking" aria-label="Ordenar ranking">
            ${[["pedidos", "Más pedidos"], ["entregados", "Más entregados"], ["efectividad", "Mayor efectividad"], ["perdidos", "Mayor % dev./canc."], ["en_curso", "Más en curso"], ["ultimo", "Pedido más reciente"], ["nombre", "Nombre (A-Z)"]]
              .map(([v, t]) => opcion(v, t, ordenRanking.campo))}
          </select></div></div>
      <div class="card-body" id="ranking">${tablaRanking(d.rankings[dimension], d.rango)}</div>
    </div>

    <div class="card mt"><div class="card-head"><h3>Alertas de seguimiento</h3><span class="sub">Tiendas, proveedores, almacenes y couriers que requieren atención</span>
        <div class="der"><a href="#/seguimiento" class="btn btn-ghost btn-sm">Ir a seguimiento</a></div></div>
      <div class="card-body" id="alertasSeg"><div class="skeleton" style="height:60px"></div></div></div>

    <div class="grid g-2 mt">
      <div class="card"><div class="card-head"><h3>Mi agenda</h3><div class="der"><a href="#/calendario" class="btn btn-ghost btn-sm">Calendario</a></div></div>
        <div class="card-body">${d.agenda.length ? html`<ul class="agenda">${d.agenda.map((e) => {
          const f = new Date(e.inicio);
          return html`<li><div class="fecha"><b>${f.toLocaleDateString("es-PE", { day: "2-digit", timeZone: "America/Lima" })}</b><small>${f.toLocaleDateString("es-PE", { month: "short", timeZone: "America/Lima" })}</small></div>
            <div class="t"><strong>${e.tipo === "tarea" ? raw('<i class="fas fa-list-check muted"></i> ') : ""}${e.titulo}</strong><span>${e.todo_el_dia ? "Todo el día" : fechaHora(e.inicio)}${e.meet_link ? " · Google Meet" : ""}</span></div></li>`;
        })}</ul>` : html`<p class="muted">No tienes reuniones ni tareas próximas.</p>`}</div></div>
      <div class="card"><div class="card-head"><h3>Actividad reciente del equipo</h3></div>
        <div class="card-body">${d.actividad.length ? html`<ul class="bitacora">${d.actividad.map((s) => html`
          <li><span class="avatar">${iniciales(s.usuario || "?")}</span><div><div class="meta"><strong>${s.usuario || "Sistema"}</strong> en <strong>${s.objetivo || s.recurso}</strong> · ${hace(s.creado_en)}</div><div class="texto">${s.comentario}</div></div></li>`)}</ul>`
          : html`<p class="muted">Aún no hay comentarios de seguimiento.</p>`}</div></div>
    </div>`);

  graficoLineas($("#grafico", cont), {
    dias: d.serie.map((s) => s.dia),
    series: [
      { nombre: "Pedidos", clase: "s1", valores: d.serie.map((s) => s.pedidos) },
      { nombre: "Entregados", clase: "s2", valores: d.serie.map((s) => s.entregados) },
      { nombre: "Dev./canc.", clase: "s3", valores: d.serie.map((s) => s.perdidos) },
    ],
  });

  const recargar = () => render(cont);
  $("#fPeriodo", cont).addEventListener("change", (e) => { filtros.periodo = e.target.value; if (filtros.periodo === "custom") { filtros.desde = r.desde; filtros.hasta = r.hasta; } recargar(); });
  $("#fPais", cont).addEventListener("change", (e) => { filtros.pais = e.target.value; recargar(); });
  for (const id of ["#fDesde", "#fHasta"]) {
    $(id, cont).addEventListener("change", () => {
      const desde = $("#fDesde", cont).value, hasta = $("#fHasta", cont).value;
      if (desde && hasta && desde > hasta) return toast("La fecha inicial debe ser menor a la final", "error");
      Object.assign(filtros, { desde, hasta });
      recargar();
    });
  }
  $$("[data-dim]", cont).forEach((b) => b.addEventListener("click", () => {
    dimension = b.dataset.dim;
    $$("[data-dim]", cont).forEach((x) => x.classList.toggle("activo", x === b));
    $("#ranking", cont).innerHTML = String(tablaRanking(d.rankings[dimension], d.rango));
  }));
  $("#ordRanking", cont).addEventListener("change", (e) => {
    ordenRanking.campo = e.target.value;
    ordenRanking.dir = e.target.value === "nombre" ? "asc" : "desc";
    $("#ranking", cont).innerHTML = String(tablaRanking(d.rankings[dimension], d.rango));
  });
  cont.onclick = (e) => { const tr = e.target.closest("[data-ir]"); if (tr) location.hash = tr.dataset.ir; };

  // Medidores, SLA y pronóstico (se cargan aparte para no demorar el tablero)
  panelIndicadores($("#indPanel", cont), "pedidos", { pais: filtros.pais });

  // Las alertas se calculan aparte para que el tablero aparezca de inmediato
  api("/api/seguimiento-actores/alertas?limite=8").then((r) => {
    const caja = $("#alertasSeg", cont);
    if (!caja) return;
    const lista = r.ok ? r.data.alertas : [];
    const TIPO = { tienda: "Tienda", proveedor: "Proveedor", almacen: "Almacén", courier: "Courier" };
    caja.innerHTML = String(lista.length ? html`<ul class="alertas" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${lista.map((a) => html`
      <li class="${a.nivel}" data-ir="#/seguimiento?id=${a.entidad_id}"><i class="fas ${a.nivel === "alta" ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i>
        <div><span class="muted">${TIPO[a.tipo]}</span> · <b>${a.nombre}</b>${a.especial ? raw(' <i class="fas fa-star" title="Trato especial" style="color:var(--brand-text);margin:0"></i>') : ""}<br>${a.texto}</div></li>`)}</ul>`
      : html`<p class="muted">Sin alertas: ningún actor en caída, inactivo o con acuerdos por vencer.</p>`);
  });
}
