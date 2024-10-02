import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { int, singlestoreTable, text } from '~/singlestore-core/index.ts';
import type { SingleStoreInsert } from '~/singlestore-core/index.ts';
import type { SingleStoreRawQueryResult } from '~/singlestore/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const singlestoreInsertReturning = await db.insert(users).values({
	//    ^?
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).$returningId();

Expect<Equal<{ id: number; serialNullable: number; serialNotNull: number }[], typeof singlestoreInsertReturning>>;

const insert = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<SingleStoreRawQueryResult, typeof insert>>;

const insertStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertPrepared = await insertStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof insertPrepared>>;

const insertSql = await db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
});
Expect<Equal<SingleStoreRawQueryResult, typeof insertSql>>;

const insertSqlStmt = db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
}).prepare();
const insertSqlPrepared = await insertSqlStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof insertSqlPrepared>>;

const insertReturning = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<SingleStoreRawQueryResult, typeof insertReturning>>;

const insertReturningStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertReturningPrepared = await insertReturningStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof insertReturningPrepared>>;

const insertReturningPartial = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<SingleStoreRawQueryResult, typeof insertReturningPartial>>;

const insertReturningPartialStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertReturningPartialPrepared = await insertReturningPartialStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof insertReturningPartialPrepared>>;

const insertReturningSql = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
});
Expect<Equal<SingleStoreRawQueryResult, typeof insertReturningSql>>;

const insertReturningSqlStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
}).prepare();
const insertReturningSqlPrepared = await insertReturningSqlStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof insertReturningSqlPrepared>>;

{
	const users = singlestoreTable('users', {
		id: int('id').autoincrement().primaryKey(),
		name: text('name').notNull(),
		age: int('age'),
		occupation: text('occupation'),
	});

	await db.insert(users).values({ name: 'John Wick', age: 58, occupation: 'housekeeper' });
}

{
	function dynamic<T extends SingleStoreInsert>(qb: T) {
		return qb.onDuplicateKeyUpdate({ set: {} });
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0 }).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;

	Expect<Equal<SingleStoreRawQueryResult, typeof result>>;
}

{
	db
		.insert(users)
		.values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0 })
		.onDuplicateKeyUpdate({ set: {} })
		// @ts-expect-error method was already called
		.onDuplicateKeyUpdate({ set: {} });
}
