import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { MsSqlDatabase } from '~/mssql-core/db.ts';
import { int, mssqlTable, text } from '~/mssql-core/index.ts';
import type { PreparedQueryHKTBase, QueryResultHKT } from '~/mssql-core/session.ts';
import type { MsSqlQueryResult } from '~/node-mssql';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const insert = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MsSqlQueryResult, typeof insert>>;

const insertStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertPrepared = await insertStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof insertPrepared>>;

const insertSql = await db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
});
Expect<Equal<MsSqlQueryResult, typeof insertSql>>;

const insertSqlStmt = db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
}).prepare();
const insertSqlPrepared = await insertSqlStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof insertSqlPrepared>>;

const insertReturning = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MsSqlQueryResult, typeof insertReturning>>;

const insertReturningStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertReturningPrepared = await insertReturningStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof insertReturningPrepared>>;

const insertReturningPartial = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MsSqlQueryResult, typeof insertReturningPartial>>;

const insertReturningPartialStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertReturningPartialPrepared = await insertReturningPartialStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof insertReturningPartialPrepared>>;

const insertOutputSql = await db.insert(users).output().values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
});
Expect<Equal<typeof users.$inferSelect[], typeof insertOutputSql>>;

const insertOutputSqlStmt = db.insert(users).output().values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
}).prepare();
const insertReturningSqlPrepared = await insertOutputSqlStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof insertReturningSqlPrepared>>;

const insertOutputPartialSql = await db.insert(users).output({ cityHome: users.homeCity }).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
});
Expect<Equal<{ cityHome: number }[], typeof insertOutputPartialSql>>;

const insertOutputPartialSqlStmt = db.insert(users).output({ cityHome: users.homeCity }).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
}).prepare();
const insertOutputPartialSqlPrepared = await insertOutputPartialSqlStmt.execute();
Expect<Equal<{ cityHome: number }[], typeof insertOutputPartialSqlPrepared>>;

{
	const users = mssqlTable('users', {
		id: int('id').identity().primaryKey(),
		name: text('name').notNull(),
		age: int('age'),
		occupation: text('occupation'),
	});

	await db.insert(users).values({ name: 'John Wick', age: 58, occupation: 'housekeeper' });
	// @ts-expect-error id is an identity column MsSql doesn't allow to write to it
	await db.insert(users).values({ name: 'John Wick', age: 58, occupation: 'housekeeper', id: 1 });
}

// Insert with explicit column selection
{
	// All required columns listed -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a' },
	]);

	// Required columns + an extra optional column -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'currentCity').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', currentCity: 2 },
	]);

	// Single-object values -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol').values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a' });

	// SQL values in listed columns -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol').values({
		homeCity: sql`1`,
		class: 'A',
		age1: sql`2 + 2`,
		enumCol: 'a',
	});

	// The column list is order-independent -> ok
	db.insert(users, 'enumCol', 'age1', 'class', 'homeCity').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a' },
	]);

	// values() rejects a column that was not part of the selection
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol')
		// @ts-expect-error currentCity was not included in the column selection
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', currentCity: 2 }]);

	// values() still requires the listed required columns to be provided
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol')
		// @ts-expect-error enumCol is missing from values
		.values([{ homeCity: 1, class: 'A', age1: 1 }]);

	// @ts-expect-error missing required column `age1` from the selection
	db.insert(users, 'homeCity', 'class', 'enumCol');

	// @ts-expect-error unknown column `nope`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'nope');

	// @ts-expect-error duplicate column `homeCity`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'homeCity');
}

{
	interface HKT1 extends QueryResultHKT {
		readonly type: 1;
	}
	interface HKT2 extends QueryResultHKT {
		readonly type: 2;
	}
	const unionDb = {} as
		| MsSqlDatabase<HKT1, PreparedQueryHKTBase>
		| MsSqlDatabase<HKT2, PreparedQueryHKTBase>;
	await unionDb.insert(users).values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a' });
}
