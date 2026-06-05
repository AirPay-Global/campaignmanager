-- ─── contacts ────────────────────────────────────────────────────────────────
CREATE INDEX idx_contacts_org_id ON contacts(org_id);
CREATE INDEX idx_contacts_org_phone ON contacts(org_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_contacts_org_email ON contacts(org_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_whatsapp_id ON contacts(org_id, whatsapp_id) WHERE whatsapp_id IS NOT NULL;
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_custom_fields ON contacts USING GIN(custom_fields);
CREATE INDEX idx_contacts_name_trgm ON contacts USING GIN(name gin_trgm_ops) WHERE name IS NOT NULL;

-- ─── audience_segments ───────────────────────────────────────────────────────
CREATE INDEX idx_audience_segments_org_id ON audience_segments(org_id);

-- ─── campaigns ───────────────────────────────────────────────────────────────
CREATE INDEX idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX idx_campaigns_org_status ON campaigns(org_id, status);
CREATE INDEX idx_campaigns_scheduled_at ON campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'scheduled';
CREATE INDEX idx_campaigns_segment_id ON campaigns(segment_id);

-- ─── campaign_messages ───────────────────────────────────────────────────────
CREATE INDEX idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
CREATE INDEX idx_campaign_messages_contact_id ON campaign_messages(contact_id);
CREATE INDEX idx_campaign_messages_org_id ON campaign_messages(org_id);
CREATE INDEX idx_campaign_messages_status ON campaign_messages(status);
CREATE INDEX idx_campaign_messages_pending ON campaign_messages(campaign_id, status) WHERE status = 'pending';
CREATE INDEX idx_campaign_messages_scheduled ON campaign_messages(scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'pending';

-- ─── mandates ────────────────────────────────────────────────────────────────
CREATE INDEX idx_mandates_org_id ON mandates(org_id);
CREATE INDEX idx_mandates_org_channel_active ON mandates(org_id, channel) WHERE is_active = TRUE;
CREATE INDEX idx_mandates_priority ON mandates(org_id, priority DESC) WHERE is_active = TRUE;
CREATE INDEX idx_mandates_keywords ON mandates USING GIN(trigger_keywords);

-- ─── inbound_messages ────────────────────────────────────────────────────────
CREATE INDEX idx_inbound_messages_org_id ON inbound_messages(org_id);
CREATE INDEX idx_inbound_messages_contact_id ON inbound_messages(contact_id);
CREATE INDEX idx_inbound_messages_sender ON inbound_messages(org_id, sender_id);
CREATE INDEX idx_inbound_messages_channel ON inbound_messages(org_id, channel);
CREATE INDEX idx_inbound_messages_created_at ON inbound_messages(created_at DESC);
CREATE INDEX idx_inbound_messages_external_id ON inbound_messages(external_id) WHERE external_id IS NOT NULL;

-- ─── outbound_messages ───────────────────────────────────────────────────────
CREATE INDEX idx_outbound_messages_org_id ON outbound_messages(org_id);
CREATE INDEX idx_outbound_messages_contact_id ON outbound_messages(contact_id);
CREATE INDEX idx_outbound_messages_campaign_id ON outbound_messages(campaign_id);
CREATE INDEX idx_outbound_messages_status ON outbound_messages(status);
CREATE INDEX idx_outbound_messages_pending ON outbound_messages(next_retry_at) WHERE status IN ('pending', 'failed') AND next_retry_at IS NOT NULL;
CREATE INDEX idx_outbound_messages_external_id ON outbound_messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_outbound_messages_created_at ON outbound_messages(created_at DESC);

-- ─── delivery_logs ───────────────────────────────────────────────────────────
CREATE INDEX idx_delivery_logs_outbound_message_id ON delivery_logs(outbound_message_id);
CREATE INDEX idx_delivery_logs_org_id ON delivery_logs(org_id);
CREATE INDEX idx_delivery_logs_event_type ON delivery_logs(event_type);
CREATE INDEX idx_delivery_logs_occurred_at ON delivery_logs(occurred_at DESC);

-- ─── social_campaigns ────────────────────────────────────────────────────────
CREATE INDEX idx_social_campaigns_org_id ON social_campaigns(org_id);
CREATE INDEX idx_social_campaigns_campaign_id ON social_campaigns(campaign_id);
CREATE INDEX idx_social_campaigns_platform ON social_campaigns(org_id, platform);
CREATE INDEX idx_social_campaigns_scheduled ON social_campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'draft';

-- ─── audit_logs ──────────────────────────────────────────────────────────────
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(org_id, action);
