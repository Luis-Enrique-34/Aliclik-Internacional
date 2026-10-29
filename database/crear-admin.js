// =====================================================================
//  Crea un administrador o promueve una cuenta existente:
//    npm run db:admin
//  Útil si la primera cuenta no se creó desde la página de registro o si
//  se perdió el acceso de administrador. La contraseña se escribe oculta.
// =====================================================================
require("dotenv").config({ quiet: true });
const readline = require("readline");
const argon2 = require("argon2");
const { Client } = require("pg");
const { buildDbConfig } = require("../src/config/dbConfig");
const { password: politica } = require("../src/validators/auth.schemas");
const { ARGON2_OPTIONS } = require("../src/config/security");

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => rl.output.write(s.includes(texto) ? s : "*".repeat(s.length ? 1 : 0));
    }
    rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write("\n"); resolve(r.trim()); });
  });
}

(async () => {
  const { info, ...config } = buildDbConfig(process.env.DATABASE_URL);
  const c = new Client(config);
  await c.connect();
  const email = (await preguntar("Correo del administrador: ")).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Correo no válido");
  const existe = await c.query("SELECT id, nombres FROM usuarios WHERE lower(email) = $1", [email]);
  if (existe.rowCount) {
    await c.query("UPDATE usuarios SET rol = 'admin', estado = 'activo', intentos_fallidos = 0, bloqueado_hasta = NULL, version_sesion = version_sesion + 1 WHERE id = $1", [existe.rows[0].id]);
    console.log(`✅ ${existe.rows[0].nombres} ahora es administrador activo.`);
  } else {
    const nombres = await preguntar("Nombres: ");
    const apellidos = await preguntar("Apellidos: ");
    const pass = await preguntar("Contraseña (10+ caracteres, mayúscula, minúscula, número y símbolo): ", true);
    const r = politica.safeParse(pass);
    if (!r.success) throw new Error(r.error.issues[0].message);
    const hash = await argon2.hash(pass, ARGON2_OPTIONS);
    await c.query("INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol, estado) VALUES ($1, $2, $3, $4, 'admin', 'activo')", [nombres, apellidos, email, hash]);
    console.log("✅ Administrador creado. Ya puedes iniciar sesión.");
  }
  await c.end();
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
