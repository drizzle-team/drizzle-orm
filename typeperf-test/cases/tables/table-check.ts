import type { Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, Table>> = TTables;

export type Tmp = Check<typeof schema>;
