const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

pool.on('error', err => console.error('[db] idle client error:', err.message));

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
