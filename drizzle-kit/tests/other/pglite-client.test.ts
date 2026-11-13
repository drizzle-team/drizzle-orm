import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, test } from 'vitest';
import { preparePostgresDB } from '../../src/cli/connections';

const clients: PGlite[] = [];
const newClient = () => {
	const client = new PGlite();
	clients.push(client);
	return client;
};

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
});

test('pglite client: preparePostgresDB queries through the provided instance', async () => {
	const client = newClient();
	await client.waitReady;
	await client.exec(`create table users (id integer primary key, name text);`);
	await client.exec(`insert into users values (1, 'drizzle');`);

	const db = await preparePostgresDB({ driver: 'pglite', client });

	expect(db.packageName).toBe('pglite');
	// data inserted through the config's client is visible => no new database was created
	expect(await db.query(`select id, name from users;`)).toStrictEqual([{ id: 1, name: 'drizzle' }]);

	// and writes go back into the same instance
	await db.query(`insert into users values (2, 'kit');`);
	const rows = await client.query<{ name: string }>(`select name from users order by id;`);
	expect(rows.rows.map((r) => r.name)).toStrictEqual(['drizzle', 'kit']);
});

test('pglite client: proxy round-trips params through the provided instance', async () => {
	const client = newClient();
	await client.waitReady;
	await client.exec(`create table items (id integer primary key, title text);`);

	const db = await preparePostgresDB({ driver: 'pglite', client });

	await db.proxy({ sql: `insert into items values ($1, $2);`, params: [1, 'first'], mode: 'object', method: 'all' });
	const selected = await db.proxy({
		sql: `select id, title from items where id = $1;`,
		params: [1],
		mode: 'object',
		method: 'all',
	});

	expect(selected).toStrictEqual([{ id: 1, title: 'first' }]);
});

test('pglite url: preparePostgresDB creates its own in-memory instance', async () => {
	const db = await preparePostgresDB({ driver: 'pglite', url: 'memory://' });

	expect(db.packageName).toBe('pglite');
	expect(await db.query(`select 1 as one;`)).toStrictEqual([{ one: 1 }]);
});
