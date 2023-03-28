import {
	and,
	between,
	eq,
	exists,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	notBetween,
	notExists,
	notIlike,
	notInArray,
	notLike,
	or,
} from '~/expressions';
import { param, sql } from '~/sql';
import { alias } from '~/sqlite-core/alias';

import type { Equal } from 'tests/utils';
import { Expect } from 'tests/utils';
import type { InferModel } from '~/table';
import { db } from './db';
import { cities, classes, newYorkers, users } from './tables';

const city = alias(cities, 'city');
const city1 = alias(cities, 'city1');

const joinAll = db
	.select()
	.from(users)
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin(city, eq(city.id, users.id))
	.rightJoin(city1, eq(city1.id, users.id))
	.all();
Expect<
	Equal<{
		users_table: InferModel<typeof users> | null;
		cities_table: InferModel<typeof cities> | null;
		city: InferModel<typeof city> | null;
		city1: InferModel<typeof city1>;
	}[], typeof joinAll>
>;

const joinGet = db
	.select()
	.from(users)
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin(city, eq(city.id, users.id))
	.rightJoin(city1, eq(city1.id, users.id))
	.get();
Expect<
	Equal<{
		users_table: InferModel<typeof users> | null;
		cities_table: InferModel<typeof cities> | null;
		city: InferModel<typeof city> | null;
		city1: InferModel<typeof city1>;
	}, typeof joinGet>
>;

const joinValues = db
	.select()
	.from(users)
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin(city, eq(city.id, users.id))
	.rightJoin(city1, eq(city1.id, users.id))
	.values();
Expect<Equal<any[][], typeof joinValues>>;

const joinPartial = db
	.select({
		user: {
			id: users.id,
			age: users.age1,
			name: users.name,
		},
		city: {
			id: cities.id,
			name: cities.name,
		},
	})
	.from(users)
	.fullJoin(cities, eq(users.id, cities.id))
	.all();

Expect<
	Equal<
		{
			user: {
				id: number;
				name: string | null;
				age: number;
			} | null;
			city: {
				id: number;
				name: string;
			} | null;
		}[],
		typeof joinPartial
	>
>;

const join3 = db
	.select({
		userId: users.id,
		cityId: cities.id,
		classId: classes.id,
	})
	.from(users)
	.fullJoin(cities, eq(users.id, cities.id))
	.rightJoin(classes, eq(users.id, classes.id)).all();

Expect<
	Equal<{
		userId: number | null;
		cityId: number | null;
		classId: number;
	}[], typeof join3>
>;

db
	.select()
	.from(users)
	.where(exists(db.select().from(cities).where(eq(users.homeCity, cities.id))));

function mapFunkyFuncResult(valueFromDriver: unknown) {
	return {
		foo: (valueFromDriver as Record<string, any>)['foo'],
	};
}

const age = 1;

const allOperators = db
	.select({
		col2: sql`5 - ${users.id} + 1`, // unknown
		col3: sql<number>`${users.id} + 1`, // number
		col33: sql`${users.id} + 1`.mapWith(users.id), // number
		col34: sql`${users.id} + 1`.mapWith(mapFunkyFuncResult), // number
		col4: sql<string | number>`one_or_another(${users.id}, ${users.class})`, // string | number
		col5: sql`true`, // unknown
		col6: sql<boolean>`true`, // boolean
		col7: sql<number>`random()`, // number
		col8: sql`some_funky_func(${users.id})`.mapWith(mapFunkyFuncResult), // { foo: string }
		col9: sql`greatest(${users.createdAt}, ${param(new Date(), users.createdAt)})`, // unknown
		col10: sql<Date | boolean>`date_or_false(${users.createdAt}, ${param(new Date(), users.createdAt)})`, // Date | boolean
		col11: sql`${users.age1} + ${age}`, // unknown
		col12: sql`${users.age1} + ${param(age, users.age1)}`, // unknown
		col13: sql`lower(${users.class})`, // unknown
		col14: sql<number>`length(${users.class})`, // number
		count: sql<number>`count(*)`, // number
	})
	.from(users)
	.where(and(
		eq(users.id, 1),
		ne(users.id, 1),
		or(eq(users.id, 1), ne(users.id, 1)),
		not(eq(users.id, 1)),
		gt(users.id, 1),
		gte(users.id, 1),
		lt(users.id, 1),
		lte(users.id, 1),
		inArray(users.id, [1, 2, 3]),
		inArray(users.id, db.select({ id: users.id }).from(users)),
		inArray(users.id, sql`select id from ${users}`),
		notInArray(users.id, [1, 2, 3]),
		notInArray(users.id, db.select({ id: users.id }).from(users)),
		notInArray(users.id, sql`select id from ${users}`),
		isNull(users.subClass),
		isNotNull(users.id),
		exists(db.select({ id: users.id }).from(users)),
		exists(sql`select id from ${users}`),
		notExists(db.select({ id: users.id }).from(users)),
		notExists(sql`select id from ${users}`),
		between(users.id, 1, 2),
		notBetween(users.id, 1, 2),
		like(users.id, '%1%'),
		notLike(users.id, '%1%'),
		ilike(users.id, '%1%'),
		notIlike(users.id, '%1%'),
	)).all();

