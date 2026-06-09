require("dotenv").config();

const express = require("express");
const helmet  = require("helmet");
const cors    = require("cors");
const rateLimit = require("express-rate-limit");

const negotiateRouter = require("./routes/negotiate");
const licenseRouter   = require("./routes/license");
const statsRouter     = require("./routes/stats");

const app  = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet());
app.use(cors({
  origin: [
    /chrome-extension:\/\/.*/,
    /moz-extension:\/\/.*/,
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "x-license-key", "x-admin-secret"],
}));

// Rate limiting (global)
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes, réessaie dans une minute." },
}));

app.use(express.json({ limit: "64kb" }));

// Routes
app.use("/api/negotiate", negotiateRouter);
app.use("/api/license",   licenseRouter);
app.use("/api/stats",     statsRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// 404
app.use((_req, res) => res.status(404).json({ message: "Route introuvable" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Erreur interne du serveur" });
});

app.listen(PORT, () => {
  console.log(`VintBot API running on port ${PORT}`);
});
