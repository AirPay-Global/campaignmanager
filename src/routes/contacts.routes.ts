import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { contactService } from '../services/contact.service';
import { auditService } from '../services/audit.service';
import { tryEnrollByTrigger } from '../engines/workflow.engine';

const router = Router();

router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /contacts
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const page = Number(req.query['page'] ?? '1');
    const limit = Math.min(Number(req.query['limit'] ?? '50'), 200);
    const search = req.query['search'] as string | undefined;

    const result = await contactService.getContacts(orgId, page, limit, search);
    res.json(result);
  }),
);

// GET /contacts/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const contact = await contactService.getContact(orgId, req.params['id']!);

    if (!contact) {
      res.status(404).json({ error: 'Not Found', message: 'Contact not found' });
      return;
    }

    res.json(contact);
  }),
);

// POST /contacts
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const body = req.body as {
      phone?: string;
      email?: string;
      name?: string;
      whatsapp_id?: string;
      tags?: string[];
      custom_fields?: Record<string, unknown>;
    };

    if (!body.phone && !body.email && !body.whatsapp_id) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'At least one of phone, email, or whatsapp_id is required',
      });
      return;
    }

    const contact = await contactService.createContact(orgId, body);

    await auditService.log(orgId, userId, 'contact.created', 'contact', contact.id, {
      phone: body.phone,
      email: body.email,
    });

    // Fire workflow trigger (non-blocking)
    tryEnrollByTrigger(contact.id, orgId, 'contact_created').catch(() => {});

    res.status(201).json(contact);
  }),
);

// PATCH /contacts/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;
    const body = req.body as {
      phone?: string;
      email?: string;
      name?: string;
      whatsapp_id?: string;
      tags?: string[];
      custom_fields?: Record<string, unknown>;
    };

    const contact = await contactService.updateContact(orgId, id!, body);

    await auditService.log(orgId, userId, 'contact.updated', 'contact', id, { changes: body });

    res.json(contact);
  }),
);

// DELETE /contacts/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { supabase } = await import('../lib/supabase');
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id!)
      .eq('org_id', orgId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    res.status(204).send();
  }),
);

// POST /contacts/:id/opt-out
router.post(
  '/:id/opt-out',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;
    const body = req.body as { channels?: string[] };

    const validChannels = ['whatsapp', 'sms', 'email', 'push'];
    const channels = body.channels?.length
      ? body.channels.filter((c) => validChannels.includes(c))
      : validChannels;

    const contact = await contactService.optOut(
      orgId,
      id!,
      channels as ('whatsapp' | 'sms' | 'email' | 'push')[],
    );

    await auditService.log(orgId, userId, 'contact.opt_out', 'contact', id, { channels });

    res.json(contact);
  }),
);

// POST /contacts/import
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const body = req.body as {
      contacts?: Array<{
        phone?: string;
        email?: string;
        name?: string;
        whatsapp_id?: string;
        tags?: string[];
        custom_fields?: Record<string, unknown>;
      }>;
    };

    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'contacts array is required and must not be empty',
      });
      return;
    }

    if (body.contacts.length > 10_000) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Maximum 10,000 contacts per import',
      });
      return;
    }

    const result = await contactService.importContacts(orgId, body.contacts);

    await auditService.log(orgId, userId, 'contact.imported', 'contact', null, {
      imported: result.imported,
      failed: result.failed,
      total: body.contacts.length,
    });

    res.json(result);
  }),
);

export default router;
