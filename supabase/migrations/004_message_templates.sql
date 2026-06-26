-- ─── message_templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'push')),
  subject     TEXT,
  body        TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER trg_message_templates_updated_at
    BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY message_templates_org ON message_templates
    FOR ALL TO authenticated
    USING (org_id = get_user_org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY message_templates_sr ON message_templates
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_message_templates_org     ON message_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_channel ON message_templates(org_id, channel);
