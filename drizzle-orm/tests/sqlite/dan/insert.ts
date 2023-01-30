import { RunResult } from 'better-sqlite3';
import { Equal, Expect } from 'tests/utils';
import { and, eq } from '~/expressions';
import { sql } from '~/sql';
import { placeholder } from '~/sql';
import { InferModel } from '~/sqlite-core/index';
import { bunDb, db } from './db';
import { NewUser, users } from './tables';

const newUser: NewUser = {
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
	serialNotNull: 1,
};

const insertRun = db.insert(users).values(newUser).run();
Expect<Equal<RunResult, typeof insertRun>>;

const insertRunBun = bunDb.insert(users).values(newUser).run();
Expect<Equal<void, typeof insertRunBun>>;

const insertAll = db.insert(users).values(newUser).all();
Expect<Equal<never, typeof insertAll>>;

const insertAllBun = bunDb.insert(users).values(newUser).all();
Expect<Equal<never, typeof insertAllBun>>;

const insertGet = db.insert(users).values(newUser).get();
Expect<Equal<never, typeof insertGet>>;

const insertGetBun = bunDb.insert(users).values(newUser).get();
Expect<Equal<never, typeof insertGetBun>>;

const insertValues = db.insert(users).values(newUser).values();
Expect<Equal<never, typeof insertValues>>;

const insertValuesBun = bunDb.insert(users).values(newUser).values();
Expect<Equal<never, typeof insertValuesBun>>;

const insertRunReturningAll = db.insert(users).values(newUser).returning().run();
Expect<Equal<RunResult, typeof insertRunReturningAll>>;

const insertRunReturningAllBun = bunDb.insert(users).values(newUser).returning().run();
Expect<Equal<void, typeof insertRunReturningAllBun>>;

const insertAllReturningAll = db.insert(users).values(newUser).returning().all();
Expect<Equal<InferModel<typeof users>[], typeof insertAllReturningAll>>;

const insertAllReturningAllBun = bunDb.insert(users).values(newUser).returning().all();
Expect<Equal<InferModel<typeof users>[], typeof insertAllReturningAllBun>>;

const insertGetReturningAll = db.insert(users).values(newUser).returning().get();
Expect<Equal<InferModel<typeof users>, typeof insertGetReturningAll>>;

const insertGetReturningAllBun = bunDb.insert(users).values(newUser).returning().get();
Expect<Equal<InferModel<typeof users>, typeof insertGetReturningAllBun>>;

const insertValuesReturningAll = db.insert(users).values(newUser).returning().values();
Expect<Equal<any[][], typeof insertValuesReturningAll>>;

const insertValuesReturningAllBun = bunDb.insert(users).values(newUser).returning().values();
Expect<Equal<any[][], typeof insertValuesReturningAllBun>>;

const insertRunReturningPartial = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).run();
Expect<Equal<RunResult, typeof insertRunReturningPartial>>;

const insertRunReturningPartialBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).run();
Expect<Equal<void, typeof insertRunReturningPartialBun>>;

const insertAllReturningPartial = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).all();
Expect<
	Equal<
		{
			id: number;
			homeCity: number;
			mySubclass: 'B' | 'D' | null;
		}[],
		typeof insertAllReturningPartial
	>
>;

const insertAllReturningPartialBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).all();
Expect<
	Equal<
		{
			id: number;
			homeCity: number;
			mySubclass: 'B' | 'D' | null;
		}[],
		typeof insertAllReturningPartialBun
	>
>;

const insertReturningSql = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql`lower(${users.class})`.as<string>(),
}).all();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSql>
>;

const insertReturningSqlBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql`lower(${users.class})`.as<string>(),
}).all();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSqlBun>
>;

const upsertDoNothing1 = db.insert(users).values(newUser).onConflictDoNothing().run();
const upsertDoNothing2 = db.insert(users).values(newUser).onConflictDoNothing({ target: users.class }).run();
const upsertDoNothing3 = db.insert(users).values(newUser).onConflictDoNothing({
	target: [
		sql`${users.class} collate nocase asc`,
		sql`${users.age1} desc`,
		users.subClass,
	],
}).run();

const upsertDoUpdate = db.insert(users).values(newUser).onConflictDoUpdate({
	target: users.age1,
	set: { age1: sql`${users.age1} + 1` },
})
	.run();

const upsertAll = db.insert(users).values(newUser)
	.onConflictDoUpdate({
		target: users.age1,
		set: { age1: sql`${users.age1} + 1` },
		where: sql`${users.age1} > 10`,
	})
	.onConflictDoNothing()
	.run();

const stmt = db.select(users)
	.where(and(eq(users.id, placeholder('id'))))
	.offset(placeholder('offset'))
	.limit(placeholder('limit'))
	.prepare();
stmt.run({ id: 1, limit: 10, offset: 20 });
