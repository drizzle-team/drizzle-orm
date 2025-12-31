import { Database } from 'bun:sqlite';
import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { defineRelations, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	json: blob('json', { mode: 'json' }).$type<string[]>(),
	bigInt: blob('big_int', { mode: 'bigint' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`strftime('%s', 'now')`),
});

export const rqbUser = sqliteTable('user_rqb_test', {
	id: integer().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: integer('created_at', {
		mode: 'timestamp_ms',
	}).notNull(),
});

export const rqbPost = sqliteTable('post_rqb_test', {
	id: integer().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: integer('created_at', {
		mode: 'timestamp_ms',
	}).notNull(),
});

export const relations = defineRelations({
	rqbUser,
	rqbPost,
}, (r) => ({
	rqbUser: {
		posts: r.many.rqbPost(),
	},
	rqbPost: {
		author: r.one.rqbUser({
			from: r.rqbPost.userId,
			to: r.rqbUser.id,
		}),
	},
}));

let db: SQLiteBunDatabase<never, typeof relations>;

beforeAll(async () => {
	try {
		const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

		const client = new Database(dbPath);
		db = drizzle({ client, relations });
	} catch (e) {
		console.error(e);
	}
});

beforeEach(async () => {
	try {
		db.run(sql`drop table if exists ${usersTable}`);
		db.run(sql`drop table if exists ${rqbUser}`);
		db.run(sql`drop table if exists ${rqbPost}`);
		db.run(sql`
			create table ${usersTable} (
				id integer primary key,
				name text not null,
				verified integer not null default 0,
				json blob,
				big_int blob,
				created_at integer not null default (strftime('%s', 'now'))
			)
		`);
		await db.run(sql`
			CREATE TABLE ${rqbUser} (
					"id" INT PRIMARY KEY NOT NULL,
					"name" TEXT NOT NULL,
					"created_at" INT NOT NULL
				 )
		`);
		await db.run(sql`
			CREATE TABLE ${rqbPost} ( 
					"id" INT PRIMARY KEY NOT NULL,
					"user_id" INT NOT NULL,
					"content" TEXT,
					"created_at" INT NOT NULL
			)
		`);
	} catch (e) {
		console.error(e);
	}
});

test.skip('select large integer', () => {
	const a = 1667476703000;
	const res = db.all<{ a: number }>(sql`select ${sql.raw(String(a))} as a`);
	const result = res[0]!;
	expect(result.a).toEqual(a);
});

test('select all fields', () => {
	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select().from(usersTable).all()[0]!;

	expect(result.createdAt).toBeInstanceOf(Date);
	expect(Math.abs(result.createdAt.getTime() - now)).toBeLessThan(1000);
	expect(result).toEqual({ id: 1, name: 'John', verified: 0, json: null, createdAt: result.createdAt, bigInt: null });
});

test('select bigint', () => {
	db.insert(usersTable).values({ name: 'John', bigInt: BigInt(100) }).run();
	const result = db.select({ bigInt: usersTable.bigInt }).from(usersTable).all()[0]!;

	expect(result).toEqual({ bigInt: BigInt(100) });
});

// test.serial('select partial', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = db.select({ name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [{ name: 'John' }]);
// });

// test.serial('insert with auto increment', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Jane' },
// 		{ name: 'George' },
// 		{ name: 'Austin' },
// 	).execute();
// 	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John' },
// 		{ id: 2, name: 'Jane' },
// 		{ id: 3, name: 'George' },
// 		{ id: 4, name: 'Austin' },
// 	]);
// });

// test.serial('insert with default values', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', verified: 0 }]);
// });

// test.serial('insert with overridden default values', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John', verified: 1 }).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', verified: 1 }]);
// });

// test.serial('update with returning all fields', (t) => {
// 	const { db } = t.context;

// 	const now = Date.now();

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().execute();

// 	t.assert(users[0]!.createdAt instanceof Date);
// 	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
// });

// test.serial('update with returning partial', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 	}).execute();

// 	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
// });

// test.serial('delete with returning all fields', (t) => {
// 	const { db } = t.context;

// 	const now = Date.now();

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().execute();

