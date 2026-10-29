// Administración de usuarios: aprobar solicitudes, cambiar roles, suspender y desbloquear.
import { api, html, raw, $, $$, hace, encabezado, opcion, ROLES, resultado, confirmar, estado, vacio, iniciales } from "../core.js";

const ESTADOS = { pendiente: ["Pendiente de aprobación", "b-warn"], activo: ["Activo", "b-ok"], suspendido: ["Suspendido", "b-danger"] };

export async function render(cont) {
  const r = await api("/api/admin/usuarios");
  const lista = r.ok ? r.data.usuarios : [];
  const pendientes = lista.filter((u) => u.estado === "pendiente");
  encabezado("Usuarios", `${lista.length} cuentas · ${pendientes.length} pendientes de aprobación`);
  const recargar = () => render(cont);

  cont.innerHTML = String(html`
    ${pendientes.length ? html`<div class="aviso warn"><i class="fas fa-user-clock"></i><div><b>${pendientes.length} solicitudes de acceso esperan aprobación.</b> Verifica que sean personas del equipo antes de aprobarlas.</div></div>` : ""}
    <div class="aviso info"><i class="fas fa-circle-info"></i><div><b>Lector:</b> solo consulta. <b>Editor:</b> carga datos y gestiona integraciones, observaciones y seguimiento. <b>Administrador:</b> además aprueba usuarios y ve la auditoría. Al cambiar el rol o estado, se cierran las sesiones abiertas de esa persona.</div></div>
    <div class="card">${lista.length ? html`<div class="tabla-wrap"><table class="tabla">
      <thead><tr><th>Usuario</th><th>Cargo</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th>Registro</th><th></th></tr></thead>
      <tbody>${lista.map((u) => {
        const yo = u.id === estado.usuario.id;
        const bloqueado = u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date();
        return html`<tr>
          <td><div class="celda-prov"><span class="avatar">${iniciales(`${u.nombres} ${u.apellidos}`)}</span><div><div class="nombre">${u.nombres} ${u.apellidos}${yo ? " (tú)" : ""}</div><div class="muted" style="font-size:12px">${u.email}</div></div></div></td>
          <td>${u.cargo || html`<span class="muted">—</span>`}</td>
          <td>${yo ? ROLES[u.rol] : html`<select class="ctrl" data-rol="${u.id}" style="min-width:130px;height:32px">${Object.entries(ROLES).map(([k, t]) => opcion(k, t, u.rol))}</select>`}</td>
          <td><span class="badge ${ESTADOS[u.estado][1]}">${ESTADOS[u.estado][0]}</span>${bloqueado ? html` <span class="badge b-danger">bloqueado</span>` : ""}</td>
          <td class="muted nowrap">${u.ultimo_login ? hace(u.ultimo_login) : "Nunca"}</td>
          <td class="muted nowrap">${hace(u.creado_en)}</td>
          <td class="nowrap">${yo ? "" : html`
            ${u.estado !== "activo" ? html`<button class="btn btn-brand btn-sm" data-estado="activo" data-id="${u.id}"><i class="fas fa-check"></i> ${u.estado === "pendiente" ? "Aprobar" : "Reactivar"}</button>` : ""}
            ${u.estado !== "suspendido" ? html`<button class="btn btn-ghost btn-sm" data-estado="suspendido" data-id="${u.id}" data-nombre="${u.nombres}">${u.estado === "pendiente" ? "Rechazar" : "Suspender"}</button>` : ""}
            ${bloqueado ? html`<button class="btn btn-ghost btn-sm" data-desbloquear="${u.id}"><i class="fas fa-lock-open"></i></button>` : ""}`}</td>
        </tr>`;
      })}</tbody></table></div>` : vacio("fa-users", "Sin usuarios")}</div>`);

  $$("[data-rol]", cont).forEach((s) => s.addEventListener("change", async () => {
    if (!resultado(await api(`/api/admin/usuarios/${s.dataset.rol}`, { method: "PATCH", body: { rol: s.value } }))) recargar();
  }));
  $$("[data-estado]", cont).forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.estado === "suspendido" && !(await confirmar("Quitar acceso", `${b.dataset.nombre} no podrá ingresar y se cerrarán sus sesiones abiertas.`, { textoOk: "Quitar acceso" }))) return;
    if (resultado(await api(`/api/admin/usuarios/${b.dataset.id}`, { method: "PATCH", body: { estado: b.dataset.estado } }))) recargar();
  }));
  $$("[data-desbloquear]", cont).forEach((b) => b.addEventListener("click", async () => {
    if (resultado(await api(`/api/admin/usuarios/${b.dataset.desbloquear}/desbloquear`, { method: "POST" }))) recargar();
  }));
}
export { raw };
