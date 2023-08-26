import pg from 'pg';
import { drizzle } from '~/node-postgres/index.ts';

const { Client } = pg;

export const db = drizzle(new Client());
