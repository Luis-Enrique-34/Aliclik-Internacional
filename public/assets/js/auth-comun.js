// Utilidades compartidas por login y registro.
export const $ = (s) => document.querySelector(s);

export function alerta(tipo, texto) {
  const el = $("#alerta");
  el.className = `alerta ${tipo}`;
  el.replaceChildren();
  const i = document.createElement("i");
  i.className = `fas ${tipo === "error" ? "fa-circle-exclamation" : tipo === "ok" ? "fa-circle-check" : "fa-circle-info"}`;
  const s = document.createElement("span");
  s.textContent = texto; // textContent: nunca se interpreta como HTML (anti-XSS)
  el.append(i, s);
  el.hidden = false;
}

export function limpiar(form) {
  form.querySelectorAll("[data-error]").forEach((e) => (e.textContent = ""));
  form.querySelectorAll(".invalido").forEach((e) => e.classList.remove("invalido"));
  $("#alerta").hidden = true;
}

export function errores(form, errs = {}) {
  for (const [campo, msg] of Object.entries(errs)) {
    const e = form.querySelector(`[data-error="${CSS.escape(campo)}"]`);
    if (e) e.textContent = msg;
    form.querySelector(`[name="${CSS.escape(campo)}"]`)?.classList.add("invalido");
  }
}

export async function enviar(url, datos) {
  try {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { mensaje: "No se pudo conectar con el servidor." } };
  }
}

// Mostrar / ocultar contraseña
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ver]");
  if (!b) return;
  const input = document.getElementById(b.dataset.ver);
  const ver = input.type === "password";
  input.type = ver ? "text" : "password";
  b.querySelector("i").className = `fas ${ver ? "fa-eye-slash" : "fa-eye"}`;
  b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
});
