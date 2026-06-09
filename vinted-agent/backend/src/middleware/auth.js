const pool = require("../services/db");

async function requireLicense(req, res, next) {
  const licenseKey = req.headers["x-license-key"];

  if (!licenseKey) {
    return res.status(401).json({ message: "Clé de licence manquante" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM licenses WHERE license_key = $1`,
      [licenseKey]
    );

    const license = result.rows[0];

    if (!license) {
      return res.status(401).json({ message: "Licence invalide" });
    }

    if (license.status !== "active") {
      return res.status(403).json({ message: `Licence ${license.status}` });
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await pool.query(`UPDATE licenses SET status = 'expired' WHERE id = $1`, [license.id]);
      return res.status(403).json({ message: "Licence expirée" });
    }

    // Reset monthly counter if past reset date
    if (new Date(license.reset_at) <= new Date()) {
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);
      await pool.query(
        `UPDATE licenses SET requests_used = 0, reset_at = $1 WHERE id = $2`,
        [nextReset, license.id]
      );
      license.requests_used = 0;
      license.reset_at = nextReset;
    }

    if (license.requests_used >= license.requests_limit) {
      return res.status(429).json({
        message: `Quota mensuel atteint (${license.requests_limit} requêtes). Passe à un plan supérieur.`,
      });
    }

    req.license = license;
    next();
  } catch (err) {
    console.error("License check error:", err);
    res.status(500).json({ message: "Erreur interne" });
  }
}

module.exports = { requireLicense };
