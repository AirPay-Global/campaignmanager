import { Pool } from 'pg';
import { logger } from './logger';

const SQL_001 = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('whatsapp', 'sms', 'email', 'push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'bounced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE mandate_action_type AS ENUM ('auto_reply', 'webhook', 'escalate', 'tag_contact', 'opt_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM ('facebook', 'twitter', 'instagram', 'linkedin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE delivery_event_type AS ENUM ('sent', 'delivered', 'read', 'failed', 'bounced', 'clicked', 'opened', 'unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'campaign.created', 'campaign.updated', 'campaign.launched', 'campaign.paused',
    'campaign.completed', 'contact.created', 'contact.updated', 'contact.opt_out',
    'contact.imported', 'mandate.created', 'mandate.updated', 'mandate.deleted',
    'message.sent', 'message.failed', 'segment.created', 'segment.updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  settings   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone            TEXT,
  email            TEXT,
  name             TEXT,
  whatsapp_id      TEXT,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  custom_fields    JSONB NOT NULL DEFAULT '{}',
  opt_out_channels channel_type[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, phone),
  UNIQUE (org_id, email)
);

CREATE TABLE IF NOT EXISTS audience_segments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  filter_query  JSONB NOT NULL DEFAULT '{}',
  contact_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  channel       channel_type NOT NULL,
  status        campaign_status NOT NULL DEFAULT 'draft',
  segment_id    UUID REFERENCES audience_segments(id) ON DELETE SET NULL,
  template_name TEXT,
  template_vars JSONB NOT NULL DEFAULT '{}',
  message_body  TEXT,
  subject       TEXT,
  from_name     TEXT,
  scheduled_at  TIMESTAMPTZ,
  launched_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel       channel_type NOT NULL,
  recipient_id  TEXT NOT NULL,
  template_vars JSONB NOT NULL DEFAULT '{}',
  status        message_status NOT NULL DEFAULT 'pending',
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  external_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mandates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  channel          channel_type NOT NULL,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  trigger_regex    TEXT,
  match_all        BOOLEAN NOT NULL DEFAULT FALSE,
  action_type      mandate_action_type NOT NULL,
  action_config    JSONB NOT NULL DEFAULT '{}',
  priority         INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel      channel_type NOT NULL,
  sender_id    TEXT NOT NULL,
  body         TEXT,
  media_url    TEXT,
  media_type   TEXT,
  external_id  TEXT,
  raw_payload  JSONB NOT NULL DEFAULT '{}',
  mandate_id   UUID REFERENCES mandates(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_message_id UUID REFERENCES campaign_messages(id) ON DELETE SET NULL,
  inbound_message_id  UUID REFERENCES inbound_messages(id) ON DELETE SET NULL,
  channel             channel_type NOT NULL,
  recipient_id        TEXT NOT NULL,
  body                TEXT,
  subject             TEXT,
  template_name       TEXT,
  template_vars       JSONB NOT NULL DEFAULT '{}',
  status              message_status NOT NULL DEFAULT 'pending',
  external_id         TEXT,
  error_message       TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  next_retry_at       TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outbound_message_id UUID NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  event_type          delivery_event_type NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}',
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_campaigns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  platform         social_platform NOT NULL,
  content          TEXT NOT NULL,
  media_urls       TEXT[] NOT NULL DEFAULT '{}',
  scheduled_at     TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  external_post_id TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',
  error_message    TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID,
  action        audit_action NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_mandates_updated_at BEFORE UPDATE ON mandates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_outbound_messages_updated_at BEFORE UPDATE ON outbound_messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const SQL_002 = `
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::UUID;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_segments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_campaigns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY contacts_org_isolation ON contacts FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY contacts_service_role_bypass ON contacts FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY campaigns_org_isolation ON campaigns FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY campaigns_service_role_bypass ON campaigns FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mandates_org_isolation ON mandates FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mandates_service_role_bypass ON mandates FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY outbound_messages_org_isolation ON outbound_messages FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY outbound_messages_service_role_bypass ON outbound_messages FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY inbound_messages_org_isolation ON inbound_messages FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY inbound_messages_service_role_bypass ON inbound_messages FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY delivery_logs_org_isolation ON delivery_logs FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY delivery_logs_service_role_bypass ON delivery_logs FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY audit_logs_org_isolation ON audit_logs FOR ALL TO authenticated USING (org_id = get_user_org_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY audit_logs_service_role_bypass ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const SQL_003 = `
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_phone ON contacts(org_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_org_email ON contacts(org_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns(org_id, status);
CREATE INDEX IF NOT EXISTS idx_mandates_org_id ON mandates(org_id);
CREATE INDEX IF NOT EXISTS idx_mandates_org_channel_active ON mandates(org_id, channel) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_outbound_messages_org_id ON outbound_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_status ON outbound_messages(status);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_created_at ON outbound_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_org_id ON inbound_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_outbound_message_id ON delivery_logs(outbound_message_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
`;

const MIGRATIONS = [
  { name: '001_initial_schema', sql: SQL_001 },
  { name: '002_rls_policies',   sql: SQL_002 },
  { name: '003_indexes',        sql: SQL_003 },
];

export async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.warn('DATABASE_URL not set — skipping auto-migration');
    return;
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query('SELECT name FROM _migrations');
    const applied = new Set(rows.map((r: { name: string }) => r.name));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) {
        logger.debug(`Migration already applied: ${migration.name}`);
        continue;
      }
      logger.info(`Applying migration: ${migration.name}`);
      await pool.query(migration.sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      logger.info(`Migration applied: ${migration.name}`);
    }

    logger.info('All migrations up to date');
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Migration failed', { error: error.message });
    throw err;
  } finally {
    await pool.end();
  }
}
