import { sql } from 'drizzle-orm';
import { QueryResult } from 'pg';
import { InferModel } from '~/index';
import { Equal, Expect } from '../utils';
import { db } from './db';
import { cities, classes, users } from './tables';

const insert1 = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).execute();

Expect<Equal<QueryResult<any>, typeof insert1>>;

const insertSql = await db.insert(users).values({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
}).execute();

Expect<Equal<QueryResult<any>, typeof insertSql>>;

const insertReturning = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).returning().execute();

Expect<Equal<InferModel<typeof users>[], typeof insertReturning>>;

const insertReturningPartial = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).execute();

Expect<
	Equal<{
		id: number;
		homeCity: number;
		mySubclass: 'B' | 'D' | null;
	}[], typeof insertReturningPartial>
>;

const insertReturningSql = await db.insert(users).values({
	homeCity: 1,
	class: 'A',
	age1: sql`2 + 2`,
	enumCol: 'a',
}).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql`lower(${users.class})`.as<string>(),
}).execute();

Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSql>
>;
