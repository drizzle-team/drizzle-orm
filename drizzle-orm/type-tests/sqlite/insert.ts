import type { RunResult } from 'better-sqlite3';
import type { Changes } from 'bun:sqlite';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { and, eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { integer, QueryBuilder, sqliteTable, text } from '~/sqlite-core/index.ts';
import type { SQLiteInsert } from '~/sqlite-core/query-builders/insert.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { bunDb, d1Db, db } from './db.ts';
import type { NewUser } from './tables.ts';
import { users } from './tables.ts';

const newUser: NewUser = {
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
	serialNotNull: 1,
};

const insertRun = db.insert(users).values(newUser).run();
Expect<Equal<RunResult, typeof insertRun>>;

const insertRunBun = bunDb.insert(users).values(newUser).run();
Expect<Equal<Changes, typeof insertRunBun>>;

const insertAll = db.insert(users).values(newUser).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof insertAll>>;

const insertAllBun = bunDb.insert(users).values(newUser).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof insertAllBun>>;

const insertGet = db.insert(users).values(newUser).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof insertGet>>;

const insertGetBun = bunDb.insert(users).values(newUser).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof insertGetBun>>;

const insertValues = db.insert(users).values(newUser).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof insertValues>>;

const insertValuesBun = bunDb.insert(users).values(newUser).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof insertValuesBun>>;

const insertRunReturningAll = db.insert(users).values(newUser).returning().run();
Expect<Equal<RunResult, typeof insertRunReturningAll>>;

const insertRunReturningAllBun = bunDb.insert(users).values(newUser).returning().run();
Expect<Equal<Changes, typeof insertRunReturningAllBun>>;

const insertAllReturningAll = db.insert(users).values(newUser).returning().all();
Expect<Equal<typeof users.$inferSelect[], typeof insertAllReturningAll>>;

const insertAllReturningAllBun = bunDb.insert(users).values(newUser).returning().all();
Expect<Equal<typeof users.$inferSelect[], typeof insertAllReturningAllBun>>;

const insertGetReturningAll = db.insert(users).values(newUser).returning().get();
Expect<Equal<typeof users.$inferSelect, typeof insertGetReturningAll>>;

const insertGetReturningAllBun = bunDb.insert(users).values(newUser).returning().get();
Expect<Equal<typeof users.$inferSelect, typeof insertGetReturningAllBun>>;

const insertValuesReturningAll = db.insert(users).values(newUser).returning().values();
Expect<Equal<any[][], typeof insertValuesReturningAll>>;

const insertValuesReturningAllBun = bunDb.insert(users).values(newUser).returning().values();
Expect<Equal<any[][], typeof insertValuesReturningAllBun>>;

const insertRunReturningPartial = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).run();
Expect<Equal<RunResult, typeof insertRunReturningPartial>>;

const insertRunReturningPartialBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).run();
Expect<Equal<Changes, typeof insertRunReturningPartialBun>>;

const insertAllReturningPartial = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).all();
Expect<
	Equal<
		{
			id: number;
			homeCity: number;
			mySubclass: 'B' | 'D' | null;
		}[],
		typeof insertAllReturningPartial
	>
>;

const insertAllReturningPartialBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).all();
Expect<
	Equal<
		{
			id: number;
			homeCity: number;
			mySubclass: 'B' | 'D' | null;
		}[],
		typeof insertAllReturningPartialBun
	>
>;

const insertReturningSql = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql<string>`lower(${users.class})`,
}).all();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSql>
>;

const insertReturningSqlBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql<string>`lower(${users.class})`,
}).all();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSqlBun>
>;

db.insert(users).values(newUser).onConflictDoNothing().run();
db.insert(users).values(newUser).onConflictDoNothing({ target: users.class }).run();
db.insert(users).values(newUser).onConflictDoNothing({
	target: [
		sql`${users.class} collate nocase asc`,
		sql`${users.age1} desc`,
		users.subClass,
	],
}).run();

db.insert(users).values(newUser).onConflictDoUpdate({
	target: users.age1,
	set: { age1: sql`${users.age1} + 1` },
})
	.run();

db.insert(users).values(newUser)
	.onConflictDoUpdate({
		target: users.age1,
		set: { age1: sql`${users.age1} + 1` },
		where: sql`${users.age1} > 10`,
	})
	.onConflictDoNothing()
	.run();

const stmt = db.select().from(users)
	.where(and(eq(users.id, sql.placeholder('id'))))
	.offset(sql.placeholder('offset'))
	.limit(sql.placeholder('limit'))
	.prepare();