// 	t.assert(users[0]!.createdAt instanceof Date);
// 	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	t.deepEqual(users, [{ id: 1, name: 'John', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
// });

// test.serial('delete with returning partial', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 	}).execute();

// 	t.deepEqual(users, [{ id: 1, name: 'John' }]);
// });

// test.serial('insert + select', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John' }]);

// 	db.insert(usersTable).values({ name: 'Jane' }).execute();
// 	const result2 = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
// });

// test.serial('json insert', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		json: usersTable.json,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
// });

// test.serial('insert many', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Bruce', json: ['foo', 'bar'] },
// 		{ name: 'Jane' },
// 		{ name: 'Austin', verified: 1 },
// 	).execute();
// 	const result = db.select({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		json: usersTable.json,
// 		verified: usersTable.verified,
// 	}).from(usersTable).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John', json: null, verified: 0 },
// 		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
// 		{ id: 3, name: 'Jane', json: null, verified: 0 },
// 		{ id: 4, name: 'Austin', json: null, verified: 1 },
// 	]);
// });

// test.serial('insert many with returning', (t) => {
// 	const { db } = t.context;

// 	const result = db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Bruce', json: ['foo', 'bar'] },
// 		{ name: 'Jane' },
// 		{ name: 'Austin', verified: 1 },
// 	)
// 		.returning({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			json: usersTable.json,
// 			verified: usersTable.verified,
// 		})
// 		.execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John', json: null, verified: 0 },
// 		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
// 		{ id: 3, name: 'Jane', json: null, verified: 0 },
// 		{ id: 4, name: 'Austin', json: null, verified: 1 },
// 	]);
// });

// test.serial('join with alias', (t) => {
// 	const { db } = t.context;
// 	const customerAlias = alias(usersTable, 'customer');

// 	db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).execute();
// 	const result = db
// 		.select().from(usersTable)
// 		.fields({ id: usersTable.id, name: usersTable.name })
// 		.leftJoin(customerAlias, eq(customerAlias.id, 11), { id: customerAlias.id, name: customerAlias.name })
// 		.where(eq(usersTable.id, 10))
// 		.execute();

// 	t.deepEqual(result, [{
// 		users: { id: 10, name: 'Ivan' },
// 		customer: { id: 11, name: 'Hans' },
// 	}]);
// });

// test('insert with spaces', (t) => {
// 	const { db } = t.context;

// 	db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).execute();
// 	const result = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
// });

// test.after.always((t) => {
// 	const ctx = t.context;
// 	ctx.client?.close();
// });

test('RQB v2 simple find first - no rows', async () => {
	const result = await db.query.rqbUser.findFirst();

	expect(result).toStrictEqual(undefined);
});

test('RQB v2 simple find first - multiple rows', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	const result = await db.query.rqbUser.findFirst({
		orderBy: {
			id: 'desc',
		},
	});

	expect(result).toStrictEqual({
		id: 2,
		createdAt: date,
		name: 'Second',
	});
});

