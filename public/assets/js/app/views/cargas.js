// Cargas de datos: subir el CSV del query de Aurora, historial y clasificación de estados.
import { api, html, raw, $, $$, numero, fechaHora, hace, encabezado, opcion, vacio, puede, toast, GRUPOS, badgeGrupo, resultado } from "../core.js";

const MAX_MB = 4;

async function subir(archivo, forzar = false, cont) {
  if (!/\.(csv|txt|tsv)$/i.test(archivo.name)) return toast("Selecciona un archivo .csv", "error");
  if (archivo.size > MAX_MB * 1024 * 1024) return toast(`El archivo supera ${MAX_MB} MB. Reduce el rango de días o usa la sincronización automática.`, "error");
  const zona = $("#zona", cont);
  zona.innerHTML = '<i class="fas fa-circle-notch spin"></i><h3>Procesando…</h3><p>Validando filas y actualizando pedidos</p>';
  const texto = await archivo.text();
  const r = await api(`/api/cargas${forzar ? "?forzar=1" : ""}`, { method: "POST", texto, headers: { "X-Nombre-Archivo": encodeURIComponent(archivo.name).slice(0, 150) } });
  if (r.status === 409 && r.data.errores?.duplicado) {
    toast(r.data.mensaje, "error");
    $("#forzarFila", cont).hidden = false;
    $("#forzarFila", cont).dataset.listo = "1";
    window.__archivoPendiente = archivo;
    return render(cont, null, true);
  }
  if (!r.ok) {
    toast(r.data.mensaje + (r.data.errores?.detalle ? ` (${r.data.errores.detalle})` : ""), "error");
    return render(cont);
  }
  const c = r.data.carga;
  toast(r.data.mensaje);
  await render(cont);
  if (c.errores?.length) {
    $("#resultado", cont).innerHTML = String(html`<div class="aviso warn"><i class="fas fa-triangle-exclamation"></i><div><b>${c.rechazadas} filas rechazadas.</b> Primeros motivos:<br>${c.errores.slice(0, 8).map((e) => html`Fila ${e.fila}: ${e.error}<br>`)}</div></div>`);
  }
}

