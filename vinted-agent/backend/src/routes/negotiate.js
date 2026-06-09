const { Router } = require("express");
const { requireLicense } = require("../middleware/auth");
const { generateNegotiationReply } = require("../services/claude");
const pool = require("../services/db");

const router = Router();

router.post("/", requireLicense, async (req, res) => {
  const { messages, item, sellerSettings, conversationId } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: "messages[] requis" });
  }

  try {
    const result = await generateNegotiationReply({ messages, item, sellerSettings });

    // Increment usage counter and log negotiation
    await pool.query(
      `UPDATE licenses SET requests_used = requests_used + 1 WHERE id = $1`,
      [req.license.id]
    );

    // Extract buyer's offer from latest message if numeric
    const lastBuyerMsg = [...messages].reverse().find((m) => m.role === "buyer");
    const buyerOffer = lastBuyerMsg
      ? parsePrice(lastBuyerMsg.text)
      : null;

    await pool.query(
      `INSERT INTO negotiations
         (license_id, conversation_id, item_title, listed_price, buyer_offer, ai_reply, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.license.id,
        conversationId || null,
        item?.title || null,
        item?.listedPrice || null,
        buyerOffer,
        result.reply,
        result.reasoning || null,
      ]
    );

    res.json(result);
  } catch (err) {
    console.error("Negotiate error:", err);
    res.status(500).json({ message: "Erreur lors de la génération de la réponse" });
  }
});

function parsePrice(text) {
  const match = text?.match(/(\d+(?:[.,]\d{1,2})?)/);
  return match ? parseFloat(match[1].replace(",", ".")) : null;
}

module.exports = router;
