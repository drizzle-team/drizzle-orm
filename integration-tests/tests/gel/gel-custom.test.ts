import { asc, eq, sql } from 'drizzle-orm';
import { drizzle, type GelJsDatabase } from 'drizzle-orm/gel';
import { alias, customType, gelTable, gelTableCreator } from 'drizzle-orm/gel-core';
import createClient, { type Client } from 'gel';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import 'zx/globals';
import relations from './relations';

let db: GelJsDatabase<never, typeof relations>;
let client: Client;

let dsn: string;
const tlsSecurity = 'insecure';

beforeAll(async () => {
	const connectionString = process.env['GEL_CONNECTION_STRING'];
	if (!connectionString) throw new Error('gel GEL_CONNECTION_STRING is not set. ');

	client = createClient({ dsn: connectionString, tlsSecurity });
	db = drizzle({ client, relations });

	dsn = connectionString;
	await $`gel query "reset schema to initial ;
		CREATE TYPE default::users_custom {
		create property id1: int16 {
			create constraint exclusive;
		};
		create required property name: str;
		create property verified: bool {
		  SET default := false;
		};
		create property json: json;
	};
		CREATE TYPE default::prefixed_users_custom {
		create property id1: int16 {
			create constraint exclusive;
		};
		create required property name: str;
	};
	" --tls-security=${tlsSecurity} --dsn=${dsn}`;
});

afterAll(async () => {
	await client?.close();
});

beforeEach((ctx) => {
	ctx.gel = {
		db,
	};
});

afterEach(async () => {
	await Promise.all([
		client.querySQL(`DELETE FROM "users_custom";`),
		client.querySQL(`DELETE FROM "prefixed_users_custom";`),
	]);
});

const customInteger = customType<{ data: number; notNull: false; default: false }>({
	dataType() {
		return 'integer';
	},
});

const customText = customType<{ data: string }>({
	dataType() {
		return 'text';
	},
});

const customBoolean = customType<{ data: boolean }>({
	dataType() {
		return 'boolean';
	},
});

const customJson = <TData>(name: string) =>
	customType<{ data: TData; driverData: string }>({
		dataType() {
			return 'json';
		},
	})(name);

const usersTable = gelTable('users_custom', {
	id1: customInteger('id1'),
	name: customText('name').notNull(),
	verified: customBoolean('verified').notNull().default(false),
	json: customJson<string[]>('json'),
});

test('select all fields', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result).toEqual([{ id1: 1, name: 'John', verified: false, json: null }]);
});

test('select sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select typed sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('insert returning sql', async (ctx) => {
	const { db } = ctx.gel;

	const users = await db.insert(usersTable).values({ id1: 1, name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	});

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('delete returning sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('update returning sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	expect(users).toEqual([{ name: 'JANE' }]);
});

test('update with returning all fields', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning();

	expect(users).toEqual([{ id1: 1, name: 'Jane', verified: false, json: null }]);
});

test('update with returning partial', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id1: usersTable.id1,
		name: usersTable.name,
	});

	expect(users).toEqual([{ id1: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

	expect(users).toEqual([{ id1: 1, name: 'John', verified: false, json: null }]);
});

test('delete with returning partial', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id1: usersTable.id1,
		name: usersTable.name,
	});

	expect(users).toEqual([{ id1: 1, name: 'John' }]);
});

test('insert + select', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const result = await db.select().from(usersTable);
	expect(result).toEqual([{ id1: 1, name: 'John', verified: false, json: null }]);

	await db.insert(usersTable).values({ id1: 2, name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	expect(result2).toEqual([
		{ id1: 1, name: 'John', verified: false, json: null },
		{ id1: 2, name: 'Jane', verified: false, json: null },
	]);
});

test('insert with overridden default values', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	expect(result).toEqual([{ id1: 1, name: 'John', verified: true, json: null }]);
});

test('insert many', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([
		{ id1: 1, name: 'John' },
		{ id1: 2, name: 'Bruce', json: ['foo', 'bar'] },
		{ id1: 3, name: 'Jane' },
		{ id1: 4, name: 'Austin', verified: true },
	]);
	const result = await db.select({
		id: usersTable.id1,
		name: usersTable.name,
		json: usersTable.json,
		verified: usersTable.verified,
	}).from(usersTable);

	expect(result).toEqual([
		{ id: 1, name: 'John', json: null, verified: false },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', json: null, verified: false },
		{ id: 4, name: 'Austin', json: null, verified: true },
	]);
});

