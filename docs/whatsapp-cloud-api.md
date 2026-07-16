# WhatsApp Cloud API Integration

## Required Meta Configuration Values

Set these environment variables on your server. **Never expose them to the frontend.**

| Variable | Description |
|---|---|
| `META_GRAPH_VERSION` | Graph API version, e.g. `v22.0` (default if omitted) |
| `META_ACCESS_TOKEN` | Permanent System User Access Token |
| `META_WABA_ID` | WhatsApp Business Account ID |
| `META_PHONE_NUMBER_ID` | Phone Number ID (from Meta Business Manager) |
| `META_WEBHOOK_VERIFY_TOKEN` | Random secret string for webhook verification |
| `WHATSAPP_APP_SECRET` | App Secret for validating webhook payload signatures |

Legacy variable names (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`) are still accepted for backward compatibility.

---

## Generating a System User Access Token

1. Open **Meta Business Manager → Settings → Users → System Users**
2. Create a System User with the **Admin** role
3. Click **Add Assets** → select your WhatsApp Business Account → grant full control
4. Click **Generate New Token** → choose your Meta App → grant these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copy the token and set it as `META_ACCESS_TOKEN`

> Use a **permanent** token (never expires) by generating it from a System User, not a personal account.

---

## Configuring the Webhook Callback URL in Meta

1. Go to **Meta Developers → Your App → WhatsApp → Configuration**
2. Set **Callback URL** to:
   ```
   https://<your-app-domain>/webhooks/whatsapp
   ```
3. Set **Verify Token** to the value of `META_WEBHOOK_VERIFY_TOKEN`
4. Click **Verify and Save**

---

## Which Webhook Events to Subscribe To

Subscribe to the **`messages`** field (under `whatsapp_business_account`). This single field covers:
- Inbound messages from users
- Message status updates: `sent`, `delivered`, `read`, `failed`

---

## Syncing Templates

Templates are pulled from Meta and stored in the `whatsapp_cloud_templates` table.

**Manual sync** — navigate to **WhatsApp → Templates** in the admin UI and click **Sync from Meta**.

**Automatic sync** — the server runs a background cron job every 6 hours (configurable in `src/index.ts`).

Only **APPROVED** templates can be sent. After creating or getting a template approved in Meta Business Manager, run a sync to make it available in the app.

---

## Sending a Test Message

1. Open **Admin → WhatsApp → Send Message**
2. Enter a recipient phone in international format (e.g. `254712345678` — no `+`)
3. Select an APPROVED template from the dropdown
4. Verify the language code matches the template
5. Optionally provide a components JSON array to fill template variables
6. Click **Send Message**

The message record is saved to `outbound_messages` and status updates arrive via webhook.

---

## Inspecting Message Logs

Open **Admin → WhatsApp → Message Log** to see:
- All outbound template messages with send/deliver/read/fail timestamps
- All inbound messages received from WhatsApp users
- Expandable rows showing the full Meta API response and any error details

For raw webhook payloads, query the `webhook_logs` table directly in Supabase.

## Reading Campaign Replies

Replies from contacts land in the **Inbox** page (or `GET /messages/inbound`),
stored in the `inbound_messages` table.

When a contact replies directly to a message you sent, WhatsApp includes the
original message's `wamid` in the reply's `context.id`. The webhook resolves
this to the originating `outbound_message` and copies its `campaign_id` onto the
inbound record (`context_message_id`, `outbound_message_id`, `campaign_id`). The
Inbox shows a **Campaign** column so you can see which campaign each reply
answers, and `GET /messages/inbound` embeds the campaign (`campaign: { id, name }`).

Replies that aren't a threaded reply to a specific message (e.g. a contact
starting a fresh message) have no `context.id` and therefore no campaign
attribution — they still appear in the Inbox, just without a campaign.

---

## Error Reference

| Meta Error Code | Meaning |
|---|---|
| 190 | Invalid or expired access token |
| 10 | Missing WhatsApp permission on the App |
| 100 / 2388094 | Wrong WABA ID |
| 100 / 2388053 | Wrong Phone Number ID |
| 131026 | Recipient is not a valid WhatsApp number |
| 131047 | Template not approved or wrong language |
| 131051 | Template language code mismatch |
| 80007 | Meta rate limit exceeded |
| 131000 | Message delivery failed |
