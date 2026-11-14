import type { SQLiteDatabase } from 'expo-sqlite';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { describe, test } from 'vitest';
import { drizzle } from '~/expo-sqlite/driver.ts';
import { eq, sql } from '~/index.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

interface StatementLedger {
	prepared: number;
	finalized: number;
}

// expo-sqlite's statement API, backed by sql.js. Like expo-sqlite, a statement runs its first step when it is
// executed, hands out the remaining rows on request, and throws on any use after it has been finalized. When SQLite
// reports an error from finalize (as it does after a failed step), finalizeSync throws without marking the statement
// finalized, as expo-sqlite 14 does, although SQLite has already freed it. The ledger counts every finalize that
// reaches SQLite, so finalizing a statement twice shows up as an extra one.
function createExpoSQLiteClient(database: Database) {
	const ledger: StatementLedger = { prepared: 0, finalized: 0 };

	const prepareSync = (source: string) => {
		const statement = database.prepare(source);
		let isFinalized = false;
		ledger.prepared++;

		const assertNotFinalized = () => {
			if (isFinalized) {
				throw new Error(`Access to a finalized statement: ${source}`);
			}
		};

		const execute = (params: SqlValue[]) => {
			assertNotFinalized();
			statement.bind(params);
			const firstRow = statement.step() ? statement.get() : undefined;
			const changes = database.getRowsModified();
			const lastInsertRowId = Number(database.exec('select last_insert_rowid()')[0]?.values[0]?.[0] ?? 0);
			const toObject = (row: SqlValue[]) =>
				Object.fromEntries(statement.getColumnNames().map((column, index) => [column, row[index]]));
			const getAllRows = () => {
				assertNotFinalized();
				const rows = firstRow ? [firstRow] : [];
				while (statement.step()) {
					rows.push(statement.get());
				}
				statement.reset();
				return rows;
			};

			return { changes, firstRow, getAllRows, lastInsertRowId, toObject };
		};

		return {
			executeSync: (params: SqlValue[]) => {
				const { changes, firstRow, getAllRows, lastInsertRowId, toObject } = execute(params);
				return {
					changes,
					lastInsertRowId,
					getAllSync: () => getAllRows().map((row) => toObject(row)),
					getFirstSync: () => {
						assertNotFinalized();
						return firstRow ? toObject(firstRow) : null;
					},
				};
			},
			executeForRawResultSync: (params: SqlValue[]) => ({ getAllSync: execute(params).getAllRows }),
			finalizeSync: () => {
				assertNotFinalized();
				ledger.finalized++;
				if (!statement.free()) {
					throw new Error('Error finalizing statement');
				}
				isFinalized = true;
			},
		};
	};

	// The session only calls prepareSync, and only the statement methods above.
	return { client: { prepareSync } as unknown as SQLiteDatabase, ledger };
}

async function createDatabase() {
	const SQL = await initSqlJs();
	const database = new SQL.Database();
	database.run('create table users (id integer primary key, name text not null)');
	const { client, ledger } = createExpoSQLiteClient(database);

	return { db: drizzle(client, { schema: { users } }), ledger };
}

describe('expo-sqlite', () => {
	test('finalizes the statement of every query builder and relational query execution', async ({ expect }) => {
		const { db, ledger } = await createDatabase();

		expect(db.insert(users).values([{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }]).run()).toEqual({
			changes: 2,
			lastInsertRowId: 2,
		});
		expect(db.update(users).set({ name: 'Bea' }).where(eq(users.id, 2)).run()).toEqual({
			changes: 1,
			lastInsertRowId: 2,
		});

		expect(db.select().from(users).all()).toEqual([{ id: 1, name: 'Ann' }, { id: 2, name: 'Bea' }]);
		expect(db.select({ name: users.name }).from(users).where(eq(users.id, 1)).get()).toEqual({ name: 'Ann' });
		expect(db.query.users.findMany().sync()).toEqual([{ id: 1, name: 'Ann' }, { id: 2, name: 'Bea' }]);
		expect(db.query.users.findFirst({ where: eq(users.id, 2) }).sync()).toEqual({ id: 2, name: 'Bea' });

		expect(db.delete(users).where(eq(users.id, 1)).run()).toEqual({ changes: 1, lastInsertRowId: 2 });

		expect(db.select().from(users).values()).toEqual([[2, 'Bea']]);
		expect(ledger).toEqual({ prepared: 8, finalized: 8 });
	});

	test('finalizes the statement of raw run, all, get and values', async ({ expect }) => {
		const { db, ledger } = await createDatabase();

		db.run(sql`insert into users (id, name) values (1, 'Ann'), (2, 'Bob')`);

		expect(db.all(sql`select name from users order by id`)).toEqual([{ name: 'Ann' }, { name: 'Bob' }]);
		expect(db.get(sql`select name from users order by id`)).toEqual({ name: 'Ann' });
		expect(db.values(sql`select name from users order by id`)).toEqual([['Ann'], ['Bob']]);
		expect(ledger).toEqual({ prepared: 4, finalized: 4 });
	});

	test('prepares and finalizes a statement on each execution of a prepared query', async ({ expect }) => {
		const { db, ledger } = await createDatabase();
		db.insert(users).values([{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }]).run();
		const userById = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare();

		expect(userById.get({ id: 1 })).toEqual({ id: 1, name: 'Ann' });
		expect(userById.get({ id: 2 })).toEqual({ id: 2, name: 'Bob' });
		expect(userById.all({ id: 2 })).toEqual([{ id: 2, name: 'Bob' }]);
		expect(ledger).toEqual({ prepared: 4, finalized: 4 });
	});

	test('finalizes the statements of committed and rolled back transactions', async ({ expect }) => {
		const { db, ledger } = await createDatabase();

		db.transaction((tx) => {
			tx.insert(users).values({ id: 1, name: 'Ann' }).run();
		});
		expect(() =>
			db.transaction((tx) => {
				tx.insert(users).values({ id: 2, name: 'Bob' }).run();
				throw new Error('rolled back');
			})
		).toThrow('rolled back');

		expect(db.select().from(users).all()).toEqual([{ id: 1, name: 'Ann' }]);
		expect(ledger).toEqual({ prepared: 7, finalized: 7 });
	});

	test('finalizes the statement of a query that fails and keeps its error', async ({ expect }) => {
		const { db, ledger } = await createDatabase();

		expect(() => db.insert(users).values({ id: 1, name: sql`null` }).run()).toThrow(/NOT NULL constraint failed/);
		expect(ledger).toEqual({ prepared: 1, finalized: 1 });
	});

	test('throws when finalizing a statement that ran reports an error', async ({ expect }) => {
		const { db, ledger } = await createDatabase();
		db.run(sql`pragma foreign_keys = on`);
		db.run(
			sql`create table posts (id integer primary key, user_id integer references users (id) deferrable initially deferred)`,
		);

		// run() reads only the first row of a returning clause, so the statement finishes when it is finalized,
		// and that is when SQLite checks the deferred foreign key and rolls the insert back.
		expect(() => db.run(sql`insert into posts (id, user_id) values (1, 999) returning id`)).toThrow();
		expect(db.all(sql`select id from posts`)).toEqual([]);
		expect(ledger).toEqual({ prepared: 4, finalized: 4 });
	});
});
