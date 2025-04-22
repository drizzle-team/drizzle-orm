import { type Equal, Expect } from 'type-tests/utils.ts';
import { except, intersect, type MsSqlSetOperator, union, unionAll } from '~/mssql-core/index.ts';
import { eq } from '~/sql/expressions';
import { desc, sql } from '~/sql/index.ts';
import { db } from './db.ts';
import { cities, classes, newYorkers, users } from './tables.ts';

const unionTest = await db
	.select({ id: users.id })
	.from(users)
	.union(
		db
			.select({ id: users.id })
			.from(users),
	);

Expect<Equal<{ id: number }[], typeof unionTest>>;

const unionAllTest = await db
	.select({ id: users.id, age: users.age1 })
	.from(users)
	.unionAll(
		db.select({ id: users.id, age: users.age1 })
			.from(users)
			.leftJoin(cities, eq(users.id, cities.id)),
	);

Expect<Equal<{ id: number; age: number }[], typeof unionAllTest>>;

const intersectTest = await db
	.select({ id: users.id, homeCity: users.homeCity })
	.from(users)
	.intersect(({ intersect }) =>
		intersect(
			db
				.select({ id: users.id, homeCity: users.homeCity })
				.from(users),
			db
				.select({ id: users.id, homeCity: sql`${users.homeCity}`.mapWith(Number) })
				.from(users),
		)
	);

Expect<Equal<{ id: number; homeCity: number }[], typeof intersectTest>>;

const intersectAllTest = await db
	.select({ id: users.id, homeCity: users.class })
	.from(users)
	.intersect(
		db
			.select({ id: users.id, homeCity: users.class })
			.from(users)
			.leftJoin(cities, eq(users.id, cities.id)),
	);

Expect<Equal<{ id: number; homeCity: 'A' | 'C' }[], typeof intersectAllTest>>;

const exceptTest = await db
	.select({ id: users.id, homeCity: users.homeCity })
	.from(users)
	.except(
		db
			.select({ id: users.id, homeCity: sql`${users.homeCity}`.mapWith(Number) })
			.from(users),
	);

Expect<Equal<{ id: number; homeCity: number }[], typeof exceptTest>>;

const exceptAllTest = await db
	.select({ id: users.id, homeCity: users.class })
	.from(users)
	.except(
		db
			.select({ id: users.id, homeCity: sql<'A' | 'C'>`${users.class}` })
			.from(users),
	);

Expect<Equal<{ id: number; homeCity: 'A' | 'C' }[], typeof exceptAllTest>>;

const union2Test = await union(db.select().from(cities), db.select().from(cities), db.select().from(cities));

Expect<Equal<{ id: number; name: string; population: number | null }[], typeof union2Test>>;

const unionAll2Test = await unionAll(
	db.select({
		id: cities.id,
		name: cities.name,
		population: cities.population,
	}).from(cities),
	db.select().from(cities),
);

Expect<Equal<{ id: number; name: string; population: number | null }[], typeof unionAll2Test>>;

const intersect2Test = await intersect(
	db.select({
		id: cities.id,
		name: cities.name,
		population: cities.population,
	}).from(cities),
	db.select({
		id: cities.id,
		name: cities.name,
		population: cities.population,
	}).from(cities),
	db.select({
		id: cities.id,
		name: cities.name,
		population: cities.population,
	}).from(cities),
);

Expect<Equal<{ id: number; name: string; population: number | null }[], typeof intersect2Test>>;

const intersectAll2Test = await intersect(
	union(
		db.select({
			id: cities.id,
		}).from(cities),
		db.select({
			id: cities.id,
		})
			.from(cities).where(sql``),
	),
	db.select({
		id: cities.id,
	})
		.from(cities),
).orderBy(desc(cities.id)).offset(0).fetch(23);

Expect<Equal<{ id: number }[], typeof intersectAll2Test>>;

const except2Test = await except(
	db.select({
		userId: newYorkers.userId,
	})
		.from(newYorkers),
	db.select({
		userId: newYorkers.userId,
	}).from(newYorkers),
);

Expect<Equal<{ userId: number }[], typeof except2Test>>;

