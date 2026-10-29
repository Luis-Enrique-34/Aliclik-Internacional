// Traduce los errores de conexión más comunes (sobre todo con Supabase)
// a pistas claras en español.
function explicarErrorDb(err, info = {}) {
  const msg = `${err.code || ""} ${err.message || ""}`;

  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) {
    return [
      "• No se encontró el servidor. Revisa que el host de DATABASE_URL esté bien copiado.",
      "• Verifica tu conexión a internet.",
    ];
  }
  if (/ENETUNREACH|EHOSTUNREACH/.test(msg) || (/ETIMEDOUT|timeout/i.test(msg) && /^db\./.test(info.host || ""))) {
    return [
      "• Estás usando la 'Direct connection' de Supabase, que solo funciona con IPv6.",
      "• Usa la cadena del 'Session pooler' (host ...pooler.supabase.com, usuario postgres.XXXX).",
      "  Supabase → botón Connect → Connection String → Method: Session pooler.",
    ];
  }
  if (/Tenant or user not found/i.test(msg)) {
    return [
      "• Con el pooler de Supabase el usuario debe ser postgres.TU_PROJECT_REF (no solo 'postgres').",
      "• Copia de nuevo la cadena completa desde Supabase → Connect → Session pooler.",
    ];
  }
  if (/password authentication failed/i.test(msg)) {
    return [
      "• La contraseña de la base de datos es incorrecta.",
      "• Si no la recuerdas: Supabase → Project Settings → Database → Reset database password.",
      "• Si tiene símbolos (@ # / : ?) codifícalos en la URL: @ → %40, # → %23, / → %2F.",
    ];
  }
  if (/ETIMEDOUT|timeout/i.test(msg)) {
    return [
      "• La conexión tardó demasiado. Revisa tu internet o si una red (oficina, VPN) bloquea el puerto 5432.",
      "• Si el proyecto de Supabase está en pausa por inactividad, reactívalo desde el dashboard (Restore project).",
    ];
  }
  if (/ECONNREFUSED/.test(msg)) {
    return info.esLocal
      ? ["• El servicio de PostgreSQL local está apagado (services.msc → iniciar postgresql)."]
      : ["• El servidor rechazó la conexión. Revisa el puerto (5432 session pooler / 6543 transaction pooler)."];
  }
  if (/certificate/i.test(msg)) {
    return [
      "• Problema con el certificado SSL. Revisa la ruta de DATABASE_SSL_CA en .env,",
      "  o bórrala para usar la conexión cifrada sin verificación de certificado.",
    ];
  }
  if (/too many clients|max client|MaxClientsInSessionMode/i.test(msg)) {
    return [
      "• Se alcanzó el límite de conexiones de Supabase.",
      "• Cierra otras instancias del servidor (otras terminales) o baja DB_POOL_MAX en .env.",
    ];
  }
  if (/does not exist/.test(msg) && /database/.test(msg)) {
    return ["• La base de datos no existe. En Supabase el nombre siempre es 'postgres' (termina en /postgres)."];
  }
  return ["• Revisa DATABASE_URL en tu archivo .env y la guía docs/GUIA-INSTALACION.md (sección de problemas)."];
}

module.exports = { explicarErrorDb };
