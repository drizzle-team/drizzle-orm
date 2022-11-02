import { RunResult } from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { InferModel } from '~/index';
import { Equal, Expect } from '../utils';
import { db } from './db';
import { NewUser, users } from './tables';

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
