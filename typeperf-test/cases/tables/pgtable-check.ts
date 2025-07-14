import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { schema } from '../../lib/schema.ts';

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, PgTable>> = TTables;

export type Tmp = Check<typeof schema>;
