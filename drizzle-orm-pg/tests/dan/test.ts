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
import { QueryResultRow } from 'pg';

import { integer, serial } from '~/columns';
import { pgTable } from '~/table';
import { Equal, Expect } from '../utils';
import { db } from './db';
import { cities, classes, users } from './tables';

db.users.select()
	.where(exists(
		db.cities.select().where(eq(users.homeCity.unsafe(), cities.id)),
	))
	.execute();

function mapFunkyFuncResult(valueFromDriver: unknown) {
	return {
		foo: (valueFromDriver as Record<string, any>)['foo'],
	};
}

const age = 1;

const allOperators = await db.users.select({
	col2: sql.response`5 - ${users.id} + 1`, // number (from users.id)
	col3: sql.response.as<number>()`${users.id} + 1`, // number
	col4: sql.response.as<string | number>()`one_or_another(${users.id}, ${users.class})`, // string | number
	col5: sql.response`true`, // unknown
	col6: sql.response.as<boolean>()`true`, // boolean
	col7: sql.response.as<number>()`random()`, // number
	col8: sql.response.as<{ foo: string }>(mapFunkyFuncResult)`some_funky_func(${users.id})`, // { foo: string }
	col9: sql.response`greatest(${users.createdAt}, ${param(new Date(), users.createdAt)})`, // Date, "new Date()" is mapped using users.createdAt
	col10: sql.response.as<Date | boolean>()`date_or_false(${users.createdAt}, ${param(new Date(), users.createdAt)})`, // Date | boolean
	col11: sql.response`${users.age1} + ${age}`, // number, age is not mapped
	col12: sql.response`${users.age1} + ${param(age, users.age1)}`, // number, age is mapped using users.age1
	col13: sql.response`lower(${users.class})`, // string
	col14: sql.response.as<number>()`length(${users.class})`, // number
	count: sql.response.as<number>()`count(*)`, // number
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
	inArray(users.id, db.users.select({ id: users.id })),
	inArray(users.id, sql`select id from ${users}`),
	notInArray(users.id, [1, 2, 3]),
	notInArray(users.id, db.users.select({ id: users.id })),
	notInArray(users.id, sql`select id from ${users}`),
	isNull(users.subClass),
	isNotNull(users.id),
	exists(db.users.select({ id: users.id })),
	exists(sql`select id from ${users}`),
	notExists(db.users.select({ id: users.id })),
	notExists(sql`select id from ${users}`),
	between(users.id, 1, 2),
	notBetween(users.id, 1, 2),
	like(users.id, '%1%'),
	notLike(users.id, '%1%'),
	ilike(users.id, '%1%'),
	notIlike(users.id, '%1%'),
)).execute();

Expect<
	Equal<{
		col2: number;
		col3: number;
		col4: string | number;
		col5: unknown;
		col6: boolean;
		col7: number;
		col8: {
			foo: string;
		};
		col9: Date;
		col10: boolean | Date;
		col11: number;
		col12: number;
		col13: 'A' | 'C';
		col14: number;
		count: number;
	}[], typeof allOperators>
>;

const rawQuery = await db.execute(
	sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
		eq(users.class, 'A')
	}`,
);

Expect<Equal<QueryResultRow, typeof rawQuery>>;

const megaJoin = await db.users
	.select({ id: users.id, maxAge: sql.response`max(${users.age1})` })
	.innerJoin(cities, sql`${users.id} = ${cities.id}`, { id: cities.id })
	.innerJoin({ homeCity: cities }, (aliases) => sql`${users.homeCity} = ${aliases.homeCity.id}`)
	.innerJoin({ class: classes }, (aliases) => eq(aliases.class.id, users.class))
	.innerJoin({ otherClass: classes }, (aliases) => sql`${aliases.class.id} = ${aliases.otherClass.id}`)
	.innerJoin({ anotherClass: classes }, (aliases) => sql`${users.class} = ${aliases.anotherClass.id}`)
	.innerJoin({ friend: users }, (aliases) => sql`${users.id} = ${aliases.friend.id}`)
	.innerJoin({ currentCity: cities }, (aliases) => sql`${aliases.homeCity.id} = ${aliases.currentCity.id}`)
	.innerJoin({ subscriber: users }, (aliases) => sql`${users.class} = ${aliases.subscriber.id}`)
	.innerJoin({ closestCity: cities }, (aliases) => sql`${users.currentCity} = ${aliases.closestCity.id}`)
	.where(sql`${users.age1} > 0`)
	.execute();

db.users
	.select({ id: users.id })
	.innerJoin(cities, sql`${users.id} = ${cities.id}`, { id: cities.id })
	.innerJoin(classes, sql`${cities.id} = ${classes.id}`)
	.innerJoin({ friends: users }, (aliases) => sql`${aliases.friends.id} = ${users.id}`)
	// .innerJoin(cities, (joins) => sql`${joins.cities1.id} = ${joins.cities2.id}`)
	// .innerJoin(classes, (joins) => eq(joins.cities1.id, joins.cities2.id))
	.where(sql`${users.age1} > 0`)
	// .where((joins) => sql`${joins.users.age1} > 0`)
	// .where(eq(users.age1, 1))
	// .where((joins) => eqjoins.users.age1, 1))
	// .orderBy(asc(users.id), desc(users.name))
	// .orderBy((joins)=> [asc(joins.users.id), desc(joins.cities1.id)])
	// .orderBy((joins)=> sql`${joins.users.age1} ASC`)
	.execute();

const join2 = await db.users.select()
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin({ city: cities }, (aliases) => eq(aliases.city.id, users.id))
	.rightJoin({ city1: cities }, (aliases) => eq(aliases.city1.id, users.id), (city) => ({ id: city.id }))
	.execute();

Expect<
	Equal<{
		users?: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			age1: number;
			createdAt: Date;
		};
		cities?: {
			id: number;
			name: string;
			population: number | null;
		};
		city?: {
			id: number;
			name: string;
			population: number | null;
		};
		city1: {
			id: number;
		};
	}[], typeof join2>
>;
