import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { int, mssqlTable, text } from '~/mssql-core/index.ts';
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
