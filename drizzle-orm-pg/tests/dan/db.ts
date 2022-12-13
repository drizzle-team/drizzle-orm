import { Client } from 'pg';
import { drizzle } from '~/node';

export const db = drizzle(new Client());
