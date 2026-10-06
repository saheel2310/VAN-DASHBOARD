// Applies pending SQL files from db/migrations in name order. Creates the database if it doesn't exist.
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureDatabase(url) {
  const probe = new Client({ connectionString: url });
  try {
    await probe.connect();
    await probe.end();
  } catch (err) {
    if (err.code !== '3D000') throw err; // 3D000 = database does not exist
    const target = new URL(url);
    const dbName = decodeURIComponent(target.pathname.slice(1));
    target.pathname = '/postgres';
    const admin = new Client({ connectionString: target.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(dbName)}`);
    await admin.end();
    console.log(`Created database "${dbName}".`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set in backend/.env');

  await ensureDatabase(url);
  const client = new Client({ connectionString: url });
  client.on('notice', n => console.log(`NOTICE: ${n.message}`));
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map(r => r.name));

    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
      console.log(`Applied ${file}`);
      count++;
    }
    console.log(count ? `Done: ${count} migration(s) applied.` : 'Database is up to date.');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
