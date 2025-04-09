import { createPool } from 'mysql2/promise';
import { drizzle } from '~/singlestore/index.ts';

const pool = createPool({});

export const db = drizzle(pool);

{
	drizzle(pool);
	drizzle(pool, { schema: {} });
	drizzle(pool, { schema: {} });
	drizzle(pool, {});
}