export async function render(cont, _ctx, mantenerForzar = false) {
  const [cg, est] = await Promise.all([api("/api/cargas"), api("/api/estados")]);
  const cargas = cg.ok ? cg.data.cargas : [];
  const estados = est.ok ? est.data.estados : [];
  const escribir = puede("escribir");

  encabezado("Cargas de datos", cargas[0] ? `Última carga ${hace(cargas[0].creado_en)}` : "Sin cargas todavía");

  cont.innerHTML = String(html`
    <div class="grid g-2-1">
      <div>
        ${escribir ? html`
        <div class="card"><div class="card-head"><h3>Subir pedidos del día</h3><span class="sub">CSV exportado desde Aurora · máx. ${MAX_MB} MB</span></div>
          <div class="card-body">
            <label class="dropzone" id="zona" tabindex="0">
              <i class="fas fa-cloud-arrow-up"></i><h3>Arrastra aquí el CSV o haz clic para elegirlo</h3>
              <p>Si un pedido ya existe se actualiza su estado; si es nuevo se agrega. Nunca se duplica.</p>
              <input type="file" id="archivo" accept=".csv,.txt,.tsv,text/csv" hidden>
            </label>
            <div class="fila-flex mt" id="forzarFila" ${mantenerForzar ? "" : raw("hidden")}>
              <span class="muted">Este archivo ya se cargó antes.</span><button class="btn btn-ghost btn-sm" id="forzar"><i class="fas fa-rotate"></i> Cargar de todos modos</button>
            </div>
            <div id="resultado" class="mt"></div>
          </div></div>` : html`<div class="aviso info"><i class="fas fa-lock"></i><div>Tu rol es de <b>lectura</b>: puedes ver el historial, pero solo editores y administradores cargan datos.</div></div>`}

        <div class="card mt"><div class="card-head"><h3>Historial de cargas</h3></div>
          ${cargas.length ? html`<div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Fecha</th><th>Origen</th><th>Archivo</th><th class="num">Filas</th><th class="num">Nuevos</th><th class="num">Actualizados</th><th class="num">Rechazados</th><th>Pedidos entre</th><th>Usuario</th></tr></thead>
            <tbody>${cargas.map((c) => html`<tr>
              <td class="nowrap">${fechaHora(c.creado_en)}</td>
              <td>${c.origen === "sync" ? html`<span class="badge b-brand">Sync Aurora</span>` : html`<span class="badge">CSV</span>`}</td>
              <td class="truncar">${c.archivo || "—"}</td><td class="num">${numero(c.filas_total)}</td>
              <td class="num">${numero(c.insertadas)}</td><td class="num">${numero(c.actualizadas)}</td>
              <td class="num">${c.rechazadas ? html`<span class="badge b-warn" title="${(c.errores || []).slice(0, 5).map((e) => `Fila ${e.fila}: ${e.error}`).join(" | ")}">${numero(c.rechazadas)}</span>` : "0"}</td>
              <td class="muted nowrap">${c.fecha_desde ? `${fechaHora(c.fecha_desde)} – ${fechaHora(c.fecha_hasta)}` : "—"}</td>
              <td>${c.usuario || html`<span class="muted">Automático</span>`}</td></tr>`)}</tbody></table></div>`
          : html`<div class="card-body">${vacio("fa-database", "Aún no hay cargas")}</div>`}
        </div>
      </div>

      <div>
        <div class="card"><div class="card-head"><h3>¿Cómo actualizar los datos?</h3></div>
          <div class="card-body">
            <ol class="pasos">
              <li><div>Abre <b>DBeaver o MySQL Workbench</b> con tu usuario de solo lectura de Aurora.</div></li>
              <li><div>Ejecuta el query <code>database/aurora/pedidos_internacional.sql</code> (trae los últimos 45 días de pedidos fuera de Perú).</div></li>
              <li><div>Exporta el resultado a <b>CSV (UTF-8, con encabezados)</b>.</div></li>
              <li><div>Súbelo aquí. Los estados nuevos se clasifican solos; revísalos abajo.</div></li>
            </ol>
            <div class="aviso info mt"><i class="fas fa-bolt"></i><div><b>Automático (recomendado):</b> <code>npm run sync:aurora -- --cada 30</code> ejecuta el mismo query y actualiza el tablero sin CSV. Ver <code>docs/SINCRONIZACION.md</code>.</div></div>
          </div></div>

        <div class="card mt"><div class="card-head"><h3>Estados de pedido</h3><span class="sub">Cómo se agrupan en el tablero</span></div>
          ${estados.length ? html`<div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Estado en Aurora</th><th class="num">Pedidos</th><th>Grupo</th></tr></thead>
            <tbody>${estados.map((e) => html`<tr>
              <td><div class="nombre">${e.estado_label || e.estado_codigo}</div><div class="muted" style="font-size:11.5px">${e.estado_codigo}${e.manual ? " · ajustado a mano" : ""}</div></td>
              <td class="num">${numero(e.pedidos)}</td>
              <td>${escribir ? html`<select class="ctrl" data-estado="${e.estado_codigo}" style="height:32px">${Object.entries(GRUPOS).map(([k, t]) => opcion(k, t, e.grupo))}</select>` : badgeGrupo(e.grupo)}</td></tr>`)}</tbody></table></div>`
          : html`<div class="card-body"><p class="muted">Aparecerán después de la primera carga.</p></div>`}
        </div>
      </div>
    </div>`);

  if (!escribir) return;
  const zona = $("#zona", cont);
  const input = $("#archivo", cont);
  input.addEventListener("change", () => input.files[0] && subir(input.files[0], false, cont));
  zona.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && input.click());
  ["dragenter", "dragover"].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add("encima"); }));
  ["dragleave", "drop"].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove("encima"); }));
  zona.addEventListener("drop", (e) => e.dataTransfer.files[0] && subir(e.dataTransfer.files[0], false, cont));
  $("#forzar", cont)?.addEventListener("click", () => window.__archivoPendiente && subir(window.__archivoPendiente, true, cont));
  $$("[data-estado]", cont).forEach((s) => s.addEventListener("change", async () => {
    resultado(await api(`/api/estados/${encodeURIComponent(s.dataset.estado)}`, { method: "PUT", body: { grupo: s.value } }));
  }));
}
