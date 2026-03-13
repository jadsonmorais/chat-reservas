import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run the SQL schema file against the database.
 * Safe to call multiple times — all statements use IF NOT EXISTS.
 */
export async function initDatabase() {
  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(sql);
    console.log('[DB] Schema initialised successfully');
  } catch (err) {
    console.error('[DB] Schema initialisation failed:', err.message);
    throw err;
  }
}

// Allow standalone execution: node src/db/init.js
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