const exceptAll2Test = await except(
	db.select({
		userId: newYorkers.userId,
		cityId: newYorkers.cityId,
	})
		.from(newYorkers).where(sql``),
	db.select({
		userId: newYorkers.userId,
		cityId: newYorkers.cityId,
	}).from(newYorkers).leftJoin(users, sql``),
);

Expect<Equal<{ userId: number; cityId: number | null }[], typeof exceptAll2Test>>;

const unionfull = await union(db.select().from(users), db.select().from(users)).orderBy(sql``).offset(0).fetch(23);

Expect<
	Equal<{
		id: number;
		text: string | null;
		homeCity: number;
		currentCity: number | null;
		serialNullable: number;
		serialNotNull: number;
		class: 'A' | 'C';
		subClass: 'B' | 'D' | null;
		age1: number;
		createdAt: Date;
		enumCol: 'a' | 'b' | 'c';
	}[], typeof unionfull>
>;

union(db.select().from(users), db.select().from(users))
	.orderBy(sql``)
	// @ts-expect-error - method was already called
	.orderBy(sql``);

union(db.select().from(users), db.select().from(users))
	.orderBy(sql``)
	.offset(0)
	// @ts-expect-error - method was already called
	.offset(0);

{
	function dynamic<T extends MsSqlSetOperator>(qb: T) {
		return qb.orderBy(sql``).offset(1).offset(2);
	}

	const qb = union(db.select().from(users), db.select().from(users)).$dynamic();
	const result = await dynamic(qb);
	Expect<Equal<typeof result, typeof users.$inferSelect[]>>;
}

await db
	.select({ id: users.id, homeCity: users.homeCity })
	.from(users)
	// All queries in combining statements should return the same number of columns
	// and the corresponding columns should have compatible data type
	// @ts-expect-error
	.intersect(({ intersect }) => intersect(db.select().from(users), db.select().from(users)));

// All queries in combining statements should return the same number of columns
// and the corresponding columns should have compatible data type
// @ts-expect-error
db.select().from(classes).union(db.select({ id: classes.id }).from(classes));

// All queries in combining statements should return the same number of columns
// and the corresponding columns should have compatible data type
// @ts-expect-error
db.select({ id: classes.id }).from(classes).union(db.select().from(classes).where(sql``));

// All queries in combining statements should return the same number of columns
// and the corresponding columns should have compatible data type
// @ts-expect-error
db.select({ id: classes.id }).from(classes).union(db.select().from(classes));

union(
	db.select({ id: cities.id, name: cities.name }).from(cities).where(sql``),
	db.select({ id: cities.id, name: cities.name }).from(cities),
	// All queries in combining statements should return the same number of columns
	// and the corresponding columns should have compatible data type
	// @ts-expect-error
	db.select().from(cities),
);

union(
	db.select({ id: cities.id, name: cities.name }).from(cities).where(sql``),
	// All queries in combining statements should return the same number of columns
	// and the corresponding columns should have compatible data type
	// @ts-expect-error
	db.select({ id: cities.id, name: cities.name, population: cities.population }).from(cities),
	db.select({ id: cities.id, name: cities.name }).from(cities).where(sql``).orderBy(users.id).$dynamic(),
	db.select({ id: cities.id, name: cities.name }).from(cities),
);

union(
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	// All queries in combining statements should return the same number of columns
	// and the corresponding columns should have compatible data type
	// @ts-expect-error
	db.select({ id: cities.id, name: cities.name }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
);

union(
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	// All queries in combining statements should return the same number of columns
	// and the corresponding columns should have compatible data type
	// @ts-expect-error
	db.select({ id: cities.id, name: cities.name }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: newYorkers.userId }).from(newYorkers),
	db.select({ id: cities.id }).from(cities),
);

union(
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities).where(sql``),
	db.select({ id: sql<number>`${cities.id}` }).from(cities),
	db.select({ id: cities.id }).from(cities),
	// All queries in combining statements should return the same number of columns
	// and the corresponding columns should have compatible data type
	// @ts-expect-error
	db.select({ id: cities.id, name: cities.name, population: cities.population }).from(cities).where(sql``),
);
