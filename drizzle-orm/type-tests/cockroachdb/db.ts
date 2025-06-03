import pg from 'pg';
import { drizzle } from '~/cockroachdb/index.ts';

const { Client } = pg;

export const db = drizzle(new Client());
