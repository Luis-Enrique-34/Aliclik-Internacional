// Componente reutilizable: bitácora de seguimiento (comentarios + cambio de estado).
import { api, html, raw, $, iniciales, hace, fechaHora, puede, toast, opcion } from "../core.js";

/**
 * @param {HTMLElement} cont   dónde pintar
 * @param {{ recurso: string, id: string, estados?: Record<string,[string,string]>, estadoActual?: string, onCambio?: Function }} op
 */
export async function bitacora(cont, { recurso, id, estados, estadoActual, onCambio }) {
  const r = await api(`/api/seguimiento/${recurso}/${id}`);
  const items = r.ok ? r.data.seguimiento : [];
  cont.innerHTML = String(html`
    ${puede("escribir") ? html`
      <form class="comentar" novalidate>
        <textarea class="ctrl" name="comentario" maxlength="2000" placeholder="Escribe el avance, acuerdo o pendiente…" required></textarea>
        <div class="fila">
          ${estados ? html`<select class="ctrl" name="estado" style="min-width:170px">${opcion("", "Sin cambio de estado", "")}${Object.entries(estados).filter(([k]) => k !== estadoActual).map(([k, [t]]) => opcion(k, `Cambiar a: ${t}`, ""))}</select>` : ""}
          <button class="btn btn-brand" type="submit"><i class="fas fa-paper-plane"></i> Comentar</button>
        </div>
      </form>` : ""}
    ${items.length ? html`<ul class="bitacora">${items.map((s) => html`
      <li><span class="avatar">${iniciales(s.usuario || "?")}</span>
        <div><div class="meta"><strong>${s.usuario || "Usuario eliminado"}</strong> · <span title="${fechaHora(s.creado_en)}">${hace(s.creado_en)}</span>
          ${s.estado_nuevo && estados ? html` · <span class="badge ${estados[s.estado_nuevo]?.[1] || ""}">${estados[s.estado_nuevo]?.[0] || s.estado_nuevo}</span>` : ""}</div>
        <div class="texto">${s.comentario}</div></div></li>`)}</ul>`
      : html`<p class="muted">Sin comentarios todavía.</p>`}`);

  const form = $("form.comentar", cont);
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const comentario = form.comentario.value.trim();
    if (!comentario) return form.comentario.focus();
    const btn = form.querySelector("button");
    btn.disabled = true;
    const res = await api(`/api/seguimiento/${recurso}/${id}`, { method: "POST", body: { comentario, ...(form.estado?.value && { estado: form.estado.value }) } });
    btn.disabled = false;
    if (!res.ok) return toast(res.data.errores?.estado || res.data.mensaje || "No se pudo guardar", "error");
    toast("Comentario agregado");
    if (res.data.item.estado_nuevo) { estadoActual = res.data.item.estado_nuevo; onCambio?.(estadoActual); }
    bitacora(cont, { recurso, id, estados, estadoActual, onCambio });
  });
}
export { raw };
