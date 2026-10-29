// =====================================================================
//  SERVICIO de autenticación: registro, login, sesión y contraseña.
//  Librerías: argon2 (hash) · jsonwebtoken (sesión). No conoce HTTP ni SQL.
// =====================================================================
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, DOMINIOS_PERMITIDOS } = require("../config/env");
const { ARGON2_OPTIONS, JWT_OPTIONS, LOGIN_POLICY } = require("../config/security");
const { HttpError } = require("../utils/HttpError");
const cacheSesion = require("../utils/cacheSesion");

const ERROR_GENERICO = "Correo o contraseña incorrectos";

class AuthService {
  #hashFicticio; // para que un correo inexistente tarde lo mismo que uno real

  constructor({ usuarioDAO, auditoriaDAO }) {
    this.usuarios = usuarioDAO;
    this.auditoria = auditoriaDAO;
  }

  /**
   * Crea la cuenta. La PRIMERA cuenta del sistema queda como administrador
   * activo; todas las demás quedan "pendientes" hasta que un admin las apruebe.
   */
  async registrar({ nombres, apellidos, email, cargo, password }, ip) {
    const dominio = email.split("@")[1];
    if (DOMINIOS_PERMITIDOS.length && !DOMINIOS_PERMITIDOS.includes(dominio)) {
      throw new HttpError(400, "No se pudo crear la cuenta", { email: `Solo se permiten correos corporativos (${DOMINIOS_PERMITIDOS.map((d) => "@" + d).join(", ")})` });
    }
    const primero = (await this.usuarios.contar()) === 0;
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    let fila;
    try {
      fila = await this.usuarios.crear({
        nombres, apellidos, email, cargo, passwordHash,
        rol: primero ? "admin" : "lector", estado: primero ? "activo" : "pendiente",
      });
    } catch (err) {
      if (err.code === "23505") {
        // Mensaje neutro: no confirma si el correo ya existe (evita enumerar cuentas)
        await this.auditoria.registrar({ accion: "REGISTRO_DUPLICADO", entidad: "usuarios", ip, detalle: { dominio } });
        return { pendiente: true };
      }
      throw err;
    }
    await this.auditoria.registrar({ usuarioId: fila.id, accion: "REGISTRO", entidad: "usuarios", entidadId: fila.id, ip, detalle: { primero } });
    return primero ? { pendiente: false, usuario: fila } : { pendiente: true };
  }

  async login({ email, password }, ip) {
    const fila = await this.usuarios.buscarParaLogin(email);
    if (!fila) {
      this.#hashFicticio ??= argon2.hash("contraseña-ficticia-para-igualar-tiempos", ARGON2_OPTIONS);
      await argon2.verify(await this.#hashFicticio, password).catch(() => {});
      throw new HttpError(401, ERROR_GENERICO);
    }

    if (fila.bloqueado_hasta && new Date(fila.bloqueado_hasta) > new Date()) {
      throw new HttpError(423, `Cuenta bloqueada temporalmente por varios intentos fallidos. Intenta en ${LOGIN_POLICY.minutosBloqueo} minutos.`);
    }

    if (!(await argon2.verify(fila.password_hash, password))) {
      const intentos = fila.intentos_fallidos + 1;
      const bloquear = intentos >= LOGIN_POLICY.maxIntentos;
      await this.usuarios.registrarFallo(fila.id, intentos, bloquear, LOGIN_POLICY.minutosBloqueo);
      await this.auditoria.registrar({ usuarioId: fila.id, accion: bloquear ? "CUENTA_BLOQUEADA" : "LOGIN_FALLIDO", entidad: "usuarios", entidadId: fila.id, ip, detalle: { intentos } });
      throw new HttpError(401, ERROR_GENERICO);
    }

    // La contraseña es correcta: recién ahora se informa el estado de la cuenta
    if (fila.estado === "pendiente") throw new HttpError(403, "Tu cuenta está pendiente de aprobación por un administrador.");
    if (fila.estado !== "activo") throw new HttpError(403, "Tu cuenta está suspendida. Contacta al administrador.");

    await this.usuarios.registrarLoginExitoso(fila.id);
    if (argon2.needsRehash(fila.password_hash, ARGON2_OPTIONS)) {
      await this.usuarios.actualizarHash(fila.id, await argon2.hash(password, ARGON2_OPTIONS));
    }
    await this.auditoria.registrar({ usuarioId: fila.id, accion: "LOGIN", entidad: "usuarios", entidadId: fila.id, ip });
    const { password_hash, ...usuario } = fila;
    return usuario;
  }

  async cambiarPassword(usuarioId, { actual, nueva }, ip) {
    const fila = await this.usuarios.hashDe(usuarioId);
    if (!fila || !(await argon2.verify(fila.password_hash, actual))) {
      throw new HttpError(400, "Revisa los datos", { actual: "La contraseña actual no es correcta" });
    }
    // Revoca TODAS las sesiones abiertas (otros navegadores/equipos)
    const { version_sesion } = await this.usuarios.actualizarHash(usuarioId, await argon2.hash(nueva, ARGON2_OPTIONS), { revocar: true });
    cacheSesion.invalidar(usuarioId);
    await this.auditoria.registrar({ usuarioId, accion: "CAMBIO_PASSWORD", entidad: "usuarios", entidadId: usuarioId, ip });
    return version_sesion;
  }

  async actualizarPerfil(usuarioId, datos) {
    cacheSesion.invalidar(usuarioId);
    return this.usuarios.actualizarPerfil(usuarioId, datos);
  }

  usuarioActual(id) {
    return this.usuarios.buscarPorId(id);
  }

  emitirToken(usuario) {
    return jwt.sign({ sub: usuario.id, rol: usuario.rol, sv: usuario.version_sesion }, JWT_SECRET, JWT_OPTIONS);
  }
}

module.exports = AuthService;
