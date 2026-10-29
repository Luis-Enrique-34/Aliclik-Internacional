// =====================================================================
//  Clasificación automática de los estados de Aurora en grupos del
//  tablero, por palabras clave del código o la etiqueta.
//  El orden importa: se evalúa de arriba hacia abajo.
//  Si un estado queda mal clasificado se corrige en Configuración →
//  "Estados de pedido" y la corrección manual nunca se pisa.
// =====================================================================
const REGLAS = [
  ["cancelado", /CANCEL|ANULAD|ELIMINAD|DESCART/],
  ["devuelto", /DEVOL|DEVUEL|RETORN|RETURN|RECHAZ|REJECT|NO_?ENTREG|NO ENTREG|SINIESTR|PERDID|EXTRAVI/],
  ["entregado", /ENTREGAD|DELIVERED|COMPLETAD|FINALIZAD|LIQUIDAD/],
  ["en_ruta", /RUTA|TRANSIT|DESPACHAD|ENVIAD|DISPATCH|SHIPPED|REPARTO|AGENCIA|REPROGRAM|EN_CAMINO|EN CAMINO|RECOGID/],
  ["pendiente", /PEND|NUEV|\bNEW\b|CREAD|REGISTRAD|POR_?PREPAR|POR PREPAR|POR_?CONFIRM|POR CONFIRM|ESPERA|SIN_?CONF|LLAMAD/],
  ["en_proceso", /PREPAR|EMPAC|PICK|PACK|CONFIRMAD|ALISTAD|PROCES|LISTO|ASIGNAD/],
];

function normalizar(t) {
  return String(t || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** @returns {"pendiente"|"en_proceso"|"en_ruta"|"entregado"|"devuelto"|"cancelado"|"otro"} */
function clasificarEstado(codigo, etiqueta) {
  const texto = `${normalizar(codigo)} ${normalizar(etiqueta)}`;
  for (const [grupo, re] of REGLAS) if (re.test(texto)) return grupo;
  return "otro";
}

module.exports = { clasificarEstado };