test('insert many with returning', async (ctx) => {
	const { db } = ctx.gel;

	const result = await db.insert(usersTable).values([
		{ id1: 1, name: 'John' },
		{ id1: 2, name: 'Bruce', json: ['foo', 'bar'] },
		{ id1: 3, name: 'Jane' },
		{ id1: 4, name: 'Austin', verified: true },
	])
		.returning({
			id: usersTable.id1,
			name: usersTable.name,
			json: usersTable.json,
			verified: usersTable.verified,
		});

	expect(result).toEqual([
		{ id: 1, name: 'John', json: null, verified: false },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', json: null, verified: false },
		{ id: 4, name: 'Austin', json: null, verified: true },
	]);
});

test('select with group by as field', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([{ id1: 1, name: 'John' }, { id1: 2, name: 'Jane' }, { id1: 3, name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([{ id1: 1, name: 'John' }, { id1: 2, name: 'Jane' }, { id1: 3, name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql + column', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([{ id1: 1, name: 'John' }, { id1: 2, name: 'Jane' }, { id1: 3, name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id1);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }, { name: 'Jane' }]);
});

test('select with group by as column + sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([{ id1: 1, name: 'John' }, { id1: 2, name: 'Jane' }, { id1: 3, name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id1, sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test('select with group by complex query', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([{ id1: 1, name: 'John' }, { id1: 2, name: 'Jane' }, { id1: 3, name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id1, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test('build query', async (ctx) => {
	const { db } = ctx.gel;

	const query = db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id1, usersTable.name)
		.toSQL();

	expect(query).toEqual({
		sql:
			'select "users_custom"."id1", "users_custom"."name" from "users_custom" group by "users_custom"."id1", "users_custom"."name"',
		params: [],
	});
});

test('insert sql', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('partial join with alias', async (ctx) => {
	const { db } = ctx.gel;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values([{ id1: 10, name: 'Ivan' }, { id1: 11, name: 'Hans' }]);
	const result = await db
		.select({
			user: {
				id: usersTable.id1,
				name: usersTable.name,
			},
			customer: {
				id: customerAlias.id1,
				name: customerAlias.name,
			},
		}).from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id1, 11))
		.where(eq(usersTable.id1, 10));

	expect(result).toEqual([{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test('full join with alias', async (ctx) => {
	const { db } = ctx.gel;

	const gelTable = gelTableCreator((name) => `prefixed_${name}`);

	const users = gelTable('users_custom', {
		id1: customInteger('id1'),
		name: customText('name').notNull(),
	});

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id1: 10, name: 'Ivan' }, { id1: 11, name: 'Hans' }]);
	const result = await db
		.select().from(users)
		.leftJoin(customers, eq(customers.id1, 11))
		.where(eq(users.id1, 10));

	expect(result).toEqual([{
		users_custom: {
			id1: 10,
			name: 'Ivan',
		},
		customer: {
			id1: 11,
			name: 'Hans',
		},
	}]);
});

test('insert with spaces', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
});

test('prepared statement', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const statement = db.select({
		id: usersTable.id1,
		name: usersTable.name,
	}).from(usersTable)
		.prepare('statement1');
	const result = await statement.execute();

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement reuse', async (ctx) => {
	const { db } = ctx.gel;

	const stmt = db.insert(usersTable).values({
		id1: sql.placeholder('id1'),
		verified: true,
		name: sql.placeholder('name'),
	}).prepare('stmt2');

	for (let i = 1; i < 11; i++) {
		await stmt.execute({ id1: i, name: `John ${i}` });
	}

	const result = await db.select({
		id1: usersTable.id1,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable);

	expect(result).toEqual([
		{ id1: 1, name: 'John 1', verified: true },
		{ id1: 2, name: 'John 2', verified: true },
		{ id1: 3, name: 'John 3', verified: true },
		{ id1: 4, name: 'John 4', verified: true },
		{ id1: 5, name: 'John 5', verified: true },
		{ id1: 6, name: 'John 6', verified: true },
		{ id1: 7, name: 'John 7', verified: true },
		{ id1: 8, name: 'John 8', verified: true },
		{ id1: 9, name: 'John 9', verified: true },
		{ id1: 10, name: 'John 10', verified: true },
	]);
});

test('prepared statement with placeholder in .where', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const stmt = db.select({
		id: usersTable.id1,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id1, sql.placeholder('id')))
		.prepare('stmt3');
	const result = await stmt.execute({ id: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement with placeholder in .limit', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values({ id1: 1, name: 'John' });
	const stmt = db
		.select({
			id: usersTable.id1,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id1, sql.placeholder('id')))
		.limit(sql.placeholder('limit'))
		.prepare('stmt_limit');

	const result = await stmt.execute({ id: 1, limit: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
	expect(result).toHaveLength(1);
});

test('prepared statement with placeholder in .offset', async (ctx) => {
	const { db } = ctx.gel;

	await db.insert(usersTable).values([{ id1: 1, name: 'John' }, { id1: 2, name: 'John1' }]);
	const stmt = db
		.select({
			id: usersTable.id1,
			name: usersTable.name,
		})
		.from(usersTable)
		.offset(sql.placeholder('offset'))
		.prepare('stmt_offset');

	const result = await stmt.execute({ offset: 1 });

	expect(result).toEqual([{ id: 2, name: 'John1' }]);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id1: number; name: string }>(sql`select id1, name from "users_custom"`);
	expect(result).toEqual([{ id1: null, name: 'John' }]);
});

test('insert via db.execute + returning', async () => {
	const inserted = await db.execute<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${
			sql.identifier(usersTable.name.name)
		}) values (${'John'}) returning ${usersTable.id1}, ${usersTable.name}`,
	);
	expect(inserted).toEqual([{ id1: null, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id1' | 'name'>>(
		db.insert(usersTable).values({ id1: 1, name: 'John' }).returning({ id: usersTable.id1, name: usersTable.name }),
	);
	expect(inserted).toEqual([{ id1: 1, name: 'John' }]);
});

// TODO on conflict does not work
// test.todo('build query insert with onConflict do update', async (ctx) => {
// 	const { db } = ctx.gel;

// 	const query = db.insert(usersTable)
// 		.values({ id1: 1, name: 'John', jsonb: ['foo', 'bar'] })
// 		.onConflictDoUpdate({ target: usersTable.id1, set: { name: 'John1' } })
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql:
// 			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do update set "name" = $3',
// 		params: ['John', '["foo","bar"]', 'John1'],
// 	});
// });

// // TODO on conflict does not work
// test.todo('build query insert with onConflict do update / multiple columns', async (ctx) => {
// 	const { db } = ctx.gel;

// 	const query = db.insert(usersTable)
// 		.values({ id1: 1, name: 'John', jsonb: ['foo', 'bar'] })
// 		.onConflictDoUpdate({ target: [usersTable.id1, usersTable.name], set: { name: 'John1' } })
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql:
// 			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
// 		params: ['John', '["foo","bar"]', 'John1'],
// 	});
// });

// // TODO on conflict does not work
// test.todo('build query insert with onConflict do nothing', async (ctx) => {
// 	const { db } = ctx.gel;

// 	const query = db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' })
// 		.onConflictDoNothing()
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql: 'insert into "users" ("id1", "name", "verified") values ($1, $2, default) on conflict do nothing',
// 		params: [1, 'John'],
// 	});
// });

// // TODO on conflict does not work
// test.todo('build query insert with onConflict do nothing + target', async (ctx) => {
// 	const { db } = ctx.gel;

// 	const query = db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' })
// 		.onConflictDoNothing({ target: usersTable.id1 })
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql: 'insert into "users" ("id1", "name", "verified") values ($1, $2, default) on conflict ("id1") do nothing',
// 		params: [1, 'John'],
// 	});
// });

// // TODO on conflict does not work
// test.todo('insert with onConflict do update', async (ctx) => {
// 	const { db } = ctx.gel;

// 	await db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' });

// 	await db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' })
// 		.onConflictDoUpdate({ target: usersTable.id1, set: { name: 'John1' } });

// 	const res = await db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable).where(
// 		eq(usersTable.id1, 1),
// 	);

// 	expect(res).toEqual([{ id: 1, name: 'John1' }]);
// });

// // TODO on conflict does not work
// test.todo('insert with onConflict do nothing', async (ctx) => {
// 	const { db } = ctx.gel;

// 	await db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' });

// 	await db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' })
// 		.onConflictDoNothing();

// 	const res = await db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable).where(
// 		eq(usersTable.id1, 1),
// 	);

// 	expect(res).toEqual([{ id: 1, name: 'John' }]);
// });

// // TODO on conflict does not work
// test.todo('insert with onConflict do nothing + target', async (ctx) => {
// 	const { db } = ctx.gel;

// 	await db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' });

// 	await db.insert(usersTable)
// 		.values({ id1: 1, name: 'John' })
// 		.onConflictDoNothing({ target: usersTable.id1 });

// 	const res = await db.select({ id: usersTable.id1, name: usersTable.name }).from(usersTable).where(
// 		eq(usersTable.id1, 1),
// 	);

// 	expect(res).toEqual([{ id: 1, name: 'John' }]);
// });
