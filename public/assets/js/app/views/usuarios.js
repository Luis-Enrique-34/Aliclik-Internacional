// Administración de usuarios: aprobar solicitudes, cambiar roles, suspender y desbloquear.
import { api, html, raw, $, $$, hace, encabezado, opcion, ROLES, resultado, confirmar, estado, vacio, iniciales, paramsHash, qs } from "../core.js";
import { panelIndicadores, selectorOrden, ordenar } from "../indicadores.js";

const dias = (v) => (v ? (Date.now() - new Date(v).getTime()) / 86400000 : null);
const ORDEN_USR = [["ultimo", "Último ingreso"], ["registro", "Fecha de registro"], ["nombre", "Nombre"], ["rol", "Rol"], ["estado", "Estado"], ["password", "Antigüedad de la contraseña"]];
const CAMPOS_USR = {
  ultimo: (u) => u.ultimo_login, registro: (u) => u.creado_en, nombre: (u) => `${u.nombres} ${u.apellidos}`,
  rol: (u) => ({ lector: 0, editor: 1, admin: 2 })[u.rol], estado: (u) => ({ pendiente: 0, activo: 1, suspendido: 2 })[u.estado],
  password: (u) => dias(u.password_cambiada),
};

const ESTADOS = { pendiente: ["Pendiente de aprobación", "b-warn"], activo: ["Activo", "b-ok"], suspendido: ["Suspendido", "b-danger"] };

export async function render(cont) {
  const h = paramsHash();
  const v = { rol: h.rol || "", estado: h.estado || "", actividad: h.actividad || "", q: h.q || "", orden: h.orden || "ultimo", dir: h.dir || "desc" };
  const r = await api("/api/admin/usuarios");
  const todos = r.ok ? r.data.usuarios : [];
  const pendientes = todos.filter((u) => u.estado === "pendiente");
  let lista = todos;
  if (v.rol) lista = lista.filter((u) => u.rol === v.rol);
  if (v.estado === "bloqueado") lista = lista.filter((u) => u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date());
  else if (v.estado) lista = lista.filter((u) => u.estado === v.estado);
  if (v.actividad === "7") lista = lista.filter((u) => dias(u.ultimo_login) != null && dias(u.ultimo_login) <= 7);
  if (v.actividad === "inactivo") lista = lista.filter((u) => dias(u.ultimo_login) == null || dias(u.ultimo_login) > 30);
  if (v.actividad === "nunca") lista = lista.filter((u) => !u.ultimo_login);
  if (v.q) { const t = v.q.toLowerCase(); lista = lista.filter((u) => `${u.nombres} ${u.apellidos} ${u.email} ${u.cargo || ""}`.toLowerCase().includes(t)); }
  lista = ordenar(lista, CAMPOS_USR, v.orden, v.dir);
  encabezado("Usuarios", `${todos.length} cuentas · ${pendientes.length} pendientes de aprobación`);
  const recargar = () => render(cont);

  cont.innerHTML = String(html`
    <div id="indPanel"></div>
    ${pendientes.length ? html`<div class="aviso warn"><i class="fas fa-user-clock"></i><div><b>${pendientes.length} solicitudes de acceso esperan aprobación.</b> Verifica que sean personas del equipo antes de aprobarlas.</div></div>` : ""}
    <div class="aviso info"><i class="fas fa-circle-info"></i><div><b>Lector:</b> solo consulta. <b>Editor:</b> carga datos y gestiona integraciones, observaciones y seguimiento. <b>Administrador:</b> además aprueba usuarios y ve la auditoría. Al cambiar el rol o estado, se cierran las sesiones abiertas de esa persona.</div></div>
    <form class="filtros" id="filtros">
      <div class="campo"><label>Rol</label><select class="ctrl" name="rol">${opcion("", "Todos", v.rol)}${Object.entries(ROLES).map(([k, t]) => opcion(k, t, v.rol))}</select></div>
      <div class="campo"><label>Estado</label><select class="ctrl" name="estado">${opcion("", "Todos", v.estado)}${Object.entries(ESTADOS).map(([k, [t]]) => opcion(k, t, v.estado))}${opcion("bloqueado", "Bloqueados ahora", v.estado)}</select></div>
      <div class="campo"><label>Actividad</label><select class="ctrl" name="actividad">${opcion("", "Todas", v.actividad)}${opcion("7", "Entraron esta semana", v.actividad)}${opcion("inactivo", "Sin entrar en 30 días", v.actividad)}${opcion("nunca", "Nunca entraron", v.actividad)}</select></div>
      <div class="campo buscador"><label>Buscar</label><input class="ctrl" name="q" value="${v.q}" placeholder="Nombre, correo o cargo" maxlength="80"></div>
      <div class="campo">${selectorOrden(ORDEN_USR, v.orden, v.dir)}</div>
      <button class="btn btn-brand" type="submit"><i class="fas fa-filter"></i> Filtrar</button>
      <a class="btn btn-ghost" href="#/usuarios">Limpiar</a>
    </form>
    <p class="muted conteo">${lista.length} de ${todos.length} usuarios</p>
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
      })}</tbody></table></div>` : vacio("fa-users", "Sin usuarios con estos filtros")}</div>`);

  $("#filtros", cont).addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/usuarios?${qs(Object.fromEntries(new FormData(e.target)))}`; });
  for (const n of ["orden", "dir"]) $(`[name="${n}"]`, cont).addEventListener("change", () => $("#filtros", cont).requestSubmit());
  panelIndicadores($("#indPanel", cont), "usuarios");
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
