import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { boolean, gelTable, integer, QueryBuilder, text } from '~/gel-core/index.ts';
import type { GelInsert } from '~/gel-core/query-builders/insert.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { identityColumnsTable, users } from './tables.ts';

const insert = await db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		class: 'A',
		createdAt: new Date(),
		uuid: '',
		age1: 1,
		arrayCol: [''],
	});
Expect<Equal<unknown, typeof insert>>;

const insertStmt = db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		class: 'A',
		createdAt: new Date(),
		uuid: '',
		age1: 1,
		arrayCol: [''],
	})
	.prepare('insertStmt');
const insertPrepared = await insertStmt.execute();
Expect<Equal<unknown, typeof insertPrepared>>;

const insertSql = await db.insert(users).values({
	id: 1,
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	createdAt: new Date(),
	uuid: '',
	arrayCol: [''],
});
Expect<Equal<unknown, typeof insertSql>>;

const insertSqlStmt = db
	.insert(users)
	.values({
		id: 1,
		homeCity: sql`123`,
		class: 'A',
		age1: 1,
		createdAt: new Date(),
		uuid: '',
		arrayCol: [''],
	})
	.prepare('insertSqlStmt');
const insertSqlPrepared = await insertSqlStmt.execute();
Expect<Equal<unknown, typeof insertSqlPrepared>>;

const insertReturning = await db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		class: 'A',
		age1: 1,
		createdAt: new Date(),
		uuid: '',
		arrayCol: [''],
	})
	.returning();
Expect<Equal<typeof users.$inferSelect[], typeof insertReturning>>;

const insertReturningStmt = db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		class: 'A',
		createdAt: new Date(),
		uuid: '',
		age1: 1,
		arrayCol: [''],
	})
	.returning()
	.prepare('insertReturningStmt');
const insertReturningPrepared = await insertReturningStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof insertReturningPrepared>>;

const insertReturningPartial = await db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		createdAt: new Date(),
		uuid: '',
		class: 'A',
		age1: 1,
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
		mySubclass: string | null;
	}[], typeof insertReturningPartial>
>;

const insertReturningPartialStmt = db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		class: 'A',
		createdAt: new Date(),
		uuid: '',
		age1: 1,
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
		mySubclass: string | null;
	}[], typeof insertReturningPartialPrepared>
>;

const insertReturningSql = await db
	.insert(users)
	.values({
		id: 1,
		homeCity: 1,
		class: 'A',
		age1: sql`2 + 2`,
		createdAt: new Date(),
		uuid: '',
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
		id: 1,
		homeCity: 1,
		class: 'A',
		createdAt: new Date(),
		uuid: '',
		age1: sql`2 + 2`,
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
	function dynamic<T extends GelInsert>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.insert(users).values({
		id: 1,
		age1: 0,
		class: 'A',
		homeCity: 0,
		arrayCol: [],
		createdAt: new Date(),
		uuid: '',
	}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends GelInsert>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.insert(users).values({
		id: 1,
		age1: 0,
		class: 'A',
		homeCity: 0,
		arrayCol: [],
		createdAt: new Date(),
		uuid: '',
	}).$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.insert(users)
		.values({ id: 1, age1: 0, class: 'A', homeCity: 0, arrayCol: [], createdAt: new Date(), uuid: '' })
		.returning()
		// @ts-expect-error method was already called
		.returning();
}

{
	const users1 = gelTable('users1', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		admin: boolean('admin').notNull().default(false),
	});
	const users2 = gelTable('users2', {
		id: integer('id').primaryKey(),
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
				id: users2.id,
				name: users2.firstName,
				admin: users2.admin,
			}).from(users2),
		);

	db
		.insert(users1)
		.select(
			qb.select({
				id: users2.id,
				name: users2.firstName,
				admin: users2.admin,
			}).from(users2).where(sql``),
		);

	db
		.insert(users2)
		.select(
			qb.select({
				id: users2.id,
				firstName: users2.firstName,
				lastName: users2.lastName,
				admin: users2.admin,
			}).from(users2),
		);

	db
		.insert(users1)
		.select(
			qb.select({
				id: users2.id,
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
