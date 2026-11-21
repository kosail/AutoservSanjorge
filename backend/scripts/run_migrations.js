require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../db');
const migrations = require('../migrations');

const SCHEMA_PATH = path.join(__dirname, '..', 'supabase_schema.sql');
const MIGRATION_LOCK_ID = 2147483001;

const asegurarTablaMigraciones = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(150) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const aplicarEsquemaBase = async (client) => {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
};

async function runMigrations({ logger = console } = {}) {
  const client = await pool.connect();
  let lockAdquirido = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    lockAdquirido = true;

    logger.log('[migracion] Aplicando esquema base idempotente...');
    await aplicarEsquemaBase(client);

    await asegurarTablaMigraciones(client);

    const { rows } = await client.query('SELECT id FROM schema_migrations');
    const aplicadas = new Set(rows.map((row) => row.id));

    for (const migracion of migrations) {
      if (aplicadas.has(migracion.id)) {
        logger.log(`[migracion] ${migracion.id} ya aplicada`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await migracion.up(client);
        await client.query(
          'INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
          [migracion.id]
        );
        await client.query('COMMIT');
        logger.log(`[migracion] ${migracion.id} aplicada`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Falló la migración ${migracion.id}: ${error.message}`);
      }
    }

    logger.log('[migracion] Migraciones completadas');
  } finally {
    if (lockAdquirido) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    }
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error) => {
      console.error('[migracion] Error:', error.message);
      await pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = {
  SCHEMA_PATH,
  MIGRATION_LOCK_ID,
  runMigrations,
};
