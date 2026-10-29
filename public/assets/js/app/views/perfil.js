// Mi perfil: datos personales y cambio de contraseña.
import { api, html, $, encabezado, estado, ROLES, datosForm, limpiarErrores, mostrarErrores, cargando, toast, fechaHora } from "../core.js";

export async function render(cont) {
  const r = await api("/api/auth/me");
  const u = r.data.usuario;
  encabezado("Mi perfil", `${ROLES[u.rol]} · ${u.email}`);
  cont.innerHTML = String(html`
    <div class="grid g-2">
      <form class="card" id="fPerfil" novalidate><div class="card-head"><h3>Datos personales</h3></div><div class="card-body">
        <div class="form-grid">
          <div class="f"><label>Nombres</label><input class="ctrl" name="nombres" value="${u.nombres}" maxlength="80"></div>
          <div class="f"><label>Apellidos</label><input class="ctrl" name="apellidos" value="${u.apellidos}" maxlength="80"></div>
          <div class="f full"><label>Cargo</label><input class="ctrl" name="cargo" value="${u.cargo || ""}" maxlength="80"></div>
          <div class="f full"><label>Correo</label><input class="ctrl" value="${u.email}" disabled><div class="ayuda">Para cambiar el correo, pide a un administrador que cree una cuenta nueva.</div></div>
        </div>
        <p class="muted" style="font-size:12.5px">Último ingreso: ${fechaHora(u.ultimo_login)}</p>
        <button class="btn btn-brand" type="submit"><i class="fas fa-floppy-disk"></i> Guardar</button>
      </div></form>
      <form class="card" id="fPass" novalidate><div class="card-head"><h3>Cambiar contraseña</h3></div><div class="card-body">
        <div class="f"><label>Contraseña actual</label><input class="ctrl" type="password" name="actual" autocomplete="current-password" maxlength="128"></div>
        <div class="f"><label>Nueva contraseña</label><input class="ctrl" type="password" name="nueva" autocomplete="new-password" maxlength="128"><div class="ayuda">10+ caracteres con mayúscula, minúscula, número y símbolo.</div></div>
        <div class="f"><label>Confirmar nueva contraseña</label><input class="ctrl" type="password" name="confirmar" autocomplete="new-password" maxlength="128"></div>
        <div class="aviso info"><i class="fas fa-shield-halved"></i><div>Al cambiarla se cerrarán tus sesiones abiertas en otros equipos.</div></div>
        <button class="btn btn-brand" type="submit"><i class="fas fa-key"></i> Actualizar contraseña</button>
      </div></form>
    </div>`);

  for (const [id, url, metodo] of [["#fPerfil", "/api/auth/perfil", "PUT"], ["#fPass", "/api/auth/password", "PUT"]]) {
    const form = $(id, cont);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      limpiarErrores(form);
      const btn = form.querySelector("button[type=submit]");
      cargando(btn, true);
      const res = await api(url, { method: metodo, body: datosForm(form) });
      cargando(btn, false);
      if (!res.ok) { if (res.data.errores) mostrarErrores(form, res.data.errores); else toast(res.data.mensaje, "error"); return; }
      toast(res.data.mensaje);
      if (id === "#fPass") form.reset();
      else { Object.assign(estado.usuario, res.data.usuario); document.querySelector("#userName").textContent = `${res.data.usuario.nombres} ${res.data.usuario.apellidos}`; }
    });
  }
}
