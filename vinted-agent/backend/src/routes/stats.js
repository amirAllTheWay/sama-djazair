const { Router } = require("express");
const { requireLicense } = require("../middleware/auth");
const pool = require("../services/db");

const router = Router();

// Seller's own stats
router.get("/", requireLicense, async (req, res) => {
  try {
    const licenseId = req.license.id;

    const [usageRes, recentRes, topItemsRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) AS total_negotiations,
           COUNT(*) FILTER (WHERE was_sent = true) AS replies_sent,
           AVG(buyer_offer / NULLIF(listed_price, 0)) AS avg_offer_ratio
         FROM negotiations
         WHERE license_id = $1`,
        [licenseId]
      ),
      pool.query(
        `SELECT conversation_id, item_title, listed_price, buyer_offer, ai_reply, created_at
         FROM negotiations
         WHERE license_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [licenseId]
      ),
      pool.query(
        `SELECT item_title, COUNT(*) AS count
         FROM negotiations
         WHERE license_id = $1
         GROUP BY item_title ORDER BY count DESC LIMIT 5`,
        [licenseId]
      ),
    ]);

    res.json({
      usage: {
        requestsUsed:  req.license.requests_used,
        requestsLimit: req.license.requests_limit,
        plan: req.license.plan,
      },
      summary: usageRes.rows[0],
      recentNegotiations: recentRes.rows,
      topItems: topItemsRes.rows,
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Erreur" });
  }
});

module.exports = router;
