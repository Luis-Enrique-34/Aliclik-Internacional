// =====================================================================
//  VALIDADORES de autenticación — librería: zod
//  Regla de oro: NUNCA confiar en lo que llega del navegador. La validación
//  del frontend es comodidad; la real ocurre aquí, en el servidor.
// =====================================================================
const { z } = require("zod");

const email = z.string({ error: "El correo es obligatorio" }).trim().toLowerCase().max(255).email("Correo electrónico no válido");

// Contraseña: 10+ caracteres con mayúscula, minúscula, número y símbolo.
// Máximo 128 para evitar ataques de denegación de servicio contra el hash.
const COMUNES = /^(password|contrase(ñ|n)a|aliclik|qwerty|123456|admin)/i;
const password = z
  .string({ error: "La contraseña es obligatoria" })
  .min(10, "La contraseña debe tener al menos 10 caracteres")
  .max(128, "La contraseña es demasiado larga")
  .regex(/[a-z]/, "Debe contener al menos una letra minúscula")
  .regex(/[A-Z]/, "Debe contener al menos una letra mayúscula")
  .regex(/[0-9]/, "Debe contener al menos un número")
  .regex(/[^A-Za-z0-9]/, "Debe contener al menos un símbolo (por ejemplo ! # $ %)")
  .refine((v) => !COMUNES.test(v), "Esa contraseña es demasiado común");

const nombre = (campo) =>
  z.string({ error: `${campo} es obligatorio` }).trim().min(2, `${campo} debe tener al menos 2 caracteres`).max(80)
    .regex(/^[\p{L}\s'.-]+$/u, `${campo} solo puede contener letras`);

const cargo = z.string().trim().max(80).optional().or(z.literal(""));

const registroSchema = z
  .object({
    nombres: nombre("Nombres"),
    apellidos: nombre("Apellidos"),
    email,
    cargo,
    password,
    confirmPassword: z.string(),
    aceptaPoliticas: z.literal(true, { error: "Debes aceptar la política de uso interno" }),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] })
  .refine((d) => !d.password.toLowerCase().includes(d.email.split("@")[0]), {
    message: "La contraseña no debe contener tu correo", path: ["password"],
  });

const loginSchema = z.object({ email, password: z.string().min(1, "La contraseña es obligatoria").max(128) });

const perfilSchema = z.object({ nombres: nombre("Nombres"), apellidos: nombre("Apellidos"), cargo });

const cambioPasswordSchema = z
  .object({ actual: z.string().min(1, "Ingresa tu contraseña actual").max(128), nueva: password, confirmar: z.string() })
  .refine((d) => d.nueva === d.confirmar, { message: "Las contraseñas no coinciden", path: ["confirmar"] })
  .refine((d) => d.nueva !== d.actual, { message: "La nueva contraseña debe ser distinta a la actual", path: ["nueva"] });

module.exports = { registroSchema, loginSchema, perfilSchema, cambioPasswordSchema, password };
