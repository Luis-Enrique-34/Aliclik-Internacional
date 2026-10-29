// RUTAS de autenticación (/api/auth/...)
const { Router } = require("express");
const { validate } = require("../middlewares/validate.middleware");
const { requireAuth } = require("../middlewares/auth.middleware");
const { loginLimiter, registroLimiter } = require("../middlewares/rateLimit.middleware");
const s = require("../validators/auth.schemas");
const auth = require("../controllers/auth.controller");

const router = Router();
//          Ruta         Middlewares (en orden)                              Controlador
router.post("/registro", registroLimiter, validate(s.registroSchema),          auth.registrar);
router.post("/login",    loginLimiter,    validate(s.loginSchema),             auth.login);
router.post("/logout",                                                         auth.logout);
router.get ("/me",       requireAuth,                                          auth.me);
router.put ("/perfil",   requireAuth,     validate(s.perfilSchema),            auth.perfil);
router.put ("/password", requireAuth,     loginLimiter, validate(s.cambioPasswordSchema), auth.password);

module.exports = router;
