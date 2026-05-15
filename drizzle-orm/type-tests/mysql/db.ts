import { createPool } from 'mysql2/promise';
import { drizzle } from '~/mysql2/index.ts';

const pool = createPool({});

export const db = drizzle({ client: pool });
