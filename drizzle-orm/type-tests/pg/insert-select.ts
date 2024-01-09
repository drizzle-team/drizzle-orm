import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { PgInsertSelect } from '~/pg-core/query-builders/insert-select.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const insertSelect = await db
	.insert(users)
  .select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
  .from(users);
Expect<Equal<QueryResult<never>, typeof insertSelect>>;

const insertSelectDistinct = await db
	.insert(users)
	.selectDistinct({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
	.from(users);
Expect<Equal<QueryResult<never>, typeof insertSelectDistinct>>;

const insertSelectDistinctOn = await db
	.insert(users)
	.selectDistinctOn([users.id], {
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
	.from(users);
Expect<Equal<QueryResult<never>, typeof insertSelectDistinctOn>>;

const insertSelectStmt = db
	.insert(users)
	.select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
  .from(users)
	.prepare('insertSelectStmt');
const insertSelectPrepared = await insertSelectStmt.execute();
Expect<Equal<QueryResult<never>, typeof insertSelectPrepared>>;

const insertSelectSql = await db
	.insert(users)
	.select({
		homeCity: sql`abc`,
		class: users.class,
		age1: users.age1,
		enumCol: sql`def`,
		arrayCol: users.arrayCol,
	})
	.from(users);
Expect<Equal<QueryResult<never>, typeof insertSelectSql>>;

const insertSelectSqlStmt = db
	.insert(users)
	.select({
		homeCity: sql`abc`,
		class: users.class,
		age1: users.age1,
		enumCol: sql`def`,
		arrayCol: users.arrayCol,
	})
	.from(users)
	.prepare('insertSelectSqlStmt');
const insertSelectSqlPrepared = await insertSelectSqlStmt.execute();
Expect<Equal<QueryResult<never>, typeof insertSelectSqlPrepared>>;

const insertSelectReturning = await db
	.insert(users)
	.select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
	.from(users)
	.returning();
Expect<Equal<typeof users.$inferSelect[], typeof insertSelectReturning>>;

const insertSelectReturningStmt = db
	.insert(users)
	.select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
	.from(users)
	.returning()
	.prepare('insertSelectReturningStmt');
const insertSelectReturningPrepared = await insertSelectReturningStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof insertSelectReturningPrepared>>;

const insertSelectReturningPartial = await db
	.insert(users)
	.select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
	.from(users)
	.returning({
		id: users.id,
		homeCity: users.homeCity,
		class: users.class
	});
Expect<
	Equal<{
		id: number;
		homeCity: number;
		class: 'A' | 'C';
	}[], typeof insertSelectReturningPartial>
>;

const insertSelectReturningPartialStmt = db
	.insert(users)
	.select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol,
  })
	.from(users)
	.returning({
		id: users.id,
		homeCity: users.homeCity,
		class: users.class
	})
	.prepare('insertSelectReturningPartialStmt');
const insertSelectReturningPartialPrepared = await insertSelectReturningPartialStmt.execute();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		class: 'A' | 'C';
	}[], typeof insertSelectReturningPartialPrepared>
>;

const insertSelectWithUnion = await db
	.insert(users)
	.select({
    homeCity: users.homeCity,
		class: users.class,
		age1: users.age1,
		enumCol: users.enumCol,
		arrayCol: users.arrayCol
  })
	.from(users)
	.union(
		db
			.select({
				homeCity: users.homeCity,
				class: users.class,
				age1: users.age1,
				enumCol: users.enumCol,
				arrayCol: users.arrayCol,
			})
			.from(users)
	);
Expect<Equal<QueryResult<never>, typeof insertSelectWithUnion>>;

{
	function dynamic<T extends PgInsertSelect>(qb: T) {
		return qb.returning().onConflictDoNothing().onConflictDoUpdate({ set: {}, target: users.id, where: sql`` });
	}

	const qbBase = db
		.insert(users)
		.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			arrayCol: users.arrayCol,
		})
		.from(users)
		.$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends PgInsertSelect>(qb: T) {
		return qb.returning();
	}

	const qbBase = db
		.insert(users)
		.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			arrayCol: users.arrayCol,
		})
		.from(users)
		.$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.insert(users)
		.select({
			homeCity: users.homeCity,
			class: users.class,
			age1: users.age1,
			enumCol: users.enumCol,
			arrayCol: users.arrayCol,
		})
		.from(users)
		.returning()
		// @ts-expect-error method was already called
		.returning();
}
