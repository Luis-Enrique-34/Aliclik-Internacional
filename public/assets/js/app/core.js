// =====================================================================
//  Núcleo del frontend: API, plantillas seguras (anti-XSS), formatos,
//  catálogos y componentes reutilizables (toast, modal, drawer).
// =====================================================================
export const estado = { usuario: null, opciones: null };

// ------------------------------------------------------------- API
/** Llama a la API con la cookie de sesión. Si la sesión expiró (401) vuelve al login. */
export async function api(url, { method = "GET", body, texto, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: texto != null ? { "Content-Type": "text/csv", ...headers } : body ? { "Content-Type": "application/json", ...headers } : headers,
      body: texto != null ? texto : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { mensaje: "No se pudo conectar con el servidor." } };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.replace("login.html?expirada=1");
  return { ok: res.ok, status: res.status, data };
}

// ------------------------------------------------------------- Plantillas seguras
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
class Raw { constructor(v) { this.v = v; } toString() { return this.v; } }
/** Marca HTML generado por nosotros (nunca datos del usuario) para no escaparlo. */
export const raw = (v) => new Raw(v);

/** Plantilla con escape automático: todo valor interpolado se escapa salvo raw()/html``. */
export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.v;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.v : esc(x))).join("");
      else if (v === false || v == null) out += "";
      else out += esc(v);
    }
  });
  return raw(out);
}

/** Solo enlaces http(s): evita "javascript:" en href/src con datos externos. */
export const urlSegura = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "");

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// ------------------------------------------------------------- Formatos
const nf = new Intl.NumberFormat("es-PE");
export const numero = (n) => nf.format(Number(n || 0));
export const compacto = (n) => new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n || 0));
export function dinero(n, moneda) {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency: moneda || "USD", maximumFractionDigits: 2 }).format(Number(n || 0));
  } catch {
    return `${moneda || ""} ${nf.format(Number(n || 0))}`;
  }
}
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const TZ = "America/Lima";
export const fecha = (v) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }) : "—");
export const fechaHora = (v) => (v ? new Date(v).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "—");
export const hora = (v) => new Date(v).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export function hace(v) {
  if (!v) return "—";
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ayer";
  return `hace ${Math.floor(s / 86400)} días`;
}
export const iniciales = (n = "") => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
/** "AAAA-MM-DD" de hoy (Lima) ± días */
export function hoyIso(dias = 0) {
  const d = new Date(Date.now() - 5 * 3600 * 1000 + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------- Catálogos
export const GRUPOS = {
  pendiente: "Pendiente", en_proceso: "En preparación", en_ruta: "En ruta",
  entregado: "Entregado", devuelto: "Devuelto / rechazado", cancelado: "Cancelado", otro: "Sin clasificar",
};
export const GRUPO_BADGE = { pendiente: "", en_proceso: "b-brand", en_ruta: "b-info", entregado: "b-ok", devuelto: "b-warn", cancelado: "b-danger", otro: "" };
export const badgeGrupo = (g, texto) => html`<span class="badge ${GRUPO_BADGE[g] || ""}">${texto || GRUPOS[g] || g}</span>`;

export const ESTADO_INT = { pendiente: ["Pendiente", ""], en_proceso: ["En proceso", "b-info"], integrado: ["Integrado", "b-ok"], pausado: ["Pausado", "b-warn"] };
export const ESTADO_OBS = { abierta: ["Abierta", "b-warn"], en_proceso: ["En proceso", "b-info"], resuelta: ["Resuelta", "b-ok"], descartada: ["Descartada", ""] };
export const badge = (mapa, k) => html`<span class="badge ${mapa[k]?.[1] || ""}">${mapa[k]?.[0] || k}</span>`;
export const ROLES = { admin: "Administrador", editor: "Editor", lector: "Lector" };
export const TIPOS = { tienda: "Tiendas", proveedor: "Proveedores", almacen: "Almacenes", courier: "Couriers" };
export const TIPO_UNO = { tienda: "tienda", proveedor: "proveedor", almacen: "almacén", courier: "courier" };
export const CHECKS = [
  ["grupo_wsp", "Grupo WhatsApp", "fa-brands fa-whatsapp"], ["conf_sistemas", "Configuración en sistemas", "fa-gear"],
  ["capacitacion", "Capacitación", "fa-chalkboard-user"], ["catalogo", "Catálogo", "fa-box-open"],
  ["despacho", "Despacho", "fa-truck-fast"], ["liquidaciones", "Liquidaciones", "fa-money-bill-transfer"],
];

export const puede = (accion) => {
  const rol = estado.usuario?.rol;
  if (accion === "escribir") return rol === "admin" || rol === "editor";
  if (accion === "admin") return rol === "admin";
  return true;
};

export async function opciones() {
  if (!estado.opciones) {
    const r = await api("/api/opciones");
    estado.opciones = r.ok ? r.data : { paises: [], usuarios: [] };
  }
  return estado.opciones;
}
export const nombrePais = (cod) => estado.opciones?.paises.find((p) => p.codigo === cod)?.nombre || cod || "—";
export const pais = (cod) => (cod ? html`<span class="pais"><span class="cod">${cod}</span>${nombrePais(cod)}</span>` : html`<span class="muted">—</span>`);

// ------------------------------------------------------------- Topbar
export function encabezado(titulo, subtitulo = "", acciones = "") {
  $("#titulo").textContent = titulo;
  $("#subtitulo").textContent = subtitulo;
  $("#accionesVista").innerHTML = String(acciones);
  document.title = `${titulo} | Aliclik Internacional`;
}

// ------------------------------------------------------------- Toasts
export function toast(texto, tipo = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${tipo === "error" ? "error" : ""}`;
  el.innerHTML = `<i class="fas ${tipo === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span></span>`;
  el.querySelector("span").textContent = texto;
  $("#toasts").append(el);
  setTimeout(() => { el.classList.add("saliendo"); setTimeout(() => el.remove(), 300); }, 4200);
}

// ------------------------------------------------------------- Formularios
export function cargando(btn, si) {
  if (!btn) return;
  btn.disabled = si;
  if (si) { btn.dataset.html = btn.innerHTML; btn.innerHTML = '<i class="fas fa-circle-notch spin"></i> Guardando…'; }
  else if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
}
export function limpiarErrores(form) {
  $$(".err", form).forEach((e) => e.remove());
  $$(".invalido", form).forEach((e) => e.classList.remove("invalido"));
}
export function mostrarErrores(form, errores = {}) {
  let primero = null;
  for (const [campo, msg] of Object.entries(errores)) {
    const input = form.querySelector(`[name="${CSS.escape(campo)}"]`);
    if (!input) { toast(msg, "error"); continue; }
    input.classList.add("invalido");
    const d = document.createElement("div");
    d.className = "err";
    d.textContent = msg;
    input.closest(".f")?.append(d);
    primero ??= input;
  }
  primero?.focus();
}
/** Lee un formulario: checkboxes → boolean, el resto → texto. */
export function datosForm(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") d[el.name] = el.checked;
    else d[el.name] = el.value.trim();
  }
  return d;
}
export const opcion = (valor, texto, sel) => html`<option value="${valor}" ${String(sel ?? "") === String(valor) ? raw("selected") : ""}>${texto}</option>`;

/**
 * Modal con formulario. `onSubmit(form)` devuelve true para cerrar, o { errores } para marcar campos.
 */
export function modal({ titulo, cuerpo, textoOk = "Guardar", claseOk = "btn-brand", onSubmit, ancho = false, textoCancelar = "Cancelar" }) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = String(html`
      <form class="modal ${ancho ? "ancho" : ""}" role="dialog" aria-modal="true" novalidate>
        <div class="modal-head"><h3>${titulo}</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>
        <div class="modal-body">${cuerpo}</div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cerrar>${textoCancelar}</button>
          ${onSubmit ? html`<button type="submit" class="btn ${claseOk}">${textoOk}</button>` : ""}
        </div>
      </form>`);
    const form = ov.querySelector("form");
    const cerrar = (v) => { ov.remove(); document.removeEventListener("keydown", tecla); window.removeEventListener("hashchange", nav); resolve(v); };
    const tecla = (e) => e.key === "Escape" && cerrar(null);
    const nav = () => cerrar(null);
    document.addEventListener("keydown", tecla);
    window.addEventListener("hashchange", nav);
    ov.addEventListener("mousedown", (e) => e.target === ov && cerrar(null));
    $$("[data-cerrar]", ov).forEach((b) => b.addEventListener("click", () => cerrar(null)));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      limpiarErrores(form);
      const btn = form.querySelector('button[type="submit"]');
      cargando(btn, true);
      const r = await onSubmit(form);
      cargando(btn, false);
      if (r?.errores) mostrarErrores(form, r.errores);
      else if (r) cerrar(r);
    });
    document.body.append(ov);
    setTimeout(() => form.querySelector("input:not([type=hidden]), select, textarea")?.focus(), 50);
  });
}

