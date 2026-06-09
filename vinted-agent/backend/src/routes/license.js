const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const pool = require("../services/db");

const router = Router();

// Validate a license key (called by extension on startup)
router.post("/validate", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ valid: false, message: "licenseKey requis" });
  }

  try {
    const result = await pool.query(
      `SELECT id, plan, status, requests_used, requests_limit, expires_at FROM licenses WHERE license_key = $1`,
      [licenseKey]
    );

    const license = result.rows[0];

    if (!license) return res.json({ valid: false, message: "Licence introuvable" });
    if (license.status !== "active") return res.json({ valid: false, message: `Licence ${license.status}` });
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.json({ valid: false, message: "Licence expirée" });
    }

    res.json({
      valid: true,
      plan: license.plan,
      requestsUsed: license.requests_used,
      requestsLimit: license.requests_limit,
    });
  } catch (err) {
    console.error("Validate error:", err);
    res.status(500).json({ valid: false, message: "Erreur interne" });
  }
});

// Admin: create a new license (protected by ADMIN_SECRET)
router.post("/create", requireAdmin, async (req, res) => {
  const { email, plan = "starter", requestsLimit, expiresAt } = req.body;

  if (!email) return res.status(400).json({ message: "email requis" });

  const limits = { starter: 200, pro: 1000, agency: 5000 };
  const key = generateLicenseKey();
  const limit = requestsLimit || limits[plan] || 200;

  try {
    const result = await pool.query(
      `INSERT INTO licenses (license_key, email, plan, requests_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, license_key, plan, status`,
      [key, email, plan, limit, expiresAt || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create license error:", err);
    res.status(500).json({ message: "Erreur création licence" });
  }
});

// Admin: list all licenses
router.get("/", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, license_key, email, plan, status, requests_used, requests_limit, created_at, expires_at
       FROM licenses ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Erreur" });
  }
});

// Admin: suspend/activate a license
router.patch("/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["active", "suspended", "expired"].includes(status)) {
    return res.status(400).json({ message: "Status invalide" });
  }

  try {
    await pool.query(`UPDATE licenses SET status = $1 WHERE id = $2`, [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Erreur" });
  }
});

function requireAdmin(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  next();
}

function generateLicenseKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const seg = (n) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `VINTB-${seg(4)}-${seg(4)}-${seg(4)}`;
}

module.exports = router;
