import { sql } from 'drizzle-orm';
import { InferModel, MySqlQueryResult, MySqlRawQueryResult } from '~/index';
import { Equal, Expect } from '../utils';
import { db } from './db';
import { users } from './tables';

const insert = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MySqlRawQueryResult, typeof insert>>;

const insertStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare('insertStmt');
const insertPrepared = await insertStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof insertPrepared>>;

const insertSql = await db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
});
Expect<Equal<MySqlRawQueryResult, typeof insertSql>>;

const insertSqlStmt = db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
}).prepare('insertSqlStmt');
const insertSqlPrepared = await insertSqlStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof insertSqlPrepared>>;

const insertReturning = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MySqlRawQueryResult, typeof insertReturning>>;

const insertReturningStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare('insertReturningStmt');
const insertReturningPrepared = await insertReturningStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof insertReturningPrepared>>;

const insertReturningPartial = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<
	Equal<MySqlRawQueryResult, typeof insertReturningPartial>
>;

const insertReturningPartialStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare('insertReturningPartialStmt');
const insertReturningPartialPrepared = await insertReturningPartialStmt.execute();
Expect<
	Equal<MySqlRawQueryResult, typeof insertReturningPartialPrepared>
>;

const insertReturningSql = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
});
Expect<
	Equal<MySqlRawQueryResult, typeof insertReturningSql>
>;

const insertReturningSqlStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
}).prepare('insertReturningSqlStmt');
const insertReturningSqlPrepared = await insertReturningSqlStmt.execute();
Expect<
	Equal<MySqlRawQueryResult, typeof insertReturningSqlPrepared>
>;
