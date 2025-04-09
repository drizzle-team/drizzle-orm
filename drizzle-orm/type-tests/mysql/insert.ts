import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { boolean, int, mysqlTable, QueryBuilder, serial, text } from '~/mysql-core/index.ts';
import type { MySqlInsert } from '~/mysql-core/index.ts';
import type { MySqlRawQueryResult } from '~/mysql2/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const mysqlInsertReturning = await db.insert(users).values({
	//    ^?
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).$returningId();

Expect<Equal<{ id: number; serialNullable: number; serialNotNull: number }[], typeof mysqlInsertReturning>>;

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
}).prepare();
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
}).prepare();
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
}).prepare();
const insertReturningPrepared = await insertReturningStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof insertReturningPrepared>>;

const insertReturningPartial = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MySqlRawQueryResult, typeof insertReturningPartial>>;

const insertReturningPartialStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const insertReturningPartialPrepared = await insertReturningPartialStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof insertReturningPartialPrepared>>;

const insertReturningSql = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
});
Expect<Equal<MySqlRawQueryResult, typeof insertReturningSql>>;

const insertReturningSqlStmt = db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
}).prepare();
const insertReturningSqlPrepared = await insertReturningSqlStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof insertReturningSqlPrepared>>;

{
	const users = mysqlTable('users', {
		id: int('id').autoincrement().primaryKey(),
		name: text('name').notNull(),
		age: int('age'),
		occupation: text('occupation'),
	});

	await db.insert(users).values({ name: 'John Wick', age: 58, occupation: 'housekeeper' });
}

{
	function dynamic<T extends MySqlInsert>(qb: T) {
		return qb.onDuplicateKeyUpdate({ set: {} });
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0 }).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;

	Expect<Equal<MySqlRawQueryResult, typeof result>>;
}

{
	db
		.insert(users)
		.values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0 })
		.onDuplicateKeyUpdate({ set: {} })
		// @ts-expect-error method was already called
		.onDuplicateKeyUpdate({ set: {} });
}

{
	const users1 = mysqlTable('users1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		admin: boolean('admin').notNull().default(false),
	});
	const users2 = mysqlTable('users2', {
		id: serial('id').primaryKey(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		admin: boolean('admin').notNull().default(false),
		phoneNumber: text('phone_number'),
	});

	const qb = new QueryBuilder();

	db.insert(users1).select(sql`select * from users1`);
	db.insert(users1).select(() => sql`select * from users1`);

	db
		.insert(users1)
		.select(
			qb.select({
				name: users2.firstName,
				admin: users2.admin,
			}).from(users2),
		);

	db
		.insert(users1)
		.select(
			qb.select({
				name: users2.firstName,
				admin: users2.admin,
			}).from(users2).where(sql``),
		);

	db
		.insert(users2)
		.select(
			qb.select({
				firstName: users2.firstName,
				lastName: users2.lastName,
				admin: users2.admin,
			}).from(users2),
		);

	db
		.insert(users1)
		.select(
			qb.select({
				name: sql`${users2.firstName} || ' ' || ${users2.lastName}`.as('name'),
				admin: users2.admin,
			}).from(users2),
		);

	db
		.insert(users1)
		.select(
			// @ts-expect-error name is undefined
			qb.select({ admin: users1.admin }).from(users1),
		);

	db.insert(users1).select(db.select().from(users1));
	db.insert(users1).select(() => db.select().from(users1));
	db.insert(users1).select((qb) => qb.select().from(users1));
	// @ts-expect-error tables have different keys
	db.insert(users1).select(db.select().from(users2));
	// @ts-expect-error tables have different keys
	db.insert(users1).select(() => db.select().from(users2));
}
