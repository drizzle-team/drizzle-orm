import type { Pool } from 'drizzle-orm/postgres';
import { expect, test } from 'vitest';
import { preparePostgresDB } from '../../src/cli/connections';

test('Drizzle Postgres client: preparePostgresDB rejects a value that is not a Drizzle Postgres Pool', async () => {
	const client = { query: () => {} } as unknown as Pool;
	await expect(preparePostgresDB({ client })).rejects.toThrowError(
		/dbCredentials\.client is not a Drizzle Postgres Pool/,
	);
});
