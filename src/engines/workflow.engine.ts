import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { enqueue } from './queue.engine';

type ChannelType = 'whatsapp' | 'sms' | 'email';

interface WorkflowStep {
  id: string; workflow_id: string; org_id: string;
  step_order: number; action_type: string;
  action_config: Record<string, unknown>; delay_hours: number;
}

interface WorkflowEnrollment {
  id: string; workflow_id: string; contact_id: string; org_id: string;
  current_step_order: number; status: string; next_step_at: string;
}

interface Contact {
  id: string; org_id: string; phone?: string; email?: string;
  whatsapp_id?: string; name?: string; tags?: string[];
  custom_fields?: Record<string, unknown>;
}

let isProcessing = false;

export async function processEnrollments(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = new Date().toISOString();
    const { data: enrollments, error } = await supabase
      .from('workflow_enrollments')
      .select('*')
      .eq('status', 'active')
      .lte('next_step_at', now)
      .limit(20);

    if (error) {
      logger.error('Failed to fetch workflow enrollments', { error: error.message });
      return;
    }

    for (const enrollment of (enrollments ?? []) as WorkflowEnrollment[]) {
      try {
        await processEnrollmentStep(enrollment);
      } catch (err: unknown) {
        const e = err as Error;
        logger.error('Workflow step failed', { enrollmentId: enrollment.id, error: e.message });
        await supabase
          .from('workflow_enrollments')
          .update({ status: 'failed', error_message: e.message })
          .eq('id', enrollment.id);
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function processEnrollmentStep(enrollment: WorkflowEnrollment): Promise<void> {
  const { data: step } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', enrollment.workflow_id)
    .eq('step_order', enrollment.current_step_order)
    .single();

  if (!step) {
    await supabase
      .from('workflow_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollment.id);
    return;
  }

  await executeAction(step as WorkflowStep, enrollment);

  // Find the next step (next higher step_order)
  const { data: nextStep } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', enrollment.workflow_id)
    .gt('step_order', enrollment.current_step_order)
    .order('step_order', { ascending: true })
    .limit(1)
    .single();

  if (!nextStep) {
    await supabase
      .from('workflow_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollment.id);
    logger.info('Workflow enrollment completed', { enrollmentId: enrollment.id });
  } else {
    const ns = nextStep as WorkflowStep;
    const nextAt = new Date(Date.now() + ns.delay_hours * 3_600_000).toISOString();
    await supabase
      .from('workflow_enrollments')
      .update({ current_step_order: ns.step_order, next_step_at: nextAt })
      .eq('id', enrollment.id);
  }
}

async function executeAction(step: WorkflowStep, enrollment: WorkflowEnrollment): Promise<void> {
  const config = step.action_config;

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', enrollment.contact_id)
    .single();

  if (!contact) return;
  const c = contact as Contact;

  switch (step.action_type) {
    case 'send_message': {
      const channel = config['channel'] as ChannelType;
      let recipientId: string | null = null;
      if (channel === 'email')     recipientId = c.email ?? null;
      else if (channel === 'sms')  recipientId = c.phone ?? null;
      else if (channel === 'whatsapp') recipientId = c.whatsapp_id ?? c.phone ?? null;
      if (!recipientId) return;

      await enqueue({
        orgId: enrollment.org_id,
        channel,
        recipientId,
        body: config['message_body'] ? interpolate(config['message_body'] as string, c) : undefined,
        subject: config['subject'] as string | undefined,
        templateName: config['template_name'] as string | undefined,
        contactId: enrollment.contact_id,
      });
      break;
    }

    case 'add_tag': {
      const tag = config['tag'] as string;
      if (!tag) return;
      const tags = [...new Set([...(c.tags ?? []), tag])];
      await supabase.from('contacts').update({ tags }).eq('id', c.id);
      break;
    }

    case 'remove_tag': {
      const tag = config['tag'] as string;
      if (!tag) return;
      await supabase.from('contacts').update({ tags: (c.tags ?? []).filter(t => t !== tag) }).eq('id', c.id);
      break;
    }

    default:
      logger.warn('Unknown workflow action type', { actionType: step.action_type });
  }
}

function interpolate(text: string, contact: Contact): string {
  const fields: Record<string, string> = {
    name:       contact.name ?? '',
    phone:      contact.phone ?? '',
    email:      contact.email ?? '',
    first_name: (contact.name ?? '').split(' ')[0] ?? '',
    ...Object.fromEntries(Object.entries(contact.custom_fields ?? {}).map(([k, v]) => [k, String(v)])),
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => fields[key] ?? `{{${key}}}`);
}

export async function enrollContacts(
  workflowId: string,
  contactIds: string[],
  orgId: string,
): Promise<{ enrolled: number; skipped: number }> {
  const { data: firstStep } = await supabase
    .from('workflow_steps')
    .select('step_order, delay_hours')
    .eq('workflow_id', workflowId)
    .order('step_order', { ascending: true })
    .limit(1)
    .single();

  if (!firstStep) throw new Error('Workflow has no steps — add at least one step before enrolling contacts');

  const nextAt = new Date(Date.now() + (firstStep.delay_hours as number) * 3_600_000).toISOString();

  let enrolled = 0;
  let skipped = 0;

  for (const contactId of contactIds) {
    const { error } = await supabase.from('workflow_enrollments').insert({
      workflow_id: workflowId,
      contact_id: contactId,
      org_id: orgId,
      current_step_order: firstStep.step_order,
      status: 'active',
      next_step_at: nextAt,
    });

    if (error) {
      if (error.code === '23505') skipped++; // already enrolled
      else { logger.warn('Failed to enroll contact', { contactId, error: error.message }); skipped++; }
    } else {
      enrolled++;
    }
  }

  return { enrolled, skipped };
}

export async function tryEnrollByTrigger(
  contactId: string,
  orgId: string,
  triggerType: string,
  triggerData: Record<string, unknown> = {},
): Promise<void> {
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, trigger_config')
    .eq('org_id', orgId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true);

  if (!workflows?.length) return;

  for (const wf of workflows) {
    if (triggerType === 'tag_added') {
      const requiredTag = (wf.trigger_config as { tag?: string }).tag;
      if (requiredTag && triggerData['tag'] !== requiredTag) continue;
    }
    try {
      await enrollContacts(wf.id as string, [contactId], orgId);
    } catch (err) {
      logger.warn('Auto-enroll failed', { contactId, workflowId: wf.id, err });
    }
  }
}
