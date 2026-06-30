import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';

const router = Router();
router.use(authMiddleware);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportedSegment {
  id: string;
  org_id: string;
  name: string;
  source_app: string | null;
  field_mappings: Record<string, string>;
  custom_field_mappings: Record<string, string>;
  raw_schema: string[];
  members_key: string;
  members: Record<string, unknown>[];
  total_members: number;
  created_at: string;
  updated_at: string;
}

// ─── Helper: resolve a single member to standard + custom fields ──────────────

export function resolveImportedMember(
  rawMember: Record<string, unknown>,
  fieldMappings: Record<string, string>,
  customFieldMappings: Record<string, string>,
): { std: Record<string, string>; custom: Record<string, string> } {
  const std: Record<string, string> = {};
  for (const [stdKey, srcKey] of Object.entries(fieldMappings)) {
    const val = rawMember[srcKey];
    if (val !== null && val !== undefined) std[stdKey] = String(val);
  }
  // Synthesise name from first_name + last_name if not mapped directly
  if (!std.name && (std.first_name || std.last_name)) {
    std.name = `${std.first_name ?? ''} ${std.last_name ?? ''}`.trim();
  }

  const custom: Record<string, string> = {};
  for (const [customKey, srcKey] of Object.entries(customFieldMappings)) {
    const val = rawMember[srcKey];
    if (val !== null && val !== undefined) custom[customKey] = String(val);
  }
  return { std, custom };
}

// ─── List ─────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const orgId = (req as unknown as { user: { org_id: string } }).user.org_id;
  const { data, error } = await supabase
    .from('imported_segments')
    .select('id, org_id, name, source_app, field_mappings, custom_field_mappings, raw_schema, members_key, total_members, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ message: error.message });
  return res.json({ data: data ?? [] });
});

// ─── Get single (includes members) ───────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const orgId = (req as unknown as { user: { org_id: string } }).user.org_id;
  const { data, error } = await supabase
    .from('imported_segments')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return res.status(404).json({ message: 'Not found' });
  return res.json(data);
});

// ─── Create / Import ──────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const orgId = (req as unknown as { user: { org_id: string } }).user.org_id;
  const {
    name,
    source_app,
    field_mappings,
    custom_field_mappings,
    members_key,
    raw_data,            // the full imported JSON object
  } = req.body as {
    name: string;
    source_app?: string;
    field_mappings: Record<string, string>;
    custom_field_mappings: Record<string, string>;
    members_key: string;
    raw_data: Record<string, unknown>;
  };

  if (!name || !raw_data || !members_key) {
    return res.status(400).json({ message: 'name, members_key and raw_data are required' });
  }

  const membersRaw = raw_data[members_key];
  if (!Array.isArray(membersRaw)) {
    return res.status(400).json({ message: `raw_data.${members_key} must be an array` });
  }

  const members = membersRaw as Record<string, unknown>[];
  const rawSchema: string[] = members.length > 0
    ? Object.keys(members[0]).filter(k => typeof members[0][k] !== 'object' || members[0][k] === null || !Array.isArray(members[0][k]))
    : [];

  const { data, error } = await supabase
    .from('imported_segments')
    .insert({
      org_id: orgId,
      name,
      source_app: source_app ?? null,
      field_mappings: field_mappings ?? {},
      custom_field_mappings: custom_field_mappings ?? {},
      members_key,
      members,
      total_members: members.length,
      raw_schema: rawSchema,
    })
    .select('id, name, source_app, total_members, created_at')
    .single();

  if (error) {
    logger.error('Failed to create imported segment', { error: error.message });
    return res.status(500).json({ message: error.message });
  }

  logger.info('Imported segment created', { orgId, name, total: members.length });
  return res.status(201).json(data);
});

// ─── Update field mappings ────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  const orgId = (req as unknown as { user: { org_id: string } }).user.org_id;
  const allowed = ['name', 'source_app', 'field_mappings', 'custom_field_mappings'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const { error } = await supabase
    .from('imported_segments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId);

  if (error) return res.status(500).json({ message: error.message });
  return res.json({ success: true });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  const orgId = (req as unknown as { user: { org_id: string } }).user.org_id;
  const { error } = await supabase
    .from('imported_segments')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId);

  if (error) return res.status(500).json({ message: error.message });
  return res.json({ success: true });
});

// ─── Preview resolved members ─────────────────────────────────────────────────

router.post('/:id/preview', async (req, res) => {
  const orgId = (req as unknown as { user: { org_id: string } }).user.org_id;
  const { data, error } = await supabase
    .from('imported_segments')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return res.status(404).json({ message: 'Not found' });

  const seg = data as ImportedSegment;
  const preview = (seg.members ?? []).slice(0, 5).map(m =>
    resolveImportedMember(m, seg.field_mappings, seg.custom_field_mappings),
  );

  return res.json({ preview, total: seg.total_members });
});

export default router;