export function confirmar(titulo, mensaje, { textoOk = "Confirmar", claseOk = "btn-danger" } = {}) {
  return modal({ titulo, cuerpo: html`<p class="muted">${mensaje}</p>`, textoOk, claseOk, onSubmit: async () => true });
}

/** Panel lateral derecho para detalles. */
export function drawer() {
  const ov = document.createElement("div");
  ov.className = "overlay drawer-overlay";
  ov.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-body"><div class="skeleton"></div></div></aside>`;
  const cerrar = () => { ov.remove(); document.removeEventListener("keydown", tecla); window.removeEventListener("hashchange", cerrar); };
  const tecla = (e) => e.key === "Escape" && !document.querySelector(".overlay:not(.drawer-overlay)") && cerrar();
  document.addEventListener("keydown", tecla);
  window.addEventListener("hashchange", cerrar);
  ov.addEventListener("mousedown", (e) => e.target === ov && cerrar());
  document.body.append(ov);
  return { el: ov.querySelector(".drawer"), cerrar };
}

/** Responde un resultado de la API con toast; devuelve true si salió bien. */
export function resultado(r, okMsg) {
  if (r.ok) { toast(r.data.mensaje || okMsg || "Listo"); return true; }
  if (!r.data.errores) toast(r.data.mensaje || "Ocurrió un error", "error");
  return false;
}

export const vacio = (icono, titulo, texto = "") => html`<div class="vacio"><i class="fas ${icono}"></i><h4>${titulo}</h4><p>${texto}</p></div>`;

/** Lee los parámetros del hash: #/pedidos?pais=GT → { pais: "GT" } */
export function paramsHash() {
  const q = location.hash.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}
export const qs = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== "" && v != null)).toString();
