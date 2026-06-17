import { Router, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { publicFormRateLimiter } from '../middleware/rate-limit.middleware';
import { tryEnrollByTrigger } from '../engines/workflow.engine';
import { recordTouch } from '../services/attribution.service';

const router = Router();

// Allow all origins for public endpoints (forms are embedded on external sites)
router.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

// GET /api/v1/public/forms/:id — fetch form schema (no auth, safe subset)
router.get(
  '/forms/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data: form, error } = await supabase
      .from('forms')
      .select('id, name, description, fields, success_message, redirect_url')
      .eq('id', id!)
      .eq('is_active', true)
      .single();

    if (error || !form) {
      res.status(404).json({ error: 'Form not found or inactive' });
      return;
    }

    res.json(form);
  }),
);

// POST /api/v1/public/forms/:id/submit
router.post(
  '/forms/:id/submit',
  publicFormRateLimiter,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const submission = req.body as Record<string, unknown>;

    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('*')
      .eq('id', id!)
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      res.status(404).json({ error: 'Form not found or inactive' });
      return;
    }

    const fields = (form.fields ?? []) as FormField[];

    // Validate required fields
    const errors: string[] = [];
    for (const field of fields) {
      if (field.required) {
        const val = submission[field.id];
        if (val === undefined || val === null || String(val).trim() === '' || val === false) {
          errors.push(`${field.label} is required`);
        }
      }
    }
    if (errors.length > 0) {
      res.status(400).json({ error: 'Validation failed', errors });
      return;
    }

    // Extract contact identifiers from typed fields
    const emailField = fields.find(f => f.type === 'email');
    const phoneField = fields.find(f => f.type === 'phone');
    const nameField  = fields.find(f => f.type === 'text' && f.label.toLowerCase().includes('name'));

    const email = emailField ? String(submission[emailField.id] ?? '').trim() || null : null;
    const phone = phoneField ? String(submission[phoneField.id] ?? '').trim() || null : null;
    const name  = nameField  ? String(submission[nameField.id] ?? '').trim()  || null : null;

    let contactId: string | null = null;

    try {
      if (email || phone) {
        // Build upsert payload — prefer email as conflict key
        const upsertData: Record<string, unknown> = {
          org_id: form.org_id,
          ...(name  ? { name }  : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        };

        const conflictCol = email ? 'org_id,email' : 'org_id,phone';

        const { data: contact } = await supabase
          .from('contacts')
          .upsert(upsertData, { onConflict: conflictCol, ignoreDuplicates: false })
          .select('id, tags')
          .single();

        if (contact) {
          contactId = contact.id as string;

          // Apply tags
          const tagsToApply = (form.tags_to_apply ?? []) as string[];
          if (tagsToApply.length > 0) {
            const merged = [...new Set([...(contact.tags ?? []), ...tagsToApply])];
            await supabase.from('contacts').update({ tags: merged }).eq('id', contactId);
          }
        }
      }
    } catch (err) {
      logger.warn('Form submit: contact upsert failed', { formId: id, error: (err as Error).message });
    }

    // Store submission
    const { error: subError } = await supabase.from('form_submissions').insert({
      form_id: form.id,
      org_id: form.org_id,
      contact_id: contactId,
      data: submission,
      ip_address: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    });

    if (subError) {
      logger.error('Failed to store form submission', { formId: id, error: subError.message });
    } else {
      // Increment denormalized counter
      await supabase
        .from('forms')
        .update({ submission_count: (form.submission_count as number) + 1 })
        .eq('id', form.id);
    }

    // Record attribution (non-blocking)
    if (contactId) {
      const utmSource   = String(submission['utm_source']   ?? '').trim() || undefined;
      const utmMedium   = String(submission['utm_medium']   ?? '').trim() || undefined;
      const utmCampaign = String(submission['utm_campaign'] ?? '').trim() || undefined;
      const utmContent  = String(submission['utm_content']  ?? '').trim() || undefined;
      recordTouch({
        contactId,
        orgId: form.org_id as string,
        sourceType: 'form',
        sourceId: form.id as string,
        sourceName: form.name as string,
        channel: 'web',
        utmSource, utmMedium, utmCampaign, utmContent,
      }).catch(() => {});
    }

    // Fire workflow trigger (non-blocking)
    if (contactId) {
      tryEnrollByTrigger(contactId, form.org_id as string, 'form_submit', { form_id: form.id }).catch(() => {});

      // Also enroll in the form's linked workflow if set
      if (form.workflow_id) {
        const { enrollContacts } = await import('../engines/workflow.engine');
        enrollContacts(form.workflow_id as string, [contactId], form.org_id as string).catch(() => {});
      }
    }

    res.json({
      success: true,
      message: form.success_message as string,
      redirect_url: (form.redirect_url as string) ?? null,
    });
  }),
);

export default router;