stmt.run({ id: 1, limit: 10, offset: 20 });

{
	function dynamic<T extends SQLiteInsert>(qb: T) {
		return qb.returning().onConflictDoNothing().onConflictDoUpdate({ set: {}, target: users.id, where: sql`` });
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, serialNotNull: 0 })
		.$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends SQLiteInsert>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, serialNotNull: 0 })
		.$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.insert(users)
		.values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, serialNotNull: 0 })
		.returning()
		// @ts-expect-error method was already called
		.returning();
}

{
	const users1 = sqliteTable('users1', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		admin: integer('admin', { mode: 'boolean' }).notNull().default(false),
	});
	const users2 = sqliteTable('users2', {
		id: integer('id').primaryKey(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		admin: integer('admin', { mode: 'boolean' }).notNull().default(false),
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
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', serialNotNull: 1 },
	]);

	// Required columns + an extra optional column -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull', 'currentCity').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', serialNotNull: 1, currentCity: 2 },
	]);

	// Single-object values -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull').values({
		homeCity: 1,
		class: 'A',
		age1: 1,
		enumCol: 'a',
		serialNotNull: 1,
	});

	// SQL values in listed columns -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull').values({
		homeCity: sql`1`,
		class: 'A',
		age1: sql`2 + 2`,
		enumCol: 'a',
		serialNotNull: 1,
	});

	// The column list is order-independent -> ok
	db.insert(users, 'serialNotNull', 'enumCol', 'age1', 'class', 'homeCity').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', serialNotNull: 1 },
	]);

	// values() rejects a column that was not part of the selection
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull')
		// @ts-expect-error currentCity was not included in the column selection
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', serialNotNull: 1, currentCity: 2 }]);

	// values() still requires the listed required columns to be provided
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull')
		// @ts-expect-error enumCol and serialNotNull are missing from values
		.values([{ homeCity: 1, class: 'A', age1: 1 }]);

	// @ts-expect-error missing required column `serialNotNull` from the selection
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol');

	// @ts-expect-error unknown column `nope`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull', 'nope');

	// @ts-expect-error duplicate column `homeCity`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull', 'homeCity');

	// Column selection combined with `.select(...)`
	const qb = new QueryBuilder();

	// Selection matching the column list -> ok
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull').select(
		qb.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			serialNotNull: users.serialNotNull,
		}).from(users),
	);

	// Selection with a key that is not part of the insert column selection
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'serialNotNull').select(
		// @ts-expect-error currentCity is not included in the insert column selection
		qb.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			serialNotNull: users.serialNotNull,
			currentCity: users.currentCity,
		}).from(users),
	);

	// A duplicate in the column list is reported at the `.insert()` call, before `.select()`
	db
		// @ts-expect-error duplicate column `class`
		.insert(users, 'class', 'class', 'homeCity', 'age1', 'enumCol', 'serialNotNull')
		.select(
			qb.select({
				class: users.class,
				homeCity: users.homeCity,
				age1: users.age1,
				enumCol: users.enumCol,
				serialNotNull: users.serialNotNull,
			}).from(users),
		);
}

