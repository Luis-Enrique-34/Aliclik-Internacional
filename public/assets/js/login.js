import { $, alerta, limpiar, errores, enviar } from "./auth-comun.js";

// Si ya hay sesión, ir directo al panel
fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => { if (r.ok) location.replace("app.html"); }).catch(() => {});

const form = $("#form");
if (new URLSearchParams(location.search).get("salir") === "1") alerta("info", "Cerraste sesión correctamente.");
if (new URLSearchParams(location.search).get("expirada") === "1") alerta("info", "Tu sesión expiró. Vuelve a ingresar.");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiar(form);
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return errores(form, { ...(!email && { email: "Ingresa tu correo" }), ...(!password && { password: "Ingresa tu contraseña" }) });
  const btn = $("#btn");
  btn.disabled = true;
  const r = await enviar("/api/auth/login", { email, password });
  btn.disabled = false;
  if (r.ok) return location.replace("app.html");
  form.password.value = "";
  errores(form, r.data.errores);
  alerta("error", r.data.mensaje || "No se pudo iniciar sesión");
});
