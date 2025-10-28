import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { test as base } from 'vitest';
import { relations } from './relations';

export const test = base.extend<{ db: PgDatabase<any, any, typeof relations> }>({
	db: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const envurl = process.env['NEON_CONNECTION_STRING'];
			if (!envurl) throw new Error();

			const client = neon(envurl);

			const db = drizzle({ client, relations });

			// const query = async (sql: string, params: any[] = []) => {
			// 	const res = await client(sql, params);
			// 	return res as any[];
			// };

			// const batch = async (statements: string[]) => {
			// 	return client(statements.map((x) => x.endsWith(';') ? x : `${x};`).join('\n')).then(() => '' as any);
			// };

			await use(db);
		},
		{ scope: 'worker' },
	],
});
