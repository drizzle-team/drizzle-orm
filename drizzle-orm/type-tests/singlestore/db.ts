import { createPool } from 'mysql2/promise';
import { drizzle } from '~/singlestore/index.ts';

const pool = createPool({});

export const db = drizzle({ client: pool });

{
	drizzle({ client: pool });
	drizzle({ client: pool, schema: {} });
	drizzle({ client: pool, schema: {} });
	drizzle({ client: pool });
}
