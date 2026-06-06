import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const MIGRATIONS = [
  { name: '001_initial_schema', file: '001_initial_schema.sql' },
  { name: '002_rls_policies',   file: '002_rls_policies.sql'   },
  { name: '003_indexes',        file: '003_indexes.sql'        },
];

function getMigrationsDir(): string {
  // Works both from dist/ (production) and src/ (dev)
  const candidates = [
    path.join(__dirname, '../../supabase/migrations'),
    path.join(__dirname, '../supabase/migrations'),
    path.join(process.cwd(), 'supabase/migrations'),
  ];
  return candidates.find(fs.existsSync) ?? candidates[0];
}

export async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.warn('DATABASE_URL not set — skipping auto-migration');
    return;
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await pool.query('SELECT name FROM _migrations');
    const appliedNames = new Set(applied.map((r: { name: string }) => r.name));

    const migrationsDir = getMigrationsDir();

    for (const migration of MIGRATIONS) {
      if (appliedNames.has(migration.name)) {
        logger.debug(`Migration already applied: ${migration.name}`);
        continue;
      }

      const filePath = path.join(migrationsDir, migration.file);
      if (!fs.existsSync(filePath)) {
        logger.warn(`Migration file not found: ${filePath}`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      logger.info(`Applying migration: ${migration.name}`);

      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);

      logger.info(`Migration applied: ${migration.name}`);
    }

    logger.info('All migrations up to date');
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Migration failed', { error: error.message });
    throw err;
  } finally {
    await pool.end();
  }
}
