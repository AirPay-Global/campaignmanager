import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

type AuditAction =
  | 'campaign.created'
  | 'campaign.updated'
  | 'campaign.launched'
  | 'campaign.paused'
  | 'campaign.completed'
  | 'contact.created'
  | 'contact.updated'
  | 'contact.opt_out'
  | 'contact.imported'
  | 'mandate.created'
  | 'mandate.updated'
  | 'mandate.deleted'
  | 'message.sent'
  | 'message.failed'
  | 'segment.created'
  | 'segment.updated';

class AuditService {
  async log(
    orgId: string,
    userId: string | null,
    action: AuditAction,
    resourceType: string,
    resourceId?: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        org_id: orgId,
        user_id: userId ?? null,
        action,
        resource_type: resourceType,
        resource_id: resourceId ?? null,
        metadata,
        created_at: new Date().toISOString(),
      });

      if (error) {
        logger.error('Failed to write audit log', {
          orgId,
          action,
          resourceType,
          resourceId,
          error: error.message,
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Audit service exception', { error: error.message });
    }
  }
}

export const auditService = new AuditService();
export default auditService;
