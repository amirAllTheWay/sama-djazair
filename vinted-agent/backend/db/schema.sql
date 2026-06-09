-- VintBot database schema

CREATE TABLE IF NOT EXISTS licenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key   VARCHAR(64) UNIQUE NOT NULL,
  email         VARCHAR(255) NOT NULL,
  plan          VARCHAR(32) NOT NULL DEFAULT 'starter',  -- starter | pro | agency
  status        VARCHAR(16) NOT NULL DEFAULT 'active',   -- active | expired | suspended
  requests_used INTEGER NOT NULL DEFAULT 0,
  requests_limit INTEGER NOT NULL DEFAULT 500,           -- monthly cap
  reset_at      TIMESTAMP NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS negotiations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id      UUID REFERENCES licenses(id) ON DELETE CASCADE,
  conversation_id VARCHAR(128),
  item_title      TEXT,
  listed_price    NUMERIC(10,2),
  buyer_offer     NUMERIC(10,2),
  ai_reply        TEXT NOT NULL,
  reasoning       TEXT,
  was_sent        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_negotiations_license ON negotiations(license_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_conv ON negotiations(conversation_id);