test('RQB v2 simple find first - with relation', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.insert(rqbPost).values([{
		id: 1,
		userId: 1,
		createdAt: date,
		content: null,
	}, {
		id: 2,
		userId: 1,
		createdAt: date,
		content: 'Has message this time',
	}]);

	const result = await db.query.rqbUser.findFirst({
		with: {
			posts: {
				orderBy: {
					id: 'asc',
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expect(result).toStrictEqual({
		id: 1,
		createdAt: date,
		name: 'First',
		posts: [{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
		}],
	});
});

test('RQB v2 simple find first - placeholders', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	const query = db.query.rqbUser.findFirst({
		where: {
			id: {
				eq: sql.placeholder('filter'),
			},
		},
		orderBy: {
			id: 'asc',
		},
	}).prepare();

	const result = await query.execute({
		filter: 2,
	});

	expect(result).toStrictEqual({
		id: 2,
		createdAt: date,
		name: 'Second',
	});
});

test('RQB v2 simple find many - no rows', async () => {
	const result = await db.query.rqbUser.findMany();

	expect(result).toStrictEqual([]);
});

test('RQB v2 simple find many - multiple rows', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	const result = await db.query.rqbUser.findMany({
		orderBy: {
			id: 'desc',
		},
	});

	expect(result).toStrictEqual([{
		id: 2,
		createdAt: date,
		name: 'Second',
	}, {
		id: 1,
		createdAt: date,
		name: 'First',
	}]);
});

test('RQB v2 simple find many - with relation', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.insert(rqbPost).values([{
		id: 1,
		userId: 1,
		createdAt: date,
		content: null,
	}, {
		id: 2,
		userId: 1,
		createdAt: date,
		content: 'Has message this time',
	}]);

	const result = await db.query.rqbPost.findMany({
		with: {
			author: true,
		},
		orderBy: {
			id: 'asc',
		},
	});

	expect(result).toStrictEqual([{
		id: 1,
		userId: 1,
		createdAt: date,
		content: null,
		author: {
			id: 1,
			createdAt: date,
			name: 'First',
		},
	}, {
		id: 2,
		userId: 1,
		createdAt: date,
		content: 'Has message this time',
		author: {
			id: 1,
			createdAt: date,
			name: 'First',
		},
	}]);
});

test('RQB v2 simple find many - placeholders', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	const query = db.query.rqbUser.findMany({
		where: {
			id: {
				eq: sql.placeholder('filter'),
			},
		},
		orderBy: {
			id: 'asc',
		},
	}).prepare();

	const result = await query.execute({
		filter: 2,
	});

	expect(result).toStrictEqual([{
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);
});

test('RQB v2 transaction find first - no rows', async () => {
	await db.transaction(async (db) => {
		const result = await db.query.rqbUser.findFirst();

		expect(result).toStrictEqual(undefined);
	});
});

test('RQB v2 transaction find first - multiple rows', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.transaction(async (db) => {
		const result = await db.query.rqbUser.findFirst({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual({
			id: 2,
			createdAt: date,
			name: 'Second',
		});
	});
});

test('RQB v2 transaction find first - with relation', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.insert(rqbPost).values([{
		id: 1,
		userId: 1,
		createdAt: date,
		content: null,
	}, {
		id: 2,
		userId: 1,
		createdAt: date,
		content: 'Has message this time',
	}]);

	await db.transaction(async (db) => {
		const result = await db.query.rqbUser.findFirst({
			with: {
				posts: {
					orderBy: {
						id: 'asc',
					},
				},
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual({
			id: 1,
			createdAt: date,
			name: 'First',
			posts: [{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}],
		});
	});
});

test('RQB v2 transaction find first - placeholders', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.transaction(async (db) => {
		const query = db.query.rqbUser.findFirst({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare();

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual({
			id: 2,
			createdAt: date,
			name: 'Second',
		});
	});
});

test('RQB v2 transaction find many - no rows', async () => {
	await db.transaction(async (db) => {
		const result = await db.query.rqbUser.findMany();

		expect(result).toStrictEqual([]);
	});
});

test('RQB v2 transaction find many - multiple rows', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.transaction(async (db) => {
		const result = await db.query.rqbUser.findMany({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual([{
			id: 2,
			createdAt: date,
			name: 'Second',
		}, {
			id: 1,
			createdAt: date,
			name: 'First',
		}]);
	});
});

test('RQB v2 transaction find many - with relation', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.insert(rqbPost).values([{
		id: 1,
		userId: 1,
		createdAt: date,
		content: null,
	}, {
		id: 2,
		userId: 1,
		createdAt: date,
		content: 'Has message this time',
	}]);

	await db.transaction(async (db) => {
		const result = await db.query.rqbPost.findMany({
			with: {
				author: true,
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual([{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
			author: {
				id: 1,
				createdAt: date,
				name: 'First',
			},
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
			author: {
				id: 1,
				createdAt: date,
				name: 'First',
			},
		}]);
	});
});

test('RQB v2 transaction find many - placeholders', async () => {
	const date = new Date(120000);

	await db.insert(rqbUser).values([{
		id: 1,
		createdAt: date,
		name: 'First',
	}, {
		id: 2,
		createdAt: date,
		name: 'Second',
	}]);

	await db.transaction(async (db) => {
		const query = db.query.rqbUser.findMany({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare();

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual([{
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);
	});
});
