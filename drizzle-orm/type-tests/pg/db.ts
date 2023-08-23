import { Client } from 'pg';
import { drizzle } from '~/node-postgres/index.ts';

export const db = drizzle(new Client());
