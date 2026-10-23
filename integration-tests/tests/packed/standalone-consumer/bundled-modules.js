// Prints the modules of drizzle-orm's bundled client that load while drizzle-orm/postgres/core runs a
// query and a batch on a pool from the standalone package.
import { registerHooks } from 'node:module';

const urls = new Set();
registerHooks({
	resolve(specifier, context, nextResolve) {
		const result = nextResolve(specifier, context);
		urls.add(result.url);
		return result;
	},
});

const { createPool } = await import('@drizzle-team/postgres');
const { sql } = await import('drizzle-orm');
const { drizzle } = await import('drizzle-orm/postgres/core');

const client = createPool(process.env.PG_CONNECTION_STRING);
const db = drizzle({ client });
try {
	await db.execute(sql`select 1`);
	await db.batch([db.execute(sql`select 1`), db.execute(sql`select 2`)]);
} finally {
	await client.end();
}

const marker = '/drizzle-orm/postgres/client/';
console.log(
	JSON.stringify([...urls].filter((url) => url.includes(marker)).map((url) => url.slice(url.indexOf(marker)))),
);
