import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '~/db/schema';
import { env } from '~/lib/env.server';

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const { databaseUrl } = env();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!client) {
    client = postgres(databaseUrl, { max: 10 });
    db = drizzle(client, { schema });
  }
  return db!;
}
