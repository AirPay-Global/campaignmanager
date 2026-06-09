import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { campaignEngine } from '../engines/campaign.engine';
import { deliveryService } from '../services/delivery.service';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /campaigns/:campaignId/ab-test — create an A/B test from an existing campaign
router.post(
  '/campaigns/:campaignId/ab-test',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { campaignId } = req.params;
    const body = req.body as {
      name?: string;
      split_percent?: number;
      variant_b: {
        name?: string;
        message_body?: string;
        template_name?: string;
        subject?: string;
      };
    };

    if (!body.variant_b) {
      res.status(400).json({ error: 'Bad Request', message: 'variant_b content is required' });
      return;
    }

    // Fetch variant A (original campaign)
    const { data: variantA, error: fetchError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !variantA) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    if (variantA.ab_test_id) {
      res.status(409).json({ error: 'Conflict', message: 'Campaign is already part of an A/B test' });
      return;
    }

    if (!['draft', 'scheduled', 'paused'].includes(variantA.status as string)) {
      res.status(409).json({ error: 'Conflict', message: 'Can only create A/B test from a draft or paused campaign' });
      return;
    }

    const splitPercent = Math.min(99, Math.max(1, body.split_percent ?? 50));

    // Create the ab_tests record
    const { data: abTest, error: testError } = await supabase
      .from('ab_tests')
      .insert({
        org_id: orgId,
        name: body.name ?? `${variantA.name} A/B Test`,
        split_percent: splitPercent,
        status: 'draft',
        created_by: userId,
      })
      .select()
      .single();

    if (testError || !abTest) {
      logger.error('Failed to create ab_test', { error: testError?.message });
      res.status(500).json({ error: 'Internal Server Error', message: testError?.message });
      return;
    }

    // Tag variant A
    await supabase
      .from('campaigns')
      .update({ ab_test_id: abTest.id, ab_variant_label: 'A' })
      .eq('id', campaignId);

    // Create variant B
    const vb = body.variant_b;
    const { data: variantB, error: bError } = await supabase
      .from('campaigns')
      .insert({
        org_id: orgId,
        name: vb.name ?? `${variantA.name} — Variant B`,
        description: variantA.description,
        channel: variantA.channel,
        status: 'draft',
        segment_id: variantA.segment_id,
        template_name: vb.template_name ?? variantA.template_name,
        template_vars: variantA.template_vars,
        message_body: vb.message_body ?? variantA.message_body,
        subject: vb.subject ?? variantA.subject,
        from_name: variantA.from_name,
        metadata: variantA.metadata ?? {},
        is_template: false,
        ab_test_id: abTest.id,
        ab_variant_label: 'B',
        created_by: userId,
      })
      .select()
      .single();

    if (bError || !variantB) {
      // Rollback: remove test and untag variant A
      await supabase.from('ab_tests').delete().eq('id', abTest.id);
      await supabase.from('campaigns').update({ ab_test_id: null, ab_variant_label: null }).eq('id', campaignId);
      res.status(500).json({ error: 'Internal Server Error', message: bError?.message });
      return;
    }

    res.status(201).json({ abTest, variantA: { ...variantA, ab_test_id: abTest.id, ab_variant_label: 'A' }, variantB });
  }),
);

// GET /ab-tests/:testId — get test + both variants + stats
router.get(
  '/:testId',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { testId } = req.params;

    const { data: test, error: testError } = await supabase
      .from('ab_tests')
      .select('*')
      .eq('id', testId)
      .eq('org_id', orgId)
      .single();

    if (testError || !test) {
      res.status(404).json({ error: 'Not Found', message: 'A/B test not found' });
      return;
    }

    const { data: variants } = await supabase
      .from('campaigns')
      .select('*')
      .eq('ab_test_id', testId);

    const variantA = (variants ?? []).find((v: { ab_variant_label: string }) => v.ab_variant_label === 'A');
    const variantB = (variants ?? []).find((v: { ab_variant_label: string }) => v.ab_variant_label === 'B');

    const [statsA, statsB] = await Promise.all([
      variantA ? deliveryService.getCampaignStats(variantA.id as string).catch(() => null) : null,
      variantB ? deliveryService.getCampaignStats(variantB.id as string).catch(() => null) : null,
    ]);

    res.json({ test, variantA, variantB, statsA, statsB });
  }),
);

// POST /ab-tests/:testId/launch — split audience and launch both variants
router.post(
  '/:testId/launch',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { testId } = req.params;

    const { data: test } = await supabase
      .from('ab_tests')
      .select('id')
      .eq('id', testId)
      .eq('org_id', orgId)
      .single();

    if (!test) {
      res.status(404).json({ error: 'Not Found', message: 'A/B test not found' });
      return;
    }

    const result = await campaignEngine.launchABTest(testId, userId);
    res.json({ success: true, enqueuedA: result.enqueuedA, enqueuedB: result.enqueuedB, total: result.enqueuedA + result.enqueuedB });
  }),
);

// POST /ab-tests/:testId/declare-winner
router.post(
  '/:testId/declare-winner',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { testId } = req.params;
    const { winner_campaign_id } = req.body as { winner_campaign_id: string };

    if (!winner_campaign_id) {
      res.status(400).json({ error: 'Bad Request', message: 'winner_campaign_id is required' });
      return;
    }

    const { data: test } = await supabase
      .from('ab_tests')
      .select('id')
      .eq('id', testId)
      .eq('org_id', orgId)
      .single();

    if (!test) {
      res.status(404).json({ error: 'Not Found', message: 'A/B test not found' });
      return;
    }

    await supabase
      .from('ab_tests')
      .update({ status: 'completed', winner_campaign_id })
      .eq('id', testId);

    // Pause the losing variant
    const { data: variants } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('ab_test_id', testId);

    for (const v of (variants ?? []) as Array<{ id: string; status: string }>) {
      if (v.id !== winner_campaign_id && v.status === 'running') {
        await supabase.from('campaigns').update({ status: 'paused' }).eq('id', v.id);
      }
    }

    res.json({ success: true, winner_campaign_id });
  }),
);

export default router;