Expect<
	Equal<{
		col2: unknown;
		col3: number;
		col33: number;
		col34: { foo: any };
		col4: string | number;
		col5: unknown;
		col6: boolean;
		col7: number;
		col8: {
			foo: any;
		};
		col9: unknown;
		col10: boolean | Date;
		col11: unknown;
		col12: unknown;
		col13: unknown;
		col14: number;
		count: number;
	}[], typeof allOperators>
>;

const textSelect = db
	.select({
		t: users.name,
	})
	.from(users)
	.all();

Expect<Equal<{ t: string | null }[], typeof textSelect>>;

const homeCity = alias(cities, 'homeCity');
const c = alias(classes, 'c');
const otherClass = alias(classes, 'otherClass');
const anotherClass = alias(classes, 'anotherClass');
const friend = alias(users, 'friend');
const currentCity = alias(cities, 'currentCity');
const subscriber = alias(users, 'subscriber');
const closestCity = alias(cities, 'closestCity');

const megaJoin = db
	.select({
		user: {
			id: users.id,
			maxAge: sql`max(${users.age1})`,
		},
		city: {
			id: cities.id,
		},
		homeCity,
		c,
		otherClass,
		anotherClass,
		friend,
		currentCity,
		subscriber,
		closestCity,
	})
	.from(users)
	.innerJoin(cities, sql`${users.id} = ${cities.id}`)
	.innerJoin(homeCity, sql`${users.homeCity} = ${homeCity.id}`)
	.innerJoin(c, eq(c.id, users.class))
	.innerJoin(otherClass, sql`${c.id} = ${otherClass.id}`)
	.innerJoin(anotherClass, sql`${users.class} = ${anotherClass.id}`)
	.innerJoin(friend, sql`${users.id} = ${friend.id}`)
	.innerJoin(currentCity, sql`${homeCity.id} = ${currentCity.id}`)
	.innerJoin(subscriber, sql`${users.class} = ${subscriber.id}`)
	.innerJoin(closestCity, sql`${users.currentCity} = ${closestCity.id}`)
	.where(and(sql`${users.age1} > 0`, eq(cities.id, 1)))
	.limit(1)
	.offset(1).all();

Expect<
	Equal<
		{
			user: {
				id: number;
				maxAge: unknown;
			};
			city: {
				id: number;
			};
			homeCity: {
				id: number;
				name: string;
				population: number | null;
			};
			currentCity: {
				id: number;
				name: string;
				population: number | null;
			};
			c: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			otherClass: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			anotherClass: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			friend: {
				id: number;
				homeCity: number;
				currentCity: number | null;
				serialNullable: number | null;
				serialNotNull: number;
				class: 'A' | 'C';
				subClass: 'B' | 'D' | null;
				name: string | null;
				age1: number;
				createdAt: Date;
				enumCol: 'a' | 'b' | 'c';
			};
			subscriber: {
				id: number;
				homeCity: number;
				currentCity: number | null;
				serialNullable: number | null;
				serialNotNull: number;
				class: 'A' | 'C';
				subClass: 'B' | 'D' | null;
				name: string | null;
				age1: number;
				createdAt: Date;
				enumCol: 'a' | 'b' | 'c';
			};
			closestCity: {
				id: number;
				name: string;
				population: number | null;
			};
		}[],
		typeof megaJoin
	>
>;

const friends = alias(users, 'friends');

const join4 = db
	.select({
		user: {
			id: users.id,
		},
		users123: {
			id: users.id,
		},
		city: {
			name: cities.name,
			population: cities.population,
		},
		class: classes,
		friend: friends,
	})
	.from(users)
	.innerJoin(cities, sql`${users.id} = ${cities.id}`)
	.innerJoin(classes, sql`${cities.id} = ${classes.id}`)
	.innerJoin(friends, sql`${friends.id} = ${users.id}`)
	.where(sql`${users.age1} > 0`).all();

Expect<
	Equal<
		{
			user: {
				id: number;
			};
			users123: {
				id: number;
			};
			city: {
				name: string;
				population: number | null;
			};
			class: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			friend: {
				id: number;
				name: string | null;
				homeCity: number;
				currentCity: number | null;
				serialNullable: number | null;
				serialNotNull: number;
				class: 'A' | 'C';
				subClass: 'B' | 'D' | null;
				age1: number;
				createdAt: Date;
				enumCol: 'a' | 'b' | 'c';
			};
		}[],
		typeof join4
	>
>;

{
	let authenticated = false;

	const result = db
		.select({
			id: users.id,
			...(authenticated ? { city: users.homeCity } : {}),
		})
		.from(users)
		.all();

	Expect<
		Equal<
			{
				id: number;
				city?: number;
			}[],
			typeof result
		>
	>;
}

{
	const result = db.select().from(newYorkers).all();
	Expect<
		Equal<
			{
				userId: number;
				cityId: number | null;
			}[],
			typeof result
		>
	>;
}

{
	const result = db.select({ userId: newYorkers.userId }).from(newYorkers).all();
	Expect<
		Equal<
			{
				userId: number;
			}[],
			typeof result
		>
	>;
}
