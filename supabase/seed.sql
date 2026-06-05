-- ─── Seed Data for AirPay Campaign Manager ───────────────────────────────────

-- ─── Sample Organization ─────────────────────────────────────────────────────
INSERT INTO organizations (id, name, slug, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'AirPay Namibia',
  'airpay-namibia',
  '{
    "whatsapp_phone_number_id": "your_phone_number_id",
    "sms_sender_id": "AirPay",
    "email_from": "campaigns@airpay.com.na",
    "timezone": "Africa/Windhoek"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─── Sample Contacts ─────────────────────────────────────────────────────────
INSERT INTO contacts (id, org_id, phone, email, name, whatsapp_id, tags, custom_fields)
VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '+264811234567',
    'john.doe@example.com',
    'John Doe',
    '264811234567',
    ARRAY['vip', 'mobile-money'],
    '{"account_type": "personal", "balance_tier": "premium"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    '+264812345678',
    'jane.smith@example.com',
    'Jane Smith',
    '264812345678',
    ARRAY['merchant'],
    '{"account_type": "business", "merchant_category": "retail"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    '+264813456789',
    'sam.nakale@example.com',
    'Sam Nakale',
    '264813456789',
    ARRAY['new-user'],
    '{"account_type": "personal", "onboarding_step": "kyc"}'::jsonb
  )
ON CONFLICT (org_id, phone) DO NOTHING;

-- ─── Sample Audience Segment ─────────────────────────────────────────────────
INSERT INTO audience_segments (id, org_id, name, description, filter_query, contact_count)
VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',
    'All Active Contacts',
    'All contacts who have not opted out of any channel',
    '{"conditions": [], "logic": "AND"}'::jsonb,
    3
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000001',
    'VIP Customers',
    'Contacts tagged as VIP',
    '{"conditions": [{"field": "tags", "operator": "contains", "value": "vip"}], "logic": "AND"}'::jsonb,
    1
  ),
  (
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000001',
    'Merchants',
    'Business merchant accounts',
    '{"conditions": [{"field": "tags", "operator": "contains", "value": "merchant"}], "logic": "AND"}'::jsonb,
    1
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Sample Mandates ─────────────────────────────────────────────────────────

-- 1. Balance Enquiry — respond with balance info link
INSERT INTO mandates (
  id, org_id, name, description, channel, trigger_keywords, trigger_regex,
  match_all, action_type, action_config, priority, is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000001',
  'Balance Enquiry',
  'Auto-respond to balance check requests on WhatsApp',
  'whatsapp',
  ARRAY['balance', 'bal', 'check balance', 'my balance'],
  NULL,
  FALSE,
  'auto_reply',
  '{
    "message": "Hi! To check your AirPay balance, open the AirPay app or dial *123# on your phone. For more help, reply HELP. 💳"
  }'::jsonb,
  10,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 2. Help Menu — display menu of options
INSERT INTO mandates (
  id, org_id, name, description, channel, trigger_keywords, trigger_regex,
  match_all, action_type, action_config, priority, is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000001',
  'Help Menu',
  'Show help menu when customer sends HELP or MENU',
  'whatsapp',
  ARRAY['help', 'menu', 'hi', 'hello', 'start'],
  NULL,
  FALSE,
  'auto_reply',
  '{
    "message": "Welcome to AirPay Support! 👋\n\nHow can we help you?\n\n1️⃣ Reply BAL to check balance\n2️⃣ Reply SEND to send money\n3️⃣ Reply BUY to buy airtime\n4️⃣ Reply AGENT to find an agent\n5️⃣ Reply COMPLAINT for escalation\n\nOur team is available Mon-Fri 8am-6pm CAT."
  }'::jsonb,
  5,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 3. Complaint Escalation — escalate to support team
INSERT INTO mandates (
  id, org_id, name, description, channel, trigger_keywords, trigger_regex,
  match_all, action_type, action_config, priority, is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000032',
  '00000000-0000-0000-0000-000000000001',
  'Complaint Escalation',
  'Escalate complaints to the support team and send acknowledgement',
  'whatsapp',
  ARRAY['complaint', 'problem', 'issue', 'urgent', 'help me', 'fraud', 'stolen'],
  NULL,
  FALSE,
  'escalate',
  '{
    "message": "We are sorry to hear you are experiencing an issue. 😔 Your complaint has been logged and a support agent will contact you within 2 hours. Your reference number has been recorded. For urgent issues, call 0800 247 365.",
    "notify_email": "support@airpay.com.na",
    "escalate_to": "support_queue"
  }'::jsonb,
  20,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 4. Opt-out handler (SMS)
INSERT INTO mandates (
  id, org_id, name, description, channel, trigger_keywords, trigger_regex,
  match_all, action_type, action_config, priority, is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000033',
  '00000000-0000-0000-0000-000000000001',
  'SMS Opt-Out',
  'Process opt-out requests from SMS',
  'sms',
  ARRAY['stop', 'unsubscribe', 'opt out', 'optout', 'cancel'],
  NULL,
  FALSE,
  'opt_out',
  '{
    "channels": ["sms"],
    "confirm_message": "You have been unsubscribed from AirPay SMS notifications. Reply START to resubscribe."
  }'::jsonb,
  100,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
