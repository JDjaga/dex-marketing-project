import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _dexNeonPool: Pool | undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function getDb() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (!global._dexNeonPool) {
    global._dexNeonPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
      max: 10,
      connectionTimeoutMillis: 10000,
    });

    global._dexNeonPool.on('error', (err) => {
      console.error('[DB Pool] Idle connection error:', err.message);
    });
  }

  return drizzle(global._dexNeonPool, { schema });
}
