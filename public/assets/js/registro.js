import { $, alerta, limpiar, errores, enviar } from "./auth-comun.js";

const form = $("#form");
const REGLAS = {
  len: (v) => v.length >= 10,
  may: (v) => /[A-Z]/.test(v),
  min: (v) => /[a-z]/.test(v),
  num: (v) => /[0-9]/.test(v),
  sim: (v) => /[^A-Za-z0-9]/.test(v),
};

form.password.addEventListener("input", () => {
  const v = form.password.value;
  let n = 0;
  for (const [k, fn] of Object.entries(REGLAS)) {
    const ok = fn(v);
    n += ok;
    const li = form.querySelector(`[data-r="${k}"]`);
    li.classList.toggle("ok", ok);
    li.querySelector("i").className = `fas ${ok ? "fa-circle-check" : "fa-circle-xmark"}`;
  }
  const barra = $("#fuerza");
  barra.style.width = `${(n / 5) * 100}%`;
  barra.style.background = n <= 2 ? "var(--danger)" : n <= 4 ? "var(--warn)" : "var(--ok)";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiar(form);
  const datos = {
    nombres: form.nombres.value.trim(),
    apellidos: form.apellidos.value.trim(),
    email: form.email.value.trim(),
    cargo: form.cargo.value.trim(),
    password: form.password.value,
    confirmPassword: form.confirmPassword.value,
    aceptaPoliticas: form.aceptaPoliticas.checked,
  };
  const btn = $("#btn");
  btn.disabled = true;
  const r = await enviar("/api/auth/registro", datos);
  btn.disabled = false;
  if (r.ok && r.data.sesion) return location.replace("app.html");
  if (r.ok) {
    form.reset();
    form.querySelectorAll("input,button").forEach((el) => (el.disabled = true));
    return alerta("ok", r.data.mensaje);
  }
  errores(form, r.data.errores);
  alerta("error", r.data.mensaje || "No se pudo enviar la solicitud");
});
