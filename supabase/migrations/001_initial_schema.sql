-- ─── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE channel_type AS ENUM ('whatsapp', 'sms', 'email', 'push');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');
CREATE TYPE message_status AS ENUM ('pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'bounced');
CREATE TYPE mandate_action_type AS ENUM ('auto_reply', 'webhook', 'escalate', 'tag_contact', 'opt_out');
CREATE TYPE social_platform AS ENUM ('facebook', 'twitter', 'instagram', 'linkedin');
CREATE TYPE delivery_event_type AS ENUM ('sent', 'delivered', 'read', 'failed', 'bounced', 'clicked', 'opened', 'unsubscribed');
CREATE TYPE audit_action AS ENUM (
  'campaign.created', 'campaign.updated', 'campaign.launched', 'campaign.paused',
  'campaign.completed', 'contact.created', 'contact.updated', 'contact.opt_out',
  'contact.imported', 'mandate.created', 'mandate.updated', 'mandate.deleted',
  'message.sent', 'message.failed', 'segment.created', 'segment.updated'
);

-- ─── organizations ──────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── contacts ───────────────────────────────────────────────────────────────
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           TEXT,
  email           TEXT,
  name            TEXT,
  whatsapp_id     TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  opt_out_channels channel_type[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, phone),
  UNIQUE (org_id, email)
);

-- ─── audience_segments ──────────────────────────────────────────────────────
CREATE TABLE audience_segments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  filter_query  JSONB NOT NULL DEFAULT '{}',
  contact_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  channel         channel_type NOT NULL,
  status          campaign_status NOT NULL DEFAULT 'draft',
  segment_id      UUID REFERENCES audience_segments(id) ON DELETE SET NULL,
  template_name   TEXT,
  template_vars   JSONB NOT NULL DEFAULT '{}',
  message_body    TEXT,
  subject         TEXT,
  from_name       TEXT,
  scheduled_at    TIMESTAMPTZ,
  launched_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── campaign_messages ───────────────────────────────────────────────────────
CREATE TABLE campaign_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel         channel_type NOT NULL,
  recipient_id    TEXT NOT NULL,
  template_vars   JSONB NOT NULL DEFAULT '{}',
  status          message_status NOT NULL DEFAULT 'pending',
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  external_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── mandates ────────────────────────────────────────────────────────────────
CREATE TABLE mandates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  channel         channel_type NOT NULL,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  trigger_regex   TEXT,
  match_all       BOOLEAN NOT NULL DEFAULT FALSE,
  action_type     mandate_action_type NOT NULL,
  action_config   JSONB NOT NULL DEFAULT '{}',
  priority        INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── inbound_messages ────────────────────────────────────────────────────────
CREATE TABLE inbound_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel         channel_type NOT NULL,
  sender_id       TEXT NOT NULL,
  body            TEXT,
  media_url       TEXT,
  media_type      TEXT,
  external_id     TEXT,
  raw_payload     JSONB NOT NULL DEFAULT '{}',
  mandate_id      UUID REFERENCES mandates(id) ON DELETE SET NULL,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── outbound_messages ───────────────────────────────────────────────────────
CREATE TABLE outbound_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_message_id UUID REFERENCES campaign_messages(id) ON DELETE SET NULL,
  inbound_message_id  UUID REFERENCES inbound_messages(id) ON DELETE SET NULL,
  channel         channel_type NOT NULL,
  recipient_id    TEXT NOT NULL,
  body            TEXT,
  subject         TEXT,
  template_name   TEXT,
  template_vars   JSONB NOT NULL DEFAULT '{}',
  status          message_status NOT NULL DEFAULT 'pending',
  external_id     TEXT,
  error_message   TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── delivery_logs ───────────────────────────────────────────────────────────
CREATE TABLE delivery_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outbound_message_id UUID NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  event_type          delivery_event_type NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}',
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── social_campaigns ────────────────────────────────────────────────────────
CREATE TABLE social_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  platform        social_platform NOT NULL,
  content         TEXT NOT NULL,
  media_urls      TEXT[] NOT NULL DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  external_post_id TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── audit_logs ──────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
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

-- ─── Triggers for updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audience_segments_updated_at
  BEFORE UPDATE ON audience_segments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_campaign_messages_updated_at
  BEFORE UPDATE ON campaign_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_mandates_updated_at
  BEFORE UPDATE ON mandates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_outbound_messages_updated_at
  BEFORE UPDATE ON outbound_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_social_campaigns_updated_at
  BEFORE UPDATE ON social_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
