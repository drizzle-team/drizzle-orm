import { Client } from 'pg';
import { drizzle } from '~/node-postgres';

export const db = drizzle(new Client());
