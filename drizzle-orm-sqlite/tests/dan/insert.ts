import { RunResult } from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { and, desc, eq, gte } from 'drizzle-orm/expressions';
import { Placeholder, placeholder } from 'drizzle-orm/sql';
import { AnySQLiteTable, InferModel } from '~/index';
import { Equal, Expect } from '../utils';
import { db } from './db';
import { NewUser, User, users } from './tables';

const newUser: NewUser = {
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
	serialNotNull: 1,
};

const insert1 = db.insert(users).values(newUser).execute();

Expect<Equal<RunResult, typeof insert1>>;

const insertSql = db.insert(users).values(newUser).execute();

Expect<Equal<RunResult, typeof insertSql>>;

const insertReturning = db.insert(users).values(newUser).returning().execute();

Expect<Equal<InferModel<typeof users>[], typeof insertReturning>>;

const insertReturningPartial = db.insert(users).values(newUser).returning({
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

const insertReturningSql = db.insert(users).values(newUser).returning({
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

const upsertDoNothing1 = db.insert(users).values(newUser).onConflictDoNothing().execute();
const upsertDoNothing2 = db.insert(users).values(newUser).onConflictDoNothing({ target: users.class }).execute();
const upsertDoNothing3 = db.insert(users).values(newUser).onConflictDoNothing({
	target: [
		sql`${users.class} collate nocase asc`,
		sql`${users.age1} desc`,
		users.subClass,
	],
}).execute();

const upsertDoUpdate = db.insert(users).values(newUser).onConflictDoUpdate({
	target: users.age1,
	set: { age1: sql`${users.age1} + 1` },
})
	.execute();

const upsertAll = db.insert(users).values(newUser)
	.onConflictDoUpdate({
		target: users.age1,
		set: { age1: sql`${users.age1} + 1` },
		where: sql`${users.age1} > 10`,
	})
	.onConflictDoNothing()
	.execute();

// type GetPlaceholderName<T> = T extends Placeholder<infer TName, any> ? TName : never;

// type InferPlaceholders<T, TTable extends AnySQLiteTable> = {
// 	[K in keyof T & keyof InferModel<TTable, 'insert'> as GetPlaceholderName<T[K]>]: T[K] extends Placeholder
// 		? InferModel<TTable, 'insert'>[K]
// 		: never;
// };

// const nUser = {
// 	homeCity: 1,
// 	class: 'A',
// 	age1: placeholder('age'),
// 	enumCol: 'a',
// 	serialNotNull: 1,
// } as const;

// type t = InferPlaceholders<typeof nUser, typeof users>;

// eq(users.id, placeholder('id')): SQL<{id: number}>;
// and(eq(users.id, placeholder('id'), gte(users.age1, placeholder('age')))): SQL<{id: number, age: number}>;

const stmt = db.select(users)
	.where(and(eq(users.id, placeholder('id'))))
	.offset(placeholder('offset'))
	.limit(placeholder('limit'))
	.prepare();
stmt.execute({ limit: 10, offset: 20 });
