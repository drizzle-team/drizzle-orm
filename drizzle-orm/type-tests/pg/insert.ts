import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { boolean, pgTable, QueryBuilder, serial, text } from '~/pg-core/index.ts';
import type { PgInsert } from '~/pg-core/query-builders/insert.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
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
	function dynamic<T extends PgInsert>(qb: T) {
		return qb.returning().onConflictDoNothing().onConflictDoUpdate({ set: {}, target: users.id, where: sql`` });
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, arrayCol: [] }).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends PgInsert>(qb: T) {
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
	const users1 = pgTable('users1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		admin: boolean('admin').notNull().default(false),
	});
	const users2 = pgTable('users2', {
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

{
	db.insert(identityColumnsTable).values([
		{ byDefaultAsIdentity: 4, name: 'fdf' },
	]);

	// @ts-expect-error
	db.insert(identityColumnsTable).values([
		{ alwaysAsIdentity: 2 },
	]);

	db.insert(identityColumnsTable).overridingSystemValue().values([
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

	// values() is restricted to the listed columns: the model only requires the selected columns...
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol').values([
		{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] },
	]);

	// ...and rejects columns that were not listed
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		// @ts-expect-error currentCity was not included in the column selection
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''], currentCity: 2 }]);

	// ...and still requires the listed required columns to be provided
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		// @ts-expect-error enumCol and arrayCol are missing from values
		.values([{ homeCity: 1, class: 'A', age1: 1 }]);

	// @ts-expect-error missing required column `age1` from the selection
	db.insert(users, 'homeCity', 'class', 'enumCol', 'arrayCol');

	// @ts-expect-error unknown column `nope`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol', 'nope');

	// @ts-expect-error duplicate column `homeCity`
	db.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol', 'homeCity');

	// @ts-expect-error duplicate column `class`
	db.insert(users, 'class', 'class', 'homeCity', 'age1', 'enumCol', 'arrayCol');

	// Column selection combined with overridingSystemValue on an identity table
	db.insert(identityColumnsTable, 'name', 'alwaysAsIdentity').overridingSystemValue().values([
		{ name: 'fdf', alwaysAsIdentity: 2 },
	]);

	// @ts-expect-error duplicate column `name` on identity table
	db.insert(identityColumnsTable, 'name', 'name');
}

// Insert with explicit column selection + `.select(...)`
{
	const users1 = pgTable('users1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		admin: boolean('admin').notNull().default(false),
	});
	const users2 = pgTable('users2', {
		id: serial('id').primaryKey(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		admin: boolean('admin').notNull().default(false),
	});

	const qb = new QueryBuilder();

	// Selection keys exactly match the column list -> ok
	db
		.insert(users1, 'name', 'admin')
		.select(
			qb.select({ name: users2.firstName, admin: users2.admin }).from(users2),
		);

	// A subset of the column list is allowed (the select's own keys drive the inserted columns) -> ok
	db
		.insert(users1, 'name', 'admin')
		.select(
			qb.select({ name: users2.firstName }).from(users2),
		);

	// Callback form -> ok
	db
		.insert(users1, 'name', 'admin')
		.select((qb) => qb.select({ name: users2.firstName, admin: users2.admin }).from(users2));

	// Raw SQL select is not validated against the column list -> ok
	db.insert(users1, 'name', 'admin').select(sql`select * from users2`);
	db.insert(users1, 'name', 'admin').select(() => sql`select * from users2`);

	// Selection contains a column that is not part of the insert column selection
	db
		.insert(users1, 'name')
		.select(
			// @ts-expect-error `admin` is not included in the insert column selection
			qb.select({ name: users2.firstName, admin: users2.admin }).from(users2),
		);

	// Same restriction applies to the callback form
	db
		.insert(users1, 'name')
		// @ts-expect-error `admin` is not included in the insert column selection
		.select((qb) => qb.select({ name: users2.firstName, admin: users2.admin }).from(users2));

	// Unknown columns are still rejected even when they are within the column list keys
	db
		.insert(users1, 'name', 'admin')
		.select(
			// @ts-expect-error `nope` does not exist in table "users1"
			qb.select({ name: users2.firstName, admin: users2.admin, nope: users2.lastName }).from(users2),
		);

	// A duplicate in the column list is reported at the `.insert()` call, before `.select()`
	db
		// @ts-expect-error duplicate column `name`
		.insert(users1, 'name', 'name')
		.select(qb.select({ name: users2.firstName }).from(users2));

	// A missing required column in the list is reported at the `.insert()` call, before `.select()`
	db
		// @ts-expect-error missing required column `name`
		.insert(users1, 'admin')
		.select(qb.select({ admin: users2.admin }).from(users2));
}