// `.get()` may return `undefined` when the insert can affect zero rows
{
	type User = typeof users.$inferSelect;

	// No conflict clause - a row is always returned
	const plain = db.insert(users).values(newUser).returning().get();
	Expect<Equal<User, typeof plain>>;

	const plainPrepared = db.insert(users).values(newUser).returning().prepare().get();
	Expect<Equal<User, typeof plainPrepared>>;

	const plainAsync = await d1Db.insert(users).values(newUser).returning().get();
	Expect<Equal<User, typeof plainAsync>>;

	// `on conflict do nothing` skips the row
	const doNothing = db.insert(users).values(newUser).onConflictDoNothing().returning().get();
	Expect<Equal<User | undefined, typeof doNothing>>;

	const doNothingAfterReturning = db.insert(users).values(newUser).returning().onConflictDoNothing().get();
	Expect<Equal<User | undefined, typeof doNothingAfterReturning>>;

	const doNothingTarget = db.insert(users).values(newUser).onConflictDoNothing({ target: users.id }).returning()
		.get();
	Expect<Equal<User | undefined, typeof doNothingTarget>>;

	const doNothingBun = bunDb.insert(users).values(newUser).onConflictDoNothing().returning().get();
	Expect<Equal<User | undefined, typeof doNothingBun>>;

	const doNothingAsync = await d1Db.insert(users).values(newUser).onConflictDoNothing().returning().get();
	Expect<Equal<User | undefined, typeof doNothingAsync>>;

	const doNothingPartial = db.insert(users).values(newUser).onConflictDoNothing().returning({ id: users.id }).get();
	Expect<Equal<{ id: number } | undefined, typeof doNothingPartial>>;

	const doNothingPrepared = db.insert(users).values(newUser).onConflictDoNothing().returning().prepare().get();
	Expect<Equal<User | undefined, typeof doNothingPrepared>>;

	// `.all()` and execution results are unaffected
	const doNothingAll = db.insert(users).values(newUser).onConflictDoNothing().returning().all();
	Expect<Equal<User[], typeof doNothingAll>>;

	const doNothingAwaited = await d1Db.insert(users).values(newUser).onConflictDoNothing().returning();
	Expect<Equal<User[], typeof doNothingAwaited>>;

	const doNothingRun = db.insert(users).values(newUser).onConflictDoNothing().run();
	Expect<Equal<RunResult, typeof doNothingRun>>;

	const doNothingGetNoReturning = db.insert(users).values(newUser).onConflictDoNothing().get();
	Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof doNothingGetNoReturning>>;

	// Unconditional `on conflict do update` always yields the row
	const doUpdate = db.insert(users).values(newUser).onConflictDoUpdate({
		target: users.id,
		set: { age1: 2 },
	}).returning().get();
	Expect<Equal<User, typeof doUpdate>>;

	const doUpdateTargetWhere = db.insert(users).values(newUser).onConflictDoUpdate({
		target: users.id,
		targetWhere: sql`${users.age1} > 10`,
		set: { age1: 2 },
	}).returning().get();
	Expect<Equal<User, typeof doUpdateTargetWhere>>;

	// Conditional `on conflict do update` can skip the row
	const doUpdateSetWhere = db.insert(users).values(newUser).onConflictDoUpdate({
		target: users.id,
		set: { age1: 2 },
		setWhere: sql`${users.age1} > 10`,
	}).returning().get();
	Expect<Equal<User | undefined, typeof doUpdateSetWhere>>;

	const doUpdateWhere = db.insert(users).values(newUser).returning().onConflictDoUpdate({
		target: users.id,
		set: { age1: 2 },
		where: sql`${users.age1} > 10`,
	}).get();
	Expect<Equal<User | undefined, typeof doUpdateWhere>>;

	const maybeWhere = {} as ReturnType<typeof sql> | undefined;
	const doUpdateMaybeWhere = db.insert(users).values(newUser).onConflictDoUpdate({
		target: users.id,
		set: { age1: 2 },
		setWhere: maybeWhere,
	}).returning().get();
	Expect<Equal<User | undefined, typeof doUpdateMaybeWhere>>;

	const doUpdateAsync = await d1Db.insert(users).values(newUser).onConflictDoUpdate({
		target: users.id,
		set: { age1: 2 },
		setWhere: sql`${users.age1} > 10`,
	}).returning().get();
	Expect<Equal<User | undefined, typeof doUpdateAsync>>;

	// Once marked, later clauses don't unmark it
	const doNothingThenDoUpdate = db.insert(users).values(newUser)
		.onConflictDoNothing({ target: users.class })
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.returning()
		.get();
	Expect<Equal<User | undefined, typeof doNothingThenDoUpdate>>;

	// `insert ... select` can select zero rows
	const fromSelect = db.insert(users).select(db.select().from(users)).returning().get();
	Expect<Equal<User | undefined, typeof fromSelect>>;

	const fromSqlSelect = db.insert(users).select(sql`select * from ${users}`).returning().get();
	Expect<Equal<User | undefined, typeof fromSqlSelect>>;

	// `$dynamic()` preserves the flag
	const dynamicGet = db.insert(users).values(newUser).$dynamic().returning().get();
	Expect<Equal<User, typeof dynamicGet>>;

	const dynamicAfterDoNothing = db.insert(users).values(newUser).onConflictDoNothing().$dynamic().returning().get();
	Expect<Equal<User | undefined, typeof dynamicAfterDoNothing>>;

	const dynamicAfterSelect = db.insert(users).select(db.select().from(users)).$dynamic().returning().get();
	Expect<Equal<User | undefined, typeof dynamicAfterSelect>>;

	const dynamicAfterReturningDoNothing = db.insert(users).values(newUser).returning().onConflictDoNothing()
		.$dynamic().get();
	Expect<Equal<User | undefined, typeof dynamicAfterReturningDoNothing>>;

	// Clauses added in dynamic mode
	const dynamicDoNothing = db.insert(users).values(newUser).$dynamic().onConflictDoNothing().returning().get();
	Expect<Equal<User | undefined, typeof dynamicDoNothing>>;

	const dynamicDoUpdate = db.insert(users).values(newUser).$dynamic()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.returning()
		.get();
	Expect<Equal<User, typeof dynamicDoUpdate>>;

	const dynamicDoUpdateSetWhere = db.insert(users).values(newUser).$dynamic()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 }, setWhere: sql`true` })
		.returning()
		.get();
	Expect<Equal<User | undefined, typeof dynamicDoUpdateSetWhere>>;

	const dynamicDoNothingThenDoUpdate = db.insert(users).values(newUser).$dynamic()
		.onConflictDoNothing()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.returning()
		.get();
	Expect<Equal<User | undefined, typeof dynamicDoNothingThenDoUpdate>>;

	const dynamicMarkedDoUpdate = db.insert(users).values(newUser).onConflictDoNothing().$dynamic()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.returning()
		.get();
	Expect<Equal<User | undefined, typeof dynamicMarkedDoUpdate>>;

	// Dynamic mode still allows repeated calls
	db.insert(users).values(newUser).$dynamic().returning().onConflictDoNothing().returning();

	// Clauses added in generic dynamic helpers update the flag
	function withDoNothing<T extends SQLiteInsert>(qb: T) {
		return qb.onConflictDoNothing();
	}
	function withDoUpdate<T extends SQLiteInsert>(qb: T) {
		return qb.onConflictDoUpdate({ target: users.id, set: {} });
	}
	function withDoUpdateSetWhere<T extends SQLiteInsert>(qb: T) {
		return qb.onConflictDoUpdate({ target: users.id, set: {}, setWhere: sql`true` });
	}

	const helperDoNothing = withDoNothing(db.insert(users).values(newUser).$dynamic()).returning().get();
	Expect<Equal<User | undefined, typeof helperDoNothing>>;

	const helperDoUpdate = withDoUpdate(db.insert(users).values(newUser).$dynamic()).returning().get();
	Expect<Equal<User, typeof helperDoUpdate>>;

	const helperDoUpdateSetWhere = withDoUpdateSetWhere(db.insert(users).values(newUser).$dynamic()).returning()
		.get();
	Expect<Equal<User | undefined, typeof helperDoUpdateSetWhere>>;

	const helperDoNothingThenDoUpdate = withDoUpdate(withDoNothing(db.insert(users).values(newUser).$dynamic()))
		.returning().get();
	Expect<Equal<User | undefined, typeof helperDoNothingThenDoUpdate>>;

	const helperAfterReturning = withDoNothing(db.insert(users).values(newUser).$dynamic().returning()).get();
	Expect<Equal<User | undefined, typeof helperAfterReturning>>;

	// Excluded methods are still excluded after marking
	db
		.insert(users)
		.values(newUser)
		.returning()
		.onConflictDoNothing()
		// @ts-expect-error method was already called
		.returning();

	db
		.insert(users)
		.values(newUser)
		.returning()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		// @ts-expect-error method was already called
		.returning();

	db
		.insert(users)
		.values(newUser)
		.returning()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 }, setWhere: sql`true` })
		// @ts-expect-error method was already called
		.returning();

	// Unconditional `on conflict do update` keeps an existing mark
	const doNothingThenDoUpdateAfterReturning = db.insert(users).values(newUser)
		.returning()
		.onConflictDoNothing({ target: users.class })
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.get();
	Expect<Equal<User | undefined, typeof doNothingThenDoUpdateAfterReturning>>;

	const doUpdateAfterReturning = db.insert(users).values(newUser)
		.returning()
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.get();
	Expect<Equal<User, typeof doUpdateAfterReturning>>;

	const doUpdateAsyncAwaited = await d1Db.insert(users).values(newUser)
		.onConflictDoUpdate({ target: users.id, set: { age1: 2 } })
		.returning({ id: users.id });
	Expect<Equal<{ id: number }[], typeof doUpdateAsyncAwaited>>;
}

{
	const unionDb = {} as
		| SQLiteAsyncDatabase<'async', { a: 1 }>
		| SQLiteAsyncDatabase<'async', { b: 2 }>;
	await unionDb.insert(users).values(newUser).run();
}
