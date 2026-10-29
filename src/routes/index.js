// Punto de entrada de la API: /api/auth/* y /api/*
const { Router } = require("express");
const { apiLimiter } = require("../middlewares/rateLimit.middleware");
const { verificarOrigen } = require("../middlewares/origen.middleware");

const router = Router();
router.use(apiLimiter);
router.use(verificarOrigen);
router.get("/salud", (req, res) => res.json({ ok: true, estado: "operativo" }));
router.use("/auth", require("./auth.routes"));
router.use("/", require("./api.routes"));
router.use((req, res) => res.status(404).json({ ok: false, mensaje: "Ruta no encontrada" }));

module.exports = router;
