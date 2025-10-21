import { createPool } from 'mysql2/promise';
import { drizzle } from '~/mysql2/index.ts';

const pool = createPool({});

export const db = drizzle({ client: pool });

{
	drizzle({ client: pool });
	// @ts-expect-error - missing mode
	drizzle({ client: pool, schema: {} });
	drizzle({ client: pool, schema: {}, mode: 'default' });
	drizzle({ client: pool, schema: {}, mode: 'planetscale' });
	drizzle({ client: pool, mode: 'default' });
	drizzle({ client: pool, mode: 'planetscale' });
}