// A column selection must not change the shape produced by `.returning()`
{
	// No returning -> plain QueryResult, same as a plain insert
	const noReturning = await db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }]);
	Expect<Equal<QueryResult<never>, typeof noReturning>>;

	// Full returning -> `$inferSelect[]`, identical to the non-selected insert on line 56
	const fullReturning = await db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }])
		.returning();
	Expect<Equal<typeof users.$inferSelect[], typeof fullReturning>>;

	// Partial returning -> exactly the selected returning fields, unaffected by the column list
	const partialReturning = await db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }])
		.returning({ id: users.id, homeCity: users.homeCity, mySubclass: users.subClass });
	Expect<
		Equal<{ id: number; homeCity: number; mySubclass: 'B' | 'D' | null }[], typeof partialReturning>
	>;

	// Returning after `.prepare()`/`.execute()` is likewise unchanged
	const preparedReturning = await db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }])
		.returning()
		.prepare('columnSelectionReturning')
		.execute();
	Expect<Equal<typeof users.$inferSelect[], typeof preparedReturning>>;

	// Returning after `.onConflictDoNothing()` is unchanged
	const onConflictReturning = await db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }])
		.onConflictDoNothing()
		.returning();
	Expect<Equal<typeof users.$inferSelect[], typeof onConflictReturning>>;

	// Returning after `.$dynamic()` is unchanged
	const dynamicReturning = await db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }])
		.$dynamic()
		.returning();
	Expect<Equal<typeof users.$inferSelect[], typeof dynamicReturning>>;

	// Returning after a column-selected `.select(...)` insert is unchanged
	const users1 = pgTable('users1_returning', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		admin: boolean('admin').notNull().default(false),
	});
	const qb = new QueryBuilder();
	const selectReturning = await db
		.insert(users1, 'name', 'admin')
		.select(qb.select({ name: users1.name, admin: users1.admin }).from(users1))
		.returning();
	Expect<Equal<typeof users1.$inferSelect[], typeof selectReturning>>;
}

// Additional column-selection scenarios
{
	// Single-object `.values()` (non-array) is accepted with a column list
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] });

	// `SQL` values are still accepted for the listed columns
	db
		.insert(users, 'homeCity', 'class', 'age1', 'enumCol', 'arrayCol')
		.values({ homeCity: sql`1`, class: 'A', age1: sql`2 + 2`, enumCol: 'a', arrayCol: [''] });

	// The column list is order-independent (required columns in a different order)
	db
		.insert(users, 'arrayCol', 'enumCol', 'age1', 'class', 'homeCity')
		.values([{ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] }]);

	// A generated-always column cannot appear in the column list at all
	// @ts-expect-error `generatedCol` is a generated column and is not insertable
	db.insert(identityColumnsTable, 'generatedCol');

	// An identity column may be listed, but `.values()` still rejects it without `.overridingSystemValue()`
	db
		.insert(identityColumnsTable, 'name', 'alwaysAsIdentity')
		// @ts-expect-error alwaysAsIdentity requires .overridingSystemValue()
		.values([{ name: 'x', alwaysAsIdentity: 2 }]);
}

{
	interface HKT1 extends PgQueryResultHKT {
		readonly type: 1;
	}
	interface HKT2 extends PgQueryResultHKT {
		readonly type: 2;
	}
	const unionDb = {} as PgAsyncDatabase<HKT1> | PgAsyncDatabase<HKT2>;
	await unionDb.insert(users).values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a', arrayCol: [''] });
}
