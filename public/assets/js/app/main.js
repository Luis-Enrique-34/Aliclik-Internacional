// =====================================================================
//  Arranque del panel: valida la sesión, arma el menú según el rol y
//  enruta por el hash (#/inicio, #/pedidos, ...). Cada vista es un
//  módulo en ./views/ que exporta render(contenedor, params).
// =====================================================================
import { api, estado, $, html, ROLES, iniciales, toast, opciones } from "./core.js";

// Agregar un módulo al menú = agregar una entrada aquí
const VISTAS = [
  { grupo: "Monitoreo" },
  { ruta: "inicio", texto: "Tablero", icono: "fa-chart-pie", modulo: "dashboard" },
  { ruta: "pedidos", texto: "Pedidos", icono: "fa-box", modulo: "pedidos" },
  { grupo: "Gestión" },
  { ruta: "integraciones", texto: "Integraciones", icono: "fa-handshake", modulo: "integraciones" },
  { ruta: "seguimiento", texto: "Seguimiento", icono: "fa-binoculars", modulo: "seguimiento" },
  { ruta: "observaciones", texto: "Observaciones", icono: "fa-clipboard-list", modulo: "observaciones" },
  { ruta: "calendario", texto: "Calendario", icono: "fa-calendar-days", modulo: "calendario" },
  { grupo: "Datos" },
  { ruta: "cargas", texto: "Cargas de datos", icono: "fa-cloud-arrow-up", modulo: "cargas" },
  { grupo: "Administración", roles: ["admin"] },
  { ruta: "usuarios", texto: "Usuarios", icono: "fa-users-gear", modulo: "usuarios", roles: ["admin"] },
  { ruta: "auditoria", texto: "Auditoría", icono: "fa-shield-halved", modulo: "auditoria", roles: ["admin"] },
  { ruta: "perfil", texto: "Mi perfil", icono: "fa-user", modulo: "perfil", oculto: true },
];

const permitidas = () => VISTAS.filter((v) => !v.roles || v.roles.includes(estado.usuario.rol));

function pintarMenu() {
  $("#nav").innerHTML = String(html`${permitidas().filter((v) => !v.oculto).map((v) =>
    v.grupo
      ? html`<div class="nav-grupo">${v.grupo}</div>`
      : html`<a class="nav-item" href="#/${v.ruta}" data-ruta="${v.ruta}"><i class="fas ${v.icono}"></i><span>${v.texto}</span></a>`)}`);
}

let navegacion = 0;
async function enrutar() {
  let ruta = (location.hash.replace(/^#\/?/, "").split(/[?/]/)[0]) || "inicio";
  if (ruta === "directorio") ruta = "seguimiento"; // nombre anterior del módulo
  const vista = permitidas().find((v) => v.ruta === ruta && v.modulo);
  if (!vista) { location.replace("#/inicio"); return; }
  document.querySelectorAll(".nav-item").forEach((a) => a.classList.toggle("activo", a.dataset.ruta === ruta));
  menu(false);
  const cont = $("#vista");
  const mio = ++navegacion;
  cont.onclick = null;
  cont.onchange = null;
  cont.oninput = null;
  cont.innerHTML = '<div class="grid g-4"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><div class="skeleton mt" style="height:300px"></div>';
  try {
    const m = await import(`./views/${vista.modulo}.js`);
    if (mio !== navegacion) return; // el usuario ya navegó a otra vista
    await m.render(cont, { ruta });
    cont.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    cont.innerHTML = "";
    toast("No se pudo cargar esta sección", "error");
  }
}

(async () => {
  const r = await api("/api/auth/me");
  if (!r.ok) return;
  estado.usuario = r.data.usuario;
  await opciones();
  const nombre = `${estado.usuario.nombres} ${estado.usuario.apellidos}`;
  $("#userName").textContent = nombre;
  $("#userRole").textContent = ROLES[estado.usuario.rol] || estado.usuario.rol;
  $("#userAvatar").textContent = iniciales(nombre);
  $("#userAvatar").title = "Mi perfil";
  $("#userAvatar").addEventListener("click", () => (location.hash = "#/perfil"));
  $("#userAvatar").style.cursor = "pointer";
  pintarMenu();
  $("#boot").remove();
  $("#layout").hidden = false;
  window.addEventListener("hashchange", enrutar);
  enrutar();
})();

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.replace("login.html?salir=1");
});
/** Abre/cierra el menú lateral en tablet y celular (con fondo oscuro detrás). */
function menu(abrir) {
  $("#sidebar").classList.toggle("abierto", abrir);
  $("#velo").classList.toggle("visible", abrir);
}
$("#menuBtn").addEventListener("click", () => menu(!$("#sidebar").classList.contains("abierto")));
$("#velo").addEventListener("click", () => menu(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && menu(false));
document.addEventListener("click", (e) => {
  if (window.innerWidth <= 1024 && e.target.closest(".nav-item")) menu(false);
});
