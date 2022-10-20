import { param, sql } from 'drizzle-orm';
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
} from 'drizzle-orm/expressions';
import { QueryResult, QueryResultRow } from 'pg';
import { alias } from '~/alias';

import { Equal, Expect } from '../utils';
import { db } from './db';
import { cities, classes, users } from './tables';

const city = alias(cities, 'city');
const city1 = alias(cities, 'city1');

const join = await db.select(users)
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin(city, eq(city.id, users.id))
	.rightJoin(city1, eq(city1.id, users.id), { id: city.id });

Expect<
	Equal<{
		users_table: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		} | null;
		cities_table: {
			id: number;
			name: string;
			population: number | null;
		} | null;
		city: {
			id: number;
			name: string;
			population: number | null;
		} | null;
		city1: {
			id: number;
		};
	}[], typeof join>
>;

const join2 = await db.select(users).fields({ id: users.id })
	.fullJoin(cities, eq(users.id, cities.id), { id: cities.id });

Expect<
	Equal<
		({
			users_table: { id: number };
			cities_table: null;
		} | {
			users_table: null;
			cities_table: { id: number };
		} | {
			users_table: { id: number };
			cities_table: { id: number };
		})[],
		typeof join2
	>
>;

const join3 = await db.select(users).fields({ id: users.id })
	.fullJoin(cities, eq(users.id, cities.id), { id: cities.id })
	.rightJoin(classes, eq(users.id, classes.id), { id: classes.id });

Expect<
	Equal<
		{
			users_table: { id: number } | null;
			cities_table: { id: number } | null;
			classes_table: { id: number };
		}[],
		typeof join3
	>
>;

db.select(users)
	.where(exists(
		db.select(cities).where(eq(users.homeCity.unsafe(), cities.id)),
	));

function mapFunkyFuncResult(valueFromDriver: unknown) {
	return {
		foo: (valueFromDriver as Record<string, any>)['foo'],
	};
}

const age = 1;

const allOperators = await db.select(users).fields({
	col2: sql`5 - ${users.id} + 1`, // unknown
	col3: sql`${users.id} + 1`.as<number>(), // number
	col33: sql`${users.id} + 1`.as(users.id), // number
	col34: sql`${users.id} + 1`.as(mapFunkyFuncResult), // number
	col4: sql`one_or_another(${users.id}, ${users.class})`.as<string | number>(), // string | number
	col5: sql`true`, // unknown
	col6: sql`true`.as<boolean>(), // boolean
	col7: sql`random()`.as<number>(), // number
	col8: sql`some_funky_func(${users.id})`.as(mapFunkyFuncResult), // { foo: string }
	col9: sql`greatest(${users.createdAt}, ${param(new Date(), users.createdAt)})`, // unknown
	col10: sql`date_or_false(${users.createdAt}, ${param(new Date(), users.createdAt)})`.as<Date | boolean>(), // Date | boolean
	col11: sql`${users.age1} + ${age}`, // unknown
	col12: sql`${users.age1} + ${param(age, users.age1)}`, // unknown
	col13: sql`lower(${users.class})`, // unknown
	col14: sql`length(${users.class})`.as<number>(), // number
	count: sql`count(*)`.as<number>(), // number
}).where(and(
	eq(users.id, 1),
	ne(users.id, 1),
	or(eq(users.id, 1), ne(users.id, 1)),
	not(eq(users.id, 1)),
	gt(users.id, 1),
	gte(users.id, 1),
	lt(users.id, 1),
	lte(users.id, 1),
	inArray(users.id, [1, 2, 3]),
	inArray(users.id, db.select(users).fields({ id: users.id })),
	inArray(users.id, sql`select id from ${users}`),
	notInArray(users.id, [1, 2, 3]),
	notInArray(users.id, db.select(users).fields({ id: users.id })),
	notInArray(users.id, sql`select id from ${users}`),
	isNull(users.subClass),
	isNotNull(users.id),
	exists(db.select(users).fields({ id: users.id })),
	exists(sql`select id from ${users}`),
	notExists(db.select(users).fields({ id: users.id })),
	notExists(sql`select id from ${users}`),
	between(users.id, 1, 2),
	notBetween(users.id, 1, 2),
	like(users.id, '%1%'),
	notLike(users.id, '%1%'),
	ilike(users.id, '%1%'),
	notIlike(users.id, '%1%'),
));

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

const textSelect = await db.select(users).fields({
	t: users.text,
});

Expect<Equal<{ t: string | null }[], typeof textSelect>>;

const homeCity = alias(cities, 'homeCity');
const c = alias(classes, 'c');
const otherClass = alias(classes, 'otherClass');
const anotherClass = alias(classes, 'anotherClass');
const friend = alias(users, 'friend');
const currentCity = alias(cities, 'currentCity');
const subscriber = alias(users, 'subscriber');
const closestCity = alias(cities, 'closestCity');

const megaJoin = await db.select(users)
	.fields({ id: users.id, maxAge: sql`max(${users.age1})` })
	.innerJoin(cities, sql`${users.id} = ${cities.id}`, { id: cities.id })
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
	.offset(1);

Expect<
	Equal<
		{
			users_table: {
				id: number;
				maxAge: unknown;
			};
			cities_table: {
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
				uuid: string;
				homeCity: number;
				currentCity: number | null;
				serialNullable: number;
				serialNotNull: number;
				class: 'A' | 'C';
				subClass: 'B' | 'D' | null;
				text: string | null;
				age1: number;
				createdAt: Date;
				enumCol: 'a' | 'b' | 'c';
			};
			subscriber: {
				id: number;
				uuid: string;
				homeCity: number;
				currentCity: number | null;
				serialNullable: number;
				serialNotNull: number;
				class: 'A' | 'C';
				subClass: 'B' | 'D' | null;
				text: string | null;
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

const join4 = await db.select(users)
	.fields({ id: users.id })
	.innerJoin(cities, sql`${users.id} = ${cities.id}`, { id: cities.id })
	.innerJoin(classes, sql`${cities.id} = ${classes.id}`)
	.innerJoin(friends, sql`${friends.id} = ${users.id}`)
	.where(sql`${users.age1} > 0`);

Expect<
	Equal<{
		users_table: {
			id: number;
		};
		cities_table: {
			id: number;
		};
		classes_table: {
			id: number;
			class: 'A' | 'C' | null;
			subClass: 'B' | 'D';
		};
		friends: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		};
	}[], typeof join4>
>;
