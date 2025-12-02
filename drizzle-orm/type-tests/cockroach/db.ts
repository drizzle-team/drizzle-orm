import pg from 'pg';
import { drizzle } from '~/cockroach/index.ts';

const { Client } = pg;

export const db = drizzle({ client: new Client() });
