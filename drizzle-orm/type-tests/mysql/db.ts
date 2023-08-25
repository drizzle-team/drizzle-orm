import { createPool } from 'mysql2/promise';
import { drizzle } from '~/mysql2/index.ts';

const pool = createPool({});

export const db = drizzle(pool);

{
	drizzle(pool);
	// @ts-expect-error - missing mode
	drizzle(pool, { schema: {} });
	drizzle(pool, { schema: {}, mode: 'default' });
	drizzle(pool, { schema: {}, mode: 'planetscale' });
	drizzle(pool, { mode: 'default' });
	drizzle(pool, { mode: 'planetscale' });
}
