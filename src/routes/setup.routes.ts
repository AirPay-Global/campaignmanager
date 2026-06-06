import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

const router = Router();

// POST /api/v1/setup
// Creates the first admin user + organization. Disabled once any user exists.
router.post('/', async (req: Request, res: Response) => {
  const setupToken = process.env.SETUP_TOKEN;

  // Require a setup token to prevent abuse
  if (!setupToken) {
    return res.status(403).json({ error: 'SETUP_TOKEN env var is not set' });
  }

  const { token, orgName, email, password } = req.body;

  if (!token || !orgName || !email || !password) {
    return res.status(400).json({ error: 'token, orgName, email, and password are required' });
  }

  if (token !== setupToken) {
    return res.status(403).json({ error: 'Invalid setup token' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Check if any users already exist — setup runs only once
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    if (existingUsers && existingUsers.users.length > 0) {
      return res.status(409).json({ error: 'Setup already completed. Users already exist.' });
    }

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        timezone: 'Africa/Windhoek',
      })
      .select()
      .single();

    if (orgError) {
      logger.error('Failed to create organization', { error: orgError.message });
      return res.status(500).json({ error: 'Failed to create organization', detail: orgError.message });
    }

    // Create admin user in Supabase Auth
    const anonUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(anonUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        organization_id: org.id,
        role: 'admin',
      },
    });

    if (userError || !userData.user) {
      // Roll back org creation
      await supabase.from('organizations').delete().eq('id', org.id);
      logger.error('Failed to create admin user', { error: userError?.message });
      return res.status(500).json({ error: 'Failed to create admin user', detail: userError?.message });
    }

    logger.info('Setup completed', { orgId: org.id, userId: userData.user.id, email });

    return res.status(201).json({
      message: 'Setup complete! You can now log in.',
      org_id: org.id,
      user_id: userData.user.id,
    });

  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Setup error', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

export default router;
