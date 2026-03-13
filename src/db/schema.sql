-- ============================================================
-- Chat Reservas — PostgreSQL Schema
-- ============================================================

-- 1. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT        PRIMARY KEY,          -- e.g. Evolution API remoteJid
    customer_phone  TEXT        NOT NULL,
    customer_name   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations (customer_phone);

-- 2. Messages (short-term memory)
CREATE TABLE IF NOT EXISTS messages (
    id              SERIAL      PRIMARY KEY,
    conversation_id TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT        NOT NULL,
    metadata        JSONB       DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at DESC);

-- 3. Flight searches & sales opportunities
CREATE TABLE IF NOT EXISTS flight_searches (
    id                  SERIAL      PRIMARY KEY,
    conversation_id     TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    origin              TEXT        NOT NULL,
    destination         TEXT        NOT NULL,
    departure_date      DATE        NOT NULL,
    return_date         DATE,
    best_flight         JSONB,
    cheapest_flight     JSONB,
    raw_response        JSONB,
    sales_opportunity   JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_searches_conversation ON flight_searches (conversation_id, created_at DESC);
