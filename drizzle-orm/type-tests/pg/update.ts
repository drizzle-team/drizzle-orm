import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { PgUpdate } from '~/pg-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';
import { db } from './db.ts';
import { cities, salEmp, users } from './tables.ts';

const update = await db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1));
Expect<Equal<QueryResult<never>, typeof update>>;

const updateStmt = db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.prepare('updateStmt');
const updatePrepared = await updateStmt.execute();
Expect<Equal<QueryResult<never>, typeof updatePrepared>>;

const updateReturning = await db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning({
		text: users.text,
	});
Expect<Equal<{ text: string | null }[], typeof updateReturning>>;

const updateReturningStmt = db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning({
		text: users.text,
	})
	.prepare('updateReturningStmt');
const updateReturningPrepared = await updateReturningStmt.execute();
Expect<Equal<{ text: string | null }[], typeof updateReturningPrepared>>;

{
	function dynamic<T extends PgUpdate>(qb: T) {
		return qb.where(sql``).returning();
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends PgUpdate>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.update(users)
		.set({})
		.returning()
		// @ts-expect-error method was already called
		.returning();

	db
		.update(users)
		.set({})
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);
}

{
	db
		.update(users)
		.set({})
		.from(sql``)
		.leftJoin(sql``, (table, from) => {
			Expect<Equal<typeof users['_']['columns'], typeof table>>;
			Expect<Equal<never, typeof from>>;
			return sql``;
		});

	db
		.update(users)
		.set({})
		.from(cities)
		.leftJoin(sql``, (table, from) => {
			Expect<Equal<typeof users['_']['columns'], typeof table>>;
			Expect<Equal<typeof cities['_']['columns'], typeof from>>;
			return sql``;
		});

	const citiesSq = db.$with('cities_sq').as(db.select({ id: cities.id }).from(cities));

	db
		.with(citiesSq)
		.update(users)
		.set({})
		.from(citiesSq)
		.leftJoin(sql``, (table, from) => {
			Expect<Equal<typeof users['_']['columns'], typeof table>>;
			Expect<Equal<typeof citiesSq['_']['selectedFields'], typeof from>>;
			return sql``;
		});

	db
		.with(citiesSq)
		.update(users)
		.set({
			homeCity: citiesSq.id,
		})
		.from(citiesSq);
}

{
	const result = await db.update(users).set({}).from(cities).returning();
	Expect<
		Equal<Simplify<
			typeof users.$inferSelect & {
				cities_table: typeof cities.$inferSelect;
			}
		>[], typeof result>
	>;
}

{
	const result1 = await db.update(users).set({}).from(cities).leftJoin(salEmp, sql``).returning();
	Expect<
		Equal<Simplify<
			typeof users.$inferSelect & {
				cities_table: typeof cities.$inferSelect;
				sal_emp: typeof salEmp.$inferSelect | null;
			}
		>[], typeof result1>
	>;

	const result2 = await db.update(users).set({}).from(cities).rightJoin(salEmp, sql``).returning();
	Expect<
		Equal<Simplify<
			{ [K in keyof typeof users.$inferSelect]: typeof users.$inferSelect[K] | null } & {
				cities_table: typeof cities.$inferSelect | null;
				sal_emp: typeof salEmp.$inferSelect;
			}
		>[], typeof result2>
	>;

	const result3 = await db.update(users).set({}).from(cities).innerJoin(salEmp, sql``).returning();
	Expect<
		Equal<Simplify<
			typeof users.$inferSelect & {
				cities_table: typeof cities.$inferSelect;
				sal_emp: typeof salEmp.$inferSelect;
			}
		>[], typeof result3>
	>;

	const result4 = await db.update(users).set({}).from(cities).fullJoin(salEmp, sql``).returning();
	Expect<
		Equal<Simplify<
			{ [K in keyof typeof users.$inferSelect]: typeof users.$inferSelect[K] | null } & {
				cities_table: typeof cities.$inferSelect | null;
				sal_emp: typeof salEmp.$inferSelect | null;
			}
		>[], typeof result4>
	>;
}

{
	const result = await db.update(users).set({}).from(cities).returning({
		id: users.id,
		cities: cities,
		cityName: cities.name,
	});
	Expect<
		Equal<Simplify<{
			id: number;
			cities: typeof cities.$inferSelect;
			cityName: string;
		}>[], typeof result>
	>;
}

{
	const result1 = await db.update(users).set({}).from(cities).leftJoin(salEmp, sql``).returning({
		id: users.id,
		cities: cities,
		cityName: cities.name,
		salEmp: salEmp,
		salEmpName: salEmp.name,
	});
	Expect<
		Equal<Simplify<{
			id: number;
			cities: typeof cities.$inferSelect;
			cityName: string;
			salEmp: typeof salEmp.$inferSelect | null;
			salEmpName: string | null;
		}>[], typeof result1>
	>;

	const result2 = await db.update(users).set({}).from(cities).rightJoin(salEmp, sql``).returning({
		id: users.id,
		cities: cities,
		cityName: cities.name,
		salEmp: salEmp,
		salEmpName: salEmp.name,
	});
	Expect<
		Equal<Simplify<{
			id: number | null;
			cities: typeof cities.$inferSelect | null;
			cityName: string | null;
			salEmp: typeof salEmp.$inferSelect;
			salEmpName: string;
		}>[], typeof result2>
	>;

	const result3 = await db.update(users).set({}).from(cities).innerJoin(salEmp, sql``).returning({
		id: users.id,
		cities: cities,
		cityName: cities.name,
		salEmp: salEmp,
		salEmpName: salEmp.name,
	});
	Expect<
		Equal<Simplify<{
			id: number;
			cities: typeof cities.$inferSelect;
			cityName: string;
			salEmp: typeof salEmp.$inferSelect;
			salEmpName: string;
		}>[], typeof result3>
	>;

	const result4 = await db.update(users).set({}).from(cities).fullJoin(salEmp, sql``).returning({
		id: users.id,
		cities: cities,
		cityName: cities.name,
		salEmp: salEmp,
		salEmpName: salEmp.name,
	});
	Expect<
		Equal<Simplify<{
			id: number | null;
			cities: typeof cities.$inferSelect | null;
			cityName: string | null;
			salEmp: typeof salEmp.$inferSelect | null;
			salEmpName: string | null;
		}>[], typeof result4>
	>;
}

{
	await db
		.update(users)
		.set({})
		// @ts-expect-error can't use joins before from
		.fullJoin(salEmp, sql``);
}
