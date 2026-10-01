import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { MySqlAsyncDatabase } from '~/mysql-core/async/db.ts';
import { boolean, int, mysqlTable, QueryBuilder, serial, text } from '~/mysql-core/index.ts';
import type { MySqlInsert } from '~/mysql-core/index.ts';
import type { MySqlQueryResultHKT } from '~/mysql-core/session.ts';
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

	// Column selection combined with `.select(...)`
	const qb = new QueryBuilder();

	// Selection matching the column list -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol').select(
		qb.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
		}).from(users),
	);

	// Selection with a key that is not part of the insert column selection
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol').select(
		// @ts-expect-error currentCity is not included in the insert column selection
		qb.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			currentCity: users.currentCity,
		}).from(users),
	);

	// A duplicate in the column list is reported at the `.insert()` call, before `.select()`
	db
		// @ts-expect-error duplicate column `class`
		.insert(users, 'class', 'class', 'homeCity', 'age1', 'enumCol')
		.select(
			qb.select({ class: users.class, homeCity: users.homeCity, age1: users.age1, enumCol: users.enumCol }).from(users),
		);
}

{
	interface HKT1 extends MySqlQueryResultHKT {
		readonly type: 1;
	}
	interface HKT2 extends MySqlQueryResultHKT {
		readonly type: 2;
	}
	const unionDb = {} as MySqlAsyncDatabase<HKT1> | MySqlAsyncDatabase<HKT2>;
	await unionDb.insert(users).values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a' });
}
