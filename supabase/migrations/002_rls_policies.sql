-- ─── Helper: get org_id from JWT claims ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── Enable RLS on all tenant tables ─────────────────────────────────────────
ALTER TABLE contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_segments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;

-- ─── contacts ────────────────────────────────────────────────────────────────
CREATE POLICY contacts_org_isolation ON contacts
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY contacts_service_role_bypass ON contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── audience_segments ───────────────────────────────────────────────────────
CREATE POLICY audience_segments_org_isolation ON audience_segments
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY audience_segments_service_role_bypass ON audience_segments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── campaigns ───────────────────────────────────────────────────────────────
CREATE POLICY campaigns_org_isolation ON campaigns
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY campaigns_service_role_bypass ON campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── campaign_messages ───────────────────────────────────────────────────────
CREATE POLICY campaign_messages_org_isolation ON campaign_messages
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY campaign_messages_service_role_bypass ON campaign_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── mandates ────────────────────────────────────────────────────────────────
CREATE POLICY mandates_org_isolation ON mandates
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY mandates_service_role_bypass ON mandates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── inbound_messages ────────────────────────────────────────────────────────
CREATE POLICY inbound_messages_org_isolation ON inbound_messages
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY inbound_messages_service_role_bypass ON inbound_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── outbound_messages ───────────────────────────────────────────────────────
CREATE POLICY outbound_messages_org_isolation ON outbound_messages
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY outbound_messages_service_role_bypass ON outbound_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── delivery_logs ───────────────────────────────────────────────────────────
CREATE POLICY delivery_logs_org_isolation ON delivery_logs
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY delivery_logs_service_role_bypass ON delivery_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── social_campaigns ────────────────────────────────────────────────────────
CREATE POLICY social_campaigns_org_isolation ON social_campaigns
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY social_campaigns_service_role_bypass ON social_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── audit_logs ──────────────────────────────────────────────────────────────
CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY audit_logs_service_role_bypass ON audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
