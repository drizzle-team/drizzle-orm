import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { CockroachDatabase } from '~/cockroach-core/db.ts';
import { bool, cockroachTable, int4, QueryBuilder, text } from '~/cockroach-core/index.ts';
import type { CockroachInsert } from '~/cockroach-core/query-builders/insert.ts';
import type { CockroachQueryResultHKT } from '~/cockroach-core/session.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { identityColumnsTable, users } from './tables.ts';

const insert = await db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	});
Expect<Equal<QueryResult<never>, typeof insert>>;

const insertStmt = db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	})
	.prepare('insertStmt');
const insertPrepared = await insertStmt.execute();
Expect<Equal<QueryResult<never>, typeof insertPrepared>>;

const insertSql = await db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
	arrayCol: [''],
});
Expect<Equal<QueryResult<never>, typeof insertSql>>;

const insertSqlStmt = db
	.insert(users)
	.values({
		homeCity: sql`123`,
		class: 'A',
		age1: 1,
		enumCol: sql`foobar`,
		arrayCol: [''],
	})
	.prepare('insertSqlStmt');
const insertSqlPrepared = await insertSqlStmt.execute();
Expect<Equal<QueryResult<never>, typeof insertSqlPrepared>>;

const insertReturning = await db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	})
	.returning();
Expect<Equal<typeof users.$inferSelect[], typeof insertReturning>>;

const insertReturningStmt = db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	})
	.returning()
	.prepare('insertReturningStmt');
const insertReturningPrepared = await insertReturningStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof insertReturningPrepared>>;

const insertReturningPartial = await db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	})
	.returning({
		id: users.id,
		homeCity: users.homeCity,
		mySubclass: users.subClass,
	});
Expect<
	Equal<{
		id: number;
		homeCity: number;
		mySubclass: 'B' | 'D' | null;
	}[], typeof insertReturningPartial>
>;

const insertReturningPartialStmt = db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	})
	.returning({
		id: users.id,
		homeCity: users.homeCity,
		mySubclass: users.subClass,
	})
	.prepare('insertReturningPartialStmt');
const insertReturningPartialPrepared = await insertReturningPartialStmt.execute();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		mySubclass: 'B' | 'D' | null;
	}[], typeof insertReturningPartialPrepared>
>;

const insertReturningSql = await db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: sql`2 + 2`,
		enumCol: 'a',
		arrayCol: [''],
	})
	.returning({
		id: users.id,
		homeCity: users.homeCity,
		subclassLower: sql`lower(${users.subClass})`,
		classLower: sql<string>`lower(${users.class})`,
	});
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSql>
>;

const insertReturningSqlStmt = db
	.insert(users)
	.values({
		homeCity: 1,
		class: 'A',
		age1: sql`2 + 2`,
		enumCol: 'a',
		arrayCol: [''],
	})
	.returning({
		id: users.id,
		homeCity: users.homeCity,
		subclassLower: sql`lower(${users.subClass})`,
		classLower: sql<string>`lower(${users.class})`,
	})
	.prepare('insertReturningSqlStmt');
const insertReturningSqlPrepared = await insertReturningSqlStmt.execute();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSqlPrepared>
>;

{
	function dynamic<T extends CockroachInsert>(qb: T) {
		return qb.returning().onConflictDoNothing().onConflictDoUpdate({ set: {}, target: users.id, where: sql`` });
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, arrayCol: [] }).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends CockroachInsert>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, arrayCol: [] }).$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.insert(users)
		.values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, arrayCol: [] })
		.returning()
		// @ts-expect-error method was already called
		.returning();
}

{
	const users1 = cockroachTable('users1', {
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		name: text('name').notNull(),
		admin: bool('admin').notNull().default(false),
	});
	const users2 = cockroachTable('users2', {
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		admin: bool('admin').notNull().default(false),
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

	db.insert(users1).select(db.select({ name: users1.name, admin: users1.admin }).from(users1));
	db.insert(users1).select(() => db.select({ name: users1.name, admin: users1.admin }).from(users1));
	db.insert(users1).select((qb) => qb.select({ name: users1.name, admin: users1.admin }).from(users1));
	// @ts-expect-error selecting generated always key
	db.insert(users1).select(db.select().from(users1));
	// @ts-expect-error selecting generated always key
	db.insert(users1).select(() => db.select().from(users1));
	// @ts-expect-error selecting generated always key
	db.insert(users1).select((qb) => qb.select().from(users1));
	// @ts-expect-error tables have different keys
	db.insert(users1).select(db.select().from(users2));
	// @ts-expect-error tables have different keys
	db.insert(users1).select(() => db.select().from(users2));
}

{
	db.insert(identityColumnsTable).values([
		{ byDefaultAsIdentity: 4, name: 'fdf' },
	]);

	// @ts-expect-error
	db.insert(identityColumnsTable).values([
		{ alwaysAsIdentity: 2 },
	]);

	// @ts-expect-error
	db.insert(identityColumnsTable).values([
		{ generatedCol: 2 },
	]);
}

// Insert with explicit column selection
{
	// All required columns listed -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] },
	]);

	// Required columns + an extra optional column -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol', 'currentCity').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''], currentCity: 2 },
	]);

	// Single-object values -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol').values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		arrayCol: [''],
	});

	// SQL values in listed columns -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol').values({
		homeCity: sql`1`,
		class: 'A',
		age1: sql`2 + 2`,
		enumCol: 'a',
		arrayCol: [''],
	});

	// The column list is order-independent -> ok
	db.insert(users, 'arrayCol', 'enumCol', 'age1', 'class', 'homeCity').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] },
	]);

	// values() rejects a column that was not part of the selection
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		// @ts-expect-error currentCity was not included in the column selection
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''], currentCity: 2 }]);

	// values() still requires the listed required columns to be provided
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		// @ts-expect-error enumCol and arrayCol are missing from values
		.values([{ homeCity: 1, class: 'A', age1: 1 }]);

	// @ts-expect-error missing required column `arrayCol` from the selection
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol');

	// @ts-expect-error unknown column `nope`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol', 'nope');

	// @ts-expect-error duplicate column `homeCity`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol', 'homeCity');

	// Column selection combined with `.select(...)`
	const qb = new QueryBuilder();

	// Selection matching the column list -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol').select(
		qb.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			arrayCol: users.arrayCol,
		}).from(users),
	);

	// Selection with a key that is not part of the insert column selection
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol').select(
		// @ts-expect-error currentCity is not included in the insert column selection
		qb.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			arrayCol: users.arrayCol,
			currentCity: users.currentCity,
		}).from(users),
	);

	// A duplicate in the column list is reported at the `.insert()` call, before `.select()`
	db
		// @ts-expect-error duplicate column `class`
		.insert(users, 'class', 'class', 'homeCity', 'age1', 'enumCol', 'arrayCol')
		.select(
			qb.select({
				class: users.class,
				homeCity: users.homeCity,
				age1: users.age1,
				enumCol: users.enumCol,
				arrayCol: users.arrayCol,
			}).from(users),
		);
}

{
	interface HKT1 extends CockroachQueryResultHKT {
		readonly type: 1;
	}
	interface HKT2 extends CockroachQueryResultHKT {
		readonly type: 2;
	}
	const unionDb = {} as CockroachDatabase<HKT1> | CockroachDatabase<HKT2>;
	await unionDb.insert(users).values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] });
}
