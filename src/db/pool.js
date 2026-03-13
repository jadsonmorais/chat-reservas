import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Run a query against the pool.
 * @param {string} text  SQL query
 * @param {any[]}  params  Bind parameters
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Acquire a dedicated client for transactions.
 * Caller MUST call client.release() when done.
 */
export const getClient = () => pool.connect();

export default pool;
