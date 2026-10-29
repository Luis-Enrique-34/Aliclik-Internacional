// =====================================================================
//  Tema claro / oscuro. Se carga en el <head> (sin defer) para aplicar el
//  tema antes de pintar. Recuerda la elección en localStorage (solo una
//  preferencia visual, nunca datos sensibles). Por defecto: claro.
// =====================================================================
(function () {
  var CLAVE = "alc-tema";
  var raiz = document.documentElement;
  function leer() { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } }
  function aplicar(tema, animar) {
    if (animar) { raiz.classList.add("tema-anim"); setTimeout(function () { raiz.classList.remove("tema-anim"); }, 300); }
    raiz.setAttribute("data-theme", tema);
  }
  var guardado = leer();
  aplicar(guardado === "dark" || guardado === "light" ? guardado : "light", false);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!b) return;
    var nuevo = raiz.getAttribute("data-theme") === "dark" ? "light" : "dark";
    aplicar(nuevo, true);
    try { localStorage.setItem(CLAVE, nuevo); } catch (err) { /* modo privado */ }
    document.dispatchEvent(new CustomEvent("temachange", { detail: nuevo }));
  });
})();
