import { type Equal, Expect } from 'type-tests/utils.ts';
import { eq } from '~/expressions.ts';
import { except, exceptAll, intersect, intersectAll, union, unionAll } from '~/mysql-core/index.ts';
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
	.select({ id: users.id, text: users.text })
	.from(users)
	.unionAll(
		db.select({ id: users.id, text: users.text })
			.from(users)
			.leftJoin(cities, eq(users.id, cities.id)),
	);

Expect<Equal<{ id: number; text: string | null }[], typeof unionAllTest>>;

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
	.intersectAll(
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
	.exceptAll(
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

const intersectAll2Test = await intersectAll(
	db.select({
		id: cities.id,
	}).from(cities),
	db.select({
		id: cities.id,
	})
		.from(cities),
).orderBy(desc(cities.id)).limit(23);

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

const exceptAll2Test = await exceptAll(
	db.select({
		userId: newYorkers.userId,
		cityId: newYorkers.cityId,
	})
		.from(newYorkers),
	db.select({
		userId: newYorkers.userId,
		cityId: newYorkers.cityId,
	}).from(newYorkers),
);

Expect<Equal<{ userId: number; cityId: number | null }[], typeof exceptAll2Test>>;

{
	const query = db
		.select()
		.from(users)
		.union(
			db.select()
				.from(users),
		)
		.prepare()
		.iterator();
	for await (const row of query) {
		Expect<Equal<typeof users.$inferSelect, typeof row>>();
	}
}

// @ts-expect-error - The select on both sites must be the same shape
db.select().from(classes).union(db.select({ id: classes.id }).from(classes));

// @ts-expect-error - The select on both sites must be the same shape
db.select({ id: classes.id }).from(classes).union(db.select().from(classes));

union(
	db.select({ id: cities.id, name: cities.name }).from(cities),
	db.select({ id: cities.id, name: cities.name }).from(cities),
	// @ts-expect-error - The select on rest parameter must be the same shape
	db.select().from(cities),
);

union(
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	// @ts-expect-error - The select on any part of the rest parameter must be the same shape
	db.select({ id: cities.id, name: cities.name }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
);

union(
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	// @ts-expect-error - The select on any part of the rest parameter must be the same shape
	db.select({ id: cities.id, name: cities.name }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
);

union(
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: cities.id }).from(cities),
	db.select({ id: sql<number>`${cities.id}` }).from(cities),
	db.select({ id: cities.id }).from(cities),
	// @ts-expect-error - The select on any part of the rest parameter must be the same shape
	db.select({ id: cities.id, name: cities.name, population: cities.population }).from(cities),
);
